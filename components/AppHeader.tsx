import {
    COLORS,
    FONT_SIZE,
    SPACING,
} from '@/constants/design';
import React from 'react';
import {
    StyleSheet,
    Text,
    View,
} from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
};

export default function AppHeader({
  title,
  subtitle,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>

      {subtitle ? (
        <Text style={styles.subtitle}>{subtitle}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.xxl,
  },

  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.heading,
    fontWeight: '700',
  },

  subtitle: {
    color: COLORS.textMuted,
    fontSize: FONT_SIZE.body,
    marginTop: SPACING.sm,
    lineHeight: 22,
  },
});