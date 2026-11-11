import { StyleSheet, type ViewStyle, type TextStyle, type ImageStyle } from 'react-native';
type Styles = Record<string, ViewStyle | TextStyle | ImageStyle>;
// Shared readable text, touch targets and bounded content across device sizes.
export function createPolishedStyles<T extends Styles>(styles:T):T {
 for(const [name, value] of Object.entries(styles)) {
  const s=value as ViewStyle & TextStyle;
  if(s.color && ['#94A3B8','#91A0B7','#8899AE','#8EA3BA'].includes(String(s.color).toUpperCase())) s.color='#AFBED0';
  if(['container','screen','header','headerRow','keyboardView'].includes(name) && s.backgroundColor) s.backgroundColor='transparent';
  if(/^(safeArea|safe)$/.test(name)) s.backgroundColor='#091321';
  if(/^(card|sectionCard|customerCard|locationCard|metricCard)$/.test(name)) {
   s.borderRadius=14;s.borderWidth=1;s.borderColor='rgba(119,171,219,0.22)';s.backgroundColor='#122237';
  }
  if(name==='container' && s.flex===1) { s.width='100%';s.maxWidth=s.maxWidth||1160;s.alignSelf='center';s.minWidth=0; }
  if(/^(headerText|headerInfo|reportHeroText|listText|itemText|cardText)$/.test(name)) s.minWidth=0;
  if(s.color && /Text$|Title$|Label$|Value$|^title$|^subtitle$/.test(name)) s.flexShrink=1;
  if(/^(back|close|modalCloseButton|modalApplyButton|modalCancelButton|viewerCloseButton|inventoryFilterButton|uniquePartPhotoButton)$/.test(name)) s.minHeight=Math.max(Number(s.minHeight)||0,44);
  if(/^(primaryButton|secondaryButton|saveButton|submitButton|backButton)$/.test(name)) {
   s.minHeight=Math.max(s.minHeight as number||0,44);s.borderRadius=12;
  }
 }
 return StyleSheet.create(styles) as T;
}
