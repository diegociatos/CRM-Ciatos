import React, { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Campos que o banco entende (crm.import_leads) e os nomes de coluna que
// costumam aparecer nas planilhas.
const CAMPOS: { id: string; label: string; sinonimos: string[] }[] = [
  { id: 'razao_social', label: 'Razão social', sinonimos: ['razaosocial', 'razao', 'nomeempresarial', 'nomerazaosocial'] },
  { id: 'nome_fantasia', label: 'Nome fantasia / empresa', sinonimos: ['nomefantasia', 'fantasia', 'empresa', 'nomeempresa', 'cliente', 'nomecliente'] },
  { id: 'cnpj', label: 'CNPJ', sinonimos: ['cnpj', 'cpfcnpj', 'cnpjcpf', 'documento'] },
  { id: 'contato', label: 'Nome do contato', sinonimos: ['contato', 'nome', 'nomecontato', 'responsavel', 'socio', 'decisor'] },
  { id: 'cargo', label: 'Cargo', sinonimos: ['cargo', 'funcao'] },
  { id: 'email', label: 'E-mail', sinonimos: ['email', 'emailcontato', 'mail', 'correioeletronico'] },
  { id: 'telefone', label: 'Telefone / WhatsApp', sinonimos: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'telefonecontato'] },
  { id: 'site', label: 'Site da empresa', sinonimos: ['site', 'website', 'dominio', 'url', 'sitedaempresa', 'siteempresa', 'paginaweb', 'homepage'] },
  { id: 'cidade', label: 'Cidade', sinonimos: ['cidade', 'municipio'] },
  { id: 'uf', label: 'UF', sinonimos: ['uf', 'estado'] },
  { id: 'segmento', label: 'Segmento', sinonimos: ['segmento', 'atividade', 'ramo', 'setor', 'ramodeatividade'] },
  { id: 'observacoes', label: 'Observações', sinonimos: ['observacoes', 'observacao', 'obs', 'notas', 'anotacoes'] },
  { id: 'tags', label: 'Etiquetas (separadas por ;)', sinonimos: ['tags', 'etiquetas', 'etiqueta', 'grupo', 'grupos'] },
];

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SITE_RE = /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,63}(\/|\?|#|$)/i;
const LOTE = 500;

/** CSV simples com aspas, separador ; ou , (o Excel em português usa ;). */
function lerCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '');
  const primeira = limpo.split(/\r?\n/, 1)[0] || '';
  const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
  const linhas: string[][] = []; let campo = ''; let linha: string[] = []; let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && limpo[i + 1] === '\n') i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter(l => l.some(v => v.trim() !== ''));
}

async function lerArquivo(arquivo: File): Promise<string[][]> {
  if (/\.csv$|\.txt$/i.test(arquivo.name)) {
    const buf = await arquivo.arrayBuffer();
    let texto = new TextDecoder('utf-8', { fatal: false }).decode(buf);
    // CSV salvo pelo Excel em Windows costuma vir em Latin-1.
    if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
    return lerCsv(texto);
  }
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
  const aba = wb.Sheets[wb.SheetNames[0]];
  return (XLSX.utils.sheet_to_json(aba, { header: 1, raw: false, defval: '' }) as any[][])
    .map(l => l.map(v => String(v ?? ''))).filter(l => l.some(v => v.trim() !== ''));
}

function modeloCsv() {
  const cab = CAMPOS.map(c => c.label.replace(/ \(.*\)/, '')).join(';');
  const ex = 'Alfa Comércio Ltda;Alfa;11.222.333/0001-81;Ana Souza;Sócia;ana@alfa.com.br;(31) 99999-0000;alfa.com.br;Belo Horizonte;MG;Comércio;Cliente desde 2020;Simples Nacional; Newsletter';
  const url = URL.createObjectURL(new Blob(['﻿' + cab + '\r\n' + ex + '\r\n'], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'modelo-importacao-crm.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface Resultado { inseridos: number; atualizados: number; ignorados: number; erros: { linha: number; motivo: string }[] }

export default function ImportContacts({ organizationId, companyName, onImported, onGoAgent, onGoRadar }: { organizationId: string; companyName: string; onImported: () => void; onGoAgent?: () => void; onGoRadar?: () => void }) {
  const [tipo, setTipo] = useState<'cliente' | 'prospect' | 'lista'>('cliente');
  const [nomeLista, setNomeLista] = useState('');
  const [etiquetas, setEtiquetas] = useState('');
  const [fonte, setFonte] = useState('Planilha de clientes');
  const [arquivo, setArquivo] = useState('');
  const [cabecalho, setCabecalho] = useState<string[]>([]);
  const [dados, setDados] = useState<string[][]>([]);
  const [mapa, setMapa] = useState<Record<string, number>>({});
  const [lendo, setLendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const escolher = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    setErro(''); setResultado(null); setLendo(true);
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error('Arquivo acima de 10 MB. Divida a planilha.');
      const linhas = await lerArquivo(f);
      if (linhas.length < 2) throw new Error('A planilha precisa de uma linha de cabeçalho e ao menos um contato.');
      const cab = linhas[0].map(v => v.trim());
      const auto: Record<string, number> = {};
      const usados = new Set<number>();
      for (const campo of CAMPOS) {
        const idx = cab.findIndex((h, i) => !usados.has(i) && campo.sinonimos.includes(normalizar(h)));
        if (idx >= 0) { auto[campo.id] = idx; usados.add(idx); }
      }
      setArquivo(f.name); setCabecalho(cab); setDados(linhas.slice(1)); setMapa(auto);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível ler o arquivo. Use CSV ou Excel (.xlsx).');
      setArquivo(''); setCabecalho([]); setDados([]);
    } finally { setLendo(false); }
  };

  const linhas = useMemo(() => dados.map(l => {
    const o: Record<string, string> = {};
    for (const [campo, idx] of Object.entries(mapa)) if (idx >= 0) o[campo] = (l[idx] || '').trim();
    return o;
  }), [dados, mapa]);

  const resumo = useMemo(() => {
    const comEmail = linhas.filter(l => EMAIL_RE.test(l.email || '')).length;
    const semIdentificacao = linhas.filter(l => !l.razao_social && !l.nome_fantasia && !l.contato && !l.email).length;
    const soSite = linhas.filter(l => !EMAIL_RE.test(l.email || '') && SITE_RE.test(l.site || '')).length;
    const semCaminho = linhas.filter(l => !EMAIL_RE.test(l.email || '') && !SITE_RE.test(l.site || '') && (l.razao_social || l.nome_fantasia || l.contato)).length;
    return { total: linhas.length, comEmail, soSite, semCaminho, emailInvalido: linhas.filter(l => l.email && !EMAIL_RE.test(l.email)).length, semIdentificacao };
  }, [linhas]);

  const importar = async () => {
    if (!linhas.length || importando) return;
    const emLista = tipo === 'lista';
    if (emLista && nomeLista.trim().length < 3) { setErro('Dê um nome à lista de prospecção (ao menos 3 letras).'); return; }
    const destino = tipo === 'cliente' ? 'clientes da carteira' : 'prospects';
    if (!window.confirm(emLista
      ? `Criar a lista "${nomeLista.trim()}" com ${linhas.length} linha(s) em ${companyName}?\n\nNada é enviado agora. O agente só trabalha a lista depois que você ligá-lo na Central da IA.`
      : `Importar ${linhas.length} linha(s) como ${destino} em ${companyName}?\n\nQuem já existir (mesmo CNPJ ou e-mail) só terá os campos vazios completados.`)) return;
    setImportando(true); setErro(''); setResultado(null); setProgresso(0);
    const tags = etiquetas.split(/[;,]/).map(t => t.trim()).filter(Boolean);
    const total: Resultado = { inseridos: 0, atualizados: 0, ignorados: 0, erros: [] };
    try {
      let job: string | null = null;
      for (let i = 0; i < linhas.length; i += LOTE) {
        const { data, error } = emLista
          ? await supabase.rpc('import_radar_sheet', { org: organizationId, job, lista: nomeLista.trim(), linhas: linhas.slice(i, i + LOTE), arquivo })
          : await supabase.rpc('import_leads', {
            org: organizationId, tipo, linhas: linhas.slice(i, i + LOTE), etiquetas: tags, fonte: fonte || 'Importação de planilha',
          });
        if (error) throw new Error(error.message);
        if (emLista) job = data.job_id;
        total.inseridos += data.inseridos; total.atualizados += data.atualizados || 0; total.ignorados += data.ignorados;
        // +2: linha 1 é o cabeçalho e a numeração do banco começa em 1 dentro do lote.
        total.erros.push(...(data.erros || []).map((e: any) => ({ linha: e.linha + i + 1, motivo: e.motivo })));
        setProgresso(Math.min(linhas.length, i + LOTE));
      }
      setResultado(total);
      onImported();
    } catch (err: any) {
      setErro(`Importação interrompida: ${err?.message || 'erro desconhecido'}. O que já foi importado permanece salvo; reimportar não duplica.`);
      if (total.inseridos || total.atualizados) setResultado(total);
      onImported();
    } finally { setImportando(false); }
  };

  const card = 'bg-white border rounded-xl p-5 space-y-4';
  const field = 'w-full rounded-lg border border-slate-300 px-3 py-2 bg-white';

  return <section className="space-y-6 text-slate-800">
    <div>
      <p className="text-sm text-slate-500">{companyName}</p>
      <h1 className="text-3xl font-bold">Importar contatos</h1>
      <p className="text-slate-500 mt-1">Traga sua carteira de clientes ou uma lista de prospects a partir de uma planilha (Excel ou CSV).</p>
    </div>
    {erro && <p role="alert" className="p-4 bg-red-50 text-red-800 rounded-lg">{erro}</p>}

    <div className={card}>
      <h2 className="font-bold text-lg">1. O que você está importando?</h2>
      <div className="grid md:grid-cols-3 gap-3">
        {([['cliente', 'Clientes da carteira', 'Já são clientes. Entram como contrato fechado e podem receber comunicados e cadências de relacionamento.'],
           ['prospect', 'Prospects', 'Empresas para prospectar. Entram na Fila de Qualificação; e-mail frio só sai depois de verificado.'],
           ['lista', 'Lista para o Snov.io e cadência', 'Leads que você gerou. Viram uma lista do Radar: o agente completa e verifica o e-mail no Snov.io e inscreve na cadência de prospecção.']] as const).map(([id, titulo, texto]) =>
          <label key={id} className={`border rounded-xl p-4 cursor-pointer ${tipo === id ? 'border-amber-500 ring-2 ring-amber-200' : 'border-slate-200'}`}>
            <input type="radio" name="tipo" className="mr-2" checked={tipo === id} onChange={() => setTipo(id)} disabled={importando} />
            <strong>{titulo}</strong><p className="text-sm text-slate-500 mt-1">{texto}</p>
          </label>)}
      </div>
      {tipo === 'lista' ? <>
        <label className="block">Nome da lista<input className={field} value={nomeLista} disabled={importando} maxLength={120} onChange={e => setNomeLista(e.target.value)} placeholder="Ex.: Feira de Logística · outubro/2026" /></label>
        <p className="text-sm text-slate-500">Para o Snov.io trabalhar, cada linha precisa de <strong>e-mail</strong> (ele verifica se é válido) ou do <strong>site da empresa</strong> (ele procura o e-mail do decisor). O nome do contato ajuda a achar a pessoa certa. O nome do arquivo fica registrado como origem (exigência da LGPD).</p>
      </> : <><div className="grid md:grid-cols-2 gap-3">
        <label className="block">Etiquetas para todos (opcional)<input className={field} value={etiquetas} disabled={importando} onChange={e => setEtiquetas(e.target.value)} placeholder="Ex.: Carteira 2026; Newsletter" /></label>
        <label className="block">Origem dos dados<input className={field} value={fonte} disabled={importando} maxLength={200} onChange={e => setFonte(e.target.value)} placeholder="Ex.: Planilha do financeiro" /></label>
      </div>
      <p className="text-sm text-slate-500">A origem fica registrada em cada contato (exigência da LGPD).</p></>}
    </div>

    <div className={card}>
      <div className="flex flex-wrap justify-between gap-3 items-center">
        <h2 className="font-bold text-lg">2. Escolha a planilha</h2>
        <button type="button" className="ux-secondary" onClick={modeloCsv}>Baixar planilha modelo</button>
      </div>
      <div className="import-file-zone"><p>Escolha um arquivo Excel ou CSV</p><span>Até aqui os dados não foram importados. Você poderá conferir as colunas antes de salvar.</span><input className="import-file-input" type="file" accept=".csv,.txt,.xlsx,.xls" onChange={escolher} disabled={lendo || importando} aria-label="Arquivo da planilha" /></div>
      {lendo && <p role="status">Lendo planilha…</p>}
      {arquivo && <p className="text-sm">Arquivo: <strong>{arquivo}</strong> · {resumo.total} linha(s)</p>}
    </div>

    {cabecalho.length > 0 && <div className={card}>
      <h2 className="font-bold text-lg">3. Confira as colunas</h2>
      <p className="text-sm text-slate-500">Reconhecemos as colunas pelo nome. Ajuste se algo estiver trocado.</p>
      <div className="grid md:grid-cols-3 gap-3">
        {CAMPOS.map(c => <label key={c.id} className="block text-sm">{c.label}
          <select className={field} value={mapa[c.id] ?? -1} disabled={importando} onChange={e => setMapa({ ...mapa, [c.id]: Number(e.target.value) })}>
            <option value={-1}>— não importar —</option>
            {cabecalho.map((h, i) => <option key={i} value={i}>{h || `Coluna ${i + 1}`}</option>)}
          </select>
        </label>)}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <span>✓ {resumo.comEmail} com e-mail válido</span>
        {tipo === 'lista' && <span>✓ {resumo.soSite} só com site (o Snov.io procura o e-mail)</span>}
        {tipo === 'lista' && resumo.semCaminho > 0 && <span className="text-amber-700">⚠ {resumo.semCaminho} sem e-mail e sem site (ficam para revisão manual)</span>}
        {resumo.emailInvalido > 0 && <span className="text-amber-700">⚠ {resumo.emailInvalido} com e-mail inválido (entram sem e-mail)</span>}
        {resumo.semIdentificacao > 0 && <span className="text-amber-700">⚠ {resumo.semIdentificacao} sem empresa, contato ou e-mail (serão ignoradas)</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr>{['Empresa', 'CNPJ', 'Contato', 'E-mail', 'Site', 'Telefone', 'Cidade/UF'].map(h => <th key={h} className="text-left p-2 border-b">{h}</th>)}</tr></thead>
          <tbody>{linhas.slice(0, 8).map((l, i) => <tr key={i}>
            <td className="p-2 border-b">{l.nome_fantasia || l.razao_social}</td><td className="p-2 border-b">{l.cnpj}</td>
            <td className="p-2 border-b">{l.contato}</td><td className={`p-2 border-b ${l.email && !EMAIL_RE.test(l.email) ? 'text-red-700' : ''}`}>{l.email}</td>
            <td className="p-2 border-b">{l.site}</td><td className="p-2 border-b">{l.telefone}</td><td className="p-2 border-b">{[l.cidade, l.uf].filter(Boolean).join('/')}</td>
          </tr>)}</tbody>
        </table>
        {linhas.length > 8 && <p className="text-sm text-slate-500 mt-2">Mostrando 8 de {linhas.length} linhas.</p>}
      </div>
      <button className="btn-navy" disabled={importando || !linhas.length} onClick={() => void importar()}>
        {importando ? `Importando… ${progresso}/${linhas.length}` : tipo === 'lista' ? `Criar lista com ${linhas.length} lead(s)` : `Importar ${linhas.length} contato(s)`}
      </button>
    </div>}

    {resultado && <div className={card} role="status">
      <h2 className="font-bold text-lg">{tipo === 'lista' ? 'Lista criada' : 'Importação concluída'}</h2>
      <p>{tipo === 'lista' ? `${resultado.inseridos} lead(s) na lista "${nomeLista.trim()}" · ${resultado.ignorados} ignorado(s)` : `${resultado.inseridos} novo(s) · ${resultado.atualizados} já existente(s) completado(s) · ${resultado.ignorados} ignorado(s)`}</p>
      {resultado.erros.length > 0 && <details><summary className="cursor-pointer">Ver avisos por linha ({resultado.erros.length})</summary>
        <ul className="text-sm mt-2 space-y-1">{resultado.erros.slice(0, 200).map((e, i) => <li key={i}>Linha {e.linha}: {e.motivo}</li>)}</ul></details>}
      {tipo === 'lista' ? <>
        <p className="text-sm text-slate-600">Nada foi enviado. Próximo passo: na Central da IA, aba do agente, escolha esta lista e uma cadência de prospecção ativa, e ligue o agente. Ele verifica e completa os e-mails no Snov.io e inscreve cada contato válido na cadência.</p>
        <div className="flex flex-wrap gap-3">
          {onGoAgent && <button type="button" className="btn-navy" onClick={onGoAgent}>Ligar o agente nesta lista</button>}
          {onGoRadar && <button type="button" className="ux-secondary" onClick={onGoRadar}>Ver a lista no Radar</button>}
        </div>
      </> : <p className="text-sm text-slate-500">{tipo === 'cliente' ? 'Os clientes aparecem em Clientes Ativos e já podem receber Comunicados.' : 'Os prospects estão na Fila de Qualificação.'}</p>}
    </div>}
  </section>;
}
