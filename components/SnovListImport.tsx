import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type SnovList={id:number;name:string;contacts:number};
export default function SnovListImport({organizationId,onImported}:{organizationId:string;onImported:()=>Promise<void>}){
  const [lists,setLists]=useState<SnovList[]>([]),[selected,setSelected]=useState(''),[page,setPage]=useState(1);
  const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
  useEffect(()=>{setLists([]);setSelected('');setPage(1);setMessage('');},[organizationId]);
  const call=async(body:Record<string,unknown>)=>{
    const {data,error}=await supabase.functions.invoke('crm-snov-lists',{body:{organization_id:organizationId,...body}});
    let code=data?.error;
    if(error&&!code){try{code=(await (error as any).context?.json())?.error;}catch{/* gateway unavailable */}}
    if(error||code)throw new Error(code==='snov_not_configured'?'A conexão Snov.io ainda precisa ser configurada no servidor.':code==='forbidden'?'Sua conta não tem acesso às listas Snov.io nesta empresa.':'Não foi possível consultar o Snov.io.');
    return data;
  };
  const load=async()=>{setBusy(true);setMessage('');try{const data=await call({action:'lists'});setLists(data.lists||[]);setMessage(data.lists?.length?'Selecione uma lista para trazer ao Radar.':'Nenhuma lista disponível na conta Snov.io.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
  const importPage=async()=>{if(!selected)return;setBusy(true);setMessage('');try{const data=await call({action:'import',list_id:Number(selected),page});setPage(data.next_page||1);setMessage(`${data.total} contato(s) nesta lista do Radar. ${data.next_page?'Importe a próxima página para continuar.':'Importação concluída.'} Revise a origem e a finalidade antes de qualquer cadência.`);await onImported();}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}};
  return <section className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4" aria-label="Listas do Snov.io">
    <div><p className="text-xs uppercase tracking-widest text-amber-700">Integração de contatos</p><h2 className="text-2xl text-[#12323b]">Suas listas do Snov.io</h2><p className="text-slate-600 mt-1">Traga contatos para a empresa selecionada, sem iniciar buscas, consumir créditos de revelação ou enviar e-mails.</p></div>
    <div className="flex flex-wrap gap-3 items-end"><button type="button" className="btn-navy" disabled={busy} onClick={()=>void load()}>Consultar listas</button>{lists.length>0&&<><label className="text-sm">Lista<select className="block border rounded-lg px-3 py-2 min-w-64" value={selected} onChange={e=>{setSelected(e.target.value);setPage(1);}}><option value="">Selecione</option>{lists.map(l=><option key={l.id} value={l.id}>{l.name} · {l.contacts} contatos</option>)}</select></label><button type="button" className="btn-navy" disabled={busy||!selected} onClick={()=>void importPage()}>{page===1?'Importar primeira página':`Importar página ${page}`}</button></>}</div>
    {message&&<p role="status" className="text-sm text-slate-700">{message}</p>}
  </section>;
}
