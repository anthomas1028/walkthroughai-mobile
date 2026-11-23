import type { PickedZip } from './pick-photo-zip';
import { zipFileSource, zipEntryFile } from './zip-photo-files';

function selectZip(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.style.display = 'none';
    function finish() { input.remove(); resolve(input.files?.[0] ?? null); }
    input.onchange = finish;
    input.oncancel = finish;
    document.body.appendChild(input);
    input.click();
  });
}

export async function pickPhotoZip(): Promise<PickedZip | null> {
  const file = await selectZip();
  if (!file) return null;
  const source = zipFileSource(file);
  return {
    source,
    async photo(entry) {
      let blob: Blob = await zipEntryFile(file, source, entry);
      let name = entry.name;
      if (entry.mime === 'image/heic' || entry.mime === 'image/heif') {
        // Chrome and Firefox cannot preview many iPhone originals. Decode locally at full resolution.
        const { heicTo } = await import('heic-to/csp');
        blob = await heicTo({ blob, type: 'image/jpeg', quality: 1 });
        name = name.replace(/\.[^.]+$/, '.jpg');
      }
      const uri = URL.createObjectURL(blob);
      const image = new Image();
      image.src = uri;
      try { await image.decode(); }
      catch { URL.revokeObjectURL(uri); throw new Error('This photo could not be opened.'); }
      return { uri, width: image.naturalWidth, height: image.naturalHeight, fileName: name, mimeType: blob.type, fileSize: blob.size,
        release(saved) { if (!saved) URL.revokeObjectURL(uri); } };
    },
    close() {},
  };
}
