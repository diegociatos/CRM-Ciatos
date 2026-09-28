import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

function Iniciar({ lead, templates, users, onDone }: { lead: Lead; templates: OnboardingTemplate[]; users: User[]; onDone: () => void }) {
  const sugerido = templates.find(t => t.serviceType && t.serviceType === lead.serviceType) || templates[0];
  const [tpl, setTpl] = useState(sugerido?.id || '');
  const [inicio, setInicio] = useState((lead.contractStart || hojeIso()).slice(0, 10));
  const [resp, setResp] = useState(lead.ownerId || users[0]?.id || '');
  const [busy, setBusy] = useState(false); const [erro, setErro] = useState('');
  const modelo = templates.find(t => t.id === tpl);
  const previa = useMemo(() => {
    if (!modelo) return [];
    let d = new Date(`${inicio}T12:00:00Z`);
    return [...modelo.phases].sort((a, b) => a.order - b.order).map(f => {
      d = new Date(d.getTime() + Math.max(0, f.defaultDueDays || 1) * 864e5); d = diaUtil(d);
      return { nome: f.name, prazo: d.toISOString().slice(0, 10), executor: (f as any).executor === 'cliente' ? 'Cliente' : 'Equipe' };
    });
  }, [modelo, inicio]);
  const iniciar = async () => {
    setBusy(true); setErro('');
    const { error } = await supabase.rpc('start_onboarding', { lid: lead.id, tpl_id: tpl, inicio, resp: resp || null });
    setBusy(false);
    if (error) return setErro(msgErro(error));
    onDone();
  };
  if (!templates.length) return <div className={`${card} p-6`}><h3 className="font-bold text-lg">Nenhum modelo de onboarding</h3><p className="text-sm text-slate-500 mt-1">Crie um modelo em Configurações → Jornadas de onboarding (fases, prazos e quem executa cada uma).</p></div>;
  return <div className={`${card} p-6 space-y-4`}>
    <div><h3 className="font-bold text-lg">Iniciar onboarding de {lead.tradeName || lead.company || lead.name}</h3>
      <p className="text-sm text-slate-500">As fases, os prazos e os responsáveis são criados a partir do modelo. Cada responsável recebe e-mail e convite no Outlook.</p></div>
    {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
    <div className="grid md:grid-cols-3 gap-3">
      <label className="text-sm">Modelo<select className={field} value={tpl} onChange={e => setTpl(e.target.value)}>{templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.serviceType ? ` · ${t.serviceType}` : ''}</option>)}</select></label>
      <label className="text-sm">Início<input type="date" className={field} value={inicio} onChange={e => setInicio(e.target.value)} /></label>
      <label className="text-sm">Responsável padrão<select className={field} value={resp} onChange={e => setResp(e.target.value)}>{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
    </div>
    {previa.length > 0 && <ol className="text-sm border border-slate-200 rounded-lg divide-y">{previa.map((p, i) => <li key={i} className="flex justify-between gap-3 px-3 py-2"><span><span className="text-slate-400 mr-2">{i + 1}.</span>{p.nome} <span className="text-xs text-slate-500">· {p.executor}</span></span><span className="text-slate-600">até {dataBr(p.prazo)}</span></li>)}</ol>}
    <button className={btnMain} disabled={busy || !tpl} onClick={() => void iniciar()}>{busy ? 'Criando…' : 'Iniciar onboarding'}</button>
  </div>;
}

function PainelFase({ step, lead, users, admin, onChanged, onClose }: { step: Row; lead?: Lead; users: User[]; admin: boolean; onChanged: () => Promise<void>; onClose: () => void }) {
  const [comentarios, setComentarios] = useState<Row[]>([]);
  const [arquivos, setArquivos] = useState<Row[]>([]);
  const [avisos, setAvisos] = useState<Row[]>([]);
  const [texto, setTexto] = useState('');
  const [prazo, setPrazo] = useState(step.prazo || '');
  const [email, setEmail] = useState(step.cliente_email || '');
  const [busy, setBusy] = useState(false); const [erro, setErro] = useState(''); const [ok, setOk] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const carregar = useCallback(async () => {
    const [c, f, a] = await Promise.all([
      supabase.from('onboarding_comments').select('*').eq('step_id', step.id).order('created_at'),
      supabase.from('onboarding_files').select('*').eq('step_id', step.id).order('created_at'),
      supabase.from('onboarding_notifications').select('tipo,destinatario,status,sent_at,created_at').eq('step_id', step.id).order('created_at', { ascending: false }).limit(20),
    ]);
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
  return <aside className={`${card} p-5 space-y-5`} aria-label="Detalhes da fase">
    <div className="flex justify-between gap-3">
      <div><p className="text-xs uppercase tracking-wider text-slate-500">Fase {step.ordem + 1} · {step.executor === 'cliente' ? 'Executada pelo cliente' : 'Executada pela equipe'}</p>
        <h3 className="text-lg font-bold mt-1">{step.titulo}</h3>{lead && <p className="text-sm text-slate-500">{lead.tradeName || lead.company || lead.name}</p>}</div>
      <button className="text-slate-400 hover:text-slate-700" aria-label="Fechar detalhes" onClick={onClose}>✕</button>
    </div>
    {step.descricao && <p className="text-sm text-slate-600 whitespace-pre-line">{step.descricao}</p>}
    <div className="flex flex-wrap gap-2 items-center"><span className={`text-xs border rounded-full px-2 py-1 ${pi.cls}`}>{pi.txt}</span>
      <span className="text-xs border rounded-full px-2 py-1 bg-slate-50 border-slate-200">{STATUS_LABEL[step.status]}</span>
      <span className="text-xs text-slate-500" title={step.calendar_error || ''}>{step.calendar_event_id ? '📅 No Outlook do responsável' : step.calendar_error ? '📅 Convite com falha' : step.status !== 'Concluido' ? '📅 Convite a caminho' : ''}</span></div>
    {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}{ok && <p role="status" className="text-sm text-emerald-700">{ok}</p>}

    <div className="flex flex-wrap gap-2">
      {step.status !== 'Concluido'
        ? <button className="rounded-lg px-4 py-2 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50" disabled={busy} onClick={() => void atualizar({ novo_status: 'Concluido' }, 'Fase concluída. A próxima foi liberada e o responsável avisado.')}>✓ Concluir fase</button>
        : <button className={btn} disabled={busy} onClick={() => void atualizar({ novo_status: 'Em Andamento' }, 'Fase reaberta.')}>Reabrir fase</button>}
      <select aria-label="Status da fase" className={`${field} w-auto`} value={step.status} disabled={busy} onChange={e => void atualizar({ novo_status: e.target.value }, 'Status atualizado.')}>
        {STATUS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
      </select>
    </div>

    <div className="grid grid-cols-1 gap-3">
      <label className="text-sm">Responsável na equipe
        <select className={field} value={step.responsavel_id || ''} disabled={busy} onChange={e => void atualizar({ novo_resp: e.target.value }, 'Responsável alterado e avisado por e-mail.')}>
          {!resp && <option value="">Sem responsável</option>}{users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select></label>
      <div className="flex gap-2 items-end"><label className="text-sm flex-1">Prazo<input type="date" className={field} value={prazo} disabled={busy} onChange={e => setPrazo(e.target.value)} /></label>
        <button className={btn} disabled={busy || !prazo || prazo === step.prazo} onClick={() => void atualizar({ novo_prazo: prazo }, 'Prazo atualizado (o convite do Outlook também).')}>Salvar</button></div>
      {step.executor === 'cliente' && <div className="flex gap-2 items-end"><label className="text-sm flex-1">E-mail do cliente para esta fase<input type="email" className={field} value={email} disabled={busy} onChange={e => setEmail(e.target.value)} placeholder="contato@cliente.com.br" /></label>
        <button className={btn} disabled={busy || email === (step.cliente_email || '')} onClick={() => void atualizar({ novo_cliente_email: email }, 'E-mail do cliente salvo; ele recebe o pedido desta fase.')}>Salvar</button></div>}
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
      <textarea className={field} rows={2} value={texto} onChange={e => setTexto(e.target.value)} placeholder="Registrar andamento…" />
      <button className={btn} disabled={busy || !texto.trim()} onClick={() => void acao(async () => { const { error } = await supabase.rpc('add_onboarding_comment', { sid: step.id, texto }); if (error) throw error; setTexto(''); })}>Comentar</button>
    </section>

    {admin && <section className="space-y-1"><h4 className="font-bold text-sm">E-mails desta fase</h4>
      {!avisos.length && <p className="text-sm text-slate-500">Nenhum e-mail ainda.</p>}
      {avisos.map((a, i) => <p key={i} className="text-xs text-slate-600">{AVISO_LABEL[a.tipo] || a.tipo} → {a.destinatario} · {a.status === 'SENT' ? `enviado ${new Date(a.sent_at).toLocaleString('pt-BR')}` : a.status === 'FAILED' ? 'falhou' : 'na fila'}</p>)}
    </section>}
  </aside>;
}

export default function Onboarding({ organizationId: org, companyName, leads, users, currentUser, templates, admin, abrirLeadId, onClearDeepLink }:
  { organizationId: string; companyName: string; leads: Lead[]; users: User[]; currentUser: User; templates: OnboardingTemplate[]; admin: boolean; abrirLeadId?: string | null; onClearDeepLink?: () => void }) {
  const [steps, setSteps] = useState<Row[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'clientes' | 'minhas'>(abrirLeadId === 'minhas' ? 'minhas' : 'clientes');
  const [leadId, setLeadId] = useState<string | null>(abrirLeadId && abrirLeadId !== 'minhas' ? abrirLeadId : null);
  const [stepId, setStepId] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'atrasados' | 'sem'>('todos');

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.from('onboarding_steps').select('*').eq('organization_id', org).order('ordem').limit(5000);
    if (error) setErro('Não foi possível carregar o onboarding.'); else { setSteps(data || []); setErro(''); }
    setCarregando(false);
  }, [org]);
  useEffect(() => { void carregar(); }, [carregar]);
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
    return !busca || `${l.tradeName} ${l.company} ${l.name}`.toLowerCase().includes(busca.toLowerCase());
  }).sort((a, b) => resumoLead(b.id).atrasadas - resumoLead(a.id).atrasadas);
  useEffect(() => { if (!leadId && listados.length && aba === 'clientes') setLeadId(listados[0].id); }, [listados, leadId, aba]);

  const abertos = steps.filter(s => s.status !== 'Concluido');
  const kpis = [
    ['Em implantação', new Set(abertos.map(s => s.lead_id)).size],
    ['Fases atrasadas', abertos.filter(s => s.prazo && s.prazo < h).length],
    ['Vencem em 7 dias', abertos.filter(s => s.prazo && s.prazo >= h && Date.parse(s.prazo) - Date.parse(h) <= 7 * 864e5).length],
    ['Aguardando cliente', abertos.filter(s => s.status === 'Aguardando Cliente').length],
  ] as const;

  const lead = leads.find(l => l.id === leadId);
  const fasesLead = leadId ? porLead.get(leadId) || [] : [];
  const stepSel = steps.find(s => s.id === stepId);
  const minhas = abertos.filter(s => s.responsavel_id === currentUser.id).sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
  const grupos: [string, Row[]][] = [
    ['Atrasadas', minhas.filter(s => s.prazo && s.prazo < h)], ['Hoje', minhas.filter(s => s.prazo === h)],
    ['Próximos 7 dias', minhas.filter(s => s.prazo && s.prazo > h && Date.parse(s.prazo) - Date.parse(h) <= 7 * 864e5)],
    ['Depois', minhas.filter(s => !s.prazo || Date.parse(s.prazo) - Date.parse(h) > 7 * 864e5)],
  ];
  const nomeLead = (id: string) => { const l = leads.find(x => x.id === id); return l?.tradeName || l?.company || l?.name || 'Cliente'; };
  const nomeUser = (id?: string) => users.find(u => u.id === id)?.name || 'Sem responsável';

  return <section className="space-y-6 text-slate-800">
    <div className="flex flex-wrap justify-between items-end gap-4">
      <div><p className="text-sm text-slate-500">{companyName}</p><h1 className="text-3xl font-bold">Onboarding do cliente</h1>
        <p className="text-slate-500 mt-1">Cada fase com responsável, prazo, e-mail de aviso e convite no Outlook — ninguém esquece a sua parte.</p></div>
      <div className="flex gap-2" role="tablist">{([['clientes', 'Clientes'], ['minhas', `Minhas fases${minhas.length ? ` (${minhas.length})` : ''}`]] as const).map(([id, t]) =>
        <button key={id} role="tab" aria-selected={aba === id} className={aba === id ? btnMain : btn} onClick={() => { setAba(id); setStepId(null); }}>{t}</button>)}</div>
    </div>
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">{kpis.map(([t, v]) => <div key={t} className={`${card} p-4`}><p className="text-sm text-slate-500">{t}</p><p className={`text-3xl font-bold mt-1 ${t === 'Fases atrasadas' && v ? 'text-red-700' : ''}`}>{v}</p></div>)}</div>
    {erro && <p role="alert" className="p-3 bg-red-50 text-red-800 rounded-lg">{erro}</p>}
    {carregando && <p role="status">Carregando…</p>}

    {!carregando && aba === 'minhas' && <div className="grid xl:grid-cols-[1fr_380px] gap-6">
      <div className="space-y-5">{!minhas.length && <div className={`${card} p-8 text-center`}><p className="text-lg font-bold">Tudo em dia ✓</p><p className="text-sm text-slate-500">Nenhuma fase aberta com você.</p></div>}
        {grupos.filter(([, fs]) => fs.length).map(([titulo, fs]) => <div key={titulo} className="space-y-2">
          <h2 className={`text-sm font-bold uppercase tracking-wider ${titulo === 'Atrasadas' ? 'text-red-700' : 'text-slate-500'}`}>{titulo} · {fs.length}</h2>
          {fs.map(s => { const pi = prazoInfo(s); return <button key={s.id} onClick={() => { setStepId(s.id); setLeadId(s.lead_id); }} className={`${card} w-full text-left p-4 flex flex-wrap justify-between gap-3 hover:border-[#c5a059] ${stepId === s.id ? 'ring-2 ring-[#c5a059]' : ''}`}>
            <div><p className="font-semibold">{s.titulo}</p><p className="text-sm text-slate-500">{nomeLead(s.lead_id)} · {s.executor === 'cliente' ? 'aguardando o cliente' : STATUS_LABEL[s.status]}</p></div>
            <span className={`text-xs border rounded-full px-2 py-1 self-center ${pi.cls}`}>{pi.txt}</span></button>; })}
        </div>)}</div>
      {stepSel && <PainelFase step={stepSel} lead={leads.find(l => l.id === stepSel.lead_id)} users={users} admin={admin} onChanged={carregar} onClose={() => setStepId(null)} />}
    </div>}

    {!carregando && aba === 'clientes' && <div className="grid lg:grid-cols-[300px_1fr] xl:grid-cols-[300px_1fr_380px] gap-6 items-start">
      <div className={`${card} p-3 space-y-3`}>
        <input className={field} placeholder="Buscar cliente" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar cliente" />
        <div className="flex gap-1 flex-wrap">{([['todos', 'Todos'], ['atrasados', 'Com atraso'], ['sem', 'Sem onboarding']] as const).map(([id, t]) =>
          <button key={id} aria-pressed={filtro === id} onClick={() => setFiltro(id)} className={`text-xs rounded-full px-3 py-1 border ${filtro === id ? 'bg-[#0a192f] text-white border-[#0a192f]' : 'bg-white border-slate-300'}`}>{t}</button>)}</div>
        <div className="max-h-[65vh] overflow-y-auto space-y-2">
          {!listados.length && <p className="text-sm text-slate-500 p-2">Nenhum cliente. Clientes aparecem aqui ao fechar contrato ou ao importar a carteira.</p>}
          {listados.map(l => { const r = resumoLead(l.id); return <button key={l.id} onClick={() => { setLeadId(l.id); setStepId(null); }}
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
        {!lead && <div className={`${card} p-8 text-center text-slate-500`}>Selecione um cliente.</div>}
        {lead && !fasesLead.length && <Iniciar lead={lead} templates={templates} users={users} onDone={() => void carregar()} />}
        {lead && fasesLead.length > 0 && <div className={`${card} p-5`}>
          <div className="flex flex-wrap justify-between gap-3 mb-4">
            <div><h2 className="text-xl font-bold">{lead.tradeName || lead.company || lead.name}</h2><p className="text-sm text-slate-500">{lead.serviceType || 'Serviço não informado'} · {resumoLead(lead.id).feitas} de {fasesLead.length} fases concluídas</p></div>
            {admin && <button className={btn} onClick={async () => { if (!window.confirm('Reiniciar o onboarding deste cliente? As fases, comentários e anexos serão apagados e os convites do Outlook cancelados.')) return; const { error } = await supabase.rpc('reset_onboarding', { lid: lead.id }); if (error) return setErro(msgErro(error)); setStepId(null); await carregar(); }}>Reiniciar</button>}
          </div>
          <ol className="relative space-y-3">
            {fasesLead.map((s, i) => { const pi = prazoInfo(s); const feito = s.status === 'Concluido'; const liberada = fasesLead.slice(0, i).every(a => !a.obrigatoria || a.status === 'Concluido');
              return <li key={s.id}><button onClick={() => setStepId(s.id)} className={`w-full text-left flex gap-4 rounded-xl border p-4 transition ${stepId === s.id ? 'border-[#c5a059] ring-2 ring-[#c5a059]/30' : 'border-slate-200 hover:border-slate-300'} ${!liberada && !feito ? 'opacity-70' : ''}`}>
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
      {stepSel && lead && stepSel.lead_id === lead.id && <div className="lg:col-span-2 xl:col-span-1"><PainelFase step={stepSel} lead={lead} users={users} admin={admin} onChanged={carregar} onClose={() => setStepId(null)} /></div>}
    </div>}
  </section>;
}
