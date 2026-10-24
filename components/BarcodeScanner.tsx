import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { AppState, Image, Linking, Pressable, Text, View } from 'react-native';
import { SCAN_TYPES, displayBarcode, scannedBarcode, scanKey, type BarcodeScan } from '../lib/barcode-scans';

const button = { minHeight: 44, paddingHorizontal: 12, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: '#23476A', borderRadius: 10 };
export type ScanLabelPhoto = { uri: string; width: number; height: number };
export function BarcodeScanner({ continuous = false, allowLabelPhoto = false, existing, otherScans, blocked, onAttach, onBusy, title = 'Scan for this item', attachLabel = 'Attach code to this item', contextText = 'Works offline. Aim at one barcode. Scanned values stay separate from part numbers.' }: {
  existing: BarcodeScan[]; otherScans: BarcodeScan[]; blocked: boolean;
  onAttach: (scan: BarcodeScan, photo?: ScanLabelPhoto) => Promise<void>; onBusy: (value: boolean) => void;
  title?: string; attachLabel?: string; contextText?: string; continuous?: boolean; allowLabelPhoto?: boolean;
}) {
  const camera = useRef<CameraView | null>(null);
  const [quantity, setQuantity] = useState(1), [savedCount, setSavedCount] = useState(0);
  const [labelPhoto, setLabelPhoto] = useState<ScanLabelPhoto | undefined>();
  const [takingPhoto, setTakingPhoto] = useState(false);
  const photoLock = useRef(false);
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
  function close() { if (attaching.current || photoLock.current) return; setOpen(false); setTorch(false); setScan(null); setLabelPhoto(undefined); locked.current = false; onBusy(false); }
  function read(result: BarcodeScanningResult) {
    if (locked.current || blocked || !foreground) return;
    try { const next = scannedBarcode(result.data, result.type); locked.current = true; setScan(next); setQuantity(1); setLabelPhoto(undefined); setError(''); void Haptics.notificationAsync(existing.some(value => scanKey(value) === scanKey(next)) ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Unreadable code. Try a label photo.'); }
  }
  const alreadyAttached = scan && existing.some(value => scanKey(value) === scanKey(scan));
  const duplicate = scan && otherScans.some(value => value.value === scan.value || scanKey(value) === scanKey(scan));
  return <View style={{ marginVertical: 12, borderWidth: 1, borderColor: '#315474', borderRadius: 12, padding: 12 }}>
    {!open ? <Pressable accessibilityRole="button" accessibilityLabel={`Scan barcode: ${title}`} disabled={blocked} style={[button, blocked && { opacity: .45 }]} onPress={() => { setOpen(true); setSavedCount(0); setError(''); setCameraError(false); onBusy(true); }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Scan Barcode</Text></Pressable> : <>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}><Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '700' }}>{title}</Text><Pressable accessibilityRole="button" disabled={saving || takingPhoto} onPress={close} style={button}><Text style={{ color: '#BFDBFE' }}>Close scanner</Text></Pressable></View>
      <Text style={{ color: '#CBD5E1', fontSize: 12, marginBottom: 10 }}>{contextText}</Text>
      {continuous && <Text accessibilityLiveRegion="polite" style={{ color: '#86EFAC', marginBottom: 8 }}>{savedCount} saved this session · Save & next keeps the scanner open</Text>}
      {!permission?.granted ? <View><Text style={{ color: '#CBD5E1', marginBottom: 10 }}>Allow camera access to scan a barcode.</Text><Pressable accessibilityRole="button" style={button} onPress={() => { if (permission?.canAskAgain === false) void Linking.openSettings(); else void requestPermission().catch(() => setError('Camera permission could not be requested. Check device settings.')); }}><Text style={{ color: '#FFFFFF' }}>{permission?.canAskAgain === false ? 'Open camera settings' : 'Allow camera'}</Text></Pressable></View> : (!scan || allowLabelPhoto) && !cameraError && foreground ? <View>
        <CameraView ref={camera} facing="back" enableTorch={torch} barcodeScannerSettings={{ barcodeTypes: [...SCAN_TYPES] }} onBarcodeScanned={scan ? undefined : read} onMountError={() => { setCameraError(true); setError('The camera could not start. Close the scanner and try again.'); }} style={{ width: '100%', height: 210, borderRadius: 10 }} />
        <Pressable accessibilityRole="button" accessibilityLabel={torch ? 'Turn scanner light off' : 'Turn scanner light on'} style={[button, { marginTop: 8 }]} onPress={() => setTorch(value => !value)}><Text style={{ color: '#BFDBFE' }}>{torch ? 'Light off' : 'Light on'}</Text></Pressable>
      </View> : !foreground ? <Text style={{ color: '#CBD5E1' }}>Scanner paused while the app is in the background.</Text> : null}
      {scan && <View><Text selectable style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 16, marginTop: 10 }}>{displayBarcode(scan.value)}</Text><Text style={{ color: '#94A3B8', marginTop: 4 }}>{scan.type} · unclassified</Text>
        {alreadyAttached ? <Text style={{ color: '#FBBF24', marginVertical: 8 }}>Already scanned here. This code will not be added twice.</Text> : duplicate ? <Text style={{ color: '#FBBF24', marginVertical: 8 }}>This code is attached to another item in this walkthrough. Check whether this is the same product before attaching.</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Decrease counted quantity" disabled={saving || quantity <= 1} style={[button, { minWidth: 60, minHeight: 52 }]} onPress={() => setQuantity(value => Math.max(1, value - 1))}><Text style={{ color: '#FFFFFF', fontSize: 24 }}>−</Text></Pressable>
          <Text accessibilityLiveRegion="polite" style={{ color: '#FFFFFF', fontWeight: '700' }}>Counted quantity: {quantity}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Increase counted quantity" disabled={saving || quantity >= 9999} style={[button, { minWidth: 60, minHeight: 52 }]} onPress={() => setQuantity(value => Math.min(9999, value + 1))}><Text style={{ color: '#FFFFFF', fontSize: 24 }}>+</Text></Pressable>
        </View>
        {allowLabelPhoto && <View>
          {labelPhoto && <Image accessibilityLabel="Attached label photo preview" source={{ uri: labelPhoto.uri }} style={{ width: '100%', height: 130, marginTop: 8, borderRadius: 8 }} resizeMode="contain" />}
          <Pressable accessibilityRole="button" disabled={saving || takingPhoto || !foreground || cameraError} style={[button, { marginTop: 8 }]} onPress={async () => {
            if (photoLock.current || attaching.current) return;
            photoLock.current = true; setTakingPhoto(true); setError('');
            try { const photo = await camera.current?.takePictureAsync({ quality: .95 }); if (!photo?.uri) throw new Error('Camera is not ready. Try again.'); setLabelPhoto({ uri: photo.uri, width: photo.width, height: photo.height }); }
            catch (issue) { setError(issue instanceof Error ? issue.message : 'Label photo could not be taken. Try again.'); }
            finally { photoLock.current = false; setTakingPhoto(false); }
          }}><Text style={{ color: '#BFDBFE' }}>{takingPhoto ? 'Taking label photo…' : labelPhoto ? 'Retake label photo' : 'Add label photo (optional)'}</Text></Pressable>
        </View>}
        <Pressable accessibilityRole="button" disabled={saving || takingPhoto || !!alreadyAttached || blocked} style={[button, { marginTop: 10, opacity: saving || alreadyAttached ? .45 : 1 }]} onPress={async () => { if (attaching.current || photoLock.current) return; attaching.current = true; setSaving(true); try { await onAttach({ ...scan, quantity }, labelPhoto); setSavedCount(value => value + 1); setScan(null); setLabelPhoto(undefined); locked.current = false; if (!continuous) { setOpen(false); onBusy(false); } } catch (issue) { setError(issue instanceof Error ? issue.message : 'The scanned value could not be saved. Try again.'); } finally { attaching.current = false; setSaving(false); } }}><Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{saving ? 'Saving scan…' : continuous ? 'Save & next' : attachLabel}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={saving || takingPhoto} style={[button, { marginTop: 8 }]} onPress={() => { setLabelPhoto(undefined); setScan(null); setError(''); locked.current = false; }}><Text style={{ color: '#BFDBFE' }}>Scan again</Text></Pressable>
      </View>}
      {error ? <Text accessibilityLiveRegion="polite" style={{ color: '#FCA5A5', marginTop: 8 }}>{error}</Text> : null}
    </>}
  </View>;
}
