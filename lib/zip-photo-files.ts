import { extractZipPhoto, type ZipPhoto, type ZipSource } from './zip-photos';

export function zipFileSource(file: File): ZipSource {
  return { size: file.size, read: async (offset, length) =>
    new Uint8Array(await file.slice(offset, offset + length).arrayBuffer()) };
}

export async function zipEntryFile(file: File, source: ZipSource, entry: ZipPhoto) {
  const chunks: Blob[] = [];
  const start = await extractZipPhoto(source, entry, chunk => {
    if (entry.method !== 0) chunks.push(new Blob([new Uint8Array(chunk)]));
  });
  const parts = entry.method === 0 ? [file.slice(start, start + entry.size)] : chunks;
  return new File(parts, entry.name, { type: entry.mime, lastModified: file.lastModified });
}
