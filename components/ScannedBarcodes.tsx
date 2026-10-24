import { Pressable, Text, View } from 'react-native';
import { displayBarcode, type BarcodeScan } from '../lib/barcode-scans';
export function ScannedBarcodes({ scans, onRemove }: { scans?: BarcodeScan[]; onRemove?: (scan: BarcodeScan) => void }) {
  if (!scans?.length) return null;
  return <View style={{ marginVertical: 10 }}><Text style={{ color: '#BFDBFE', fontWeight: '700', fontSize: 13 }}>Scanned codes · not classified as part numbers</Text>
    {scans.map((scan, index) => <View key={`${scan.type}-${scan.value}-${index}`} style={{ borderBottomWidth: 1, borderBottomColor: '#26384E', paddingVertical: 8 }}><Text selectable style={{ color: '#FFFFFF', fontSize: 14 }}>{displayBarcode(scan.value)}</Text><Text style={{ color: '#94A3B8', fontSize: 12, marginTop: 3 }}>{scan.type}</Text>{onRemove ? <Pressable accessibilityRole="button" accessibilityLabel={`Remove scanned code ${displayBarcode(scan.value)}`} onPress={() => onRemove(scan)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: '#FCA5A5', fontSize: 12 }}>Remove scan</Text></Pressable> : null}</View>)}
  </View>;
}
