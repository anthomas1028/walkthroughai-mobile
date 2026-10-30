import { StyleSheet, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;
// Visual-only normalization; never changes display, layout direction or behavior.
export function createPolishedStyles<T extends Styles>(styles:T):T {
 for(const [name, value] of Object.entries(styles)) {
  const s=value as ViewStyle & TextStyle;
  if(s.color && ['#94A3B8','#91A0B7','#8899AE','#8EA3BA'].includes(String(s.color).toUpperCase())) s.color='#AFBED0';
  if(['container','screen','header','headerRow','keyboardView'].includes(name) && s.backgroundColor) s.backgroundColor='transparent';
  if(/^(safeArea|safe)$/.test(name)) s.backgroundColor='#091321';
  if(/^(card|sectionCard|customerCard|locationCard|metricCard)$/.test(name)) {
   s.borderRadius=14;s.borderWidth=1;s.borderColor='rgba(119,171,219,0.22)';s.backgroundColor='#122237';
  }
  if(/^(primaryButton|secondaryButton|saveButton|submitButton|backButton)$/.test(name)) {
   s.minHeight=Math.max(s.minHeight as number||0,44);s.borderRadius=12;
  }
 }
 return StyleSheet.create(styles) as T;
}
