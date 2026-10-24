import { attachBarcode, displayBarcode, scanKey, type BarcodeScan } from './barcode-scans';
export type CapturedScan = BarcodeScan & { id: string; labelPhotoId?: string };
export type ScanGroup = { name: string; scans?: CapturedScan[]; photos?: { id: string }[] };
export function isScanReference(photo: string | null | undefined) { return !!photo?.startsWith('scan_'); }
export function captureScanRows(groups: ScanGroup[]) {
  const photos = groups.flatMap(group => group.photos || []);
  return groups.flatMap(group => (group.scans || []).map(scan => attachBarcode({
    photo: scan.labelPhotoId && photos.some(photo => photo.id === scan.labelPhotoId) ? `photo_${String(photos.findIndex(photo => photo.id === scan.labelPhotoId) + 1).padStart(3, '0')}.jpg` : `scan_${scan.id}`, location: group.name, description: `Barcode scan · ${displayBarcode(scan.value)}`,
    part_number: '', manufacturer_part_number: '', vendor_part_number: '', customer_part_number: '', fastenal_part_number: '',
    manufacturer: '', vendor: '', size_specification: '', package_quantity: '', label_text: '', confidence: 0,
    notes: scan.labelPhotoId && photos.some(photo => photo.id === scan.labelPhotoId) ? 'Barcode with employee-attached label photo. Verify product details.' : 'Captured barcode only. Product and number type require employee review; no source photo was taken.',
    is_confirmed: false, review_needed: true,
  }, scan)));
}
export function addAreaScan<T extends { scans?: CapturedScan[] }>(group: T, scan: BarcodeScan, id: string) {
  const existing = group.scans || [];
  if (existing.some(value => scanKey(value) === scanKey(scan))) return group;
  if (existing.length >= 100) throw new Error('This area already has 100 scans. Start another walkthrough for more items.');
  return { ...group, scans: [...existing, { ...scan, id }] };
}

// Pair only when OCR found a single item in the explicitly attached label photo.
// Multi-product photos keep their barcode row separate for employee review.
export function mergeCaptureScans<T extends { photo?: string; scanned_barcodes?: BarcodeScan[]; notes?: string }>(recognized: T[], scans: T[]): T[] {
  const merged = [...recognized];
  for (const row of scans) {
    const matches = merged.map((item, index) => ({ item, index })).filter(({ item }) => item.photo === row.photo);
    if (!isScanReference(row.photo) && matches.length === 1) {
      const { item, index } = matches[0];
      let next = item;
      for (const scan of row.scanned_barcodes || []) next = attachBarcode(next, scan);
      merged[index] = { ...next, notes: [next.notes, row.notes].filter(Boolean).join('\n') };
    } else merged.push(row);
  }
  return merged;
}
