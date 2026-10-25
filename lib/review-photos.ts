import { sourcePhotos, type PhotoEvidence } from './source-photos';
import { isScanReference } from './capture-scans';
type LocalPhoto = { uri: string; fileName?: string };
export function resolveReviewPhoto(item: PhotoEvidence, photos: LocalPhoto[]) {
  const label = item.photo || 'Source photo';
  if (isScanReference(item.photo)) return null;
  const match = /(?:photo|image)[-_ ]*0*(\d+)/i.exec(label);
  const index = match ? Number(match[1]) - 1 : photos.length === 1 ? 0 : -1;
  const local = photos.find(photo => photo.fileName === item.photo) || photos[index];
  if (local?.uri) return { uri: local.uri, label, fallbackUri: item.photo_url || undefined };
  return item.photo_url ? { uri: item.photo_url, label } : null;
}
export function reviewPhotos(items: PhotoEvidence[], photos: LocalPhoto[]) {
  const local = photos.map((photo, index) => ({ uri: photo.uri, label: `Photo ${index + 1}` }));
  return [...local, ...sourcePhotos(items)];
}
