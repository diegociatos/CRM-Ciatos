import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './Onboarding.css';
import { supabase } from '../lib/supabase';
import { Lead, LeadStatus, OnboardingTemplate, User } from '../types';

type Row = Record<string, any>;
const STATUS = ['Pendente', 'Em Andamento', 'Aguardando Cliente', 'Bloqueado', 'Concluido'] as const;
const STATUS_LABEL: Record<string, string> = { Pendente: 'A fazer', 'Em Andamento': 'Em andamento', 'Aguardando Cliente': 'Aguardando cliente', Bloqueado: 'Bloqueada', Concluido: 'Concluída' };
const AVISO_LABEL: Record<string, string> = { atribuida: 'Atribuída ao responsável', liberada: 'Fase liberada', lembrete_antes: 'Lembrete (2 dias antes)', lembrete_dia: 'Lembrete (no dia)', atrasada: 'Aviso de atraso', cliente_pedido: 'Pedido ao cliente', cliente_lembrete: 'Lembrete ao cliente', resumo: 'Resumo diário' };
const card = 'bg-white border border-slate-200 rounded-xl';
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white text-sm';
const btn = 'rounded-lg px-3 py-2 text-sm font-semibold border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50';
const btnMain = 'rounded-lg px-4 py-2 text-sm font-semibold bg-[#0a192f] text-white hover:bg-[#112240] disabled:opacity-50';

const hojeIso = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // America/Sao_Paulo
const dataBr = (iso?: string | null) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const diaUtil = (d: Date) => { const w = d.getUTCDay(); if (w === 6) d.setUTCDate(d.getUTCDate() + 2); if (w === 0) d.setUTCDate(d.getUTCDate() + 1); return d; };
const msgErro = (e: any) => String(e?.message || e || 'Erro inesperado');

function prazoInfo(s: Row) {
  if (s.status === 'Concluido') return { txt: `Concluída ${dataBr(s.concluida_em)}`, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (!s.prazo) return { txt: 'Sem prazo', cls: 'bg-slate-50 text-slate-500 border-slate-200' };
  const h = hojeIso();
  if (s.prazo < h) { const d = Math.round((Date.parse(h) - Date.parse(s.prazo)) / 864e5); return { txt: `Atrasada ${d}d · ${dataBr(s.prazo)}`, cls: 'bg-red-50 text-red-700 border-red-200' }; }
  if (s.prazo === h) return { txt: 'Vence hoje', cls: 'bg-amber-50 text-amber-800 border-amber-200' };
  return { txt: `Até ${dataBr(s.prazo)}`, cls: 'bg-slate-50 text-slate-600 border-slate-200' };
}

function Iniciar({ lead, templates, users, onDone, onCancel, onTemplates, guardRef }: { lead: Lead; templates: OnboardingTemplate[]; users: User[]; onDone: () => void; onCancel: () => void; onTemplates?: () => void; guardRef: React.MutableRefObject<()=>boolean> }) {
  const sugerido = templates.find(t => t.serviceType && t.serviceType === lead.serviceType) || templates[0];
  const [tpl, setTpl] = useState(sugerido?.id || '');
  const [inicio, setInicio] = useState((lead.contractStart || hojeIso()).slice(0, 10));
  const [resp, setResp] = useState(users.some(u=>u.id===lead.ownerId)?lead.ownerId:users[0]?.id || '');
  const [busy, setBusy] = useState(false); const [erro, setErro] = useState('');
  const initial=useRef(JSON.stringify([tpl,inicio,resp]));
  useEffect(()=>{guardRef.current=()=>!busy&&(initial.current===JSON.stringify([tpl,inicio,resp])||window.confirm('Descartar a configuração ainda não iniciada?'));return()=>{guardRef.current=()=>true;};},[tpl,inicio,resp,busy,guardRef]);
  const modelo = templates.find(t => t.id === tpl);
  const previa = useMemo(() => {
    if (!modelo || !inicio || !Number.isFinite(Date.parse(inicio))) return [];
    let d = new Date(`${inicio}T12:00:00Z`);
    return [...modelo.phases].sort((a, b) => a.order - b.order).map(f => {
      d = new Date(d.getTime() + Math.max(0, f.defaultDueDays ?? 1) * 864e5); d = diaUtil(d);
      return { nome: f.name, prazo: d.toISOString().slice(0, 10), executor: (f as any).executor === 'cliente' ? 'Cliente' : 'Equipe' };
    });
  }, [modelo, inicio]);
  const iniciar = async () => {
    if (busy || !inicio || !modelo?.phases.length || !resp) return;
    setBusy(true); setErro('');
    try { const { error } = await supabase.rpc('start_onboarding', { lid: lead.id, tpl_id: tpl, inicio, resp: resp || null });
    if (error) throw error;
    onDone(); } catch(e) { setErro(msgErro(e)); } finally { setBusy(false); }
  };
  if (!templates.length) return <div className={`${card} p-6`}><h3 className="font-bold text-lg">Nenhum modelo de onboarding</h3><p className="text-sm text-slate-500 mt-1">Defina as fases e os prazos antes de iniciar a implantação.</p><button className={btnMain} onClick={onTemplates}>Configurar jornadas</button><button className={btn} onClick={()=>{if(guardRef.current())onCancel();}}>Voltar aos clientes</button></div>;
  return <div className={`${card} ob-start p-6 space-y-4`}>
    <div><h3 className="font-bold text-lg">Iniciar onboarding de {lead.tradeName || lead.company || lead.name}</h3>
      <p className="text-sm text-slate-500">Revise o modelo, os prazos e o responsável antes de criar a jornada. Avisos e calendário dependem das integrações configuradas.</p></div>
    {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
    <div className="grid md:grid-cols-3 gap-3">
      <label className="text-sm">Modelo<select className={field} disabled={busy} value={tpl} onChange={e => setTpl(e.target.value)}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.serviceType ? ` · ${t.serviceType}` : ''}</option>)}</select></label>
      <label className="text-sm">Início<input type="date" className={field} disabled={busy} value={inicio} onChange={e => setInicio(e.target.value)} /></label>
      <label className="text-sm">Responsável padrão<select className={field} disabled={busy} value={resp} onChange={e => setResp(e.target.value)}><option value="">Selecione um responsável</option>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    </div>
    {previa.length > 0 && <ol className="text-sm border border-slate-200 rounded-lg divide-y">{previa.map((p, i) => <li key={i} className="flex justify-between gap-3 px-3 py-2"><span><span className="text-slate-400 mr-2">{i + 1}.</span>{p.nome} <span className="text-xs text-slate-500">· {p.executor}</span></span><span className="text-slate-600">até {dataBr(p.prazo)}</span></li>)}</ol>}
    <div className="ob-savebar"><button className={btn} disabled={busy} onClick={()=>{if(guardRef.current())onCancel();}}>Voltar aos clientes</button><button className={btnMain} disabled={busy || !tpl || !inicio || !resp || !previa.length} onClick={() => void iniciar()}>{busy ? 'Criando…' : 'Confirmar e iniciar jornada'}</button></div>
  </div>;
}

function PainelFase({ step, lead, users, admin, onChanged, onClose, guardRef }: { step: Row; lead?: Lead; users: User[]; admin: boolean; onChanged: () => Promise<void>; onClose: () => void; guardRef: React.MutableRefObject<()=>boolean> }) {
  const [comentarios, setComentarios] = useState<Row[]>([]);
  const [arquivos, setArquivos] = useState<Row[]>([]);
  const [avisos, setAvisos] = useState<Row[]>([]);
  const [texto, setTexto] = useState('');
  const [prazo, setPrazo] = useState(step.prazo || '');
  const [email, setEmail] = useState(step.cliente_email || '');
  const [busy, setBusy] = useState(false); const [erro, setErro] = useState(''); const [ok, setOk] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef=useRef<HTMLElement>(null);
  useEffect(()=>{panelRef.current?.focus({preventScroll:true});panelRef.current?.scrollIntoView({behavior:'smooth',block:'start'});},[]);
  useEffect(()=>{guardRef.current=()=>!busy&&(!(texto.trim()||prazo!==(step.prazo||'')||email!==(step.cliente_email||''))||window.confirm('Descartar as alterações não salvas desta fase?'));return()=>{guardRef.current=()=>true;};},[texto,prazo,email,step.prazo,step.cliente_email,busy,guardRef]);
  const carregar = useCallback(async () => {
    const [c, f, a] = await Promise.all([
      supabase.from('onboarding_comments').select('*').eq('step_id', step.id).order('created_at'),
      supabase.from('onboarding_files').select('*').eq('step_id', step.id).order('created_at'),
      supabase.from('onboarding_notifications').select('tipo,destinatario,status,sent_at,created_at').eq('step_id', step.id).order('created_at', { ascending: false }).limit(20),
    ]);
    if(c.error||f.error||a.error){setErro('Não foi possível carregar todos os detalhes desta fase.');return;}
    setComentarios(c.data || []); setArquivos(f.data || []); setAvisos(a.data || []);
  }, [step.id]);
  useEffect(() => { setPrazo(step.prazo || ''); setEmail(step.cliente_email || ''); setErro(''); setOk(''); void carregar(); }, [step.id, step.prazo, step.cliente_email, carregar]);
  const acao = async (fn: () => Promise<void>, sucesso?: string) => {
    if (busy) return; setBusy(true); setErro(''); setOk('');
    try { await fn(); if (sucesso) setOk(sucesso); await onChanged(); await carregar(); } catch (e) { setErro(msgErro(e)); } finally { setBusy(false); }
  };
  const atualizar = (args: Row, sucesso: string) => acao(async () => {
    const { error } = await supabase.rpc('update_onboarding_step', { sid: step.id, novo_status: null, novo_resp: null, novo_prazo: null, novo_cliente_email: null, ...args });
    if (error) throw error;
  }, sucesso);
  const enviarArquivo = (file: File) => acao(async () => {
    if (file.size > 20 * 1024 * 1024) throw new Error('Arquivo acima de 20 MB.');
    const seguro = file.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);
    const path = `${step.organization_id}/${step.lead_id}/${step.id}/${Date.now()}_${seguro}`;
    const up = await supabase.storage.from('crm-onboarding').upload(path, file, { contentType: file.type || undefined });
    if (up.error) throw up.error;
    const { error } = await supabase.rpc('register_onboarding_file', { sid: step.id, file_path: path, file_name: file.name, file_size: file.size, file_type: file.type || '' });
    if (error) { await supabase.storage.from('crm-onboarding').remove([path]); throw error; }
  }, 'Arquivo anexado.');
  const baixar = async (f: Row) => {
    const { data, error } = await supabase.storage.from('crm-onboarding').createSignedUrl(f.path, 120, { download: f.nome });
    if (error || !data) return setErro('Não foi possível abrir o arquivo.');
    window.open(data.signedUrl, '_blank', 'noopener');
  };
  const pi = prazoInfo(step);
  const resp = users.find(u => u.id === step.responsavel_id);
  return <aside ref={panelRef} tabIndex={-1} className={`${card} ob-phase-detail p-5 space-y-5`} aria-label="Detalhes da fase">
    <div className="flex justify-between gap-3">
      <div><p className="text-xs uppercase tracking-wider text-slate-500">Fase {step.ordem + 1} · {step.executor === 'cliente' ? 'Executada pelo cliente' : 'Executada pela equipe'}</p>
        <h3 className="text-lg font-bold mt-1">{step.titulo}</h3>{lead && <p className="text-sm text-slate-500">{lead.tradeName || lead.company || lead.name}</p>}</div>
      <button className="text-slate-400 hover:text-slate-700" aria-label="Fechar detalhes" disabled={busy} onClick={()=>{if(guardRef.current())onClose();}}>✕</button>
    </div>
    {step.descricao && <p className="text-sm text-slate-600 whitespace-pre-line">{step.descricao}</p>}
    <div className="flex flex-wrap gap-2 items-center"><span className={`text-xs border rounded-full px-2 py-1 ${pi.cls}`}>{pi.txt}</span>
      <span className="text-xs border rounded-full px-2 py-1 bg-slate-50 border-slate-200">{STATUS_LABEL[step.status]}</span>
      <span className="text-xs text-slate-500" title={step.calendar_error || ''}>{step.calendar_event_id ? '📅 No Outlook do responsável' : step.calendar_error ? '📅 Convite com falha' : step.status !== 'Concluido' ? 'Calendário ainda não sincronizado' : ''}</span></div>
    {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}{ok && <p role="status" className="text-sm text-emerald-700">{ok}</p>}

    <div className="flex flex-wrap gap-2">
      {step.status !== 'Concluido'
        ? <button className="rounded-lg px-4 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" disabled={busy} onClick={() => void atualizar({ novo_status: 'Concluido' }, 'Fase concluída. A jornada foi atualizada.')}>✓ Concluir fase</button>
        : <button className={btn} disabled={busy} onClick={() => void atualizar({ novo_status: 'Em Andamento' }, 'Fase reaberta.')}>Reabrir fase</button>}
      <select aria-label="Status da fase" className={`${field} w-auto`} value={step.status} disabled={busy} onChange={e => void atualizar({ novo_status: e.target.value }, 'Status atualizado.')}>
        {STATUS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
    </div>

    <div className="grid grid-cols-1 gap-3">
      <label className="text-sm">Responsável na equipe
        <select className={field} value={step.responsavel_id || ''} disabled={busy} onChange={e => void atualizar({ novo_resp: e.target.value }, 'Responsável atualizado.')}>
          {!resp && <option value="">Sem responsável</option>}{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select></label>
      <div className="flex gap-2 items-end"><label className="text-sm flex-1">Prazo<input type="date" className={field} value={prazo} disabled={busy} onChange={e => setPrazo(e.target.value)} /></label>
        <button className={btn} disabled={busy || !prazo || prazo === step.prazo} onClick={() => void atualizar({ novo_prazo: prazo }, 'Prazo atualizado.')}>Salvar</button></div>
      {step.executor === 'cliente' && <div className="flex gap-2 items-end"><label className="text-sm flex-1">E-mail do cliente para esta fase<input type="email" className={field} value={email} disabled={busy} onChange={e => setEmail(e.target.value)} placeholder="contato@cliente.com.br" /></label>
        <button className={btn} disabled={busy || email === (step.cliente_email || '')} onClick={() => void atualizar({ novo_cliente_email: email }, 'E-mail do cliente salvo.')}>Salvar</button></div>}
    </div>

    <section className="space-y-2"><div className="flex justify-between items-center"><h4 className="font-bold text-sm">Anexos</h4>
      <button className={btn} disabled={busy} onClick={() => fileRef.current?.click()}>📎 Anexar</button>
      <input ref={fileRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void enviarArquivo(f); }} /></div>
      {!arquivos.length && <p className="text-sm text-slate-500">Nenhum anexo.</p>}
      {arquivos.map(f => <div key={f.id} className="flex items-center justify-between gap-2 text-sm border border-slate-200 rounded-lg px-3 py-2">
        <button className="truncate text-left text-[#0a192f] underline" onClick={() => void baixar(f)} title={f.nome}>{f.nome}</button>
        <span className="text-xs text-slate-500 whitespace-nowrap">{f.enviado_por_nome} · {dataBr(f.created_at)}</span>
        <button className="text-slate-400 hover:text-red-600" aria-label={`Excluir ${f.nome}`} onClick={() => { if (window.confirm(`Excluir o anexo "${f.nome}"?`)) void acao(async () => { const { data, error } = await supabase.rpc('delete_onboarding_file', { fid: f.id }); if (error) throw error; await supabase.storage.from('crm-onboarding').remove([data]); }, 'Anexo excluído.'); }}>✕</button>
      </div>)}
    </section>

    <section className="space-y-2"><h4 className="font-bold text-sm">Comentários</h4>
      {!comentarios.length && <p className="text-sm text-slate-500">Nenhum comentário.</p>}
      {comentarios.map(c => <div key={c.id} className="text-sm bg-slate-50 rounded-lg px-3 py-2"><p className="text-xs text-slate-500">{c.autor_nome} · {new Date(c.created_at).toLocaleString('pt-BR')}</p><p className="whitespace-pre-line">{c.texto}</p></div>)}
      <textarea className={field} aria-label="Comentário da fase" disabled={busy} rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Registrar andamento…" />
      <button className={btn} disabled={busy || !texto.trim()} onClick={() => void acao(async () => { const { error } = await supabase.rpc('add_onboarding_comment', { sid: step.id, texto }); if (error) throw error; setTexto(''); })}>Comentar</button>
    </section>

    {admin && <section className="space-y-1"><h4 className="font-bold text-sm">E-mails desta fase</h4>
      {!avisos.length && <p className="text-sm text-slate-500">Nenhum e-mail ainda.</p>}
      {avisos.map((a, i) => <p key={i} className="text-xs text-slate-600">{AVISO_LABEL[a.tipo] || a.tipo} → {a.destinatario} · {a.status === 'SENT' ? `enviado ${new Date(a.sent_at).toLocaleString('pt-BR')}` : a.status === 'FAILED' ? 'falhou' : 'na fila'}</p>)}
    </section>}
  </aside>;
}

export default function Onboarding({ organizationId: org, companyName, leads, users, currentUser, templates, admin, abrirLeadId, onClearDeepLink, onImport, onTemplates, onCustomers }:
  { organizationId: string; companyName: string; leads: Lead[]; users: User[]; currentUser: User; templates: OnboardingTemplate[]; admin: boolean; abrirLeadId?: string | null; onClearDeepLink?: () => void; onImport?: () => void; onTemplates?: () => void; onCustomers?: () => void }) {
  const guardRef=useRef<()=>boolean>(()=>true);
  const [steps, setSteps] = useState<Row[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'clientes' | 'minhas'>(abrirLeadId === 'minhas' ? 'minhas' : 'clientes');
  const [leadId, setLeadId] = useState<string | null>(abrirLeadId && abrirLeadId !== 'minhas' ? abrirLeadId : null);
  const [stepId, setStepId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'atrasados' | 'sem' | 'ativas' | 'aguardando' | 'proximas'>('todos');

  const requestVersion=useRef(0);
  const carregar = useCallback(async () => {
    const version=++requestVersion.current;
    try { const { data, error } = await supabase.from('onboarding_steps').select('*').eq('organization_id', org).order('ordem').limit(5000);
      if(error)throw error;if(version===requestVersion.current){setSteps(data||[]);setErro('');}
    }catch(e){if(version===requestVersion.current)setErro('Não foi possível carregar o onboarding. Tente novamente.');}
    finally{if(version===requestVersion.current)setCarregando(false);}
  }, [org]);
  useEffect(() => {setCarregando(true);setSteps([]);void carregar();return()=>{requestVersion.current++;};}, [carregar]);
  useEffect(() => { if (abrirLeadId) onClearDeepLink?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const clientes = useMemo(() => leads.filter(l => l.status === LeadStatus.WON || l.relacao === 'cliente' || steps.some(s => s.lead_id === l.id)), [leads, steps]);
  const porLead = useMemo(() => { const m = new Map<string, Row[]>(); for (const s of steps) { const a = m.get(s.lead_id) || []; a.push(s); m.set(s.lead_id, a); } return m; }, [steps]);
  const h = hojeIso();
  const resumoLead = (id: string) => {
    const fs = porLead.get(id) || [];
    const feitas = fs.filter(s => s.status === 'Concluido').length;
    const atrasadas = fs.filter(s => s.status !== 'Concluido' && s.prazo && s.prazo < h).length;
    const proxima = fs.find(s => s.status !== 'Concluido');
    return { total: fs.length, feitas, atrasadas, proxima, pct: fs.length ? Math.round(feitas / fs.length * 100) : 0 };
  };
  const listados = clientes.filter(l => {
    const r = resumoLead(l.id);
    if (filtro === 'atrasados' && !r.atrasadas) return false;
    if (filtro === 'sem' && r.total) return false;
    if (filtro === 'ativas' && (!r.total || r.feitas===r.total)) return false;
    if (filtro === 'aguardando' && !(porLead.get(l.id)||[]).some(s=>s.status==='Aguardando Cliente')) return false;
    if (filtro === 'proximas' && !(porLead.get(l.id)||[]).some(s=>s.status!=='Concluido'&&s.prazo>=h&&Date.parse(s.prazo)-Date.parse(h)<=7*864e5)) return false;
    return !busca || `${l.tradeName} ${l.company} ${l.name}`.toLowerCase().includes(busca.toLowerCase());
  }).sort((a, b) => resumoLead(b.id).atrasadas - resumoLead(a.id).atrasadas);
  useEffect(() => { if(aba==='clientes'&&!listados.some(l=>l.id===leadId)){setLeadId(listados[0]?.id||null);setStepId(null);} }, [listados, leadId, aba]);

  const abertos = steps.filter(s => s.status !== 'Concluido');
  const kpis = [
    ['Em implantação', new Set(abertos.map(s => s.lead_id)).size],
    ['Fases atrasadas', abertos.filter(s => s.prazo && s.prazo < h).length],
    ['Vencem em 7 dias', abertos.filter(s => s.prazo && s.prazo >= h && Date.parse(s.prazo) - Date.parse(h) <= 7 * 864e5).length],
    ['Aguardando cliente', abertos.filter(s => s.status === 'Aguardando Cliente').length],
  ] as const;

  const lead = clientes.find(l => l.id === leadId);
  const fasesLead = leadId ? porLead.get(leadId) || [] : [];
  const stepSel = steps.find(s => s.id === stepId);
  const minhas = abertos.filter(s => s.responsavel_id === currentUser.id).sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
  const grupos: [string, Row[]][] = [
    ['Atrasadas', minhas.filter(s => s.prazo && s.prazo < h)], ['Hoje', minhas.filter(s => s.prazo === h)],
    ['Próximos 7 dias', minhas.filter(s => s.prazo && s.prazo > h && Date.parse(s.prazo) - Date.parse(h) <= 7 * 864e5)],
    ['Depois', minhas.filter(s => !s.prazo || Date.parse(s.prazo) - Date.parse(h) > 7 * 864e5)],
  ];
  const previewModel=(/contab/i.test(companyName)&&templates.find(t=>/contab/i.test(t.serviceType)))||templates[0];
  const nomeLead = (id: string) => { const l = leads.find(x => x.id === id); return l?.tradeName || l?.company || l?.name || 'Cliente'; };
  const nomeUser = (id?: string) => users.find(u => u.id === id)?.name || 'Sem responsável';

  return <section className="onboarding-workspace space-y-6 text-slate-800">
    <div className="ob-page-heading flex flex-wrap justify-between items-end gap-4">
      <div><p className="text-sm text-slate-500">{companyName}</p><h1 className="text-3xl font-bold">Onboarding do cliente</h1>
        <p className="text-slate-500 mt-1">Da chegada do cliente à operação organizada. Cada etapa, um responsável e um próximo passo.</p></div>
      <div className="ob-view-tabs flex gap-2" role="tablist" aria-label="Visão do onboarding">{([['clientes', 'Clientes'], ['minhas', `Minhas fases${minhas.length ? ` (${minhas.length})` : ''}`]] as const).map(([id, t]) =>
        <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? btnMain : btn} onClick={() => {if(!guardRef.current())return; setAba(id); setStepId(null); }}>{t}</button>)}</div>
    </div>
    {clientes.length>0&&<div className="ob-metrics grid grid-cols-2 xl:grid-cols-4 gap-4">{kpis.map(([t, v],i) => <button key={t} aria-label={`${t}: ${v}. Filtrar clientes`} onClick={()=>{if(!guardRef.current())return;setAba('clientes');setBusca('');setFiltro((['ativas','atrasados','proximas','aguardando'] as const)[i]);setStepId(null);}} className={`${card} p-4 text-left`}><p className="text-sm text-slate-500">{t}</p><p className={`text-3xl font-bold mt-1 ${t === 'Fases atrasadas' && v ? 'text-red-700' : ''}`}>{v}</p><span className="ob-metric-link">Ver clientes →</span></button>)}</div>}
    {erro && <p role="alert" className="p-3 bg-red-50 text-red-800 rounded-lg">{erro} <button className={btn} onClick={()=>void carregar()}>Tentar novamente</button></p>}
    {carregando && <p role="status" className="ob-loading">Carregando as jornadas de {companyName}…</p>}

    {!carregando && !erro && !clientes.length && aba==='clientes' && <div className="ob-welcome">
      <div className="ob-welcome-main"><span className="ob-eyebrow">BOAS-VINDAS À OPERAÇÃO</span><h2>Uma boa parceria começa<br/>com uma chegada bem cuidada.</h2><p>Organize a entrada dos clientes da <strong>{companyName}</strong>: documentos, responsáveis e prazos em uma jornada que sua equipe consegue acompanhar.</p><div className="ob-welcome-actions"><button className={btnMain} onClick={onImport}>Importar carteira de clientes <span aria-hidden="true">↗</span></button><button className={btn} onClick={onCustomers}>Abrir base de clientes</button></div><p className="ob-footnote">Ao importar, escolha a relação “Cliente”. Negócios ganhos também aparecem aqui automaticamente.</p><div className="ob-getting-started">{[['01','Traga sua carteira','Cadastre os clientes na empresa em que você está trabalhando.'],['02','Prepare a jornada','Escolha o modelo, revise os prazos e defina quem acompanha.'],['03','Acompanhe a entrega','Registre documentos e avanços até concluir a implantação.']].map(([n,title,body])=><div key={n}><span>{n}</span><h3>{title}</h3><p>{body}</p></div>)}</div></div>
      <aside className="ob-model-preview"><span className="ob-eyebrow">ANTES DE COMEÇAR</span><h2>Sua jornada, preparada</h2><p>Revise o modelo usado pela equipe antes de receber o primeiro cliente.</p>{templates.length ? <><strong>{previewModel?.name}</strong><ol>{(previewModel?.phases||[]).slice().sort((a,b)=>a.order-b.order).slice(0,5).map((p,i)=><li key={p.id}><span>{i+1}</span><div><strong>{p.name}</strong><small>{p.executor==='cliente'?'Participação do cliente':'Responsabilidade da equipe'}</small></div></li>)}</ol><p className="ob-footnote">Prévia do modelo. Nenhuma implantação foi iniciada.</p></>:<p className="ob-footnote">Nenhum modelo disponível nesta empresa.</p>}{admin?<button className={btn} onClick={onTemplates}>Revisar modelos de jornada →</button>:<p>Peça ao administrador para revisar os modelos da empresa.</p>}</aside>
    </div>}
    {!carregando && !erro && aba === 'minhas' && <div className="ob-mine-layout">
      <div className="space-y-5">{!minhas.length && <div className={`${card} p-8 text-center`}><p className="text-lg font-bold">Nenhuma fase atribuída a você</p><p className="text-sm text-slate-500">As etapas sob sua responsabilidade aparecerão aqui, organizadas por prazo.</p></div>}
        {grupos.filter(([, fs]) => fs.length).map(([titulo, fs]) => <div key={titulo} className="space-y-2">
          <h2 className={`text-sm font-bold uppercase tracking-wider ${titulo === 'Atrasadas' ? 'text-red-700' : 'text-slate-500'}`}>{titulo} · {fs.length}</h2>
          {fs.map(s => { const pi = prazoInfo(s); return <button key={s.id} onClick={() => {if(!guardRef.current())return; setStepId(s.id); setLeadId(s.lead_id); }} className={`${card} w-full text-left p-4 flex flex-wrap justify-between gap-3 hover:border-[#c5a059] ${stepId === s.id ? 'ring-2 ring-[#c5a059]' : ''}`}>
            <div><p className="font-semibold">{s.titulo}</p><p className="text-sm text-slate-500">{nomeLead(s.lead_id)} · {s.executor === 'cliente' ? 'aguardando o cliente' : STATUS_LABEL[s.status]}</p></div>
            <span className={`text-xs border rounded-full px-2 py-1 self-center ${pi.cls}`}>{pi.txt}</span></button>; })}
        </div>)}</div>
      {stepSel && <PainelFase guardRef={guardRef} key={stepSel.id} step={stepSel} lead={leads.find(l => l.id === stepSel.lead_id)} users={users} admin={admin} onChanged={carregar} onClose={() => setStepId(null)} />}
    </div>}

    {!carregando && !erro && clientes.length>0 && aba === 'clientes' && <div className="ob-client-layout">
      <div className={`${card} ob-client-picker p-3 space-y-3`}><h2 className="ob-section-label">Sua carteira · {clientes.length}</h2>
        <input className={field} placeholder="Buscar cliente" value={busca} onChange={e => {if(guardRef.current())setBusca(e.target.value);}} aria-label="Buscar cliente" />
        <div className="flex gap-1 flex-wrap">{([['todos', 'Todos'], ['ativas','Em implantação'], ['atrasados', 'Com atraso'], ['sem', 'Não iniciados'], ['aguardando','Aguardando cliente'], ['proximas','Próximos 7 dias']] as const).map(([id, t]) =>
          <button key={id} aria-pressed={filtro === id} onClick={() => {if(guardRef.current())setFiltro(id);}} className={`text-xs rounded-full px-3 py-1 border ${filtro === id ? 'bg-[#0a192f] text-white border-[#0a192f]' : 'bg-white border-slate-300'}`}>{t}</button>)}</div>
        <div className="max-h-[65vh] overflow-y-auto space-y-2">
          {!listados.length && <div className="ob-no-results"><p>Nenhum cliente corresponde à busca ou ao filtro.</p><button className={btn} onClick={()=>{setBusca('');setFiltro('todos');}}>Limpar filtros</button></div>}
          {listados.map(l => { const r = resumoLead(l.id); return <button key={l.id} onClick={() => {if(!guardRef.current())return; setLeadId(l.id); setStepId(null); }}
            className={`w-full text-left rounded-lg border p-3 ${leadId === l.id ? 'border-[#c5a059] bg-amber-50/40' : 'border-slate-200 hover:bg-slate-50'}`}>
            <div className="flex justify-between gap-2"><p className="font-semibold truncate">{l.tradeName || l.company || l.name}</p>{r.atrasadas > 0 && <span className="text-xs text-red-700 font-bold whitespace-nowrap">{r.atrasadas} atrasada(s)</span>}</div>
            {r.total ? <>
              <div className="h-1.5 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-[#c5a059]" style={{ width: `${r.pct}%` }} /></div>
              <p className="text-xs text-slate-500 mt-1">{r.pct === 100 ? 'Concluído' : `${r.feitas}/${r.total} · próxima: ${r.proxima?.titulo}`}</p>
            </> : <p className="text-xs text-slate-500 mt-1">Sem onboarding</p>}
          </button>; })}
        </div>
      </div>

      <div className="space-y-4 min-w-0">
        {!lead && <div className={`${card} ob-no-results`}><h2>Nenhuma jornada nesta seleção</h2><p>Ajuste os filtros para encontrar o cliente que deseja acompanhar.</p></div>}
        {lead && !fasesLead.length && <Iniciar guardRef={guardRef} key={lead.id} onCancel={()=>onCustomers?.()} onTemplates={onTemplates} lead={lead} templates={templates} users={users} onDone={() => void carregar()} />}
        {lead && fasesLead.length > 0 && <div className={`${card} ob-journey p-5`}>
          <div className="flex flex-wrap justify-between gap-3 mb-4">
            <div><h2 className="text-xl font-bold">{lead.tradeName || lead.company || lead.name}</h2><p className="text-sm text-slate-500">{lead.serviceType || 'Serviço não informado'} · {resumoLead(lead.id).feitas} de {fasesLead.length} fases concluídas</p></div>
            {admin && <button className={btn} onClick={async () => { if (!window.confirm('Reiniciar o onboarding deste cliente? As fases, comentários e anexos serão apagados e os convites do Outlook cancelados.')) return; const { error } = await supabase.rpc('reset_onboarding', { lid: lead.id }); if (error) return setErro(msgErro(error)); setStepId(null); await carregar(); }}>Reiniciar</button>}
          </div>
          <div className="ob-progress-summary"><strong>{resumoLead(lead.id).pct}% concluído</strong><span>{resumoLead(lead.id).proxima ? `Próximo passo: ${resumoLead(lead.id).proxima.titulo}` : 'Implantação concluída'}</span><progress max="100" value={resumoLead(lead.id).pct} aria-label="Progresso da implantação"/></div><ol className="ob-timeline relative space-y-3">
            {fasesLead.map((s, i) => { const pi = prazoInfo(s); const feito = s.status === 'Concluido'; const liberada = fasesLead.slice(0, i).every(a => !a.obrigatoria || a.status === 'Concluido');
              return <li key={s.id}><button onClick={() => {if(guardRef.current())setStepId(s.id);}} className={`w-full text-left flex gap-4 rounded-xl border p-4 transition ${stepId === s.id ? 'border-[#c5a059] ring-2 ring-[#c5a059]/30' : 'border-slate-200 hover:border-slate-300'} ${!liberada && !feito ? 'opacity-70' : ''}`}>
                <span className={`shrink-0 w-9 h-9 rounded-full grid place-items-center text-sm font-bold ${feito ? 'bg-emerald-600 text-white' : liberada ? 'bg-[#0a192f] text-white' : 'bg-slate-100 text-slate-500'}`}>{feito ? '✓' : i + 1}</span>
                <span className="flex-1 min-w-0"><span className="flex flex-wrap items-center gap-2"><span className="font-semibold">{s.titulo}</span>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${s.executor === 'cliente' ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-600'}`}>{s.executor === 'cliente' ? 'Cliente' : 'Equipe'}</span>
                  {!s.obrigatoria && <span className="text-xs text-slate-500">opcional</span>}</span>
                  <span className="block text-sm text-slate-500 mt-0.5">{nomeUser(s.responsavel_id)} · {feito ? STATUS_LABEL.Concluido : liberada ? STATUS_LABEL[s.status] : 'Aguardando fase anterior'}</span></span>
                <span className={`self-center text-xs border rounded-full px-2 py-1 whitespace-nowrap ${pi.cls}`}>{pi.txt}</span>
              </button></li>; })}
          </ol>
        </div>}
      </div>
      {stepSel && lead && stepSel.lead_id === lead.id && <div className="ob-detail-row"><PainelFase guardRef={guardRef} key={stepSel.id} step={stepSel} lead={lead} users={users} admin={admin} onChanged={carregar} onClose={() => setStepId(null)} /></div>}
    </div>}
  </section>;
}
