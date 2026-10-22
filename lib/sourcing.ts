export type SourcingComparison = { attribute: string; source: string; candidate: string; status: 'matches' | 'differs' | 'missing'; required: boolean };
export type CatalogProduct = { sku: string; brand: string; manufacturer_part_number: string; description: string; url: string; specs: Record<string,string> };
export type SourcingCandidate = CatalogProduct & { match_type: string; comparisons: SourcingComparison[]; requires_acknowledgement: boolean; review_required: boolean };
export type SourcingProposal = { id: string; status: string; source_number: string; source?: CatalogProduct | null; candidates: SourcingCandidate[];
  checked_at?: string; error?: string; selection?: { candidate_index: number; reviewed_by: string; reviewed_at: string } | null };
export type SourcingState = { sourceNumber: string; targetToken: string; proposalId?: string; proposal?: SourcingProposal; error?: string };
export function applySourcingSelection<T extends { fastenal_part_number: string; sourcing_previous_fastenal?: string }>(original: T, state: SourcingState, proposal: SourcingProposal) {
  const selection = proposal.selection;
  const candidate = selection && proposal.candidates[selection.candidate_index];
  if (!selection || !candidate || proposal.id !== state.proposalId || proposal.source_number !== state.sourceNumber.trim().toUpperCase()) throw new Error('Select and review a valid sourcing candidate first.');
  return { ...original, sourcing_previous_fastenal: original.sourcing_previous_fastenal ?? original.fastenal_part_number, fastenal_part_number: candidate.sku, sourcing_selection_id: proposal.id, sourcing_target_token: state.targetToken,
    sourcing_state: { ...state, proposal }, was_edited: true, is_confirmed: false, review_needed: true };
}

export type SavedSourcing = { source_supplier: string; source_number: string; source?: CatalogProduct | null; candidate?: SourcingCandidate | null;
  checked_at?: string; selection?: { reviewed_by: string; reviewed_at: string } | null; status: string };
