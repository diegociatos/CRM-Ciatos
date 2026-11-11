import React,{useEffect,useRef,useState} from 'react';
import type {supabase} from '../lib/supabase';
import type {User} from '../types';
import {useDialog} from '../lib/useDialog';
import {demandPriorities,isDefiniteDemandRejection} from '../lib/supportDemands';
import {callOutcomes,emptyIntake,intakeChannels,intakeError,intakePayload} from '../lib/supportIntake';
import type {IntakeDetails} from '../lib/supportIntake';

type Props={organizationId:string;users:User[];client:typeof supabase;onClose:()=>void;onOpenDemand?:(id:string)=>void};
export default function SupportIntake({organizationId,users,client,onClose,onOpenDemand}:Props){
 const [details,setDetails]=useState(emptyIntake),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[priority,setPriority]=useState('NORMAL'),[assignee,setAssignee]=useState(''),[confidential,setConfidential]=useState(false);
 const [busy,setBusy]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(''),[confirmClose,setConfirmClose]=useState(false);
 const [requestId]=useState(()=>crypto.randomUUID());
 const mounted=useRef(true),locked=useRef(false),uncertain=useRef(false),submitted=useRef<Record<string,unknown>|null>(null);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const dirty=!!(title||description||details.name||details.phone||details.email||details.company);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(!saved&&(dirty||pending)){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty,pending,saved]);
 const close=()=>{if(locked.current)return;if((dirty&&!saved)||uncertain.current)setConfirmClose(true);else onClose();};
 const ref=useDialog(close);
 const change=(patch:Partial<IntakeDetails>)=>setDetails(d=>({...d,...patch}));
 async function submit(event:React.FormEvent){
  event.preventDefault();if(locked.current||saved)return;
  if(!submitted.current){const problem=intakeError(details);if(problem){setError(problem);return;}if(title.trim().length<2){setError('Informe o assunto do atendimento.');return;}}
  locked.current=true;setBusy(true);setPending(true);setError('');
  submitted.current??={org:organizationId,details:intakePayload(details),demand_title:title.trim(),demand_description:description.trim(),demand_priority:priority,assignee:assignee||null,is_confidential:confidential,request_id:requestId};
  try{
   const {data,error:failure}=await client.rpc('create_support_intake',submitted.current);if(failure)throw failure;
   if(typeof data!=='string'||!/^[0-9a-f-]{36}$/i.test(data))throw new Error('Resposta não confirmada.');
   if(mounted.current){setSaved(data);setPending(false);uncertain.current=false;}
  }catch(e){if(mounted.current){
   const rejected=!uncertain.current&&isDefiniteDemandRejection(e);
   if(rejected){submitted.current=null;setPending(false);setError((e as {message?:string}).message||'Não foi possível registrar. Revise os dados.');}
   else{uncertain.current=true;setError('O resultado não foi confirmado. Os dados estão preservados. Clique em Conferir registro para consultar a mesma solicitação sem duplicar.');}
  }}finally{locked.current=false;if(mounted.current)setBusy(false);}
 }
 return <div className="intake-backdrop"><section ref={ref} role="dialog" aria-modal="true" aria-labelledby="intake-title" tabIndex={-1} className="intake-dialog">
  <header inert={confirmClose}><div><p className="desk-eyebrow">REGISTRO MANUAL · EMPRESA SELECIONADA</p><h2 id="intake-title">Novo atendimento</h2><p>Registre o que foi atendido fora do sistema. Isso não liga, envia mensagens nem cria um lead.</p></div><button type="button" className="desk-secondary" aria-label="Fechar novo atendimento" disabled={busy} onClick={close}>Fechar</button></header>
  {saved?<div className="intake-content"><p role="status" className="desk-notice">Atendimento registrado na Central de demandas, com responsável, prazo e histórico.</p><p className="desk-fine">Referência: {saved}</p><div className="desk-row-actions">{onOpenDemand&&<button type="button" className="desk-primary" onClick={()=>onOpenDemand(saved)}>Acompanhar demanda</button>}<button type="button" className="desk-secondary" onClick={onClose}>Concluir</button></div></div>:
  <form onSubmit={submit} className="intake-content" inert={confirmClose}>
   <fieldset disabled={busy||pending}>
    <div className="desk-field-pair"><label>Canal informado<select value={details.channel} onChange={e=>change({channel:e.target.value as IntakeDetails['channel']})}>{Object.entries(intakeChannels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Assunto<input required minLength={2} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label></div>
    <div className="desk-field-pair"><label>Nome de quem solicitou<input required minLength={2} maxLength={160} value={details.name} onChange={e=>change({name:e.target.value})}/></label><label>Empresa do solicitante<input maxLength={200} value={details.company} onChange={e=>change({company:e.target.value})}/></label></div>
    <div className="desk-field-pair"><label>Telefone com DDD<input type="tel" required={['phone','whatsapp'].includes(details.channel)} maxLength={40} value={details.phone} onChange={e=>change({phone:e.target.value})}/></label><label>E-mail do solicitante<input type="email" required={details.channel==='email'} maxLength={254} value={details.email} onChange={e=>change({email:e.target.value})}/></label></div>
    {details.channel==='phone'&&<div className="desk-field-pair"><label>Direção<select value={details.direction} onChange={e=>change({direction:e.target.value as IntakeDetails['direction']})}><option value="INBOUND">Recebida</option><option value="OUTBOUND">Realizada</option></select></label><label>Resultado da ligação<select value={details.outcome} onChange={e=>change({outcome:e.target.value as IntakeDetails['outcome'],...(e.target.value==='MISSED'?{duration_seconds:0}:{})})}>{Object.entries(callOutcomes).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Duração em segundos<input type="number" min={0} max={86400} step={1} value={details.duration_seconds} onChange={e=>change({duration_seconds:Number(e.target.value)})}/></label></div>}
    <label>Relato e próximo passo<textarea required minLength={2} maxLength={20000} rows={4} value={description} onChange={e=>setDescription(e.target.value)}/></label>
    <div className="desk-field-pair"><label>Prioridade<select value={priority} onChange={e=>setPriority(e.target.value)}>{Object.entries(demandPriorities).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Responsável<select value={assignee} onChange={e=>setAssignee(e.target.value)}><option value="">Triagem da empresa</option>{users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label></div>
    <label className="desk-check"><input type="checkbox" checked={confidential} onChange={e=>setConfidential(e.target.checked)}/>Confidencial: só criador, responsável e administradores</label>
    <p className="desk-fine">O prazo segue a política da empresa, em horas corridas. A ligação foi informada pela equipe; não há gravação ou comprovação do PABX.</p>
   </fieldset>
   {error&&<p role="alert" className="desk-error">{error}</p>}
   {pending&&<p className="desk-fine">Referência de conferência: {requestId}</p>}
   <footer><button type="button" className="desk-secondary" disabled={busy} onClick={close}>Cancelar</button><button type="submit" className="desk-primary" disabled={busy}>{busy?'Registrando…':pending?'Conferir registro':'Registrar atendimento'}</button></footer>
  </form>}
  {confirmClose&&<div className="intake-confirm" role="alertdialog" aria-label="Fechar registro"><p>{uncertain.current?'Há um resultado pendente. Confira a Central de demandas antes de registrar novamente.':'Fechar e descartar o rascunho?'}</p><button className="desk-secondary" onClick={()=>setConfirmClose(false)}>Continuar aqui</button><button className="desk-primary" onClick={onClose}>Fechar registro</button></div>}
 </section></div>;
}
