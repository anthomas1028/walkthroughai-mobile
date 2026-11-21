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

export type SavedOriginal = { name: string; uri: string; area?: string };
export type SavedPhotoGroup = SourcePhoto & { name: string; title: string; area: string; itemCount: number };

export function savedPhotoGroups(items: (PhotoEvidence & { location?: string | null })[], originals: SavedOriginal[]) {
  const groups = new Map<string, SavedPhotoGroup>();
  function add(name: string, uri: string, area?: string | null) {
    let group = groups.get(name);
    if (!group) {
      const number = /^photo_(\d+)\.[^.]+$/i.exec(name);
      const title = number ? `Photo ${Number(number[1])}` : name;
      group = { name, title, uri, area: area || "Unassigned", label: name, itemCount: 0 };
      groups.set(name, group);
    }
    return group;
  }
  for (const photo of originals) add(photo.name, photo.uri, photo.area);
  for (const item of items) {
    const names = (item.photo || "").split(",").map(name => name.trim()).filter(name => name && !name.startsWith("scan_"));
    for (const name of new Set(names)) {
      const uri = name === names[0] ? item.photo_url || "" : "";
      const group = add(name, uri, item.location);
      if (uri) group.uri = uri;
      group.itemCount++;
    }
    for (const retake of item.retake_evidence || []) {
      if (!retake.photo || !retake.photo_url) continue;
      const group = add(retake.photo, retake.photo_url, item.location);
      group.title = `Label close-up · ${names[0] || retake.photo}`;
      group.uri = retake.photo_url;
      if (!names.includes(retake.photo)) group.itemCount++;
    }
  }
  return Array.from(groups.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
