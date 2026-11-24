import { Linking, Pressable, Text } from 'react-native';
import { Alert } from '../lib/alerts';
import type { FastenalMatch } from '../lib/part-photos';

export function FastenalPart({ match }: { match?: FastenalMatch | null }) {
  if (!match || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(match.sku)) return null;
  const url = 'https://www.fastenal.com/product/details/' + match.sku;
  return <Pressable accessibilityRole="link" accessibilityLabel={`Fastenal part ${match.sku}, ${match.label}. Open product.`}
    onPress={() => void Linking.openURL(url).catch(() => Alert.alert('Could not open Fastenal', `Fastenal part ${match.sku}`))}
    style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 4 }}>
    <Text style={{ color: '#93C5FD', textDecorationLine: 'underline', fontWeight: '700' }}>Fastenal Part # {match.sku}</Text>
    <Text style={{ color: '#C5D4E5', fontSize: 12, marginTop: 2 }}>{match.label}</Text>
  </Pressable>;
}
