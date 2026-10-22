import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { apiFetch, API_BASE_URL } from '../lib/api';
import { SourcingProposal, SourcingState } from '../lib/sourcing';

const action = { padding: 13, minHeight: 46, backgroundColor: '#244C68', borderRadius: 10, marginTop: 8 };
export function SourcingPanel({ saved, jobId, photo, existingFastenal, initialManufacturer, initialManufacturerPartNumber, blocked, onState, onSelected, onBusy, onClear }: {
  initialManufacturer?: string; initialManufacturerPartNumber?: string; saved?: SourcingState; jobId: string; photo: string; existingFastenal: string; blocked: boolean;
  onState: (value: SourcingState) => Promise<void>; onSelected: (value: SourcingState, proposal: SourcingProposal) => Promise<void>; onClear: () => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const [number, setNumber] = useState(saved?.sourceNumber || initialManufacturerPartNumber || '');
  const [allowed,setAllowed] = useState(false),[busy,setBusy] = useState(false),[error,setError] = useState('');
  const [ack,setAck] = useState<number | null>(null),[replace,setReplace] = useState<number | null>(null);
  const [kind,setKind] = useState<'manufacturer'|'grainger'>(saved ? saved.sourceKind || 'grainger' : 'manufacturer');
  const [manufacturer,setManufacturer] = useState(saved?.sourceManufacturer || initialManufacturer || '');
  const active=useRef(true),running=useRef(false);
  useEffect(() => {
    active.current=true;
    apiFetch(`${API_BASE_URL}/api/diagnostics`).then(response=>response.json()).then(data=>{ if(active.current) setAllowed(data.sourcing_enabled===true); }).catch(()=>{ if(active.current)setError('Could not verify test sourcing access. Reopen this item to retry.'); });
    return()=>{active.current=false;};
  },[]);
  const proposal=saved?.proposal;
  async function read(response: Response): Promise<SourcingProposal> {
    const data=await response.json(); if(!response.ok || !data.success) throw new Error(data.error || 'Catalog lookup unavailable.'); return data;
  }
  async function lookup(resume=false) {
    if(running.current || blocked || !allowed)return;
    const lookupKind=resume && saved ? saved.sourceKind || 'grainger' : kind;
    const brand=(resume && saved ? saved.sourceManufacturer || '' : manufacturer).trim();
    const raw=(resume && saved ? saved.sourceNumber : number).trim();
    const code=lookupKind==='grainger' ? raw.toUpperCase() : raw;
    if(lookupKind==='grainger' ? !/^[A-Z0-9][A-Z0-9._-]{1,39}$/.test(code) : !brand || !code || /[\x00-\x1f\x7f]/.test(brand+code)){setError('Enter the manufacturer and its part number, or a valid Grainger item number.');return;}
    running.current=true;setBusy(true);onBusy(true);setError('');setAck(null);setReplace(null);
    let state:SourcingState=resume && saved ? {...saved} : {sourceNumber:code,sourceKind:lookupKind,sourceManufacturer:brand,targetToken:`item-${Date.now()}-${Math.random().toString(36).slice(2)}`};
    try {
      await onState(state); // Retain the idempotency token before any request.
      if(!state.proposalId){
        const created=await read(await apiFetch(`${API_BASE_URL}/api/test/sourcing`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({job_id:jobId,photo,source_number:state.sourceNumber,source_kind:state.sourceKind || 'grainger',source_manufacturer:state.sourceManufacturer || '',target_token:state.targetToken})}));
        state={...state,proposalId:created.id,proposal:created};await onState(state);
      }
      const started=Date.now();
      while(active.current){
        const result=await read(await apiFetch(`${API_BASE_URL}/api/test/sourcing/${state.proposalId}`));
        state={...state,proposal:result};await onState(state);
        if(result.status==='complete')return;
        if(result.status==='failed')throw new Error(result.error || 'Lookup failed. Your inventory is unchanged.');
        if(Date.now()-started>5*60*1000)throw new Error('Still processing. Resume this lookup rather than starting another.');
        await new Promise(resolve=>setTimeout(resolve,2500));
      }
    }catch(reason){const message=reason instanceof Error?reason.message:'Lookup failed.';if(active.current){setError(message);try{await onState({...state,error:message});}catch{setError('Could not save sourcing progress. Keep this screen open.');}}}
    finally{running.current=false;if(active.current){setBusy(false);onBusy(false);}}
  }
  async function select(index:number){
    if(!saved?.proposalId || running.current || blocked)return;
    running.current=true;setBusy(true);onBusy(true);setError('');
    try{
      const result=await read(await apiFetch(`${API_BASE_URL}/api/test/sourcing/${saved.proposalId}/select`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({candidate_index:index,acknowledge_differences:ack===index})}));
      if(active.current){await onState({...saved,proposal:result});await onSelected(saved,result);}
    }catch(reason){if(active.current)setError(reason instanceof Error?reason.message:'Selection could not be saved.');}
    finally{running.current=false;if(active.current){setBusy(false);onBusy(false);}}
  }
  function link(url:string){
    if(!/^https:\/\/(www\.)?(grainger|fastenal)\.com\/product\//i.test(url))return;
    void Linking.openURL(url).catch(()=>setError('Could not open the product page.'));
  }
  const disabled=busy || blocked || !allowed;
  return <View style={{borderWidth:1,borderColor:'#315474',borderRadius:12,padding:14,marginVertical:12}}>
    <Text style={{color:'#E2E8F0',fontSize:18,fontWeight:'700'}}>Find Fastenal alternatives · Test</Text>
    <Text style={{color:'#CBD5E1',marginTop:6}}>Search any manufacturer and part number against public Fastenal listings, or start from a Grainger item. Coverage depends on published evidence. Every selection needs employee review.</Text>
    {!allowed && <Text style={{color:'#FBBF24',marginTop:8}}>Sourcing must be enabled for this test account before searching.</Text>}
    <View style={{flexDirection:'row',gap:8}}>{(['manufacturer','grainger'] as const).map(mode=><Pressable key={mode} accessibilityRole="radio" accessibilityState={{selected:kind===mode}} disabled={busy || blocked} style={action} onPress={()=>{setKind(mode);setNumber('');}}><Text style={{color:'white'}}>{mode==='manufacturer'?'Manufacturer part':'Grainger item'}</Text></Pressable>)}</View>
    {kind==='manufacturer' && <><Text style={{color:'#CBD5E1',marginTop:12}}>Manufacturer / brand as printed</Text><TextInput accessibilityLabel="Manufacturer" editable={!busy && !blocked} value={manufacturer} autoCorrect={false} maxLength={120} onChangeText={setManufacturer} placeholder="Any manufacturer name" placeholderTextColor="#94A3B8" style={{color:'white',padding:12,borderWidth:1,borderColor:'#55718C'}}/></>}
    <Text style={{color:'#CBD5E1',marginTop:12}}>{kind==='manufacturer'?'Manufacturer part number (preserve punctuation)':'Grainger item number'}</Text>
    <TextInput accessibilityLabel={kind==='manufacturer'?'Manufacturer part number':'Grainger item number'} editable={!busy && !blocked} value={number} autoCapitalize="none" autoCorrect={false} maxLength={kind==='manufacturer'?100:40} onChangeText={setNumber} placeholder="Part number from label" placeholderTextColor="#94A3B8" style={{color:'white',padding:12,borderColor:'#55718C',borderWidth:1,borderRadius:8,marginTop:6}}/>
    <Pressable accessibilityRole="button" disabled={disabled} style={[action,disabled && {opacity:.4}]} onPress={()=>void lookup(false)}><Text style={{color:'white'}}>Find alternatives</Text></Pressable>
    {saved && proposal?.status!=='complete' && <Pressable accessibilityRole="button" disabled={disabled} style={action} onPress={()=>{setNumber(saved.sourceNumber);void lookup(true);}}><Text style={{color:'white'}}>Resume saved lookup</Text></Pressable>}
    {busy && <View><ActivityIndicator/><Text accessibilityLiveRegion="polite" style={{color:'#CBD5E1'}}>Researching this item only. Your inventory is unchanged.</Text></View>}
    {!!error && <Text accessibilityLiveRegion="polite" style={{color:'#FCA5A5',marginTop:8}}>{error}</Text>}
    {saved && <Pressable accessibilityRole="button" disabled={busy || blocked} style={action} onPress={()=>{ void onClear().catch(()=>setError('Could not clear this selection.')); }}><Text style={{color:'#FBBF24'}}>{proposal?.selection ? 'Undo sourcing selection' : 'Clear sourcing lookup'}</Text></Pressable>}
    {proposal?.status==='complete' && <>
      <Text style={{color:'#94A3B8',marginTop:12}}>{proposal.source_kind==='manufacturer' ? proposal.source_manufacturer : 'Grainger'} {proposal.source_number} · Checked {proposal.checked_at ? new Date(proposal.checked_at).toLocaleString() : 'unknown'}</Text>
      {proposal.source ? <><Text selectable style={{color:'white',marginTop:8}}>{proposal.source.brand} · {proposal.source.description}</Text><Pressable accessibilityRole="link" style={action} onPress={()=>link(proposal.source!.url)}><Text style={{color:'#BFDBFE'}}>View verified source listing</Text></Pressable></> : <Text style={{color:'#FBBF24'}}>No verified source item found. Nothing will be assigned.</Text>}
      {proposal.source && !proposal.candidates.length && <Text style={{color:'#FBBF24',marginTop:8}}>No supported Fastenal candidate found. Keep the original item for sourcing follow-up.</Text>}
      {proposal.candidates.map((candidate,index)=>{
        const conflict=Boolean(existingFastenal && existingFastenal!==candidate.sku);
        const selected=proposal.selection?.candidate_index===index;
        const canSelect=!disabled && (!candidate.requires_acknowledgement || ack===index) && (!conflict || replace===index);
        return <View key={candidate.sku} style={{marginTop:16,borderTopWidth:1,borderColor:'#315474',paddingTop:12}}>
          <Text selectable style={{color:'white',fontWeight:'700'}}>Fastenal {candidate.sku} · {candidate.brand}</Text>
          <Text style={{color:'#FBBF24',marginVertical:6}}>{candidate.match_type==='same_manufacturer_product'?'Same manufacturer/product candidate · review required':'Suggested substitute · review required'}</Text>
          <Text selectable style={{color:'#CBD5E1'}}>{candidate.description}</Text>
          <Text style={{color:'#94A3B8',marginTop:6}}>Manufacturer number: {candidate.manufacturer_part_number || 'Not established'}</Text>
          {candidate.comparisons.map(row=><View key={row.attribute} style={{paddingVertical:7,borderBottomWidth:1,borderBottomColor:'#23364B'}}><Text style={{color:row.status==='matches'?'#A7F3D0':'#FBBF24'}}>{row.attribute.replace(/_/g,' ')} · {row.status}{row.required?' · key specification':''}</Text><Text selectable style={{color:'#CBD5E1'}}>Source: {row.source || 'Unknown'}{'\n'}Fastenal: {row.candidate || 'Unknown'}</Text></View>)}
          <Pressable accessibilityRole="link" style={action} onPress={()=>link(candidate.url)}><Text style={{color:'#BFDBFE'}}>View Fastenal listing</Text></Pressable>
          {candidate.requires_acknowledgement && <Pressable accessibilityRole="checkbox" accessibilityState={{checked:ack===index}} disabled={disabled} style={action} onPress={()=>setAck(ack===index?null:index)}><Text style={{color:'white'}}>{ack===index?'☑':'☐'} I reviewed the differences and missing specifications.</Text></Pressable>}
          {conflict && <Pressable accessibilityRole="checkbox" accessibilityState={{checked:replace===index}} disabled={disabled} style={action} onPress={()=>setReplace(replace===index?null:index)}><Text style={{color:'#FBBF24'}}>{replace===index?'☑':'☐'} Replace existing Fastenal number {existingFastenal} with {candidate.sku}.</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={!canSelect} style={[action,!canSelect && {opacity:.4}]} onPress={()=>void select(index)}><Text style={{color:'white'}}>Approve this sourcing selection</Text></Pressable>
          {selected && <Text style={{color:'#A7F3D0',marginTop:8}}>Selected by employee · {proposal.selection?.reviewed_at}. Save the item to retain this selection.</Text>}
        </View>;
      })}
    </>}
  </View>;
}
