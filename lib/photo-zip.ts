// Stored ZIP entries preserve image bytes. Only the small directory records are retained.
import { strToU8 } from "fflate";

const max32 = 0xffffffff;
const table = Uint32Array.from({ length: 256 }, (_, value) => {
  for (let i = 0; i < 8; i++) value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  return value >>> 0;
});

function record(length: number, signature: number) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  const word = (at: number, n: number) => view.setUint16(at, n, true);
  const long = (at: number, n: number) => view.setUint32(at, n, true);
  const wide = (at: number, n: number) => { long(at, n); long(at + 4, Math.floor(n / 0x100000000)); };
  long(0, signature);
  return { bytes, word, long, wide };
}

export class PhotoZip {
  private entries: Uint8Array[] = [];
  private offset = 0;
  constructor(private write: (bytes: Uint8Array) => void) {}

  add(name: string, photo: Uint8Array) {
    const filename = strToU8(name);
    const size = photo.length;
    // Individual files are limited to 500 MiB by the upload server.
    if (size >= max32 || filename.length > 65535) throw new Error("ZIP entry exceeds its size limit.");
    let crc = -1;
    for (const byte of photo) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
    crc = (crc ^ -1) >>> 0;
    const local = record(30 + filename.length, 0x04034b50);
    local.word(4, 20); local.word(6, 0x800); local.word(12, 0x21);
    local.long(14, crc); local.long(18, size); local.long(22, size);
    local.word(26, filename.length); local.bytes.set(filename, 30);
    const large = this.offset >= max32;
    const central = record(46 + filename.length + (large ? 12 : 0), 0x02014b50);
    central.word(4, 45); central.word(6, large ? 45 : 20); central.word(8, 0x800); central.word(14, 0x21);
    central.long(16, crc); central.long(20, size); central.long(24, size);
    central.word(28, filename.length); central.word(30, large ? 12 : 0);
    central.long(42, large ? max32 : this.offset); central.bytes.set(filename, 46);
    if (large) {
      const extra = 46 + filename.length;
      central.word(extra, 1); central.word(extra + 2, 8); central.wide(extra + 4, this.offset);
    }
    this.write(local.bytes); this.write(photo);
    this.offset += local.bytes.length + size;
    this.entries.push(central.bytes);
  }

  finish() {
    const start = this.offset;
    for (const entry of this.entries) { this.write(entry); this.offset += entry.length; }
    const size = this.offset - start;
    const count = this.entries.length;
    if (this.offset >= max32) {
      const end = record(56, 0x06064b50);
      end.wide(4, 44); end.word(12, 45); end.word(14, 45);
      end.wide(24, count); end.wide(32, count); end.wide(40, size); end.wide(48, start);
      const locator = record(20, 0x07064b50);
      locator.wide(8, this.offset); locator.long(16, 1);
      this.write(end.bytes); this.write(locator.bytes);
    }
    const end = record(22, 0x06054b50);
    end.word(8, count); end.word(10, count); end.long(12, size); end.long(16, Math.min(start, max32));
    this.write(end.bytes);
  }
}
