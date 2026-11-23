import type { ExtractedPhoto, PickedZip } from './pick-photo-zip';
import { listZipPhotos, zipPhotoId } from './zip-photos';

export type ZipAsset = ExtractedPhoto & { assetId: string };
export type ZipCounts = { added: number; duplicates: number; ignored: number; overLimit: number; failed: number; firstFailure: string };
export function describeZip(result: ZipCounts) {
  const parts = [`${result.added} photo${result.added === 1 ? '' : 's'} added`];
  if (result.duplicates) parts.push(`${result.duplicates} already included`);
  if (result.ignored) parts.push(`${result.ignored} other file${result.ignored === 1 ? '' : 's'} skipped`);
  if (result.overLimit) parts.push(`${result.overLimit} skipped at the 500-photo limit`);
  if (result.failed) parts.push(`${result.failed} could not be read`);
  return parts.join(' · ');
}

export async function importPhotoZip(archive: PickedZip, remaining: number, seen: Set<string>,
  save: (batch: ZipAsset[]) => Promise<void>, progress: (done: number, total: number) => void, active: () => boolean) {
  const { photos, ignored } = await listZipPhotos(archive.source);
  if (!photos.length) throw new Error('This ZIP contains no supported photos. Choose a ZIP with JPG, PNG, WebP, HEIC, HEIF, or AVIF photos.');
  const counts: ZipCounts = { added: 0, ignored, failed: 0, duplicates: 0, overLimit: 0, firstFailure: '' };
  const batch: ZipAsset[] = [];
  let batchBytes = 0;
  async function checkpoint() {
    if (!batch.length) return;
    await save(batch);
    counts.added += batch.length;
    for (const photo of batch.splice(0)) photo.release(true);
    batchBytes = 0;
  }
  try {
    progress(0, photos.length);
    for (const [index, entry] of photos.entries()) {
      if (!active()) break;
      const assetId = zipPhotoId(entry);
      if (seen.has(assetId)) counts.duplicates++;
      else if (counts.added + batch.length >= remaining) counts.overLimit++;
      else {
        try {
          const asset = await archive.photo(entry);
          batch.push({ ...asset, assetId });
          seen.add(assetId);
          batchBytes += asset.fileSize;
        } catch (error) {
          counts.failed++;
          if (!counts.firstFailure) counts.firstFailure = entry.name + ' — ' + (error instanceof Error ? error.message : 'Could not read this photo.');
        }
      }
      if (!active()) break;
      if (batch.length >= 8 || batchBytes >= 24 * 1024 * 1024) await checkpoint();
      progress(index + 1, photos.length);
      if (index % 4 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    if (active()) await checkpoint();
    return counts;
  } finally {
    for (const photo of batch) photo.release(false);
  }
}
