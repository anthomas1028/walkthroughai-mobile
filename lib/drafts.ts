import { Platform } from "react-native";
export function draftKey(userId: string, customerId: string) { return `walkthrough:${userId}:${customerId}`; }
const revisions = new Map<string, number>();
async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const req = indexedDB.open("walkthrough-drafts", 1); req.onupgradeneeded = () => req.result.createObjectStore("drafts"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
export async function readDraft(key: string): Promise<any> {
  if (Platform.OS !== "web") { const storage = (await import("@react-native-async-storage/async-storage")).default; const value = await storage.getItem(key); return value ? JSON.parse(value) : null; }
  const database = await db();
  try { return await new Promise((resolve, reject) => { const req = database.transaction("drafts").objectStore("drafts").get(key); req.onsuccess = () => resolve(req.result || null); req.onerror = () => reject(req.error); }); } finally { database.close(); }
}
export async function writeDraft(key: string, value: any) {
  if (value === null) revisions.set(key, (revisions.get(key) || 0) + 1);
  if (Platform.OS !== "web") {
    const storage = (await import("@react-native-async-storage/async-storage")).default;
    if (value === null) await storage.removeItem(key); else await storage.setItem(key, JSON.stringify(value));
    return;
  }
  const database = await db();
  try { await new Promise<void>((resolve, reject) => { const tx = database.transaction("drafts", "readwrite"); if (value === null) tx.objectStore("drafts").delete(key); else tx.objectStore("drafts").put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { database.close(); }
}
export async function storeGroups(key: string, groups: any[]) {
  const revision = (revisions.get(key) || 0) + 1;
  revisions.set(key, revision);
  if (Platform.OS !== "web") {
    const fs = await import("expo-file-system/legacy");
    const directory = `${fs.documentDirectory}walkthrough-drafts/${encodeURIComponent(key)}/`;
    await fs.makeDirectoryAsync(directory, { intermediates: true });
    const saved = await Promise.all(groups.map(async group => ({ ...group, photos: await Promise.all(group.photos.map(async (photo: any) => {
      if (photo.uri.startsWith(directory)) return photo;
      const uri = `${directory}${encodeURIComponent(photo.id || photo.uri)}.jpg`;
      if (!(await fs.getInfoAsync(uri)).exists) await fs.copyAsync({ from: photo.uri, to: uri });
      return { ...photo, uri };
    })) })));
    if (revisions.get(key) === revision) await writeDraft(key, saved);
    return;
  }
  const saved = await Promise.all(groups.map(async group => ({ ...group, photos: await Promise.all(group.photos.map(async (photo: any) => ({ ...photo, blob: await (await fetch(photo.uri)).blob() }))) })));
  if (revisions.get(key) === revision) await writeDraft(key, saved);
}
export async function restoreGroups(key: string): Promise<any[] | null> {
  const saved = await readDraft(key);
  return saved?.map((group: any) => ({ ...group, photos: group.photos.map((photo: any) => ({ ...photo, uri: photo.blob ? URL.createObjectURL(photo.blob) : photo.uri, blob: undefined })) })) || null;
}
