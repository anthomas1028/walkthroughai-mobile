import { COLORS, RADIUS, SHADOWS } from '@/constants/design';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
    Pressable,
    StyleSheet,
    Text,
    ViewStyle,
} from 'react-native';

type Props = {
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  style?: ViewStyle;
};

export default function PrimaryButton({
  title,
  icon,
  onPress,
  style,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        style,
        pressed && styles.buttonPressed,
      ]}
    >
      {icon && (
        <Ionicons
          name={icon}
          size={22}
          color={COLORS.white}
        />
      )}

      <Text style={styles.text}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    height: 58,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,

    ...SHADOWS.primaryButton,
  },

  buttonPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },

  text: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 17,
  },
});