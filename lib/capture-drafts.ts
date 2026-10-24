import AsyncStorage from '@react-native-async-storage/async-storage';
export type CaptureDraft = { customerId: string; customerName: string; contactName: string; photoCount: number; updatedAt: string };
let writes = Promise.resolve();
function storageKey(userId: string) {
  if (!userId) throw new Error('Sign in before saving a walkthrough.');
  return `walkthrough-capture-index:${userId}`;
}
export async function captureDrafts(userId: string): Promise<CaptureDraft[]> {
  await writes;
  const value = await AsyncStorage.getItem(storageKey(userId));
  return value ? JSON.parse(value) : [];
}
export async function saveCaptureDraft(userId: string, draft: Omit<CaptureDraft, 'updatedAt'>) {
  const key = storageKey(userId);
  const next = writes.catch(() => {}).then(async () => {
    const raw = await AsyncStorage.getItem(key);
    const current: CaptureDraft[] = raw ? JSON.parse(raw) : [];
    const other = current.filter(value => value.customerId !== draft.customerId);
    await AsyncStorage.setItem(key, JSON.stringify(draft.photoCount ? [{ ...draft, updatedAt: new Date().toISOString() }, ...other] : other));
  });
  writes = next;
  await next;
}
