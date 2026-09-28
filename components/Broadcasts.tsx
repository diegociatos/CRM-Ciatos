import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

type Row = Record<string, any>;
const STATUS: Record<string, string> = { DRAFT: 'Rascunho', SCHEDULED: 'Agendado', SENDING: 'Enviando', SENT: 'Enviado', CANCELLED: 'Cancelado' };
const card = 'bg-white border rounded-xl p-5 space-y-4';
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white';
const vazio = { id: null as string | null, titulo: '', assunto: '', corpo: '', relacao: 'cliente', tags: [] as string[], uf: '', segmento: '' };

const msgErro = (e: any) => String(e?.message || e || 'Erro inesperado').replace(/^.*?:\s(?=[A-ZÁÉÍÓÚ])/, '');

const REDIRECT_MS = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-ms365`;

async function chamarMs365(body: Row) {
  const { data, error } = await supabase.functions.invoke('crm-ms365', { body });
  let msg = data?.error; if (error) { try { msg = (await (error as any).context.json()).error; } catch { msg = error.message; } }
  if (msg) throw new Error(msg);
  return data;
}

/** Caixa do Microsoft 365 que envia todos os e-mails do CRM (mesmo modelo do ContaOne). */
function Ms365Panel({ canPlatform, onStatus }: { canPlatform: boolean; onStatus: (s: Row | null) => void }) {
  const [st, setSt] = useState<Row | null>(null);
  const [f, setF] = useState({ tenant_id: '', client_id: '', client_secret: '', envia_como: '' });
  const [busy, setBusy] = useState(false); const [erro, setErro] = useState(''); const [ok, setOk] = useState('');
  const carregar = useCallback(async () => {
    try { const s = await chamarMs365({ action: 'status' }); setSt(s); onStatus(s); setF(x => ({ ...x, tenant_id: s.tenant_id, client_id: s.client_id, envia_como: s.envia_como })); }
    catch { setSt(null); onStatus(null); }
  }, [onStatus]);
  useEffect(() => { void carregar(); }, [carregar]);
  const acao = async (fn: () => Promise<void>) => { setBusy(true); setErro(''); setOk(''); try { await fn(); } catch (e: any) { setErro(e.message); } finally { setBusy(false); } };
  return <div className={card}>
    <div className="flex flex-wrap justify-between items-center gap-2">
      <h2 className="font-bold text-lg">Caixa de envio (Microsoft 365)</h2>
      <span className={`text-sm font-bold ${st?.conectado ? 'text-emerald-700' : 'text-amber-700'}`}>{st?.conectado ? `● Conectada: ${st.conta_email}` : '○ Não conectada'}</span>
    </div>
    <p className="text-sm text-slate-500">Todos os e-mails do CRM saem por esta caixa do grupo, pelo Microsoft 365 (como no ContaOne). As respostas dos clientes chegam nela ou no endereço de resposta de cada empresa.</p>
    {st?.conectado && <p className="text-sm">Remetente padrão: <strong>{st.envia_como || st.conta_email}</strong>. Cada empresa pode usar outro endereço, desde que a caixa conectada tenha a permissão “Enviar como” nele.</p>}
    {erro && <p role="alert" className="text-red-700 text-sm">{erro}</p>}{ok && <p role="status" className="text-emerald-700 text-sm">{ok}</p>}
    {canPlatform ? <>
      <details open={!st?.appConfigurado}><summary className="cursor-pointer font-bold">App do Azure (Entra ID)</summary>
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <label className="block">Tenant ID<input className={field} disabled={busy} value={f.tenant_id} onChange={e => setF({ ...f, tenant_id: e.target.value })} /></label>
          <label className="block">Client ID (Application ID)<input className={field} disabled={busy} value={f.client_id} onChange={e => setF({ ...f, client_id: e.target.value })} /></label>
          <label className="block">Client secret<input type="password" autoComplete="off" className={field} disabled={busy} value={f.client_secret} onChange={e => setF({ ...f, client_secret: e.target.value })} placeholder={st?.appConfigurado ? '•••••• (guardado; preencha só para trocar)' : ''} /></label>
          <label className="block">Enviar como (padrão)<input type="email" className={field} disabled={busy} value={f.envia_como} onChange={e => setF({ ...f, envia_como: e.target.value })} placeholder="envio@grupociatos.com.br" /></label>
        </div>
        <p className="text-sm text-slate-500 mt-2">No Azure, adicione em <em>Authentication → Redirect URIs (Web)</em>: <code className="break-all">{REDIRECT_MS}</code> e as permissões delegadas <em>Mail.Send</em>, <em>User.Read</em> e <em>offline_access</em>.</p>
        <button className="ux-secondary mt-3" disabled={busy} onClick={() => acao(async () => { const s = await chamarMs365({ action: 'save_app', ...f }); setSt(s); onStatus(s); setF(x => ({ ...x, client_secret: '' })); setOk('App salvo.'); })}>Salvar app</button>
      </details>
      <div className="flex flex-wrap gap-2">
        <button className="btn-navy" disabled={busy || !st?.appConfigurado} onClick={() => acao(async () => { const r = await chamarMs365({ action: 'connect', origin: window.location.origin }); window.location.href = r.url; })}>{st?.conectado ? 'Reconectar caixa' : 'Conectar caixa'}</button>
        {st?.conectado && <button className="ux-secondary" disabled={busy} onClick={() => acao(async () => { if (!window.confirm('Desconectar a caixa? Nenhum e-mail do CRM sairá até reconectar.')) return; await chamarMs365({ action: 'disconnect' }); await carregar(); })}>Desconectar</button>}
      </div>
    </> : !st?.conectado && <p className="text-sm text-slate-500">O dono da plataforma precisa conectar a caixa do grupo.</p>}
  </div>;
}

/** Configuração de remetente e limite diário da empresa (vale para comunicados e cadências). */
function SendSettings({ org, companyName, policy, canConfigure, onSaved, remetentePadrao }: { org: string; companyName: string; policy?: Row; canConfigure: boolean; onSaved: () => void; remetentePadrao?: string }) {
  const [f, setF] = useState({ live: false, sender: '', name: '', reply: '', limit: 100 });
  const [busy, setBusy] = useState(false); const [erro, setErro] = useState(''); const [ok, setOk] = useState('');
  useEffect(() => {
    setF({ live: !!policy?.live_enabled, sender: policy?.sender || remetentePadrao || '', name: policy?.sender_name || companyName, reply: policy?.reply_to || '', limit: policy?.daily_limit || 100 });
  }, [policy, companyName, remetentePadrao]);
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault(); setErro(''); setOk('');
    if (f.live && !policy?.live_enabled && !window.confirm(`Ligar o envio real de e-mails de ${companyName}?\n\nComunicados e cadências passarão a sair de verdade, até ${f.limit} por dia.`)) return;
    setBusy(true);
    const { error } = await supabase.rpc('save_outreach_policy', { org, live: f.live, sender_email: f.sender, from_name: f.name, reply_address: f.reply, per_day: f.limit });
    setBusy(false);
    if (error) return setErro(msgErro(error));
    setOk('Configuração salva.'); onSaved();
  };
  return <form className={card} onSubmit={salvar}>
    <div className="flex flex-wrap justify-between items-center gap-2">
      <h2 className="font-bold text-lg">Configuração de envio</h2>
      <span className={`text-sm font-bold ${policy?.live_enabled ? 'text-emerald-700' : 'text-slate-500'}`}>{policy?.live_enabled ? '● Envio ligado' : '○ Envio desligado'}</span>
    </div>
    {!canConfigure && <p className="text-sm text-slate-500">Somente o master da empresa ou o dono da plataforma altera esta configuração.</p>}
    {erro && <p role="alert" className="text-red-700 text-sm">{erro}</p>}{ok && <p role="status" className="text-emerald-700 text-sm">{ok}</p>}
    <div className="grid md:grid-cols-2 gap-3">
      <label className="block">E-mail remetente<input type="email" className={field} disabled={!canConfigure || busy} value={f.sender} onChange={e => setF({ ...f, sender: e.target.value })} placeholder="envio@grupociatos.com.br" /></label>
      <label className="block">Nome que aparece para o cliente<input className={field} maxLength={80} disabled={!canConfigure || busy} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label className="block">Respostas vão para<input type="email" className={field} disabled={!canConfigure || busy} value={f.reply} onChange={e => setF({ ...f, reply: e.target.value })} placeholder="atendimento@suaempresa.com.br" /></label>
      <label className="block">Limite de e-mails por dia<input type="number" min={1} max={1000} className={field} disabled={!canConfigure || busy} value={f.limit} onChange={e => setF({ ...f, limit: Number(e.target.value) })} /></label>
    </div>
    <p className="text-sm text-slate-500">O remetente precisa ser a caixa do Microsoft 365 conectada ou um endereço em que ela tenha permissão “Enviar como” (ex.: <strong>envio@grupociatos.com.br</strong>). Use “Respostas vão para” com a caixa real da equipe desta empresa. O Microsoft 365 aceita até 10 mil e-mails por dia por caixa.</p>
    <label className="flex items-center gap-2"><input type="checkbox" disabled={!canConfigure || busy} checked={f.live} onChange={e => setF({ ...f, live: e.target.checked })} /> Envio real ligado nesta empresa</label>
    {canConfigure && <button className="btn-navy" disabled={busy}>{busy ? 'Salvando…' : 'Salvar configuração'}</button>}
  </form>;
}

export default function Broadcasts({ organizationId: org, companyName, canConfigure, canPlatform, onGoImport }: { organizationId: string; companyName: string; canConfigure: boolean; canPlatform: boolean; onGoImport: () => void }) {
  const [ms, setMs] = useState<Row | null>(null);
  const [lista, setLista] = useState<Row[]>([]);
  const [stats, setStats] = useState<Record<string, Row>>({});
  const [policy, setPolicy] = useState<Row | undefined>();
  const [tagsDisponiveis, setTagsDisponiveis] = useState<string[]>([]);
  const [admin, setAdmin] = useState(false);
  const [form, setForm] = useState({ ...vazio });
  const [editando, setEditando] = useState(false);
  const [publico, setPublico] = useState<{ total: number; exemplos: string[] } | null>(null);
  const [agendar, setAgendar] = useState('');
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState(''); const [aviso, setAviso] = useState('');

  const carregar = useCallback(async () => {
    const [b, s, p, t, a] = await Promise.all([
      supabase.from('broadcasts').select('*').eq('organization_id', org).order('created_at', { ascending: false }).limit(100),
      supabase.rpc('broadcast_stats', { org }),
      supabase.from('outreach_policy').select('*').eq('organization_id', org).maybeSingle(),
      supabase.from('leads').select('tags').eq('organization_id', org).not('tags', 'eq', '{}').limit(5000),
      supabase.rpc('pode_administrar', { org }),
    ]);
    if (b.error) { setErro('Não foi possível carregar os comunicados.'); return; }
    setLista(b.data || []);
    setStats(Object.fromEntries((s.data || []).map((x: Row) => [x.broadcast_id, x])));
    setPolicy(p.data || undefined);
    setTagsDisponiveis([...new Set((t.data || []).flatMap((r: Row) => r.tags || []))].sort() as string[]);
    setAdmin(a.data === true);
  }, [org]);
  useEffect(() => { void carregar(); }, [carregar]);
  // Atualiza o andamento enquanto houver envio em curso.
  useEffect(() => {
    if (!lista.some(b => ['SENDING', 'SCHEDULED'].includes(b.status))) return;
    const t = setInterval(() => void carregar(), 20000); return () => clearInterval(t);
  }, [lista, carregar]);

  const audiencia = useMemo(() => ({ relacao: form.relacao, tags: form.tags, uf: form.uf.trim(), segmento: form.segmento.trim() }), [form.relacao, form.tags, form.uf, form.segmento]);
  useEffect(() => {
    if (!editando) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('broadcast_audience_count', { org, aud: audiencia });
      setPublico(data || null);
    }, 400);
    return () => clearTimeout(t);
  }, [audiencia, editando, org]);

  const salvar = async (): Promise<string | null> => {
    setErro('');
    const { data, error } = await supabase.rpc('save_broadcast', { org, bid: form.id, title: form.titulo, subject: form.assunto, body: form.corpo, aud: audiencia });
    if (error) { setErro(msgErro(error)); return null; }
    setForm(f => ({ ...f, id: data })); return data;
  };

  const acao = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setErro(''); setAviso(''); try { await fn(); } catch (e) { setErro(msgErro(e)); } finally { setBusy(false); } };

  const teste = () => acao(async () => {
    const { data, error } = await supabase.functions.invoke('crm-mail', { body: { action: 'test', kind: 'broadcast', organization_id: org, assunto: form.assunto, corpo: form.corpo } });
    let msg = data?.error; if (error) { try { msg = (await (error as any).context.json()).error; } catch { msg = error.message; } }
    if (msg) throw new Error(msg);
    setAviso(`Teste enviado para ${data.para}. Confira a caixa de entrada (e o spam).`);
  });

  const disparar = () => acao(async () => {
    if (!publico?.total) throw new Error('Nenhum contato elegível para este público.');
    const quando = agendar ? new Date(agendar) : null;
    const texto = quando ? `Agendar o envio para ${publico.total} contato(s) em ${quando.toLocaleString('pt-BR')}?` : `Enviar agora para ${publico.total} contato(s)?`;
    if (!window.confirm(`${texto}\n\nAssunto: ${form.assunto}\n\nDepois de disparado, não é possível editar.`)) return;
    const id = await salvar(); if (!id) return;
    const { data, error } = await supabase.rpc('launch_broadcast', { bid: id, quando: quando ? quando.toISOString() : null });
    if (error) throw new Error(msgErro(error));
    setAviso(`${quando ? 'Agendado' : 'Envio iniciado'} para ${data.total} contato(s). O envio acontece em lotes, a cada minuto, respeitando o limite diário.`);
    setEditando(false); setForm({ ...vazio }); setAgendar(''); await carregar();
  });

  const abrir = (b?: Row) => {
    setErro(''); setAviso(''); setAgendar('');
    setForm(b ? { id: b.id, titulo: b.titulo, assunto: b.assunto, corpo: b.corpo, relacao: b.audiencia?.relacao || 'cliente', tags: b.audiencia?.tags || [], uf: b.audiencia?.uf || '', segmento: b.audiencia?.segmento || '' } : { ...vazio });
    setEditando(true);
  };

  const live = !!policy?.live_enabled && !!policy?.sender && !!ms?.conectado;

  return <section className="space-y-6 text-slate-800">
    <div className="flex flex-wrap justify-between items-end gap-4">
      <div><p className="text-sm text-slate-500">{companyName}</p><h1 className="text-3xl font-bold">Comunicados</h1>
        <p className="text-slate-500 mt-1">Avisos, notícias e novidades por e-mail para a sua carteira, com descadastro automático.</p></div>
      {admin && !editando && <button className="btn-navy" onClick={() => abrir()}>+ Novo comunicado</button>}
    </div>
    {erro && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-lg">{erro}</p>}
    {aviso && <p role="status" className="p-3 bg-green-50 text-green-800 rounded-lg">{aviso}</p>}
    {!live && <div className="safe-banner"><strong>Envio desligado nesta empresa</strong><p className="text-sm mt-1">{!ms?.conectado ? 'A caixa do Microsoft 365 ainda não está conectada (veja abaixo). ' : ''}Você pode escrever e salvar rascunhos{ms?.conectado ? ' e mandar testes para você' : ''}. Para disparar, ligue o envio na configuração abaixo.</p></div>}

    {editando && <div className={card}>
      <h2 className="font-bold text-lg">{form.id ? 'Editar comunicado' : 'Novo comunicado'}</h2>
      <label className="block">Nome interno<input className={field} maxLength={120} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Ex.: Aviso de prazo do IR 2027" /></label>
      <label className="block">Assunto do e-mail<input className={field} maxLength={200} value={form.assunto} onChange={e => setForm({ ...form, assunto: e.target.value })} placeholder="Ex.: {{company}}, atenção ao prazo do Imposto de Renda" /></label>
      <label className="block">Mensagem<textarea className={field} rows={12} maxLength={20000} value={form.corpo} onChange={e => setForm({ ...form, corpo: e.target.value })}
        placeholder={'Olá {{name}},\n\nEscreva aqui o aviso ou a notícia. Deixe uma linha em branco entre os parágrafos.\n\nLinks como https://grupociatos.com.br viram clicáveis.\n\nAbraço,\nEquipe'} /></label>
      <p className="text-sm text-slate-500">Use <code>{'{{name}}'}</code> para o primeiro nome do contato e <code>{'{{company}}'}</code> para a empresa. O rodapé com o link de descadastro é incluído automaticamente.</p>

      <fieldset className="border rounded-xl p-4 space-y-3"><legend className="px-2 font-bold">Para quem</legend>
        <div className="grid md:grid-cols-3 gap-3">
          <label className="block">Contatos<select className={field} value={form.relacao} onChange={e => setForm({ ...form, relacao: e.target.value })}>
            <option value="cliente">Clientes da carteira</option><option value="prospect">Prospects com e-mail verificado</option><option value="todos">Todos</option></select></label>
          <label className="block">UF (opcional)<input className={field} maxLength={2} value={form.uf} onChange={e => setForm({ ...form, uf: e.target.value.toUpperCase() })} placeholder="MG" /></label>
          <label className="block">Segmento contém (opcional)<input className={field} value={form.segmento} onChange={e => setForm({ ...form, segmento: e.target.value })} placeholder="Construção" /></label>
        </div>
        {tagsDisponiveis.length > 0 && <div><p className="text-sm mb-2">Somente com as etiquetas (qualquer uma):</p><div className="flex flex-wrap gap-2">{tagsDisponiveis.map(t =>
          <button type="button" key={t} aria-pressed={form.tags.includes(t)} onClick={() => setForm({ ...form, tags: form.tags.includes(t) ? form.tags.filter(x => x !== t) : [...form.tags, t] })}
            className={`px-3 py-1 rounded-full border text-sm ${form.tags.includes(t) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white'}`}>{t}</button>)}</div></div>}
        <p role="status" className="font-bold">{publico ? `${publico.total} contato(s) vão receber` : 'Calculando público…'}{publico?.exemplos?.length ? <span className="font-normal text-slate-500"> · ex.: {publico.exemplos.join(', ')}</span> : null}</p>
        {publico && publico.total === 0 && <p className="text-sm text-slate-500">Ninguém neste filtro. Contatos precisam ter e-mail e não ter pedido descadastro. <button type="button" className="underline" onClick={onGoImport}>Importar contatos</button></p>}
      </fieldset>

      <div className="flex flex-wrap gap-2 items-end">
        <button className="ux-secondary" disabled={busy} onClick={() => acao(async () => { if (await salvar()) { setAviso('Rascunho salvo.'); await carregar(); } })}>Salvar rascunho</button>
        <button className="ux-secondary" disabled={busy || !form.assunto || !form.corpo} onClick={teste}>Enviar teste para mim</button>
        <label className="text-sm">Agendar (opcional)<input type="datetime-local" className={field} value={agendar} onChange={e => setAgendar(e.target.value)} /></label>
        <button className="btn-navy" disabled={busy || !live || !publico?.total || !form.titulo || !form.assunto || !form.corpo} onClick={disparar}>{agendar ? 'Agendar envio' : 'Enviar agora'}</button>
        <button className="ux-secondary" disabled={busy} onClick={() => { setEditando(false); setForm({ ...vazio }); }}>Fechar</button>
      </div>
    </div>}

    <div className={card}>
      <h2 className="font-bold text-lg">Histórico</h2>
      {!lista.length && <p className="text-slate-500">Nenhum comunicado ainda.</p>}
      {lista.map(b => { const s = stats[b.id] || {}; return <div key={b.id} className="border-b pb-3 flex flex-wrap justify-between gap-3">
        <div><strong>{b.titulo}</strong><p className="text-sm text-slate-500">{b.assunto}</p>
          <p className="text-sm">{STATUS[b.status]}{b.scheduled_at && b.status === 'SCHEDULED' ? ` para ${new Date(b.scheduled_at).toLocaleString('pt-BR')}` : ''}
            {b.status !== 'DRAFT' && ` · ${s.enviados ?? 0}/${b.total} enviados`}
            {Number(s.descadastros) > 0 && ` · ${s.descadastros} descadastros`}{Number(s.falhas) > 0 && ` · ${s.falhas} falhas`}</p></div>
        {admin && <div className="flex gap-2 items-start">
          {b.status === 'DRAFT' && <><button className="ux-secondary" onClick={() => abrir(b)}>Abrir</button>
            <button className="ux-secondary" disabled={busy} onClick={() => acao(async () => { if (!window.confirm('Excluir este rascunho?')) return; const { error } = await supabase.rpc('delete_broadcast', { bid: b.id }); if (error) throw error; await carregar(); })}>Excluir</button></>}
          {['SCHEDULED', 'SENDING'].includes(b.status) && <button className="ux-secondary" disabled={busy} onClick={() => acao(async () => { if (!window.confirm('Cancelar o envio? Quem já recebeu não é afetado.')) return; const { error } = await supabase.rpc('cancel_broadcast', { bid: b.id }); if (error) throw error; await carregar(); })}>Cancelar envio</button>}
        </div>}
      </div>; })}
      <p className="text-sm text-slate-500">Os e-mails saem pela caixa do Microsoft 365: devoluções e respostas chegam nela. Quem clica em “não quero mais receber” sai da lista automaticamente.</p>
    </div>

    <Ms365Panel canPlatform={canPlatform} onStatus={setMs} />
    <SendSettings org={org} companyName={companyName} policy={policy} canConfigure={canConfigure} remetentePadrao={ms?.envia_como || ms?.conta_email} onSaved={() => void carregar()} />
  </section>;
}
