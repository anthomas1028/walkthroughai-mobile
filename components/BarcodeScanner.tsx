import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Pressable, Text, View } from 'react-native';
import { SCAN_TYPES, displayBarcode, scannedBarcode, scanKey, type BarcodeScan } from '../lib/barcode-scans';

const button = { minHeight: 44, paddingHorizontal: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#23476A', borderRadius: 10 };
export function BarcodeScanner({ existing, otherScans, blocked, onAttach, onBusy, title = 'Scan for this item', attachLabel = 'Attach code to this item', contextText = 'Works offline. Aim at one barcode. Scanned values stay separate from part numbers.' }: {
  existing: BarcodeScan[]; otherScans: BarcodeScan[]; blocked: boolean;
  onAttach: (scan: BarcodeScan) => Promise<void>; onBusy: (value: boolean) => void;
  title?: string; attachLabel?: string; contextText?: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false), [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [scan, setScan] = useState<BarcodeScan | null>(null), [torch, setTorch] = useState(false);
  const [error, setError] = useState(''), [cameraError, setCameraError] = useState(false), [saving, setSaving] = useState(false);
  const locked = useRef(false), attaching = useRef(false), busyCallback = useRef(onBusy);
  busyCallback.current = onBusy;
  useEffect(() => {
    const listener = AppState.addEventListener('change', value => setForeground(value === 'active'));
    return () => { listener.remove(); busyCallback.current(false); };
  }, []);
  function close() { if (attaching.current) return; setOpen(false); setTorch(false); setScan(null); locked.current = false; onBusy(false); }
  function read(result: BarcodeScanningResult) {
    if (locked.current || blocked || !foreground) return;
    try { const next = scannedBarcode(result.data, result.type); locked.current = true; setScan(next); setTorch(false); setError(''); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Unreadable code. Try a label photo.'); }
  }
  const alreadyAttached = scan && existing.some(value => scanKey(value) === scanKey(scan));
  const duplicate = scan && otherScans.some(value => value.value === scan.value || scanKey(value) === scanKey(scan));
  return <View style={{ marginVertical: 12, borderWidth: 1, borderColor: '#315474', borderRadius: 12, padding: 12 }}>
    {!open ? <Pressable accessibilityRole="button" accessibilityLabel={`Scan barcode: ${title}`} disabled={blocked} style={[button, blocked && { opacity: .45 }]} onPress={() => { setOpen(true); setError(''); setCameraError(false); onBusy(true); }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Scan Barcode</Text></Pressable> : <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{title}</Text><Pressable accessibilityRole="button" disabled={saving} onPress={close} style={button}><Text style={{ color: '#BFDBFE' }}>Close scanner</Text></Pressable></View>
      <Text style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 10 }}>{contextText}</Text>
      {!permission?.granted ? <View><Text style={{ color: '#CBD5E1', marginBottom: 10 }}>Allow camera access to scan a barcode.</Text><Pressable accessibilityRole="button" style={button} onPress={() => { if (permission?.canAskAgain === false) void Linking.openSettings(); else void requestPermission().catch(() => setError('Camera permission could not be requested. Check device settings.')); }}><Text style={{ color: '#FFFFFF' }}>{permission?.canAskAgain === false ? 'Open camera settings' : 'Allow camera'}</Text></Pressable></View> : !scan && !cameraError && foreground ? <View>
        <CameraView facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: [...SCAN_TYPES] }} onBarcodeScanned={read} onMountError={() => { setCameraError(true); setError('The camera could not start. Close the scanner and try again.'); }} style={{ width: '100%', height: 260, borderRadius: 10 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn scanner light off' : 'Turn scanner light on'} style={[button, { marginTop: 8 }]} onPress={() => setTorch(value => !value)}><Text style={{ color: '#BFDBFE' }}>{torch ? 'Light off' : 'Light on'}</Text></Pressable>
      </View> : !foreground ? <Text style={{ color: '#CBD5E1' }}>Scanner paused while the app is in the background.</Text> : null}
      {scan && <View><Text selectable style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginTop: 10 }}>{displayBarcode(scan.value)}</Text><Text style={{ color: '#94A3B8', marginTop: 4 }}>{scan.type} · unclassified</Text>
        {alreadyAttached ? <Text style={{ color: '#FBBF24', marginVertical: 8 }}>This code is already attached to this item.</Text> : duplicate ? <Text style={{ color: '#FBBF24', marginVertical: 8 }}>This code is attached to another item in this walkthrough. Check whether this is the same product before attaching.</Text> : null}
        <Pressable accessibilityRole="button" disabled={saving || !!alreadyAttached || blocked} style={[button, { marginTop: 10, opacity: saving || alreadyAttached ? .45 : 1 }]} onPress={async () => { if (attaching.current) return; attaching.current = true; setSaving(true); try { await onAttach(scan); setSaving(false); setOpen(false); setScan(null); locked.current = false; onBusy(false); } catch (issue) { setError(issue instanceof Error ? issue.message : 'The scanned value could not be saved. Try again.'); } finally { attaching.current = false; setSaving(false); } }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{saving ? 'Saving scan…' : attachLabel}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={saving} style={[button, { marginTop: 8 }]} onPress={() => { setScan(null); setError(''); locked.current = false; }}><Text style={{ color: '#BFDBFE' }}>Scan again</Text></Pressable>
      </View>}
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: '#FCA5A5', marginTop: 8 }}>{error}</Text> : null}
    </>}
  </View>;
}
