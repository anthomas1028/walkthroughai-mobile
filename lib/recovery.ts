import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type RecoveryPhoto = { id: string; uri: string; fileName: string; mimeType: string; location: string };
export type RecoveryDraft = {
  version: 1; customerId: string; customerName: string; contactName: string;
  photos: RecoveryPhoto[]; prepared: RecoveryPhoto[]; uploadId: string;
  completionAlertToken?: string;
  captureSaveId?: string;
  teamSessionId?: string;
  teamArea?: string;
  contributionRevision?: number;
  nativeBatchId?: string;
  uploadRequested?: boolean;
  captureScans?: unknown[];
  localCaptureReview?: boolean;
  removedPhotos?: string[];
  editingIndex?: number | null; editDraft?: unknown;
  uploaded: number[]; jobId: string; results: unknown[]; updatedAt: string;
};
let writes: Promise<unknown> = Promise.resolve();
async function key(userId?: string) {
  // Local storage scope only. Server requests still validate the access token.
  // The app passes its active AuthContext identity so offline saves never refresh a token.
  if (userId) return `walkthrough-recovery-v1:${userId}`;
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.id) throw new Error('Sign in to recover your walkthrough.');
  return `walkthrough-recovery-v1:${data.session.user.id}`;
}
export async function loadRecovery(userId?: string): Promise<RecoveryDraft | null> {
  await writes.catch(() => {});
  const raw = await AsyncStorage.getItem(await key(userId));
  if (!raw) return null;
  const draft = JSON.parse(raw);
  return draft.version === 1 ? draft : null;
}
export async function saveRecovery(draft: RecoveryDraft, userId?: string) {
  const storageKey = await key(userId);
  const value = JSON.stringify({ ...draft, updatedAt: new Date().toISOString() });
  const next = writes.catch(() => {}).then(() => AsyncStorage.setItem(storageKey, value));
  writes = next;
  await next;
}
export async function clearRecovery(userId?: string, keepPhotosForViewer = false) {
  const storageKey = await key(userId);
  const next = writes.catch(() => {}).then(async () => {
    const raw = await AsyncStorage.getItem(storageKey);
    await AsyncStorage.removeItem(storageKey);
    if (Platform.OS !== 'web' && raw) {
      const draft: RecoveryDraft = JSON.parse(raw);
      if (draft.nativeBatchId) {
        const { clearNativeUpload } = await import("./native-upload");
        await clearNativeUpload(draft.nativeBatchId);
      }
      if (!keepPhotosForViewer) cleanupRecoveryPhotos(draft);
      else return draft;
    }
  });
  writes = next;
  return await next;
}
export function cleanupRecoveryPhotos(draft: RecoveryDraft) {
  if (Platform.OS === 'web') return;
  const retakes = [...draft.results, draft.editDraft].flatMap((row: any) => row?.retake_attempt?.uri ? [{ uri: row.retake_attempt.uri }] : []);
  for (const photo of [...draft.photos, ...draft.prepared, ...retakes]) {
    if (photo.uri.startsWith(new Directory(Paths.document, 'walkthrough-recovery').uri)) {
      const file = new File(photo.uri);
      try { if (file.exists) file.delete(); } catch { /* Metadata is cleared; failed local cleanup must not invalidate a saved report. */ }
    }
  }
}
export async function retainPhotos(photos: RecoveryPhoto[], prefix: string,
  onProgress?: (ready: number) => void): Promise<RecoveryPhoto[]> {
  if (Platform.OS === 'web') return photos;
  const { copyAsync } = await import('expo-file-system/legacy');
  const directory = new Directory(Paths.document, 'walkthrough-recovery');
  directory.create({ intermediates: true, idempotent: true });
  const retained = new Array<RecoveryPhoto>(photos.length);
  const created: File[] = [];
  let next = 0, ready = 0;
  let failed = false;
  async function copyPhotos() {
    while (!failed && next < photos.length) {
      const index = next++;
      const photo = photos[index];
      try {
        if (photo.uri.startsWith(directory.uri)) retained[index] = photo;
        else {
          const target = new File(directory, `${prefix}-${index}.jpg`);
          created.push(target);
          await copyAsync({ from: photo.uri, to: target.uri });
          retained[index] = { ...photo, uri: target.uri };
        }
        onProgress?.(++ready);
      } catch (error) { failed = true; throw error; }
    }
  }
  const workers = await Promise.allSettled([copyPhotos(), copyPhotos()]);
  for (const worker of workers) {
    if (worker.status === 'rejected') {
      for (const file of created) { try { if (file.exists) file.delete(); } catch {} }
      throw worker.reason;
    }
  }
  return retained;
}
