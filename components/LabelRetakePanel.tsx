import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { apiFetch, API_BASE_URL } from '../lib/api';
import { retainPhotos } from '../lib/recovery';
import { RetakeAttempt, RetakeCandidate, retakeChanges } from '../lib/label-retake';

const button = { minHeight: 46, padding: 12, backgroundColor: '#23476A', borderRadius: 10, marginTop: 8 };
export function LabelRetakePanel({ original, attempt, customer, customerId, location, onAttempt, onApply, onBusy }: {
  original: RetakeCandidate; attempt?: RetakeAttempt; customer: string; customerId?: string; location: string;
  onAttempt: (value: RetakeAttempt) => Promise<void>; onApply: (candidate: RetakeCandidate, index: number) => void; onBusy: (busy: boolean) => void;
}) {
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const active = useRef(true), running = useRef(false), picking = useRef(false);
  useEffect(() => {
    active.current = true;
    apiFetch(`${API_BASE_URL}/api/diagnostics`).then(response => response.json()).then(data => {
      if (active.current) { setAllowed(data.label_retakes_enabled === true); if (!data.label_retakes_enabled) setMessage('Label retakes are not enabled for this test account yet.'); }
    }).catch(() => { if (active.current) setMessage('Could not verify test access. Reopen this item to try again.'); });
    return () => { active.current = false; };
  }, []);
  async function json(response: Response) {
    const data = await response.json();
    if (!response.ok || data.success === false) throw new Error(data.error || 'The close-up could not be processed.');
    return data;
  }
  async function process(value: RetakeAttempt) {
    if (running.current || !allowed) return;
    running.current = true; setBusy(true); onBusy(true);
    let current: RetakeAttempt = { ...value, error: undefined };
    const checkpoint = async () => { if (active.current) await onAttempt({ ...current }); };
    try {
      await checkpoint();
      if (!current.jobId) {
        setMessage('Uploading one close-up. Your original results are unchanged.');
        if (!current.uploadId) {
          const created = await json(await apiFetch(`${API_BASE_URL}/api/upload-sessions`, { method: 'POST',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ photo_count: 1 }) }));
          if (typeof created.upload_id !== "string" || !created.upload_id) throw new Error("The server did not create a close-up upload session.");
          current.uploadId = created.upload_id; await checkpoint();
        }
        const base = `${API_BASE_URL}/api/upload-sessions/${current.uploadId}`;
        const status = await json(await apiFetch(base));
        if (status.result?.job_id) current.jobId = status.result.job_id;
        else {
          if (!(status.uploaded_slots || []).includes(0)) {
            const form = new FormData();
            if (Platform.OS === 'web') {
              const response = await fetch(current.uri);
              if (!response.ok) throw new Error('Close-up unavailable. Select the image again.');
              form.append('photo', await response.blob(), 'closeup.jpg');
            } else form.append('photo', { uri: current.uri, name: 'closeup.jpg', type: 'image/jpeg' } as unknown as Blob);
            await json(await apiFetch(`${base}/photos/0`, { method: 'POST', body: form }));
          }
          const form = new FormData(); form.append('customer', customer);
          if (customerId) form.append('customer_id', customerId);
          form.append('photo_locations', JSON.stringify([location]));
          const submitted = await json(await apiFetch(`${base}/submit`, { method: 'POST', body: form }));
          if (typeof submitted.job_id !== "string" || !submitted.job_id) throw new Error("The close-up upload is saved, but analysis has not started. Resume this close-up.");
          current.jobId = submitted.job_id;
        }
        await checkpoint();
      }
      const started = Date.now();
      while (active.current) {
        setMessage('Reading this close-up only…');
        const job = await json(await apiFetch(`${API_BASE_URL}/api/jobs/${current.jobId}`));
        if (job.status === 'failed') throw new Error('The close-up failed. Resume to check it or take another photo.');
        if (job.status === 'complete' || job.status === 'completed') {
          current.candidates = Array.isArray(job.results) ? job.results : [];
          await checkpoint(); setMessage(current.candidates?.length ? 'Compare the reading below. Nothing has been replaced.' : 'No label found. Try a sharper close-up.');
          return;
        }
        if (Date.now() - started > 10 * 60 * 1000) throw new Error('Still processing. Resume this close-up later; do not restart the walkthrough.');
        await new Promise(resolve => setTimeout(resolve, 2500));
      }
    } catch (error) {
      current.error = error instanceof Error ? error.message : 'Close-up failed. Your original results are safe.';
      try { await checkpoint(); } catch { if (active.current) setMessage(`${current.error} Close-up progress could not be saved. Keep this screen open.`); }
    } finally { running.current = false; if (active.current) { setBusy(false); onBusy(false); } }
  }
  async function pick(camera: boolean) {
    if (running.current || picking.current || !allowed) return;
    picking.current = true; setBusy(true); onBusy(true); setMessage('Preparing close-up…');
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
        setMessage('Camera permission is needed. You can choose a close-up from Photos instead.'); return;
      }
      const options = { mediaTypes: ['images'] as ImagePicker.MediaType[], quality: 1, allowsEditing: false };
      const selected = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: false });
      if (selected.canceled || !active.current) return;
      const asset = selected.assets[0];
      // Convert orientation/format without resizing small printed identifiers.
      const converted = await ImageManipulator.manipulateAsync(asset.uri, [], { compress: 1, format: ImageManipulator.SaveFormat.JPEG });
      const retained = await retainPhotos([{ id: `retake-${Date.now()}`, uri: converted.uri, fileName: 'closeup.jpg', mimeType: 'image/jpeg', location }], `retake-${Date.now()}`);
      const value: RetakeAttempt = { uri: retained[0].uri };
      await onAttempt(value);
      setMessage('Checking capture quality…');
      const form = new FormData();
      if (Platform.OS === 'web') {
        const image = await fetch(value.uri); form.append('photo', await image.blob(), 'closeup.jpg');
      } else form.append('photo', { uri: value.uri, name: 'closeup.jpg', type: 'image/jpeg' } as unknown as Blob);
      try {
        const checked = await json(await apiFetch(`${API_BASE_URL}/api/test/label-quality`, { method: 'POST', body: form }));
        value.qualityWarnings = checked.quality?.warnings || [];
      } catch { value.qualityWarnings = ['Capture check unavailable. Inspect the characters and label edges before reading.']; }
      if (!active.current) return;
      await onAttempt(value);
      setMessage('Check the close-up, then read it. Capture warnings are advisory; they do not certify readable text.');
    } catch (error) { if (active.current) setMessage(error instanceof Error ? error.message : 'Camera unavailable. Choose an existing close-up.'); }
    finally { picking.current = false; if (active.current) { setBusy(false); onBusy(false); } }
  }
  return <View style={{ borderWidth: 1, borderColor: '#315474', borderRadius: 12, padding: 14, marginVertical: 12 }}>
    <Text style={{ color: '#E2E8F0', fontSize: 18, fontWeight: '700' }}>Read this label again · Test</Text>
    <Text style={{ color: '#CBD5E1', marginTop: 6 }}>Photograph only this label. Keep every edge visible, hold steady, and change angle if light covers the text.</Text>
    {attempt?.uri && <Image source={{ uri: attempt.uri }} resizeMode="contain" style={{ width: '100%', height: 180, marginTop: 10 }} />}
    {attempt?.qualityWarnings?.map((warning, index) => <Text key={index} style={{ color: '#FBBF24', marginTop: 6 }}>{warning}</Text>)}
    {busy ? <View><ActivityIndicator /><Text accessibilityLiveRegion="polite" style={{ color: '#CBD5E1' }}>{message}</Text></View> : <>
      <Pressable disabled={!allowed} accessibilityRole="button" style={[button, !allowed && { opacity: .45 }]} onPress={() => void pick(true)}><Text style={{ color: 'white' }}>Take label close-up</Text></Pressable>
      <Pressable disabled={!allowed} accessibilityRole="button" style={[button, !allowed && { opacity: .45 }]} onPress={() => void pick(false)}><Text style={{ color: 'white' }}>Choose close-up from Photos</Text></Pressable>
      {attempt && !attempt.candidates && <Pressable disabled={!allowed} accessibilityRole="button" style={[button, !allowed && { opacity: .45 }]} onPress={() => void process(attempt)}><Text style={{ color: 'white' }}>{attempt.jobId || attempt.uploadId ? 'Resume this close-up' : 'Read this close-up'}</Text></Pressable>}
      <Text accessibilityLiveRegion="polite" style={{ color: attempt?.error ? '#FCA5A5' : '#CBD5E1', marginTop: 8 }}>{attempt?.error || message}</Text>
      {attempt?.candidates?.map((candidate, index) => {
        const changes = retakeChanges(original, candidate), blanks = changes.filter(change => !change.before);
        return <View key={index} style={{ borderTopWidth: 1, borderTopColor: '#315474', paddingTop: 12, marginTop: 12 }}>
          <Text style={{ color: '#FBBF24', fontWeight: '700' }}>Reading {index + 1} · verify this is the same physical label</Text>
          <Text selectable style={{ color: '#CBD5E1', marginVertical: 8 }}>{candidate.label_text || 'No readable source text'}</Text>
          {changes.map(change => <Text selectable key={change.field} style={{ color: change.conflict ? '#FBBF24' : '#CBD5E1', marginBottom: 5 }}>{change.field.replace(/_/g, ' ')}: {change.before || '(blank)'} → {change.after}{change.conflict ? ' · conflict; existing value kept' : ''}</Text>)}
          <Pressable disabled={!attempt.jobId || !changes.length} accessibilityRole="button" style={[button, !changes.length && { opacity: .5 }]} onPress={() => onApply(candidate, index)}><Text style={{ color: 'white' }}>Use this reading · fill {blanks.length} blank fields</Text></Pressable>
          <Text style={{ color: '#94A3B8', marginTop: 6 }}>Existing values stay unchanged. Edit conflicting fields manually after comparing both photos.</Text>
        </View>;
      })}
    </>}
  </View>;
}
