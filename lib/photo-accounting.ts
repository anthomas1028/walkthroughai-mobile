export type PhotoResult = {
  source_row_id?: string; source_bbox?: number[]; label_text?: string; saved_revision?: number;
  photo: string; notes?: string; description?: string; part_number?: string;
  manufacturer_part_number?: string; vendor_part_number?: string; customer_part_number?: string;
  fastenal_part_number?: string; is_confirmed?: boolean; was_edited?: boolean;
};
export function resultKey(row: PhotoResult) {
  if (row.source_row_id) return JSON.stringify([row.photo, 'label', row.source_row_id]);
  return legacyKey(row);
}
function legacyKey(row: PhotoResult) {
  return JSON.stringify([row.photo, row.part_number || '', row.manufacturer_part_number || '', row.vendor_part_number || '', row.description || '']);
}
export function resultPhotoIndex(name: string, count: number) {
  const match = /^photo_(\d+)\.[a-z]+$/i.exec(name);
  if (!match) return null;
  const index = Number(match[1]) - 1;
  return index >= 0 && index < count ? index : null;
}
export function photoOutcome(rows: PhotoResult[], removed = false) {
  if (!rows.length) return removed ? 'Excluded after review' : 'Failed / missing';
  const hasCode = (row: PhotoResult) => [row.part_number, row.manufacturer_part_number, row.vendor_part_number, row.customer_part_number, row.fastenal_part_number].some(value => Boolean(value?.trim()));
  if (rows.every(row => !hasCode(row) && !row.description && /failed|no processing result|download/i.test(row.notes || ''))) return 'Failed / missing';
  if (rows.some(row => !hasCode(row))) return 'Needs retake / review';
  if (rows.every(row => row.is_confirmed)) return 'Confirmed';
  return 'Ready to review';
}
export function mergeRecoveryResults<T extends PhotoResult>(incoming: T[], reviewed: T[], removed: string[]) {
  const edits = reviewed.filter(row => row.is_confirmed || row.was_edited || row.saved_revision !== undefined);
  const excluded = new Set(removed);
  const output = incoming.slice();
  const claimed = new Set<number>();
  const keys = (row: PhotoResult) => [
    row.source_row_id && JSON.stringify([row.photo, 'id', row.source_row_id]),
    row.source_bbox?.length === 4 && JSON.stringify([row.photo, 'box', row.source_bbox]),
    row.label_text && JSON.stringify([row.photo, 'label', row.label_text]),
    legacyKey(row),
    row.part_number && JSON.stringify([row.photo, 'part', row.part_number]),
    row.description && JSON.stringify([row.photo, 'description', row.description]),
  ].filter((key): key is string => typeof key === 'string' && key.length > 0);
  const candidates = new Map<string, number[]>();
  const editCounts = new Map<string, number>();
  for (const row of reviewed) {
    for (const key of keys(row)) editCounts.set(key, (editCounts.get(key) || 0) + 1);
  }
  incoming.forEach((row, index) => {
    for (const key of keys(row)) {
      const positions = candidates.get(key);
      if (positions) positions.push(index);
      else candidates.set(key, [index]);
    }
  });
  for (const old of edits) {
    const match = keys(old).map(key => editCounts.get(key) === 1 ? candidates.get(key) : undefined)
      .find(positions => positions?.length === 1 &&
        (!old.source_row_id || !incoming[positions[0]].source_row_id || incoming[positions[0]].source_row_id === old.source_row_id));
    if (!match || claimed.has(match[0])) {
      throw new Error('A saved edit could not be matched to a single label. Reopen your saved draft to review it.');
    }
    const index = match[0];
    claimed.add(index);
    output[index] = { ...incoming[index], ...old };
  }
  return output.filter((row, i) => ![resultKey(row), legacyKey(row), resultKey(incoming[i]), legacyKey(incoming[i])]
    .some(key => excluded.has(key)));
}
