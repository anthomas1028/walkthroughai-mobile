import { ActivityIndicator, Pressable, Text, View } from 'react-native';

export function CompletedWalkthroughActions({ remainingCount, recipientEmail, busy, onView, onEmail, onDone }: {
  remainingCount: number; recipientEmail: string; busy: boolean;
  onView: () => void; onEmail: () => void; onDone: () => void;
}) {
  return <View style={{ gap: 6 }}>
    <Text style={{ color: '#86EFAC', fontSize: 13, fontWeight: '700' }}>✓ Report saved{remainingCount ? ` · ${remainingCount} need review` : ''}</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {[{ label: 'View Report', action: onView, color: '#176347' }, { label: 'Email', action: onEmail, color: '#285FC6' }, { label: 'Done', action: onDone, color: '#20364D' }].map(({ label, action, color }) =>
        <Pressable key={label} accessibilityRole="button" accessibilityLabel={label === 'Email' ? `Email report to ${recipientEmail || 'your account email'}` : label} disabled={busy} onPress={action}
          style={{ flex: 1, minHeight: 44, paddingHorizontal: 6, paddingVertical: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: color, borderRadius: 10, opacity: busy ? .5 : 1 }}>
          {busy && label === 'Email' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{label}</Text>}
        </Pressable>)}
    </View>
    <Text numberOfLines={1} style={{ color: '#92A8BF', fontSize: 11 }}>Email to {recipientEmail || 'account email unavailable'}</Text>
  </View>;
}
