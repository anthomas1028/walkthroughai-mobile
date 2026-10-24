import { attachBarcode, displayBarcode, scanKey, type BarcodeScan } from './barcode-scans';
export type CapturedScan = BarcodeScan & { id: string };
export type ScanGroup = { name: string; scans?: CapturedScan[] };
export function isScanReference(photo: string | null | undefined) { return !!photo?.startsWith('scan_'); }
export function captureScanRows(groups: ScanGroup[]) {
  return groups.flatMap(group => (group.scans || []).map(scan => attachBarcode({
    photo: `scan_${scan.id}`, location: group.name, description: `Barcode scan · ${displayBarcode(scan.value)}`,
    part_number: '', manufacturer_part_number: '', vendor_part_number: '', customer_part_number: '', fastenal_part_number: '',
    manufacturer: '', vendor: '', size_specification: '', package_quantity: '', label_text: '', confidence: 0,
    notes: 'Captured barcode only. Product and number type require employee review; no source photo was taken.',
    is_confirmed: false, review_needed: true,
  }, scan)));
}
export function addAreaScan<T extends { scans?: CapturedScan[] }>(group: T, scan: BarcodeScan, id: string) {
  const existing = group.scans || [];
  if (existing.some(value => scanKey(value) === scanKey(scan))) return group;
  if (existing.length >= 100) throw new Error('This area already has 100 scans. Start another walkthrough for more items.');
  return { ...group, scans: [...existing, { ...scan, id }] };
}
