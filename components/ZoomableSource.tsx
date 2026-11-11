import { useState, type RefObject } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

export function ZoomableSource({uri,headers,isZoomed}:{uri:string;headers?:Record<string,string>;isZoomed?:RefObject<boolean>}) {
 const [size,setSize]=useState({width:0,height:0});
 const [failed,setFailed]=useState(false);
 return <View style={{flex:1,minHeight:0}} onLayout={e=>setSize(e.nativeEvent.layout)}>
  <Text style={{color:'#BFDBFE',fontSize:13,textAlign:'center',padding:8}}>Pinch to zoom</Text>
  {failed?<Text accessibilityRole="alert" style={{color:'#FCA5A5',padding:20}}>Photo unavailable. Close and reopen it to try again.</Text>:<ScrollView key={uri} centerContent minimumZoomScale={1} maximumZoomScale={5} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={e=>{if(isZoomed)isZoomed.current=(e.nativeEvent.zoomScale||1)>1.05;}} style={{flex:1}}>
   <Image source={{uri,headers}} accessibilityLabel="Source inventory photo" resizeMode="contain" onError={()=>setFailed(true)} style={{width:size.width,height:Math.max(0,size.height-34)}}/>
  </ScrollView>}
 </View>;
}
