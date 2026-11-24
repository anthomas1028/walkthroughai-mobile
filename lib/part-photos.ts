export type PartPhoto = { name: string; item_id: number; uri?: string };
export type FastenalMatch = { sku: string; label: 'Exact Match' | 'Suggested Equivalent' | 'Saved cross-reference'; url: string };
export type SourcingPart = {
  fastenal_match?: FastenalMatch | null;
  item_ids: number[];
  summary: Partial<Record<'manufacturer' | 'manufacturer_part_number' | 'vendor' | 'vendor_part_number' |
    'package_quantity' | 'description' | 'size_specification', string | null>>;
  photos: PartPhoto[];
};

export function savedParts<T extends { id: number }>(items: T[], parts?: SourcingPart[]) {
  if (!parts) return items.map(item => ({ ...item, part: undefined as SourcingPart | undefined }));
  const byId = new Map(items.map(item => [item.id, item]));
  return parts.flatMap((part, index) => {
    const primary = byId.get(part.item_ids[0]);
    return primary ? [{ ...primary, ...part.summary, item_number: index + 1, part }] : [];
  });
}
