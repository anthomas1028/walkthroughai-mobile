import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL, apiFetch } from '../lib/api';
import { completionAlertsSupported } from '../lib/completion-notifications';
import { loadRecovery } from '../lib/recovery';

export function CompletionNotificationListener() {
  const { session, isLoading } = useAuth();
  const userId = session?.user.id;
  const handled = useRef(new Set<string>());
  useEffect(() => {
    if (!completionAlertsSupported || !userId || isLoading) return;
    let active = true;
    let cleanup: (() => void) | undefined;
    void import('expo-notifications').then(async Notifications => {
      if (!active) return;
      Notifications.setNotificationHandler({ handleNotification: async () => ({
        shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
      }) });
      async function open(response: import('expo-notifications').NotificationResponse | null) {
        if (!response || !active) return;
        const id = response.notification.request.identifier;
        const data = response.notification.request.content.data;
        if (handled.current.has(id) || data.type !== 'analysis-complete' || typeof data.jobId !== 'string' || !/^[a-f0-9]{32}$/.test(data.jobId)) return;
        try {
          // Authenticate against the server; never trust customer or route data from a push.
          const result = await apiFetch(`${API_BASE_URL}/api/jobs/${data.jobId}`);
          const job = await result.json();
          if (!active || !result.ok || !job.success) return;
          const saved = await loadRecovery();
          if (!active) return;
          if (saved?.jobId && saved.jobId !== data.jobId) return; // Preserve another in-progress review.
          handled.current.add(id);
          await Notifications.clearLastNotificationResponseAsync();
          router.push({ pathname: '/upload', params: {
            resume: '1', resumeJobId: data.jobId,
            customerId: String(job.customer_id || ''), customerName: job.customer || '',
          } });
        } catch { /* The saved job remains accessible through Resume walkthrough. */ }
      }
      const sub = Notifications.addNotificationResponseReceivedListener(response => { void open(response); });
      cleanup = () => sub.remove();
      await open(await Notifications.getLastNotificationResponseAsync());
    }).catch(() => {});
    return () => { active = false; cleanup?.(); };
  }, [userId, isLoading]);
  return null;
}
