import { useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { usePathname, router } from 'expo-router';
import { loadRecovery, RecoveryDraft } from '../lib/recovery';
import { serverBatchStatus } from '../lib/native-upload';
import { API_BASE_URL, apiFetch } from '../lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';

export function RecoveryBanner() {
  const { session } = useAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<RecoveryDraft | null>(null);
  const [status, setStatus] = useState('Resume walkthrough');
  const [detail, setDetail] = useState('Your review progress is saved.');
  const [jobId, setJobId] = useState('');
  useEffect(() => {
    let active = true;
    let busy = false;
    async function refresh() {
      if (busy || !session || pathname === '/upload' || AppState.currentState !== 'active') return;
      busy = true;
      try {
        const value = await loadRecovery();
        if (!active) return;
        setDraft(value);
        setJobId(value?.jobId || '');
        if (!value) return;
        let id = value.jobId;
        let title = value.results.length ? 'Review results' : 'Resume walkthrough';
        let message = 'Your review progress is saved.';
        if (!id && value.nativeBatchId) {
          const batch = await serverBatchStatus(value.nativeBatchId);
          id = batch?.result?.job_id || '';
          title = 'Uploading photos';
          message = `${batch?.uploaded_slots?.length || 0} of ${value.photos.length} received. Tap to view progress.`;
        }
        if (id && !value.results.length) {
          const response = await apiFetch(`${API_BASE_URL}/api/jobs/${encodeURIComponent(id)}`);
          const job = await response.json();
          if (!response.ok || !job.success) throw new Error('Status unavailable');
          title = job.status === 'complete' ? 'Results ready · Open review' : job.status === 'failed' ? 'Analysis needs attention' : 'Analyzing photos';
          message = job.status === 'complete' ? 'Tap to open this walkthrough’s results.' : job.status === 'failed' ? 'Tap to see the error and recovery options.' : 'Processing continues. Tap to view progress.';
        }
        if (active) { setJobId(id); setStatus(title); setDetail(message); }
      } catch { if (active) { setStatus('Check walkthrough'); setDetail('Could not refresh status. Tap to reconnect.'); } }
      finally { busy = false; }
    }
    if (session) void refresh(); else setDraft(null);
    const timer = setInterval(() => void refresh(), 5000);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { active = false; clearInterval(timer); sub.remove(); };
  }, [pathname, session?.user.id]);
  if (!draft || pathname === '/upload' || !session) return null;
  return <View style={{ backgroundColor: '#17344B', padding: 12, paddingTop: insets.top + 8 }}>
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/upload', params: {
      resume: '1', ...(jobId && !draft.results.length ? { resumeJobId: jobId } : {}),
      customerId: draft.customerId, customerName: draft.customerName,
      contactName: draft.contactName, photos: JSON.stringify(draft.photos),
    } })}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>{status} · {draft.customerName}</Text>
      <Text style={{ color: '#CBD5E1', marginTop: 3 }}>{detail}</Text>
    </Pressable>
  </View>;
}
