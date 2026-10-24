export type SourcePhoto = { uri: string; label: string };
export type PhotoEvidence = { photo?: string | null; photo_url?: string | null; retake_evidence?: { photo: string; photo_url?: string | null }[] };
export function sourcePhotos(items: PhotoEvidence[]): SourcePhoto[] {
  const photos = new Map<string, SourcePhoto>();
  for (const item of items) {
    if (item.photo_url) photos.set(item.photo_url, { uri: item.photo_url, label: item.photo || 'Original photo' });
    for (const closeup of item.retake_evidence || []) {
      if (closeup.photo_url) photos.set(closeup.photo_url, { uri: closeup.photo_url, label: `Label close-up · ${item.photo || 'same item'}` });
    }
  }
  return [...photos.values()];
}
