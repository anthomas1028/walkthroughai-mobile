import { useMemo, useRef, type ReactNode, type RefObject } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';

export type NavigablePhoto = { uri: string; label: string };

/** Navigate only at fit scale; two-finger zoom and zoomed panning stay native. */
export function PhotoNavigation({ photos, current, onSelect, isZoomed, children }: {
  photos: NavigablePhoto[]; current: NavigablePhoto | null;
  onSelect: (photo: NavigablePhoto) => void;
  isZoomed: RefObject<boolean>; children: ReactNode;
}) {
  const unique = Array.from(new Map(photos.filter(p => p.uri).map(p => [p.uri, p])).values());
  const index = unique.findIndex(p => p.uri === current?.uri);
  const state = useRef({ unique, index, onSelect });
  state.current = { unique, index, onSelect };
  const move = (offset: number) => {
    const { unique: list, index: position, onSelect: select } = state.current;
    const next = position + offset;
    if (position >= 0 && next >= 0 && next < list.length) select(list[next]);
  };
  const responder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => !isZoomed.current &&
      state.current.unique.length > 1 && g.numberActiveTouches === 1 &&
      Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (!isZoomed.current && g.numberActiveTouches <= 1 &&
          Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) move(g.dx < 0 ? 1 : -1);
    },
  }), [isZoomed]);
  const button = { minHeight: 44, minWidth: 88, alignItems: 'center' as const, justifyContent: 'center' as const };
  return <View style={{ flex: 1 }}>
    {unique.length > 1 && index >= 0 && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#26384E' }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous photo" disabled={index === 0} onPress={() => move(-1)} style={[button, { opacity: index === 0 ? .35 : 1 }]}><Text style={{ color: '#BFDBFE', fontWeight: '700' }}>‹ Previous</Text></Pressable>
      <Text accessibilityLiveRegion="polite" style={{ color: '#AABBD0', fontSize: 12 }}>{index + 1} / {unique.length}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Next photo" disabled={index === unique.length - 1} onPress={() => move(1)} style={[button, { opacity: index === unique.length - 1 ? .35 : 1 }]}><Text style={{ color: '#BFDBFE', fontWeight: '700' }}>Next ›</Text></Pressable>
    </View>}
    <View style={{ flex: 1 }} {...responder.panHandlers}>{children}</View>
  </View>;
}
