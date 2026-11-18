import { Platform } from "react-native";
export function draftKey(userId: string, customerId: string) { return `walkthrough:${userId}:${customerId}`; }
const browserPhotos = new WeakMap<object, { uri: string; blob: Blob }>();
const revisions = new Map<string, number>();
const saves = new Map<string, Promise<any>>();
async function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const req = indexedDB.open("walkthrough-drafts", 1); req.onupgradeneeded = () => req.result.createObjectStore("drafts"); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
export async function readDraft(key: string): Promise<any> {
  if (Platform.OS !== "web") { const storage = (await import("@react-native-async-storage/async-storage")).default; const value = await storage.getItem(key); return value ? JSON.parse(value) : null; }
  const database = await db();
  const tx = database.transaction("drafts");
  const store = tx.objectStore("drafts");
  try {
    return await new Promise((resolve, reject) => {
      const request = store.get(key);
      let groups: any;
      request.onsuccess = () => {
        groups = request.result;
        for (const group of groups || []) {
          for (const photo of group.photos) {
            if (!photo.blobKey) continue; // Older drafts already contain their bytes.
            const bytes = store.get(photo.blobKey);
            bytes.onsuccess = () => {
              if (!bytes.result) {
                photo.previewError = "Photo missing from this device. Remove it or select its original again.";
                return;
              }
              photo.blob = bytes.result;
            };
          }
        }
      };
      tx.oncomplete = () => resolve(groups || null);
      tx.onabort = () => reject(tx.error || new Error("Draft photo data is missing."));
    });
  } finally { database.close(); }
}
export async function writeDraft(key: string, value: any) {
  if (value === null) revisions.set(key, (revisions.get(key) || 0) + 1);
  if (Platform.OS !== "web") {
    const storage = (await import("@react-native-async-storage/async-storage")).default;
    if (value === null) {
      const revision = revisions.get(key);
      const queued = saves.get(key);
      await queued?.catch(() => {});
      if (revisions.get(key) !== revision) return;
      await storage.removeItem(key);
      const fs = await import("expo-file-system/legacy");
      if (revisions.get(key) === revision) {
        const directory = `${fs.documentDirectory}walkthrough-drafts/${encodeURIComponent(key)}/`;
        await fs.deleteAsync(directory, { idempotent: true });
      }
    } else await storage.setItem(key, JSON.stringify(value));
    return;
  }
  const database = await db();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = database.transaction("drafts", "readwrite");
      const store = tx.objectStore("drafts");
      const previous = store.get(key);
      previous.onsuccess = () => {
        const oldKeys = new Set<string>();
        for (const group of previous.result || []) {
          for (const photo of group.photos) if (photo.blobKey) oldKeys.add(photo.blobKey);
        }
        if (value === null) store.delete(key);
        else {
          const groups = value.map((group: any) => ({ ...group, photos: group.photos.map((photo: any) => {
            const { blob, ...metadata } = photo;
            if (!blob) { if (metadata.blobKey) oldKeys.delete(metadata.blobKey); return metadata; }
            const immutable = metadata.uri.startsWith("blob:");
            const blobKey = metadata.restoredUri === metadata.uri && oldKeys.has(metadata.blobKey)
              ? metadata.blobKey
              : JSON.stringify([key, metadata.id || "", immutable ? metadata.uri : crypto.randomUUID()]);
            delete metadata.restoredUri;
            // Only blob URLs identify immutable content for their full lifetime.
            if (!oldKeys.has(blobKey)) store.put(blob, blobKey);
            oldKeys.delete(blobKey);
            return { ...metadata, uri: "", blobKey };
          }) }));
          store.put(groups, key);
        }
        for (const removed of oldKeys) store.delete(removed);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("Draft could not be saved."));
    });
  } finally { database.close(); }
}
export async function storeGroups(key: string, groups: any[]) {
  const revision = (revisions.get(key) || 0) + 1;
  revisions.set(key, revision);
  const operation = (saves.get(key) || Promise.resolve()).catch(() => {}).then(async () => {
  if (revisions.get(key) !== revision) return null;
  const fs = Platform.OS === "web" ? null : await import("expo-file-system/legacy");
  const directory = fs ? `${fs.documentDirectory}walkthrough-drafts/${encodeURIComponent(key)}/` : "";
  if (fs) await fs.makeDirectoryAsync(directory, { intermediates: true });

  async function persistPhoto(photo: any) {
    if (fs) {
      if (photo.uri.startsWith(directory)) return photo;
      const uri = `${directory}${encodeURIComponent(photo.id || photo.uri)}.jpg`;
      if (!(await fs.getInfoAsync(uri)).exists) await fs.copyAsync({ from: photo.uri, to: uri });
      return { ...photo, uri };
    }
    // A blob URL identifies immutable bytes. Let removed photo objects be collected.
    const cached = browserPhotos.get(photo);
    if (cached && cached.uri === photo.uri) return { ...photo, blob: cached.blob };
    if (!photo.uri && photo.previewError) return photo;
    const response = await fetch(photo.uri);
    if (!response.ok) throw new Error("A draft photo could not be read.");
    const blob = await response.blob();
    if (photo.uri.startsWith("blob:")) browserPhotos.set(photo, { uri: photo.uri, blob });
    return { ...photo, blob };
  }

  const saved = [];
  for (const group of groups) {
    const photos = [];
    for (let start = 0; start < group.photos.length; start += 4) {
      if (revisions.get(key) !== revision) return null;
      photos.push(...await Promise.all(group.photos.slice(start, start + 4).map(persistPhoto)));
    }
    saved.push({ ...group, photos });
  }
  if (revisions.get(key) === revision) { await writeDraft(key, saved); return saved; }
  return null;
  });
  saves.set(key, operation);
  try { return await operation; }
  finally { if (saves.get(key) === operation) saves.delete(key); }
}
export async function restoreGroups(key: string): Promise<any[] | null> {
  const saved = await readDraft(key);
  return saved?.map((group: any) => ({ ...group, photos: group.photos.map((photo: any) => {
    const uri = photo.blob ? URL.createObjectURL(photo.blob) : photo.uri;
    return { ...photo, uri, restoredUri: uri, blob: undefined };
  }) })) || null;
}
