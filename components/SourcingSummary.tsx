import { Linking, Pressable, Text, View } from 'react-native';
import { SavedSourcing } from '../lib/sourcing';
export function SourcingSummary({ record }: { record?: SavedSourcing | null }) {
  if(!record)return null;
  const open=(url:string)=>{if(/^https:\/\/(www\.)?(grainger|fastenal)\.com\/product\//i.test(url))void Linking.openURL(url).catch(()=>{});};
  return <View style={{padding:14,borderWidth:1,borderColor:'#315474',borderRadius:12,marginVertical:12}}>
    <Text style={{color:'white',fontWeight:'700'}}>{record.selection ? 'Saved sourcing selection' : 'Sourcing follow-up'}</Text>
    <Text selectable style={{color:'#CBD5E1',marginTop:8}}>{record.source_supplier} {record.source_number} → Fastenal {record.candidate?.sku || 'not selected'}</Text>
    <Text style={{color:'#FBBF24',marginTop:6}}>{!record.candidate ? 'No approved Fastenal selection' : record.candidate.match_type==='same_manufacturer_product'?'Same manufacturer/product candidate':'Suggested substitute'} · {record.status}</Text>
    {(record.candidate?.comparisons || []).filter(row=>row.status!=='matches').map(row=><Text selectable key={row.attribute} style={{color:'#FBBF24',marginTop:6}}>{row.attribute.replace(/_/g,' ')}: {row.source || 'Unknown'} → {row.candidate || 'Unknown'} ({row.status})</Text>)}
    <Text selectable style={{color:'#94A3B8',marginTop:8}}>Looked up {record.checked_at || 'not completed'}{'\n'}Selected by {record.selection?.reviewed_by || 'not selected'} at {record.selection?.reviewed_at || '—'}</Text>
    {[['Original product',record.source?.url || ''],['Fastenal product',record.candidate?.url || '']].filter(([,url])=>Boolean(url)).map(([label,url])=><Pressable key={label} accessibilityRole="link" onPress={()=>open(url)} style={{paddingVertical:12,minHeight:44}}><Text style={{color:'#BFDBFE'}}>{label}</Text></Pressable>)}
  </View>;
}
