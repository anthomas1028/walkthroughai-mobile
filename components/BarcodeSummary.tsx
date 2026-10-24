import { Text, View } from 'react-native';
export type BarcodeEvidence = { status: string; printed_part_number?: string; codes: { value: string; format: string }[] };
export function BarcodeSummary({ evidence }: { evidence?: BarcodeEvidence | null }) {
  if (!evidence || evidence.status === 'not_decoded') return null;
  const conflict = evidence.status === 'conflict';
  const label = conflict ? 'Barcode differs · compare the label' : evidence.status === 'matches' ? 'Barcode agrees with printed text' : evidence.status === 'unavailable' ? 'Barcode check unavailable' : 'Barcode decoded · printed comparison needed';
  return <View style={{ borderWidth: 1, borderColor: conflict ? '#A67532' : '#315474', borderRadius: 10, padding: 10, marginVertical: 8 }}>
    <Text style={{ color: conflict ? '#FBBF24' : '#BFDBFE', fontWeight: '700', fontSize: 13 }}>Source photo: {label}</Text>
    {evidence.printed_part_number ? <Text selectable style={{ color: '#CBD5E1', fontSize: 12, marginTop: 4 }}>Printed part number: {evidence.printed_part_number}</Text> : null}
    {evidence.codes.map((code, index) => <Text selectable key={index} style={{ color: '#CBD5E1', fontSize: 12, marginTop: 4 }}>{code.format}: {code.value}</Text>)}
    <Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 4 }}>Barcode values do not replace your inventory fields.</Text>
  </View>;
}
