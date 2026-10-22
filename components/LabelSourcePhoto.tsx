import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { validLabelBox } from '../lib/label-retake';

export function LabelSourcePhoto({ uri, box }: { uri: string; box?: unknown }) {
  const [ratio, setRatio] = useState(4 / 3);
  const bounds = validLabelBox(box);
  return <View style={{ marginBottom: 12 }}>
    <Text style={{ color: '#A9C9EF', marginBottom: 8 }}>{bounds ? 'Highlighted label · compare with your close-up' : 'Source photo · label location unavailable'}</Text>
    <View style={{ width: '100%', aspectRatio: ratio, backgroundColor: '#081321' }}>
      <Image source={{ uri }} resizeMode="contain" style={{ width: '100%', height: '100%' }} onLoad={event => {
        const { width, height } = event.nativeEvent.source;
        if (width > 0 && height > 0) setRatio(width / height);
      }} />
      {bounds && <View pointerEvents="none" accessibilityLabel="Selected label region" style={{ position: 'absolute',
        left: `${bounds[0] / 10}%`, top: `${bounds[1] / 10}%`, width: `${(bounds[2] - bounds[0]) / 10}%`,
        height: `${(bounds[3] - bounds[1]) / 10}%`, borderWidth: 3, borderColor: '#FBBF24', backgroundColor: 'rgba(251,191,36,.12)' }} />}
    </View>
    {!bounds && <Text style={{ color: '#CBD5E1', marginTop: 6 }}>Match the label to this item's source text before taking a close-up.</Text>}
  </View>;
}
