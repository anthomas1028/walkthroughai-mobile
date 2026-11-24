import { Image, Pressable, Text, View } from 'react-native';

type Thumbnail = { name: string; uri?: string };
export function PartPhotoStrip<T extends Thumbnail>({ photos, onSelect }: {
  photos: T[]; onSelect: (photo: T) => void;
}) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 12 }}>
    {photos.map((photo, index) => <Pressable key={photo.name} accessibilityRole="button"
      accessibilityLabel={`Open ${photo.name}, photo ${index + 1} of ${photos.length}`}
      onPress={() => onSelect(photo)} style={{ width: 88, gap: 4 }}>
      {photo.uri ? <Image source={{ uri: photo.uri }} resizeMode="cover"
        style={{ width: 88, height: 68, borderRadius: 8, backgroundColor: '#20364D' }} /> : null}
      <Text numberOfLines={1} style={{ color: '#B8D9F8', fontSize: 12 }}>{photo.name}</Text>
    </Pressable>)}
  </View>;
}
