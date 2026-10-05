import { test } from 'node:test';
import assert from 'node:assert/strict';
import { receitaFromBrasilApi, applyReceita, lookupReceita, processSdr } from '../supabase/functions/_shared/sdr.ts';

const api = { cnpj: '11222333000181', razao_social: 'ALFA TRANSPORTES LTDA', nome_fantasia: 'ALFA LOG', descricao_situacao_cadastral: 'ATIVA', porte: 'DEMAIS',
  cnae_fiscal: 4930202, cnae_fiscal_descricao: 'Transporte rodoviário de carga', municipio: 'CONTAGEM', uf: 'MG', ddd_telefone_1: '3133334444', ddd_telefone_2: '31999990000',
  email: 'CONTATO@ALFA.TEST', opcao_pelo_simples: false, capital_social: 500000,
  qsa: [{ nome_socio: 'JOAO DA SILVA', qualificacao_socio: 'Sócio-Administrador' }, { nome_socio: 'MARIA DE SOUZA', qualificacao_socio: 'Sócio' }] };
const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('Receita: reduz o cadastro, formata telefone e sócios e só completa o que está vazio', async () => {
  const r = receitaFromBrasilApi(api);
  assert.deepEqual(r.telefones, ['(31) 3333-4444', '(31) 99999-0000']);
  assert.deepEqual(r.socios.map(s => s.nome), ['Joao da Silva', 'Maria de Souza']);
  assert.equal(r.email, 'contato@alfa.test');
  const vazio = applyReceita({ empresa: 'Alfa', nome: '', email: '', telefone: 'Não localizado', cidade: '', uf: '', segmento: '', dados: { partners: [] } }, r) as any;
  assert.equal(vazio.empresa, undefined, 'nome da planilha não é trocado');
  assert.equal(vazio.nome, 'Joao da Silva', 'único sócio-administrador vira o contato');
  assert.equal(vazio.telefone, '(31) 3333-4444');
  assert.equal(vazio.email, 'contato@alfa.test');
  assert.equal(vazio.email_verified_at, null, 'e-mail da Receita ainda passa pela verificação do Snov.io');
  assert.deepEqual(vazio.dados.partners, ['Joao da Silva', 'Maria de Souza']);
  const cheio = applyReceita({ empresa: 'Alfa', nome: 'Ana', email: 'ana@alfa.test', telefone: '(31) 1111-2222', cidade: 'BH', uf: 'MG', segmento: 'Logística', dados: {} }, r) as any;
  assert.deepEqual(Object.keys(cheio), ['dados']);
  assert.throws(() => receitaFromBrasilApi({ message: 'erro' }));
  assert.equal(await lookupReceita('11222333000181', json({}, 404) as any), 'not_found');
  assert.equal(await lookupReceita('11222333000181', json({}, 429) as any), 'retry');
  assert.equal(await lookupReceita('123', (() => { throw new Error('não deveria chamar'); }) as any), 'not_found');
});

function fila(lead: any, simulate = true) {
  const feito: any = { updates: [], finish: null };
  const db = {
    rpc: async (name: string, args: any) => {
      if (name === 'claim_sdr_lead') return { data: { id: 'q1', lease: 't1', organization_id: 'o1', simulate, lead }, error: null };
      if (name === 'finish_sdr_lead') feito.finish = args;
      return { data: null, error: null };
    },
    from: () => ({ update: (patch: any) => { feito.updates.push(patch); const q: any = { eq: () => q, then: (ok: any) => ok({ data: null, error: null }) }; return q; } }),
  };
  return { db, feito };
}
const lead = { id: 'l1', cnpj_raw: '11222333000181', empresa: 'Alfa', nome: '', email: 'x@alfa.test', telefone: '', dados: {}, contact_basis: 'b', contact_source: 's' };

test('agente consulta a Receita antes do Snov.io e não envia para empresa baixada', async () => {
  const ok = fila(lead);
  assert.equal(await processSdr(ok.db, () => undefined, json(api) as any), 'simulation');
  assert.equal(ok.feito.updates[0].dados.receita.razao_social, 'ALFA TRANSPORTES LTDA');
  assert.equal(ok.feito.finish.outcome, 'ENROLLED');

  const baixada = fila(lead);
  assert.equal(await processSdr(baixada.db, () => undefined, json({ ...api, descricao_situacao_cadastral: 'BAIXADA' }) as any), 'review');
  assert.equal(baixada.feito.finish.outcome, 'REVIEW');
  assert.match(baixada.feito.finish.detail, /baixada/);

  // Receita fora do ar: tenta de novo e, na 3ª falha, segue sem ela em vez de travar a cadência.
  const fora = fila(lead);
  assert.equal(await processSdr(fora.db, () => undefined, json({}, 503) as any), 'waiting');
  assert.deepEqual(fora.feito.updates[0].dados.receita, { status: 'tentar', tentativas: 1 });
  assert.equal(fora.feito.finish.outcome, 'PENDING');
  const desiste = fila({ ...lead, dados: { receita: { status: 'tentar', tentativas: 2 } } });
  assert.equal(await processSdr(desiste.db, () => undefined, json({}, 503) as any), 'simulation');
  assert.equal(desiste.feito.updates[0].dados.receita.status, 'indisponivel');

  // Já consultado: não consulta de novo.
  const ja = fila({ ...lead, dados: { receita: { status: 'ok' } } });
  await processSdr(ja.db, () => undefined, (() => { throw new Error('não deveria chamar'); }) as any);
  assert.equal(ja.feito.updates.length, 0);
});
