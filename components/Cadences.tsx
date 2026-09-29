import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { cadenceLibrary } from '../lib/cadenceLibrary';

type Row = Record<string, any>;
const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white';
const button = 'rounded-lg px-3 py-2 bg-slate-100 text-slate-800 hover:bg-slate-200 disabled:opacity-50';
const labels: Record<string, string> = { ACTIVE: 'Ativa', DRAFT: 'Rascunho', PAUSED: 'Pausada', ARCHIVED: 'Arquivada' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Only company-owned offerings appear in the selected workspace.
const serviceByOrg: Record<string, string[]> = {
  '00000000-0000-4000-8000-000000000001': cadenceLibrary.map(c => c.id),
  '8345da0f-171a-44c4-ab3b-b5b468487c09': ['tributario','credito'],
  '97dbf5e9-9ea2-4fb1-9de9-7561a1810567': ['racionaliza'],
  'd136ff75-88e2-49f0-a57c-34f8ffde2468': ['holding'],
  '86086314-ad9c-4064-832d-21a0ce9fc4a7': ['log'],
  '5080f093-3019-4015-b048-3d837aae21ee': ['contabilidade'],
  '791a8796-503a-4817-b516-f229f54b58af': ['crise','tributario','holding','credito'],
  'eb2c1641-b38c-4104-b097-f74398c50f54': ['juridico'],
  '0934f7bb-ceee-4fc1-95fa-92d1267a1d9c': ['bank'],
};

const passoVazio = () => ({ assunto: '', corpo: '', espera_dias: 3 });
const msgErro = (e: any) => String(e?.message || e || 'Erro inesperado');

export default function Cadences({ org, admin, policy, sequences, onChanged }: { org: string; admin: boolean; policy?: Row; sequences: Row[]; onChanged: () => Promise<void> | void }) {
  const [leads, setLeads] = useState<Row[]>([]);
  const [radarJobs, setRadarJobs] = useState<Row[]>([]);
  const [radarList, setRadarList] = useState('');
  const companyLibrary = cadenceLibrary.filter(c => (serviceByOrg[org] || []).includes(c.id));
  const [busy, setBusy] = useState(false); const [erro, setErro] = useState(''); const [aviso, setAviso] = useState('');
  const [nova, setNova] = useState({ titulo: '', publico: 'cliente', espera_final: 5, passos: [passoVazio()] });
  const [sid, setSid] = useState(''); const [real, setReal] = useState(false);
  const [filtroTag, setFiltroTag] = useState(''); const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());

  useEffect(() => {
    let ativo = true;
    setLeads([]); setRadarJobs([]); setRadarList('');
    supabase.from('mining_jobs').select('id,dados').eq('organization_id', org).order('created_at', { ascending: false }).limit(200).then(({ data }) => { if (ativo) setRadarJobs(data || []); });
    supabase.from('leads').select('id,empresa,nome,email,relacao,tags,opt_out,email_verified_at,contact_basis,dados')
      .eq('organization_id', org).order('empresa').limit(5000)
      .then(({ data }) => { if (ativo) setLeads(data || []); });
    return () => { ativo = false; };
  }, [org, sequences.length]);

  const cadencia = sequences.find(s => s.id === sid);
  const publico = cadencia?.settings?.publico || 'prospect';
  const live = !!policy?.live_enabled && !!policy?.sender;
  const tags = useMemo(() => [...new Set(leads.flatMap(l => l.tags || []))].sort(), [leads]);
  // Prospect só pode receber envio real com e-mail verificado há < 30 dias (regra do servidor).
  const podeReal = (l: Row) => l.relacao === 'cliente' || (l.email_verified_at && Date.now() - Date.parse(l.email_verified_at) < 30 * 864e5 && l.contact_basis);
  const elegiveis = useMemo(() => leads.filter(l => !l.opt_out && EMAIL_RE.test(l.email || '')
    && (publico === 'cliente' ? l.relacao === 'cliente' : l.relacao !== 'cliente')
    && (!filtroTag || (l.tags || []).includes(filtroTag))
    && (!radarList || l.dados?.radarJobId === radarList || (l.dados?.radarJobIds || []).includes(radarList))
    && (!busca || `${l.empresa} ${l.nome} ${l.email}`.toLowerCase().includes(busca.toLowerCase()))), [leads, publico, filtroTag, busca, radarList]);
  const semVerificacao = real ? elegiveis.filter(l => marcados.has(l.id) && !podeReal(l)).length : 0;

  const acao = async (fn: () => Promise<void>) => { if (busy) return; setBusy(true); setErro(''); setAviso(''); try { await fn(); } catch (e) { setErro(msgErro(e)); } finally { setBusy(false); } };

  const criar = (e: React.FormEvent) => { e.preventDefault(); void acao(async () => {
    const { error } = await supabase.rpc('create_cadence_v2', { org, title: nova.titulo, publico: nova.publico, passos: nova.passos, espera_final: nova.espera_final });
    if (error) throw error;
    setAviso('Cadência salva como rascunho. Ative-a para poder inscrever contatos.');
    setNova({ titulo: '', publico: 'cliente', espera_final: 5, passos: [passoVazio()] }); await onChanged();
  }); };

  const testar = (p: { assunto: string; corpo: string }) => acao(async () => {
    const { data, error } = await supabase.functions.invoke('crm-mail', { body: { action: 'test', kind: 'cadence', organization_id: org, assunto: p.assunto, corpo: p.corpo } });
    let msg = data?.error; if (error) { try { msg = (await (error as any).context.json()).error; } catch { msg = error.message; } }
    if (msg) throw new Error(msg);
    setAviso(`Teste enviado para ${data.para}.`);
  });

  const inscrever = (e: React.FormEvent) => { e.preventDefault(); void acao(async () => {
    const ids = [...marcados].filter(id => elegiveis.some(l => l.id === id));
    if (!ids.length) throw new Error('Selecione ao menos um contato.');
    if (real && !window.confirm(`Inscrever ${ids.length} contato(s) em "${cadencia?.nome}" com ENVIO REAL?\n\nOs e-mails saem em dias úteis, das 9h às 18h, respeitando o limite diário. A cadência para quando você registrar resposta ou reunião.`)) return;
    const { data, error } = radarList
      ? await supabase.rpc('enroll_radar_list', { sid, job: radarList, lids: ids, simulate: !real })
      : await supabase.rpc('enroll_leads', { sid, lids: ids, simulate: !real });
    if (error) throw error;
    setAviso(`${data.inscritos} contato(s) inscrito(s)${real ? '' : ' em simulação'}${data.ignorados ? ` · ${data.ignorados} ignorado(s) (já inscritos, sem e-mail ou descadastrados)` : ''}.`);
    setMarcados(new Set()); await onChanged();
  }); };

  const setPasso = (i: number, patch: Row) => setNova({ ...nova, passos: nova.passos.map((p, j) => j === i ? { ...p, ...patch } : p) });

  return <div className="space-y-6">
    {admin && companyLibrary.length > 0 && <section className="bg-[#15343e] text-white p-6 rounded-xl space-y-4"><h2 className="text-2xl">Modelos para esta empresa</h2><p>Escolha um modelo para revisar ou instale os modelos desta empresa como rascunhos. Nenhum contato é inscrito automaticamente.</p><div className="flex flex-wrap gap-2">{companyLibrary.map(c=><button key={c.id} className="rounded-lg border border-white/40 px-3 py-2 hover:bg-white/10" onClick={()=>{setNova({titulo:c.titulo,publico:c.publico,espera_final:c.espera_final,passos:c.passos.map(p=>({...p}))});setAviso(`Modelo ${c.name} carregado no formulário Nova cadência. Revise e salve.`);}}>{c.name}</button>)}</div><button className="bg-[#e2c18a] text-[#15343e] rounded-lg px-4 py-3 font-bold disabled:opacity-50" disabled={busy} onClick={()=>acao(async()=>{
      const {data,error}=await supabase.rpc('install_sdr_library',{org,library:companyLibrary});if(error)throw error;await onChanged();setAviso(`${data} cadência(s) instalada(s) como rascunho. As já instaladas foram preservadas.`);
    })}>Instalar {companyLibrary.length} modelo(s) · {companyLibrary.length * 4} e-mails</button></section>}
    {erro && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-lg">{erro}</p>}
    {aviso && <p role="status" className="p-3 bg-green-50 text-green-800 rounded-lg">{aviso}</p>}
    <div className="grid xl:grid-cols-2 gap-6">
      <div className="bg-white p-5 border rounded-xl space-y-4">
        <h2 className="font-bold text-lg">Cadências da empresa</h2>
        {!sequences.length && <p>Nenhuma cadência criada.</p>}
        {sequences.map(s => <div className="border-b pb-4" key={s.id}>
          <strong>{s.nome}</strong><span className="ml-3 text-sm">{labels[s.status]}</span>
          <span className="ml-3 text-sm text-slate-500">{s.settings?.publico === 'cliente' ? 'Carteira' : 'Prospecção'}</span>
          {admin && <div className="flex gap-2 mt-2">{['ACTIVE', 'PAUSED'].map(state => <button key={state} className={button} disabled={busy || s.status === state}
            onClick={() => acao(async () => { const { error } = await supabase.rpc('set_cadence_state', { sid: s.id, new_status: state }); if (error) throw error; await onChanged(); })}>{state === 'ACTIVE' ? 'Ativar' : 'Pausar'}</button>)}</div>}
        </div>)}
      </div>

      {admin && <form className="bg-white p-5 border rounded-xl space-y-4" onSubmit={inscrever}>
        <h2 className="font-bold text-lg">Inscrever contatos</h2>
        <select required aria-label="Cadência" className={field} value={sid} onChange={e => { setSid(e.target.value); setMarcados(new Set()); }}>
          <option value="">Selecione a cadência ativa</option>
          {sequences.filter(s => s.status === 'ACTIVE').map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
        </select>
        {sid && <>
          {radarJobs.length > 0 && <label className="block text-sm">Lista do Radar
            <select aria-label="Lista do Radar" className={field} value={radarList} onChange={e => { setRadarList(e.target.value); setMarcados(new Set()); }}>
              <option value="">Todas as listas e demais contatos</option>
              {radarJobs.map(j => <option key={j.id} value={j.id}>{j.dados?.name || j.dados?.filters?.segment || 'Busca sem nome'}</option>)}
            </select></label>}
          <div className="grid md:grid-cols-2 gap-3">
            <input className={field} placeholder="Buscar contato" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar contato" />
            <select className={field} value={filtroTag} onChange={e => setFiltroTag(e.target.value)} aria-label="Etiqueta"><option value="">Todas as etiquetas</option>{tags.map(t => <option key={t}>{t}</option>)}</select>
          </div>
          {radarList && <p className="text-sm text-slate-600">Somente contatos desta lista participam da seleção. Verifique os e-mails e a origem antes do envio real.</p>}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={elegiveis.length > 0 && elegiveis.every(l => marcados.has(l.id))}
            onChange={e => setMarcados(e.target.checked ? new Set(elegiveis.map(l => l.id)) : new Set())} /> Selecionar os {elegiveis.length} listados</label>
          <div className="max-h-64 overflow-y-auto border rounded-lg divide-y">{elegiveis.slice(0, 500).map(l => <label key={l.id} className="flex items-center gap-2 p-2 text-sm">
            <input type="checkbox" checked={marcados.has(l.id)} onChange={e => { const n = new Set(marcados); if (e.target.checked) n.add(l.id); else n.delete(l.id); setMarcados(n); }} />
            <span className="flex-1">{l.empresa || l.nome} <span className="text-slate-500">· {l.email}</span></span>
            {publico !== 'cliente' && !podeReal(l) && <span className="text-amber-700 text-xs">não verificado</span>}
          </label>)}{!elegiveis.length && <p className="p-3 text-sm text-slate-500">Nenhum contato {publico === 'cliente' ? 'da carteira' : 'de prospecção'} com e-mail neste filtro.</p>}</div>
          <fieldset className="space-y-1 text-sm"><legend className="font-bold">Modo</legend>
            <label className="flex items-center gap-2"><input type="radio" checked={!real} onChange={() => setReal(false)} /> Simulação (mostra o que seria enviado, nada sai)</label>
            <label className={`flex items-center gap-2 ${live ? '' : 'opacity-50'}`}><input type="radio" disabled={!live} checked={real} onChange={() => setReal(true)} /> Envio real {live ? '' : '(ligue o envio em Comunicados → Configuração de envio)'}</label>
          </fieldset>
          {semVerificacao > 0 && <p className="text-sm text-amber-700">{semVerificacao} prospect(s) sem e-mail verificado: o servidor vai parar a cadência deles e pedir revisão. Verifique pelo Snov.io antes.</p>}
          <button className="btn-navy" disabled={busy || !marcados.size}>{real ? `Inscrever ${marcados.size} com envio real` : `Simular com ${marcados.size}`}</button>
        </>}
      </form>}
    </div>

    {admin && <form className="bg-white p-5 border rounded-xl space-y-4" onSubmit={criar}>
      <h2 className="font-bold text-lg">Nova cadência</h2>
      <div className="grid md:grid-cols-3 gap-3">
        <label className="block">Nome<input required maxLength={100} className={field} value={nova.titulo} onChange={e => setNova({ ...nova, titulo: e.target.value })} placeholder="Ex.: Reativação de clientes" /></label>
        <label className="block">Público<select className={field} value={nova.publico} onChange={e => setNova({ ...nova, publico: e.target.value })}>
          <option value="cliente">Clientes da carteira</option><option value="prospect">Prospecção (e-mail frio)</option></select></label>
        <label className="block">Dias sem resposta até avisar a equipe<input type="number" min={1} max={30} className={field} value={nova.espera_final} onChange={e => setNova({ ...nova, espera_final: Number(e.target.value) })} /></label>
      </div>
      <p className="text-sm text-slate-500">{nova.publico === 'cliente'
        ? 'Para quem já é cliente: dispensa verificação de e-mail. Ideal para reativação, oferta de outro serviço e relacionamento.'
        : 'Para prospects: cada e-mail só sai se o endereço tiver sido verificado (Snov.io) nos últimos 30 dias e a origem do contato estiver registrada.'}
        {' '}Use <code>{'{{name}}'}</code> e <code>{'{{company}}'}</code>. A cadência para quando você registra resposta ou reunião.</p>
      {nova.passos.map((p, i) => <fieldset key={i} className="border rounded-xl p-4 space-y-3">
        <legend className="px-2 font-bold">E-mail {i + 1}</legend>
        {i > 0 && <label className="block text-sm">Enviar quantos dias depois do anterior<input type="number" min={1} max={30} className={field} value={p.espera_dias} onChange={e => setPasso(i, { espera_dias: Number(e.target.value) })} /></label>}
        <label className="block">Assunto<input required maxLength={200} className={field} value={p.assunto} onChange={e => setPasso(i, { assunto: e.target.value })} /></label>
        <label className="block">Mensagem<textarea required rows={6} maxLength={6000} className={field} value={p.corpo} onChange={e => setPasso(i, { corpo: e.target.value })} /></label>
        <div className="flex gap-2">
          <button type="button" className={button} disabled={busy || !p.assunto || !p.corpo} onClick={() => testar(p)}>Enviar teste para mim</button>
          {nova.passos.length > 1 && <button type="button" className={button} onClick={() => setNova({ ...nova, passos: nova.passos.filter((_, j) => j !== i) })}>Remover</button>}
        </div>
      </fieldset>)}
      <div className="flex gap-2">
        {nova.passos.length < 8 && <button type="button" className={button} onClick={() => setNova({ ...nova, passos: [...nova.passos, passoVazio()] })}>+ Adicionar e-mail</button>}
        <button disabled={busy} className="btn-navy">Salvar rascunho</button>
      </div>
    </form>}
  </div>;
}
