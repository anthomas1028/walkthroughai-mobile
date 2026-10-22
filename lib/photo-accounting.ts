export type PhotoResult = {
  photo: string; notes?: string; description?: string; part_number?: string;
  manufacturer_part_number?: string; vendor_part_number?: string; customer_part_number?: string;
  fastenal_part_number?: string; is_confirmed?: boolean; was_edited?: boolean;
};
export function resultKey(row: PhotoResult) {
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
  const positions: Record<string, number> = {};
  return incoming.map(row => {
    const index = positions[row.photo] || 0;
    positions[row.photo] = index + 1;
    const old = reviewed.filter(item => item.photo === row.photo)[index];
    return old && (old.is_confirmed || old.was_edited) ? old : row;
  }).filter(row => !removed.includes(resultKey(row)));
}
