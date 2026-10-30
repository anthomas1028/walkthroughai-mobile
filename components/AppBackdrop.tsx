import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
export function AppBackdrop({variant='quiet'}:{variant?:'full'|'dashboard'|'quiet'}) {
 const full=variant==='full';
 return <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
  <Image accessible={false} source={require('../assets/images/warehouse-backdrop.png')} resizeMode="stretch" style={[StyleSheet.absoluteFill,{width:'100%',height:full?'100%':variant==='dashboard'?460:240,opacity:full?1:variant==='dashboard'?.38:.16}]} />
 </View>;
}
