import React,{useCallback,useEffect,useState} from 'react';
import {supabase} from '../lib/supabase';

type QuickReply={id:string;organization_id:string;title:string;body:string;created_by:string|null;active:boolean};

export default function InboxQuickReplies({organizationId,onInsert,client=supabase}:{organizationId:string;onInsert?:(body:string)=>void;client?:typeof supabase}){
 const [open,setOpen]=useState(false);
 const [items,setItems]=useState<QuickReply[]>([]);
 const [editing,setEditing]=useState<string|null>(null);
 const [title,setTitle]=useState('');
 const [body,setBody]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [loading,setLoading]=useState(false);
 const [showArchived,setShowArchived]=useState(false);
 const reload=useCallback(async()=>{
   const {data,error}=await client.from('inbox_quick_replies').select('id,organization_id,title,body,created_by,active').eq('organization_id',organizationId).order('title',{ascending:true}).limit(100);
   if(error)throw new Error('Não foi possível carregar as respostas desta empresa.');
   setItems((data||[]) as QuickReply[]);
 },[client,organizationId]);
 useEffect(()=>{setItems([]);setEditing(null);setTitle('');setBody('');setShowArchived(false);setOpen(false);},[organizationId]);
 useEffect(()=>{if(!open)return;let active=true;setLoading(true);setError('');void reload().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[open,reload]);
 useEffect(()=>{if(!open)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[open]);
 const save=(e:React.FormEvent)=>{e.preventDefault();if(busy)return;setBusy(true);setError('');void (async()=>{
   const {error}=await client.rpc('save_inbox_quick_reply',{org:organizationId,rid:editing,reply_title:title.trim(),reply_body:body.trim()});
   if(error)throw new Error('Não foi possível salvar. Confira o texto e sua permissão nesta empresa.');
   await reload();setEditing(null);setTitle('');setBody('');
 })().catch(e=>setError(e.message)).finally(()=>setBusy(false));};
 const archive=(id:string)=>{if(busy)return;setBusy(true);setError('');void (async()=>{
   const {error}=await client.rpc('archive_inbox_quick_reply',{rid:id});
   if(error)throw new Error('Não foi possível arquivar esta resposta.');
   await reload();setEditing(null);setTitle('');setBody('');
 })().catch(e=>setError(e.message)).finally(()=>setBusy(false));};
 return <>
   <button type="button" className="inbox-button" onClick={()=>setOpen(true)}>Respostas rápidas</button>
   {open&&<div className="inbox-quick-backdrop" onClick={()=>setOpen(false)}><section className="inbox-quick-dialog" role="dialog" aria-modal="true" aria-label="Respostas rápidas da empresa" onClick={e=>e.stopPropagation()}>
     <div className="inbox-quick-head"><div><p className="inbox-eyebrow">BIBLIOTECA DA EMPRESA</p><h2>Respostas rápidas</h2><p>Escolha um ponto de partida e personalize antes de enviar.</p></div><button type="button" className="inbox-button" onClick={()=>setOpen(false)} aria-label="Fechar respostas rápidas">Fechar</button></div>
     {error&&<p className="inbox-error" role="alert">{error}</p>}
     <div className="inbox-quick-content"><div><div className="inbox-quick-tabs" role="group" aria-label="Estado das respostas rápidas"><button type="button" aria-pressed={!showArchived} onClick={()=>setShowArchived(false)}>Ativas</button><button type="button" aria-pressed={showArchived} onClick={()=>setShowArchived(true)}>Arquivadas</button></div><div className="inbox-quick-list">{loading?<p>Carregando respostas…</p>:items.filter(q=>q.active!==showArchived).length?items.filter(q=>q.active!==showArchived).map(q=><article key={q.id}><h3>{q.title}</h3><p>{q.body}</p><div>{onInsert&&q.active&&<button type="button" className="btn-navy" disabled={busy} onClick={()=>{onInsert(q.body);setOpen(false);}}>Inserir no rascunho</button>}<button type="button" className="inbox-button" disabled={busy} onClick={()=>{setEditing(q.id);setTitle(q.title);setBody(q.body);}}>{q.active?'Editar':'Editar e restaurar'}</button></div></article>):<p>{showArchived?'Nenhuma resposta arquivada nesta empresa.':'Nenhuma resposta cadastrada para esta empresa.'}</p>}</div></div>
     <form className="inbox-quick-editor" onSubmit={save}><h3>{editing?'Editar resposta':'Nova resposta'}</h3><label htmlFor="inbox-quick-title">Título</label><input id="inbox-quick-title" required minLength={2} maxLength={80} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ex.: Propor reunião"/><label htmlFor="inbox-quick-body">Texto</label><textarea id="inbox-quick-body" required maxLength={2000} rows={5} value={body} onChange={e=>setBody(e.target.value)} placeholder="Escreva uma sugestão curta. Ela poderá ser editada antes do envio."/><p>Uma resposta rápida nunca é enviada automaticamente.</p><div><button type="submit" className="btn-navy" disabled={busy||!title.trim()||!body.trim()}>Salvar resposta</button>{editing&&<><button type="button" className="inbox-button" onClick={()=>{setEditing(null);setTitle('');setBody('');}}>Cancelar edição</button><button type="button" className="inbox-quick-archive" disabled={busy} onClick={()=>archive(editing)}>Arquivar</button></>}</div></form></div>
   </section></div>}
 </>;
}
