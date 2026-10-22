// Experimental workflow: enabled only by the separate test-app configuration.
export const RETAKE_FIELDS = ['part_number', 'manufacturer_part_number', 'vendor_part_number',
  'customer_part_number', 'fastenal_part_number', 'description', 'manufacturer', 'vendor',
  'size_specification', 'package_quantity'] as const;
export type RetakeCandidate = Partial<Record<typeof RETAKE_FIELDS[number], string>> & { label_text?: string; notes?: string };
export type RetakeAttempt = { uri: string; uploadId?: string; jobId?: string; candidates?: RetakeCandidate[]; error?: string; qualityWarnings?: string[] };
export type RetakeReference = { job_id: string; candidate_index: number };
export function validLabelBox(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length !== 4 || value.some(n => typeof n !== 'number' || !Number.isFinite(n))) return null;
  const [x,y,r,b] = value;
  return x >= 0 && y >= 0 && r <= 1000 && b <= 1000 && r > x && b > y ? value : null;
}
export function retakeChanges(original: RetakeCandidate, candidate: RetakeCandidate) {
  return RETAKE_FIELDS.filter(field => Boolean(candidate[field]?.trim())).map(field => ({ field,
    before: original[field]?.trim() || '', after: candidate[field]!.trim(),
    conflict: Boolean(original[field]?.trim() && original[field]!.trim() !== candidate[field]!.trim()) }));
}
export function fillRetakeBlanks<T extends RetakeCandidate>(original: T, candidate: RetakeCandidate) {
  const next = { ...original };
  for (const change of retakeChanges(original, candidate)) {
    if (!change.before) (next as RetakeCandidate)[change.field] = change.after;
  }
  return { ...next, was_edited: true, is_confirmed: false, review_needed: true };
}
