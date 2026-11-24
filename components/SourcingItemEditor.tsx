import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { API_BASE_URL, apiFetch } from '../lib/api';

const fields = {vendor:'Vendor', vendor_part_number:'Vendor part number', manufacturer:'Manufacturer',
  manufacturer_part_number:'Manufacturer part number', description:'Description', size_specification:'Size / specification'} as const;
type Field = keyof typeof fields;
type Item = {id:number} & Partial<Record<Field,string|null>>;
const keys = Object.keys(fields) as Field[];

export function SourcingItemEditor({item,onSaved}:{item:Item;onSaved:()=>void}) {
  const [draft,setDraft] = useState<Item|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  async function save() {
    if (!draft || busy) return;
    const changed = keys.filter(key => (draft[key] || '') !== (item[key] || ''));
    if (!changed.length) {setDraft(null); return;}
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API_BASE_URL}/api/walkthrough-items/${item.id}`, {
        method:'PATCH',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...Object.fromEntries(changed.map(key=>[key,draft[key]])),
          previous_fields:Object.fromEntries(changed.map(key=>[key,item[key]])),was_edited:true,is_confirmed:false}),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || 'Could not save changes.');
      onSaved();
    } catch(cause) {setError(cause instanceof Error ? cause.message : 'Could not save changes.');}
    finally {setBusy(false);}
  }
  const button = (label:string,action:()=>void) => <Pressable accessibilityRole="button" disabled={busy} style={{paddingVertical:12}} onPress={action}><Text style={{color:'#93C5FD'}}>{label}</Text></Pressable>;
  if (!draft) return button('Edit sourcing details',()=>{setError('');setDraft({...item});});
  return <View style={{gap:8}}>
    {keys.map(key=><View key={key}><Text style={{color:'#CBD5E1'}}>{fields[key]}</Text>
      <TextInput accessibilityLabel={fields[key]} editable={!busy} value={draft[key] || ''} onChangeText={value=>setDraft({...draft,[key]:value})}
        style={{color:'white',backgroundColor:'#192E43',minHeight:44,padding:10}} /></View>)}
    {error ? <Text accessibilityRole="alert" style={{color:'#FCD34D'}}>{error}</Text> : null}
    {button(busy?'Saving…':'Save changes',()=>void save())}{button('Cancel',()=>setDraft(null))}
  </View>;
}
