import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { aiCenterQueries } from '../lib/aiCenterQueries';
import Cadences from './Cadences';
import SdrAgent from './SdrAgent';

const labels: Record<string, string> = { ACTIVE: 'Ativa', DRAFT: 'Rascunho', PAUSED: 'Pausada', ARCHIVED: 'Arquivada', OPEN: 'Aguardando', ACKNOWLEDGED: 'Em atendimento', PENDING: 'Na fila', RUNNING: 'Executando', DONE: 'Concluída', FAILED: 'Falhou', CANCELLED: 'Cancelada', STOPPED: 'Interrompida', COMPLETED: 'Concluída', RESOLVED: 'Resolvido', DISMISSED: 'Dispensado' };
const button = 'rounded-lg px-3 py-2 bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50';
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white';
type Row = Record<string, any>;

export default function AiCenter({workspace,onOpenLead}:{workspace?:{id:string;nome:string};onOpenLead?:(id:string)=>void}={}) {
  const [organizations, setOrganizations] = useState<Row[]>([]);
  const [org, setOrg] = useState(workspace?.id||'');
  const [rows, setRows] = useState<Record<string, Row[]>>({});
  const [tab, setTab] = useState('attention');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [admin, setAdmin] = useState(false);
  const [lead, setLead] = useState('');
  const [sequence, setSequence] = useState('');
  const [domain, setDomain] = useState('');
  const [note, setNote] = useState('');
  const [basis, setBasis] = useState('');
  const [source, setSource] = useState('');
  const [form, setForm] = useState({ title: '', subject: '', body: '', days: 2 });
  const generation = useRef(0);
  useEffect(() => {
    if(workspace){setOrganizations([workspace]);setOrg(workspace.id);return;}
    let active = true;
    supabase.from('organizations').select('id,nome,branding').order('nome').then(({ data, error }) => {
      if (!active) return;
      if (error) { setError('Central indisponível. Confira se as migrations e permissões foram instaladas.'); setLoading(false); setLoadFailed(true); }
      else { setOrganizations(data || []); setOrg(data?.[0]?.id || ''); if (!data?.length) setLoading(false); }
    });
    return () => { active = false; };
  }, [workspace?.id]);
  const refresh = useCallback(async () => {
    if (!org) return;
    const version = ++generation.current;
    setLoading(true); setLoadFailed(false); setError('');
    const tables = aiCenterQueries.map(([name]) => name);
    const results = await Promise.all(aiCenterQueries.map(([name, order]) => {
      const query = supabase.from(name).select('*').eq('organization_id', org).limit(200);
      return order ? query.order(order, { ascending: false }) : query;
    }));
    const permission = await supabase.rpc('tenant_member', { org, admin_only: true });
    if (version !== generation.current) return;
    setLoading(false);
    if (results.some(r => r.error) || permission.error) { setLoadFailed(true); setRows({}); setAdmin(false); setError('Não foi possível carregar a Central. Verifique a conexão e a instalação das migrations.'); return; }
    setRows(Object.fromEntries(tables.map((name, i) => [name, results[i].data || []]))); setAdmin(permission.data === true);
  }, [org]);
  useEffect(() => { setRows({}); setLead(''); setSequence(''); setAdmin(false); setNotice(''); setError(''); void refresh(); return () => { generation.current++; }; }, [refresh]);
  async function run(name: string, args: Row) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error } = await supabase.rpc(name, args);
      if (error) throw error;
      setNotice('Alteração registrada.'); await refresh();
    } catch { setError('Operação não concluída. Confira suas permissões, os campos e se o lead já participa da cadência.'); }
    finally { setBusy(false); }
  }
  async function integration(name: string, args: Row) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error } = await supabase.functions.invoke(name, { body: { organization_id: org, ...args } });
      if (error || data?.error) throw new Error();
      setNotice(data?.summary || (data?.status === 'WAITING' ? 'Consulta iniciada. Aguarde alguns segundos e consulte o resultado.' : 'Solicitação registrada.'));
      await refresh();
    } catch { setError('Integração indisponível. Confira a ativação no servidor, as credenciais, os limites e a origem/base de contato do lead.'); }
    finally { setBusy(false); }
  }
  const handoffs = (rows.human_handoffs || []).filter(h => ['OPEN','ACKNOWLEDGED'].includes(h.status));
  const jobs = rows.automation_jobs || [];
  const company = organizations.find(o => o.id === org);
  const leadName = (id: string) => { const l = rows.leads?.find(l => l.id === id); return l?.empresa || l?.nome || 'Lead'; };
  const policy = rows.outreach_policy?.[0];
  return <section className="ai-center space-y-6 text-slate-800">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-sm text-slate-500">{company?.branding?.displayName || company?.nome || 'CRM Ciatos'}</p><h1 className="text-3xl font-bold">Central da IA</h1><p className="text-slate-500 mt-1">Seu ponto de encontro com as oportunidades e decisões da operação.</p></div>
      <div className="flex gap-2"><select aria-label="Empresa" disabled={busy||!!workspace} value={org} onChange={e => setOrg(e.target.value)} className={field}>{organizations.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}</select><button className={button} onClick={() => void refresh()}>Atualizar</button></div>
    </div>
    <div className="safe-banner"><strong>{policy?.live_enabled ? 'Envio real ligado nesta empresa' : 'Modo seguro: envio real desligado'}</strong><p className="text-sm mt-1">{policy?.live_enabled ? `Cadências inscritas em "envio real" disparam e-mails em dias úteis, das 9h às 18h, até ${policy?.daily_limit} por dia (somando comunicados).` : 'Inscrições só em simulação. Para enviar de verdade, ligue o envio em Comunicados → Configuração de envio.'} Resolver um alerta não reinicia a cadência.</p></div>
    {error && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-lg">{error}</p>}
    {notice && <p role="status" className="p-3 bg-green-50 text-green-800 rounded-lg">{notice}</p>}
    {loading && !Object.keys(rows).length && <p role="status">Carregando Central…</p>}
    {!loading && !org && !error && <p>Nenhuma empresa vinculada. Solicite ao administrador a associação do seu usuário.</p>}
    {/* Recarregar depois de uma ação mantém a tela (e a mensagem de sucesso) montada. */}
    {(!loading || Object.keys(rows).length > 0) && !loadFailed && org && <>
    <div className="central-metrics grid grid-cols-2 xl:grid-cols-4 gap-4">{[
      ['Precisa de você', handoffs.length], ['Execuções pendentes', jobs.filter(j => j.status === 'PENDING').length],
      ['Simulações concluídas', jobs.filter(j => j.result?.outcome === 'simulated').length], ['Falhas para revisar', jobs.filter(j => j.status === 'FAILED').length]
    ].map(([label, value]) => <div key={label} className="bg-white rounded-xl border p-5"><p className="text-sm text-slate-500">{label}</p><p className="text-3xl font-bold mt-2">{value}</p></div>)}</div>
    <p className="central-caption">Indicadores dos últimos 200 registros por categoria.</p>
    <nav className="flex gap-2 flex-wrap" aria-label="Seções da Central">{[['attention','Precisa de você'],['agent','Agente SDR'],['cadences','Cadências'],['activity','Atividade'],['integrations','IA e enriquecimento'],['privacy','Contatos e privacidade']].map(([id,label]) => <button key={id} aria-pressed={tab===id} className={`${button} ${tab===id ? 'ring-2 ring-amber-500' : ''}`} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'integrations' && <div className="bg-white p-5 border rounded-xl space-y-4"><h2 className="text-lg font-bold">IA e enriquecimento opcional</h2><p>Estas consultas usam provedores externos e podem consumir créditos quando habilitadas no servidor. Não iniciam envio de e-mails.</p>{admin ? <><label className="block">Lead<select className={field} value={lead} onChange={e=>setLead(e.target.value)}><option value="">Selecione</option>{rows.leads?.filter(l=>!l.opt_out).map(l=><option value={l.id} key={l.id}>{l.empresa || l.nome}</option>)}</select></label><form className="space-y-3" onSubmit={e=>{e.preventDefault();void run('save_contact_basis',{lid:lead,basis,source});}}><h3 className="font-bold">Origem e finalidade do contato</h3><label className="block">Base de contato avaliada<input required minLength={3} maxLength={500} className={field} value={basis} onChange={e=>setBasis(e.target.value)}/></label><label className="block">Fonte dos dados<input required minLength={3} maxLength={1000} className={field} value={source} onChange={e=>setSource(e.target.value)}/></label><button className={button} disabled={busy || !lead}>Registrar avaliação</button></form><label className="block">Contexto para a IA<textarea className={field} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} placeholder="Ex.: pediu uma conversa sobre nossos serviços. Evite dados sensíveis."/></label><button disabled={busy || !lead} className={button} onClick={()=>void integration('crm-ai-supervisor',{lead_id:lead,note})}>Solicitar análise da IA</button><hr/><label className="block">Domínio para encontrar decisores<input className={field} value={domain} onChange={e=>setDomain(e.target.value)} placeholder="empresa.com.br"/></label><div className="flex gap-2"><button className={button} disabled={busy || !lead || !domain} onClick={()=>void integration('crm-enrichment',{action:'start',kind:'discover',lead_id:lead,domain})}>Buscar no Snov.io</button><button className={button} disabled={busy || !lead} onClick={()=>void integration('crm-enrichment',{action:'start',kind:'verify',lead_id:lead})}>Verificar e-mail do lead</button></div></> : <p>Um administrador da empresa pode solicitar consultas.</p>}{rows.enrichment_requests?.map(r=><article key={r.id} className="border-t pt-3"><strong>{leadName(r.lead_id)}</strong><p>{r.kind==='verify'?'Verificação de e-mail':'Busca de decisores'} · {r.status}</p>{r.result && <p>{r.kind==='verify'?(r.result.verified?'Verificado':'Não verificado — não enviar'):(r.result.candidates || []).map((p:any)=>[p.name || [p.first_name,p.last_name].filter(Boolean).join(' '),p.position,(p.emails || []).map((e:any)=>e.email).join(', ')].filter(Boolean).join(' · ')).join('; ') || 'Nenhum perfil retornado'}</p>}{admin && r.status==='WAITING' && <button disabled={busy} className={button} onClick={()=>void integration('crm-enrichment',{action:'poll',id:r.id})}>Consultar resultado</button>}</article>)}</div>}
    {tab === 'attention' && <div className="space-y-3">{!handoffs.length && <div className="central-empty"><span aria-hidden="true">✓</span><h2>Tudo em dia por aqui.</h2><p>Nenhuma intervenção pendente nesta empresa.</p><p>Quando um contato ou uma execução precisar da sua atenção, você encontrará o contexto e a próxima ação aqui.</p><button className="btn-navy" onClick={()=>setTab('cadences')}>Explorar cadências <span aria-hidden="true">↗</span></button></div>}{handoffs.map(h => <article key={h.id} className="bg-white rounded-xl border p-5"><div className="flex justify-between"><h2 className="font-bold">{onOpenLead?<button className="underline" onClick={()=>onOpenLead(h.lead_id)}>{leadName(h.lead_id)}</button>:leadName(h.lead_id)}</h2><span>{labels[h.status]} · {h.priority === 'HIGH' ? 'Alta prioridade' : 'Normal'}</span></div><p className="mt-2">{h.reason}</p><p className="text-slate-500">{h.ai_summary || h.suggested_action}</p><div className="mt-4 flex gap-2"><button disabled={busy} className={button} onClick={() => void run('resolve_handoff',{hid:h.id,resolution:'ACKNOWLEDGED'})}>Assumir atendimento</button><button disabled={busy} className={button} onClick={() => void run('resolve_handoff',{hid:h.id,resolution:'RESOLVED'})}>Marcar resolvido</button></div></article>)}</div>}
    {tab === 'agent' && <SdrAgent onOpenLead={onOpenLead} key={org} org={org} admin={admin} sequences={rows.outreach_sequences || []} onChanged={refresh} />}
    {tab === 'cadences' && <Cadences org={org} admin={admin} policy={policy} sequences={rows.outreach_sequences || []} onChanged={refresh} />}
    {tab === 'activity' && <div className="bg-white border rounded-xl p-5 space-y-4"><h2 className="font-bold">Histórico de execução</h2><p className="text-sm text-slate-500">Até 200 registros por categoria. Eventos de entrega: {rows.message_events?.length || 0} · Decisões de IA: {rows.ai_runs?.length || 0}</p>{!jobs.length && <p>A fila está vazia. Ative uma cadência e inscreva um lead para simular.</p>}{jobs.map(j=><div className="border-b py-3 flex justify-between gap-4" key={j.id}><div><strong>{leadName(j.lead_id)}</strong><p className="text-sm">{j.job_type} · {new Date(j.created_at).toLocaleString('pt-BR')}</p></div><div className="text-right">{labels[j.status]}<p className="text-sm text-slate-500">{j.result?.outcome === 'simulated' ? 'Simulação — nenhum envio' : j.opened_at ? 'Possível abertura registrada' : j.last_error}</p></div></div>)}</div>}
    {tab === 'privacy' && <div className="bg-white border rounded-xl p-5 space-y-4"><h2 className="font-bold">Contatos e privacidade</h2><p className="text-sm text-slate-500">Supressões registradas: {rows.suppression_list?.length || 0}. Registrar resposta ou reunião interrompe as cadências do contato.</p>{rows.leads?.map(l=><div key={l.id} className="border-b py-3"><strong>{l.empresa || l.nome}</strong><p className="text-sm">{l.email} · {l.opt_out ? 'Não contatar' : l.email_verified_at ? 'E-mail verificado' : 'Verificação pendente'}</p><div className="flex flex-wrap gap-2 mt-2">{[['reply','Recebemos resposta'],['meeting','Reunião marcada'],['opt_out','Não contatar']].map(([action,label])=><button disabled={busy || l.opt_out} key={action} className={button} onClick={()=>void run('contact_action',{lid:l.id,action})}>{label}</button>)}{admin && <button className={button} disabled={busy} onClick={async()=>{setError(''); const {data,error}=await supabase.rpc('lead_privacy_export',{lid:l.id}); if(error){setError('Exportação não concluída.');return;} const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); const a=document.createElement('a');a.href=url;a.download='dados-do-contato.json';a.click();URL.revokeObjectURL(url);}}>Exportar dados</button>}</div></div>)}</div>}
    </>}
  </section>;
}
