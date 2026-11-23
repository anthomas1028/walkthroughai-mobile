// The archive stays on the device. Read the directory first, then inflate one photo at a time.
import { Inflate, strFromU8 } from 'fflate';
import { updatePhotoCrc } from './photo-zip';

export type ZipSource = { size: number; read(offset: number, length: number): Promise<Uint8Array> };
export type ZipPhoto = {
  name: string; mime: string; size: number; crc: number; offset: number; compressed: number;
  method: number; encrypted: boolean;
};
const MiB = 1024 * 1024;
const maxFile = 500 * MiB;
const maxBatch = 4096 * MiB;
const max32 = 0xffffffff;
const types: Record<string, string> = {
  jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', heic: 'heic', heif: 'heif', avif: 'avif',
};
const badZip = () => new Error('The ZIP is incomplete or damaged. Create a new ZIP and try again.');
const view = (bytes: Uint8Array) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
function uint64(data: DataView, offset: number) {
  const value = data.getUint32(offset + 4, true) * 0x100000000 + data.getUint32(offset, true);
  if (!Number.isSafeInteger(value)) throw badZip();
  return value;
}
async function range(source: ZipSource, offset: number, bytes: number) {
  if (offset < 0 || bytes < 0 || offset + bytes > source.size) throw badZip();
  const result = await source.read(offset, bytes);
  if (result.length !== bytes) throw badZip();
  return result;
}
export async function listZipPhotos(source: ZipSource) {
  const tail = await range(source, Math.max(0, source.size - 65557), Math.min(source.size, 65557));
  const d = view(tail);
  let end = tail.length - 22;
  while (end >= 0 && (d.getUint32(end, true) !== 0x06054b50 || end + 22 + d.getUint16(end + 20, true) !== tail.length)) end--;
  if (end < 0) throw badZip();
  if (d.getUint16(end + 4, true) || d.getUint16(end + 6, true)) throw new Error('Choose a single ZIP file. Split archives cannot be imported.');
  let count = d.getUint16(end + 10, true);
  let length = d.getUint32(end + 12, true);
  let start = d.getUint32(end + 16, true);
  if (count === 65535 || start === max32 || length === max32) {
    const locator = view(await range(source, source.size - tail.length + end - 20, 20));
    if (locator.getUint32(0, true) !== 0x07064b50 || locator.getUint32(16, true) !== 1) throw badZip();
    const wide = view(await range(source, uint64(locator, 8), 56));
    if (wide.getUint32(0, true) !== 0x06064b50) throw badZip();
    count = uint64(wide, 32); length = uint64(wide, 40); start = uint64(wide, 48);
  }
  if (count > 50000 || length > 16 * MiB) throw new Error('This ZIP has too many file records. Split it into smaller ZIPs.');
  const bytes = await range(source, start, length);
  const dir = view(bytes);
  const photos: ZipPhoto[] = [];
  let ignored = 0, total = 0, pos = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > length || dir.getUint32(pos, true) !== 0x02014b50) throw badZip();
    const nameEnd = pos + 46 + dir.getUint16(pos + 28, true);
    const extraEnd = nameEnd + dir.getUint16(pos + 30, true);
    const next = extraEnd + dir.getUint16(pos + 32, true);
    if (next > length) throw badZip();
    const path = strFromU8(bytes.subarray(pos + 46, nameEnd)).replace(/\\/g, '/');
    const parts = path.split('/').filter(part => part !== '.');
    const name = parts[parts.length - 1] || '';
    const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase() || '';
    const type = Object.prototype.hasOwnProperty.call(types, extension) ? types[extension] : undefined;
    const mode = dir.getUint32(pos + 38, true) >>> 28;
    if (name && !parts.some(part => part.startsWith('.') || part === '__MACOSX' || !part) && type && mode !== 10 && !/[\x00-\x1f]/.test(path)) {
      let size = dir.getUint32(pos + 24, true), compressed = dir.getUint32(pos + 20, true), offset = dir.getUint32(pos + 42, true);
      if ([size, compressed, offset].includes(max32)) {
        let cursor = nameEnd;
        while (cursor + 4 <= extraEnd && dir.getUint16(cursor, true) !== 1) cursor += 4 + dir.getUint16(cursor + 2, true);
        if (cursor + 4 > extraEnd) throw badZip();
        const fieldEnd = cursor + 4 + dir.getUint16(cursor + 2, true);
        cursor += 4;
        const wide = () => { if (cursor + 8 > Math.min(fieldEnd, extraEnd)) throw badZip(); cursor += 8; return uint64(dir, cursor - 8); };
        if (size === max32) size = wide();
        if (compressed === max32) compressed = wide();
        if (offset === max32) offset = wide();
      }
      total += size;
      if (total > maxBatch) throw new Error('The photos in this ZIP exceed 4 GB. Split them into smaller ZIPs.');
      photos.push({ name, mime: 'image/' + type, size, compressed, offset, method: dir.getUint16(pos + 10, true),
        encrypted: !!(dir.getUint16(pos + 8, true) & 1), crc: dir.getUint32(pos + 16, true) });
    } else if (name && !parts.some(p => p.startsWith('.') || p === '__MACOSX')) ignored++;
    pos = next;
  }
  return { photos, ignored };
}
export function zipPhotoId(photo: ZipPhoto) { return `zip:${photo.size}:${photo.crc.toString(16)}`; }

function isPhoto(bytes: Uint8Array, mime: string) {
  const tag = String.fromCharCode(...bytes.subarray(0, 12));
  if (mime === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === 'image/png') return tag.startsWith('\x89PNG\r\n\x1a\n');
  if (mime === 'image/webp') return tag.startsWith('RIFF') && tag.endsWith('WEBP');
  return tag.slice(4, 8) === 'ftyp';
}
export async function extractZipPhoto(source: ZipSource, photo: ZipPhoto, write: (chunk: Uint8Array) => void) {
  if (photo.encrypted) throw new Error('This photo is password-protected.');
  if (photo.method !== 0 && photo.method !== 8) throw new Error('Unsupported ZIP compression. Use a standard ZIP.');
  if (!photo.size || photo.size > maxFile || photo.compressed > maxFile + MiB) throw new Error('This photo is empty or exceeds 500 MB.');
  const header = view(await range(source, photo.offset, 30));
  if (header.getUint32(0, true) !== 0x04034b50 || header.getUint16(8, true) !== photo.method || (header.getUint16(6, true) & 1)) throw badZip();
  const start = photo.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
  if (start + photo.compressed > source.size || (photo.method === 0 && photo.compressed !== photo.size)) throw badZip();
  let written = 0, crc = -1;
  const prefix = new Uint8Array(12);
  function chunk(bytes: Uint8Array) {
    if (written + bytes.length > photo.size) throw badZip();
    if (written < prefix.length) prefix.set(bytes.subarray(0, prefix.length - written), written);
    written += bytes.length;
    crc = updatePhotoCrc(crc, bytes);
    if (bytes.length) write(bytes);
  }
  const inflater = photo.method === 8 ? new Inflate(chunk) : null;
  for (let n = 0; n < photo.compressed;) {
    const bytes = await range(source, start + n, Math.min(256 * 1024, photo.compressed - n));
    n += bytes.length;
    if (n % (4 * MiB) === 0) await new Promise(resolve => setTimeout(resolve, 0));
    if (!inflater) { chunk(bytes); continue; }
    // Bound temporary inflated output even if an entry lies about its size.
    for (let i = 0; i < bytes.length; i += 8192) {
      inflater.push(bytes.subarray(i, i + 8192), n === photo.compressed && i + 8192 >= bytes.length);
    }
  }
  if (written !== photo.size || ((crc ^ -1) >>> 0) !== photo.crc) throw badZip();
  if (!isPhoto(prefix, photo.mime)) throw new Error('The file does not contain the expected image format.');
  return start;
}
