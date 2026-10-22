import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type RecoveryPhoto = { id: string; uri: string; fileName: string; mimeType: string; location: string };
export type RecoveryDraft = {
  version: 1; customerId: string; customerName: string; contactName: string;
  photos: RecoveryPhoto[]; prepared: RecoveryPhoto[]; uploadId: string;
  removedPhotos?: string[];
  editingIndex?: number | null; editDraft?: unknown;
  uploaded: number[]; jobId: string; results: unknown[]; updatedAt: string;
};
let writes = Promise.resolve();
async function key() {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.id) throw new Error('Sign in to recover your walkthrough.');
  return `walkthrough-recovery-v1:${data.session.user.id}`;
}
export async function loadRecovery(): Promise<RecoveryDraft | null> {
  await writes;
  const raw = await AsyncStorage.getItem(await key());
  if (!raw) return null;
  const draft = JSON.parse(raw);
  return draft.version === 1 ? draft : null;
}
export async function saveRecovery(draft: RecoveryDraft) {
  const storageKey = await key();
  const value = JSON.stringify({ ...draft, updatedAt: new Date().toISOString() });
  const next = writes.catch(() => {}).then(() => AsyncStorage.setItem(storageKey, value));
  writes = next;
  await next;
}
export async function clearRecovery() {
  const storageKey = await key();
  const next = writes.catch(() => {}).then(async () => {
    const raw = await AsyncStorage.getItem(storageKey);
    await AsyncStorage.removeItem(storageKey);
    if (Platform.OS !== 'web' && raw) {
      const draft: RecoveryDraft = JSON.parse(raw);
      for (const photo of [...draft.photos, ...draft.prepared]) {
        if (photo.uri.startsWith(new Directory(Paths.document, 'walkthrough-recovery').uri)) {
          const file = new File(photo.uri);
          try { if (file.exists) file.delete(); } catch { /* Metadata is cleared; failed local cleanup must not invalidate a saved report. */ }
        }
      }
    }
  });
  writes = next;
  await next;
}
export async function retainPhotos(photos: RecoveryPhoto[], prefix: string): Promise<RecoveryPhoto[]> {
  if (Platform.OS === 'web') return photos;
  const directory = new Directory(Paths.document, 'walkthrough-recovery');
  directory.create({ intermediates: true, idempotent: true });
  return photos.map((photo, index) => {
    const source = new File(photo.uri);
    if (photo.uri.startsWith(directory.uri)) return photo;
    const target = new File(directory, `${prefix}-${index}.jpg`);
    source.copy(target);
    return { ...photo, uri: target.uri };
  });
}
