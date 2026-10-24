import { useState, type ReactNode } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

export function InventoryItemSummary({ title, identifier, identifierLabel, photoUri, quantity, location, status, onPhoto, children }: {
  title: string; identifier: string; identifierLabel: string; photoUri?: string; quantity?: number;
  location: string; status: 'Ready' | 'Needs details' | 'Saved'; onPhoto: () => void; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const color = status === 'Needs details' ? '#FFD18A' : '#86EFAC';
  return <View>
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      {photoUri ? <Pressable accessibilityRole="button" accessibilityLabel="View item source photo" onPress={onPhoto}>
        <Image source={{ uri: photoUri }} resizeMode="cover" style={{ width: 64, height: 72, borderRadius: 10 }} />
      </Pressable> : <View style={{ width: 64, height: 72, borderRadius: 10, backgroundColor: '#193653', justifyContent: 'center', padding: 6 }}><Text style={{ color: '#BFDBFE', textAlign: 'center', fontSize: 12 }}>No photo</Text></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color, fontSize: 12, fontWeight: '700', marginBottom: 4 }}>{status}</Text>
        <Text style={{ color: '#FFFFFF', fontSize: 16, fontWeight: '700' }}>{title}</Text>
        <Text selectable style={{ color: '#73DCE7', marginTop: 5 }}>{identifierLabel}: {identifier || 'Not captured'}</Text>
        <Text style={{ color: '#B8C8DB', fontSize: 13, marginTop: 5 }}>{location || 'Unassigned'} · Counted: {quantity ?? 'Not entered'}</Text>
      </View>
    </View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: '#93C5FD', fontWeight: '600' }}>{expanded ? 'Hide details −' : 'Details & review notes +'}</Text>
    </Pressable>
    {expanded && children}
  </View>;
}
