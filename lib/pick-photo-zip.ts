import { Directory, File, Paths } from 'expo-file-system';
import { Image } from 'react-native';
import { copyAsync } from 'expo-file-system/legacy';
import { extractZipPhoto, type ZipPhoto, type ZipSource } from './zip-photos';

export type ExtractedPhoto = { uri: string; fileName: string; mimeType: string; fileSize: number; width: number; height: number; release(saved: boolean): void };
export type PickedZip = {
  source: ZipSource;
  photo(entry: ZipPhoto): Promise<ExtractedPhoto>;
  close(): void;
};

export async function pickPhotoZip(): Promise<PickedZip | null> {
  let selected;
  try {
    selected = await File.pickFileAsync(undefined, 'application/zip');
  } catch (error) {
    if (/cancel/i.test(String(error))) return null;
    throw error;
  }
  const picked = Array.isArray(selected) ? selected[0] : selected;
  if (!picked) return null;
  const folder = new Directory(Paths.cache, 'photo-import-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  folder.create();
  try {
    let archive = picked;
    if (picked.uri.startsWith('content:')) {
      archive = new File(folder, 'source.zip');
      await copyAsync({ from: picked.uri, to: archive.uri });
    }
    const input = archive.open();
    const source: ZipSource = { size: input.size ?? archive.size, read: async (offset, length) => {
      input.offset = offset;
      return input.readBytes(length);
    } };
    return {
      source,
      async photo(entry) {
        const output = new File(folder, entry.offset + '.' + entry.name.split('.').pop());
        output.create();
        try {
          const handle = output.open();
          try { await extractZipPhoto(source, entry, bytes => handle.writeBytes(bytes)); }
          finally { handle.close(); }
          const { width, height } = await Image.getSize(output.uri);
          return { uri: output.uri, width, height, fileName: entry.name, mimeType: entry.mime, fileSize: entry.size,
            release() { try { if (output.exists) output.delete(); } catch { /* Folder cleanup retries after import. */ } } };
        } catch (error) {
          if (output.exists) output.delete();
          throw error;
        }
      },
      close() {
        try { input.close(); } finally {
          try { folder.delete(); } catch { /* Temporary cache can be reclaimed by the OS. */ }
          // iOS imports a private copy into Inbox. Never remove a user-selected source.
          if (picked.uri.startsWith(Paths.document.uri.replace(/\/$/, '') + '/Inbox/')) {
            try { if (picked.exists) picked.delete(); } catch { /* The provider owns cleanup if access expired. */ }
          }
        }
      },
    };
  } catch (error) {
    folder.delete();
    throw error;
  }
}
