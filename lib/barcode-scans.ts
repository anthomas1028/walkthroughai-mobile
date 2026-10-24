export const SCAN_TYPES = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'codabar', 'itf14', 'datamatrix'] as const;
export type BarcodeScan = { value: string; type: string; captured_at: string };
export function scannedBarcode(value: string, type: string): BarcodeScan {
  if (!(SCAN_TYPES as readonly string[]).includes(type) || !value.trim() || value.length > 512 || /[\x00-\x1c\x1e-\x1f\x7f]/.test(value)) {
    throw new Error('This code could not be recorded safely. Take a label photo instead.');
  }
  return { value, type, captured_at: new Date().toISOString() };
}
export function displayBarcode(value: string) { return value.replace(/\x1d/g, '[GS]'); }
export function scanKey(scan: Pick<BarcodeScan, 'value' | 'type'>): string {
  const value = scan.value;
  if (['ean13', 'ean8', 'upc_a', 'itf14'].includes(scan.type) && /^\d{8}$|^\d{12,14}$/.test(value)) {
    const digits = value.slice(0, -1).split('').reverse();
    const sum = digits.reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 3 : 1), 0);
    if ((10 - sum % 10) % 10 === Number(value.at(-1))) return `gtin:${value.padStart(14, '0')}`;
  }
  return `code:${value}`;
}
function note(scan: BarcodeScan) { return `Camera scan (${scan.type}): ${displayBarcode(scan.value)} · unclassified; verify label.`; }
export function attachBarcode<T extends { scanned_barcodes?: BarcodeScan[]; notes?: string }>(item: T, scan: BarcodeScan) {
  const existing = item.scanned_barcodes || [];
  if (existing.some(value => scanKey(value) === scanKey(scan))) return item;
  if (existing.length >= 12) throw new Error('This item already has 12 scanned codes. Remove an incorrect code before adding another.');
  return { ...item, scanned_barcodes: [...existing, scan], notes: [item.notes, note(scan)].filter(Boolean).join('\n'), was_edited: true, is_confirmed: false, review_needed: true };
}
export function removeBarcode<T extends { scanned_barcodes?: BarcodeScan[]; notes?: string }>(item: T, scan: BarcodeScan) {
  return { ...item, scanned_barcodes: (item.scanned_barcodes || []).filter(value => scanKey(value) !== scanKey(scan)),
    notes: (item.notes || '').split('\n').filter(line => line !== note(scan)).join('\n'), was_edited: true, is_confirmed: false, review_needed: true };
}
