import { requireOptionalNativeModule } from 'expo-modules-core';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { API_BASE_URL, apiFetch } from './api';
import type { RecoveryPhoto } from './recovery';

const native = Platform.OS === 'ios' ? requireOptionalNativeModule('WalkthroughUpload') : null;
export const nativeUploadSupported = !!native;
export function newBatchId() {
  // Random batch ID is only a locator; server authentication and ownership are mandatory.
  return Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
export async function enqueueNativeUpload(id: string, photos: RecoveryPhoto[], metadata: Record<string, unknown>) {
  if (!nativeUploadSupported) throw new Error('Install the updated TestFlight build for background photo uploads.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in before uploading.');
  await native.enqueue(id, photos.map(p => p.uri), JSON.stringify(Constants.expoConfig?.extra?.appVariant === 'test' ? metadata : { ...metadata, release_channel: 'production' }), `Bearer ${session.access_token}`);
}
export async function nativeUploadStatus(id: string) {
  return native.status(id) as Promise<{ count?: number; uploaded?: string[]; error?: string; jobId?: string }>;
}
export async function serverBatchStatus(id: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/native-batches/${id}`);
  if (response.status === 410) return { expired: true };
  if (response.status === 404) return null; // iOS may still be waiting for connectivity.
  if (response.status === 429 || response.status >= 500) {
    throw new TypeError('Upload status is temporarily unavailable.');
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Upload status HTTP ${response.status}`);
  return body;
}

export async function clearNativeUpload(id: string) { if (native) await native.clear(id); }

// Use the same numbered slot as the native queue so a retry cannot create a second job.
export async function sendPhotoWhileOpen(id: string, slot: number, photos: RecoveryPhoto[],
  signal: AbortSignal, onProgress: (percent: number) => void) {
  const { File } = await import('expo-file-system');
  const FS = await import('expo-file-system/legacy');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in again to resume this upload.');
  let uri = photos[slot].uri;
  const handle = new File(uri).open();
  let jpeg: boolean;
  try {
    const header = handle.readBytes(2);
    jpeg = header[0] === 0xff && header[1] === 0xd8;
  } finally { handle.close(); }
  if (!jpeg) {
    const images = await import('expo-image-manipulator');
    uri = (await images.manipulateAsync(uri, [], { compress: 1, format: images.SaveFormat.JPEG })).uri;
  }
  try {
    if (signal.aborted) return;
    const task = FS.createUploadTask(`${API_BASE_URL}/api/native-batches/${id}/${slot}`, uri, {
      httpMethod: 'PUT', uploadType: FS.FileSystemUploadType.BINARY_CONTENT,
      sessionType: FS.FileSystemSessionType.FOREGROUND,
      headers: { Authorization: `Bearer ${session.access_token}`, 'X-Photo-Count': String(photos.length), 'Content-Type': 'image/jpeg' },
    }, progress => {
      if (!signal.aborted && progress.totalBytesExpectedToSend > 0) {
        onProgress(Math.round(100 * progress.totalBytesSent / progress.totalBytesExpectedToSend));
      }
    });
    const cancel = () => { void task.cancelAsync().catch(() => {}); };
    signal.addEventListener('abort', cancel);
    try {
      const result = await task.uploadAsync();
      if (signal.aborted) return;
      if (!result || result.status < 200 || result.status >= 300) {
        throw new Error(result ? `Photo ${slot + 1} upload returned HTTP ${result.status}.` : 'Connection interrupted.');
      }
      const receipt = JSON.parse(result.body);
      if (receipt?.success !== true) throw new Error('The server could not confirm this photo.');
      return receipt as { uploaded?: number; result?: { success: boolean; job_id: string } };
    } finally { signal.removeEventListener('abort', cancel); }
  } finally {
    if (uri !== photos[slot].uri) await FS.deleteAsync(uri, { idempotent: true }).catch(() => {});
  }
}
