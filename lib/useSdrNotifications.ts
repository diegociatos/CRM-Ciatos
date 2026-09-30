import {useEffect,useState} from 'react';
import {supabase} from './supabase';
import type {Notification} from '../types';
export function useSdrNotifications(org?:string,uid?:string) {
 const [notifications,setNotifications]=useState<Notification[]>([]);
 useEffect(()=>{let active=true;setNotifications([]);if(!org||!uid)return;
 const load=async()=>{const {data,error}=await supabase.rpc('sdr_notifications',{org});if(!active||error)return;setNotifications((data||[]).map((a:any)=>({id:a.id,leadId:a.lead_id,title:`${a.kind==='hot'?'Lead quente':'Resposta recebida'} · ${a.empresa||a.nome||'Contato'}`,message:a.summary,timestamp:new Date(a.created_at).toLocaleString('pt-BR'),type:a.kind==='hot'?'success':'info',read:a.read})));};
 void load();const timer=setInterval(load,20000);return()=>{active=false;clearInterval(timer);};},[org,uid]);
 const markRead=async(id:string)=>{const {error}=await supabase.rpc('read_sdr_notification',{aid:id});if(!error)setNotifications(n=>n.map(a=>a.id===id?{...a,read:true}:a));};
 const clearAll=async()=>{await Promise.all(notifications.filter(n=>!n.read).map(n=>markRead(n.id)));};
 return {notifications,markRead,clearAll};
}
