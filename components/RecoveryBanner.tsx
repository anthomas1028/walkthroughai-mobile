import { useEffect, useState } from 'react';
import { AppState, Pressable, Text, View } from 'react-native';
import { usePathname, router } from 'expo-router';
import { loadRecovery, RecoveryDraft } from '../lib/recovery';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';

export function RecoveryBanner() {
  const { session } = useAuth();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<RecoveryDraft | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => { loadRecovery().then(value => { if (active) setDraft(value); }).catch(() => { if (active) setDraft(null); }); };
    if (session) refresh(); else setDraft(null);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; sub.remove(); };
  }, [pathname, session?.user.id]);
  if (!draft || pathname === '/upload' || !session) return null;
  return <View style={{ backgroundColor: '#17344B', padding: 12, paddingTop: insets.top + 8 }}>
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/upload', params: {
      resume: '1', customerId: draft.customerId, customerName: draft.customerName,
      contactName: draft.contactName, photos: JSON.stringify(draft.photos),
    } })}>
      <Text style={{ color: '#FFFFFF', fontWeight: '700' }}>Resume walkthrough · {draft.customerName}</Text>
      <Text style={{ color: '#CBD5E1', marginTop: 3 }}>Your uploaded photos and review progress are saved.</Text>
    </Pressable>
  </View>;
}
