import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { API_BASE_URL } from '../lib/api';

export type ConnectionState = 'checking' | 'online' | 'offline';
export function useConnection() {
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const active = useRef(true);
  const pending = useRef<Promise<boolean> | null>(null);
  const refresh = useCallback((): Promise<boolean> => {
    if (pending.current) return pending.current;
    pending.current = (async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      let online = false;
      try {
        const response = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal, cache: 'no-store' });
        online = response.ok && (await response.json()).ok === true;
      } catch { /* Capture and device saves do not require a connection. */ }
      finally { clearTimeout(timer); }
      if (active.current) setConnection(online ? 'online' : 'offline');
      return online;
    })().finally(() => { pending.current = null; });
    return pending.current;
  }, []);
  useEffect(() => {
    active.current = true;
    void refresh();
    const interval = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const reconnect = () => { void refresh(); };
    if (Platform.OS === 'web') window.addEventListener('online', reconnect);
    return () => { active.current = false; clearInterval(interval); subscription.remove(); if (Platform.OS === 'web') window.removeEventListener('online', reconnect); };
  }, [refresh]);
  return { connection, refresh };
}
