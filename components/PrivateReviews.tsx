import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { API_BASE_URL, apiFetch } from '../lib/api';
import { mergeCaptureScans } from '../lib/capture-scans';

type Review = { job_id: string; photo_count: number; completed_at: string };

export function PrivateReviews({customerId, customerName, onSaved}: {
  customerId: number; customerName: string; onSaved: () => void;
}) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const saving = useRef(false);
  const [attempt, setAttempt] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setReviews([]); setError('');
    apiFetch(`${API_BASE_URL}/api/customers/${customerId}/private-reviews`).then(async response => {
      if (response.status === 404) return;
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (active) setReviews(data.reviews);
    }).catch(() => { if (active) setError('Could not check for private analyses.'); });
    return () => { active = false; };
  }, [customerId, attempt]));

  async function save(review: Review) {
    if (saving.current) return;
    saving.current = true; setBusy(review.job_id); setError('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/jobs/${review.job_id}`);
      const job = await response.json();
      if (!response.ok || job.status !== 'complete' || !job.private_review || Number(job.customer_id) !== customerId) throw new Error('This analysis is no longer available.');
      const saved = await apiFetch(`${API_BASE_URL}/api/finalize`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({job_id: review.job_id, customer_id: customerId, customer: customerName,
          walkthrough_name: job.private_review.name || null, send_email: false,
          results: mergeCaptureScans(job.results, job.private_review.scans)}),
      });
      const body = await saved.json();
      if (!saved.ok || !body.history_saved) throw new Error(body.error || 'Could not save this report.');
      setReviews(previous => previous.filter(item => item.job_id !== review.job_id));
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this report.'); }
    finally { saving.current = false; setBusy(''); }
  }
  if (!reviews.length && !error) return null;
  return <View style={{padding: 14, gap: 10, backgroundColor: '#172D43'}}>
    {reviews.map(review => <Pressable accessibilityRole="button" disabled={!!busy} key={review.job_id}
      onPress={() => void save(review)} style={{paddingVertical: 10}}>
      <Text style={{color: 'white', fontWeight: '700'}}>{busy === review.job_id ? 'Saving…' : 'Save completed analysis to history'}</Text>
      <Text style={{color: '#CBD5E1'}}>{review.photo_count} photos · {new Date(review.completed_at).toLocaleString()} · Private for 7 days</Text>
    </Pressable>)}
    {error ? <Pressable accessibilityRole="button" onPress={() => { setAttempt(n => n + 1); onSaved(); }}><Text style={{color:'#FCD34D'}}>{error} Tap to refresh.</Text></Pressable> : null}
  </View>;
}
