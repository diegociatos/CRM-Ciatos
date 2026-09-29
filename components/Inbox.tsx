import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {supabase} from '../lib/supabase';
import type {User} from '../types';

type Conversation = {id:string;organization_id:string;lead_id:string;status:'OPEN'|'IN_PROGRESS'|'CLOSED';assigned_to:string|null;subject:string;last_message_at:string;created_at:string};
type Message = {id:string;conversation_id:string;direction:'INBOUND'|'OUTBOUND'|'INTERNAL';sender:string;recipient:string;subject:string;body:string;classification:'hot'|'review'|'opt_out'|'automatic'|null;author_id:string|null;received_at:string};
type LeadSummary = {id:string;nome:string|null;empresa:string|null;email:string|null;telefone:string|null};
type Read = {conversation_id:string;read_at:string};
const statusText:Record<Conversation['status'],string>={OPEN:'Aguardando',IN_PROGRESS:'Em atendimento',CLOSED:'Concluída'};
const classificationText:Record<NonNullable<Message['classification']>,string>={hot:'Interesse identificado',review:'Revisar resposta',opt_out:'Não contatar',automatic:'Resposta automática'};
const dateTime=(value:string)=>new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
const button='inbox-button';

export default function Inbox({organizationId,users,currentUser,onOpenLead,client=supabase}:{organizationId:string;users:User[];currentUser:User;onOpenLead:(id:string)=>void;client?:typeof supabase}) {
 const [conversations,setConversations]=useState<Conversation[]>([]);
 const [leads,setLeads]=useState<Record<string,LeadSummary>>({});
 const [reads,setReads]=useState<Record<string,string>>({});
 const [messages,setMessages]=useState<Message[]>([]);
 const [selected,setSelected]=useState<string|null>(null);
 const [filter,setFilter]=useState<'OPEN'|'MINE'|'ALL'|'CLOSED'>('OPEN');
 const [search,setSearch]=useState('');
 const [note,setNote]=useState('');
 const [loading,setLoading]=useState(true);
 const [loadingThread,setLoadingThread]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');

 const refresh=useCallback(async()=>{
   const [c,r]=await Promise.all([
     client.from('inbox_conversations').select('id,organization_id,lead_id,status,assigned_to,subject,last_message_at,created_at').eq('organization_id',organizationId).order('last_message_at',{ascending:false}).limit(200),
     client.from('inbox_reads').select('conversation_id,read_at').eq('organization_id',organizationId).eq('user_id',currentUser.id)
   ]);
   if(c.error||r.error)throw new Error('Não foi possível carregar as conversas. Confira a conexão e a atualização do CRM.');
   const rows=(c.data||[]) as Conversation[];
   const ids=[...new Set(rows.map(x=>x.lead_id))];
   let nextLeads:Record<string,LeadSummary>={};
   if(ids.length){
     const result=await client.from('leads').select('id,nome,empresa,email,telefone').eq('organization_id',organizationId).in('id',ids);
     if(result.error)throw new Error('Não foi possível carregar os contatos destas conversas.');
     nextLeads=Object.fromEntries(((result.data||[]) as LeadSummary[]).map(l=>[l.id,l]));
   }
   setConversations(rows);setLeads(nextLeads);
   setReads(Object.fromEntries(((r.data||[]) as Read[]).map(x=>[x.conversation_id,x.read_at])));
   setSelected(prev=>prev&&rows.some(x=>x.id===prev)?prev:null);
 },[organizationId,currentUser.id,client]);

 useEffect(()=>{let active=true;setSelected(null);setConversations([]);setMessages([]);setLoading(true);setError('');
   void refresh().catch(e=>{if(active)setError(e.message||'Não foi possível abrir o Inbox.');}).finally(()=>{if(active)setLoading(false);});
   return()=>{active=false;};
 },[refresh]);

 useEffect(()=>{let active=true;setMessages([]);if(!selected)return;
   setLoadingThread(true);
   void (async()=>{
     const {data,error}=await client.from('inbox_messages').select('id,conversation_id,direction,sender,recipient,subject,body,classification,author_id,received_at').eq('organization_id',organizationId).eq('conversation_id',selected).order('received_at',{ascending:true}).limit(200);
     if(error)throw new Error('Não foi possível abrir esta conversa.');
     if(!active)return;
     setMessages((data||[]) as Message[]);
     const {error:readError}=await client.rpc('mark_inbox_read',{cid:selected});
     if(!readError&&active)setReads(old=>({...old,[selected]:new Date().toISOString()}));
   })().catch(e=>{if(active)setError(e.message||'Não foi possível abrir esta conversa.');}).finally(()=>{if(active)setLoadingThread(false);});
   return()=>{active=false;};
 },[selected,organizationId,client]);

 const current=conversations.find(x=>x.id===selected);
 const visible=useMemo(()=>conversations.filter(c=>{
   if(filter==='OPEN'&&c.status==='CLOSED')return false;
   if(filter==='MINE'&&(c.assigned_to!==currentUser.id||c.status==='CLOSED'))return false;
   if(filter==='CLOSED'&&c.status!=='CLOSED')return false;
   const l=leads[c.lead_id];const hay=[l?.empresa,l?.nome,l?.email,c.subject].join(' ').toLocaleLowerCase('pt-BR');
   return hay.includes(search.trim().toLocaleLowerCase('pt-BR'));
 }),[conversations,leads,filter,search,currentUser.id]);
 const unread=(c:Conversation)=>!reads[c.id]||new Date(c.last_message_at)>new Date(reads[c.id]);
 const action=async(fn:()=>Promise<void>)=>{if(busy)return;setBusy(true);setError('');setNotice('');try{await fn();await refresh();}catch(e:any){setError(e.message||'Não foi possível salvar a alteração.');}finally{setBusy(false);}};
 const update=(status:Conversation['status'],assignee:string|null)=>{if(!current)return;void action(async()=>{
   const {error}=await client.rpc('update_inbox_conversation',{cid:current.id,new_status:status,new_assignee:assignee});
   if(error)throw error;if(status==='CLOSED')setFilter('CLOSED');setNotice('Atendimento atualizado.');
 });};
 const saveNote=(e:React.FormEvent)=>{e.preventDefault();if(!current||!note.trim())return;void action(async()=>{
   const {error}=await client.rpc('add_inbox_note',{cid:current.id,note_text:note.trim()});if(error)throw error;
   setNote('');setNotice('Nota interna salva.');
   const result=await client.from('inbox_messages').select('id,conversation_id,direction,sender,recipient,subject,body,classification,author_id,received_at').eq('organization_id',organizationId).eq('conversation_id',current.id).order('received_at',{ascending:true}).limit(200);
   if(result.error)throw result.error;setMessages((result.data||[]) as Message[]);
 });};
 const lead=current?leads[current.lead_id]:null;
 return <section className="inbox-page" aria-label="Caixa de entrada">
   <header className="inbox-header"><div><p className="inbox-eyebrow">ATENDIMENTO · {organizationId?'EMPRESA SELECIONADA':'CRM'}</p><h1>Caixa de entrada</h1><p>Respostas às campanhas desta empresa, com contexto e um próximo responsável.</p></div><button type="button" className={button} disabled={loading||busy} onClick={()=>void action(async()=>{await refresh();setNotice('Conversas atualizadas.');})}>Atualizar</button></header>
   <div className="inbox-info"><strong>Leitura de respostas por e-mail</strong><span>Somente respostas correlacionadas às cadências aparecem aqui. Para recebê-las, a caixa Microsoft 365 precisa estar conectada com permissão de leitura. Notas internas nunca são enviadas ao cliente.</span></div>
   {error&&<p className="inbox-error" role="alert">{error}</p>}{notice&&<p className="inbox-success" role="status">{notice}</p>}
   <div className="inbox-layout">
     <aside className="inbox-list" aria-label="Conversas"><div className="inbox-list-tools"><label className="sr-only" htmlFor="inbox-search">Buscar conversa</label><input id="inbox-search" placeholder="Buscar contato ou empresa" value={search} onChange={e=>setSearch(e.target.value)}/><div className="inbox-filters" role="group" aria-label="Filtrar conversas">{([['OPEN','Pendentes'],['MINE','Minhas'],['ALL','Todas'],['CLOSED','Concluídas']] as const).map(([id,label])=><button type="button" key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
       <div className="inbox-list-scroll">{loading?<p className="inbox-list-empty">Carregando conversas…</p>:visible.length?visible.map(c=>{const l=leads[c.lead_id];return <button type="button" key={c.id} className={`inbox-row ${selected===c.id?'is-selected':''}`} aria-current={selected===c.id?'true':undefined} onClick={()=>{setError('');setNotice('');setSelected(c.id);}}><span className="inbox-row-top"><strong>{l?.empresa||l?.nome||'Contato'}</strong><time>{dateTime(c.last_message_at)}</time></span><span>{l?.email||'E-mail não disponível'}</span><span className="inbox-row-bottom"><span className={`inbox-status ${c.status.toLowerCase()}`}>{statusText[c.status]}</span>{unread(c)&&<span className="inbox-unread" aria-label="Nova resposta">Nova</span>}</span></button>}):<div className="inbox-list-empty"><strong>{search?'Nenhum resultado.':'Nenhuma conversa nesta visão.'}</strong><p>{search?'Tente outro nome ou e-mail.':'As respostas recebidas aparecerão aqui. Se já recebeu um e-mail, confira a conexão e a leitura de respostas em Comunicados.'}</p></div>}</div>
     </aside>
     <main className="inbox-thread" aria-label="Conversa selecionada">{!current?<div className="inbox-welcome"><span aria-hidden="true">✉</span><h2>Uma conversa por vez.</h2><p>Selecione uma resposta para consultar o histórico, assumir o atendimento e registrar o próximo passo.</p><ol><li>Abra a resposta recebida.</li><li>Confira o lead e quem vai acompanhar.</li><li>Registre uma nota ou conclua o atendimento.</li></ol></div>:<>
       <div className="inbox-thread-head"><div><p className="inbox-eyebrow">{statusText[current.status]} · E-MAIL</p><h2>{lead?.empresa||lead?.nome||'Contato'}</h2><p>{lead?.email||'E-mail não disponível'}{lead?.telefone?` · ${lead.telefone}`:''}</p></div><button type="button" className={button} onClick={()=>onOpenLead(current.lead_id)}>Abrir cadastro ↗</button></div>
       <div className="inbox-controls"><label>Estado<select value={current.status} disabled={busy} onChange={e=>update(e.target.value as Conversation['status'],current.assigned_to)}><option value="OPEN">Aguardando</option><option value="IN_PROGRESS">Em atendimento</option><option value="CLOSED">Concluída</option></select></label><label>Responsável<select value={current.assigned_to||''} disabled={busy} onChange={e=>update(current.status,e.target.value||null)}><option value="">Sem responsável</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>{current.status!=='CLOSED'&&<button type="button" className="inbox-claim" disabled={busy||current.assigned_to===currentUser.id} onClick={()=>update('IN_PROGRESS',currentUser.id)}>Assumir</button>}</div>
       <div className="inbox-messages" aria-live="polite">{loadingThread?<p>Carregando mensagens…</p>:messages.length?messages.map(m=><article key={m.id} className={`inbox-message ${m.direction==='INTERNAL'?'is-note':''}`}><div className="inbox-message-meta"><strong>{m.direction==='INTERNAL'?'Nota interna':m.direction==='INBOUND'?'Resposta recebida':'E-mail enviado'}</strong><time>{dateTime(m.received_at)}</time></div><p className="inbox-message-from">{m.direction==='INTERNAL'?(users.find(u=>u.id===m.author_id)?.name||'Equipe'):m.sender}</p>{m.classification&&<span className={`inbox-classification ${m.classification}`}>{classificationText[m.classification]}</span>}{m.subject&&<p className="inbox-message-subject">{m.subject}</p>}<p className="inbox-message-body">{m.body}</p></article>):<p>Nenhuma mensagem carregada.</p>}</div>
       <form className="inbox-note-form" onSubmit={saveNote}><label htmlFor="inbox-note">Nota interna para a equipe</label><textarea id="inbox-note" maxLength={4000} required rows={3} placeholder="Registre o contexto e o próximo passo. O cliente não recebe esta nota." value={note} onChange={e=>setNote(e.target.value)}/><div><small>Este Inbox ainda não envia respostas. Responda pela caixa Microsoft 365 conectada.</small><button type="submit" className="btn-navy" disabled={busy||!note.trim()}>Salvar nota</button></div></form>
     </>}</main>
   </div>
 </section>;
}
