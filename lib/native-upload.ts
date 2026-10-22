import { requireOptionalNativeModule } from 'expo-modules-core';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import { API_BASE_URL, apiFetch } from './api';
import type { RecoveryPhoto } from './recovery';

const native = Platform.OS === 'ios' ? requireOptionalNativeModule('WalkthroughUpload') : null;
export const nativeUploadSupported = !!native && Constants.expoConfig?.extra?.appVariant === 'test';
export function newBatchId() {
  // Random batch ID is only a locator; server authentication and ownership are mandatory.
  return Array.from({ length: 48 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
export async function enqueueNativeUpload(id: string, photos: RecoveryPhoto[], metadata: Record<string, unknown>) {
  if (!nativeUploadSupported) throw new Error('Install the updated TestFlight build for background photo uploads.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Sign in before uploading.');
  await native.enqueue(id, photos.map(p => p.uri), JSON.stringify(metadata), `Bearer ${session.access_token}`);
}
export async function nativeUploadStatus(id: string) {
  return native.status(id) as Promise<{ count?: number; uploaded?: string[]; error?: string; jobId?: string }>;
}
export async function serverBatchStatus(id: string) {
  const response = await apiFetch(`${API_BASE_URL}/api/native-batches/${id}`);
  if (response.status === 404) return null; // iOS may still be waiting for connectivity.
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Upload status HTTP ${response.status}`);
  return body;
}

export async function clearNativeUpload(id: string) { if (native) await native.clear(id); }
