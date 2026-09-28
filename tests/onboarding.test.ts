import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { renderAviso, eventoFase } from '../supabase/functions/_shared/onboarding.ts';

test('e-mails do onboarding: cliente responde ao responsável, texto escapado, link do CRM para a equipe', () => {
  const base = { empresa: 'Ciatos Contabilidade', referencia: '2026-10-08', lead_id: 'L1', cliente: 'Cliente <SA>', contato: 'Carlos Souza',
    fase: { titulo: 'Enviar documentos', descricao: 'Contrato social <b>e</b> cartão CNPJ', prazo: '2026-10-05', executor: 'cliente', ordem: 0, total: 3, responsavel: { nome: 'Ana', email: 'ana@ciatos.test' } } };
  const cli = renderAviso({ ...base, tipo: 'cliente_lembrete', para: 'carlos@cliente.test' }, 'https://crm.test');
  assert.equal(cli.replyTo, 'ana@ciatos.test');
  assert.match(cli.subject, /Pendente: Enviar documentos/);
  assert.match(cli.html, /&lt;b&gt;e&lt;\/b&gt;/);
  assert.doesNotMatch(cli.html, /crm\.test/, 'cliente não recebe link interno');
  const eq = renderAviso({ ...base, tipo: 'atrasada', para: 'ana@ciatos.test', para_nome: 'Ana Equipe' }, 'https://crm.test');
  assert.match(eq.subject, /Atrasada 3 dia/);
  assert.match(eq.html, /https:\/\/crm\.test\/\?onboarding=L1/);
  assert.match(eq.html, /Cliente &lt;SA&gt;/);
  const ev = eventoFase({ titulo: 'Análise', prazo: '2026-10-12', cliente: 'Cliente SA', executor: 'equipe', resp_email: 'ana@ciatos.test', lead_id: 'L1' }, 'https://crm.test');
  assert.equal(ev.isAllDay, true);
  assert.equal(ev.end.dateTime.slice(0, 10), '2026-10-13');
  assert.equal(ev.attendees[0].emailAddress.address, 'ana@ciatos.test');
});

const user = '11111111-1111-4111-8111-111111111111';
const org = '00000000-0000-4000-8000-000000000001';

async function banco() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, service_role; grant execute on function auth.uid() to authenticated,service_role;`);
  const migrations = readdirSync('supabase/migrations').sort();
  for (const path of migrations.slice(0, 2)) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
  await db.exec(`insert into auth.users values('${user}'); insert into crm.profiles(id,nome,email,papel) values('${user}','Ana Equipe','ana@ciatos.test','ADMIN');`);
  for (const path of migrations.slice(2)) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
  const fases = [
    { id: 'f1', name: 'Coleta de documentos', order: 0, defaultDueDays: 3, mandatory: true, executor: 'cliente' },
    { id: 'f2', name: 'Análise', order: 1, defaultDueDays: 5, mandatory: true },
    { id: 'f3', name: 'Reunião de entrega', order: 2, defaultDueDays: 2, mandatory: false },
  ];
  await db.exec(`insert into crm.onboarding_templates(id, organization_id, dados) values ('tpl1','${org}','${JSON.stringify({ id: 'tpl1', name: 'Padrão', phases: fases })}');
    insert into crm.leads(id, organization_id, nome, email, empresa, status) values ('22222222-2222-4222-8222-222222222222','${org}','Carlos Cliente','carlos@cliente.test','Cliente SA','Fechado (Ganho)');
    set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
  return db;
}
const lead = '22222222-2222-4222-8222-222222222222';
const linhas = async (db: PGlite, sql: string) => (await db.query<any>(sql)).rows;

test('iniciar gera fases com prazo acumulado em dia útil, responsável e aviso da primeira', async () => {
  const db = await banco();
  try {
    // 2026-10-02 é sexta: +3 = segunda 05/10; +5 = sábado 10/10 → segunda 12/10; +2 = 14/10.
    assert.equal((await linhas(db, `select crm.start_onboarding('${lead}','tpl1','2026-10-02','${user}') n`))[0].n, 3);
    const fases = await linhas(db, `select titulo, executor, status, prazo::text, responsavel_id, cliente_email from crm.onboarding_steps order by ordem`);
    assert.deepEqual(fases.map(f => f.prazo), ['2026-10-05', '2026-10-12', '2026-10-14']);
    assert.deepEqual(fases.map(f => f.status), ['Em Andamento', 'Pendente', 'Pendente']);
    assert.equal(fases[0].executor, 'cliente');
    assert.equal(fases[0].cliente_email, 'carlos@cliente.test');
    assert.ok(fases.every(f => f.responsavel_id === user));
    await db.exec('reset role');
    const avisos = await linhas(db, `select tipo, destinatario from crm.onboarding_notifications order by tipo`);
    assert.deepEqual(avisos.map(a => `${a.tipo}:${a.destinatario}`), ['atribuida:ana@ciatos.test', 'cliente_pedido:carlos@cliente.test']);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
    await assert.rejects(db.exec(`select crm.start_onboarding('${lead}','tpl1',null,null)`), /já tem onboarding/);
  } finally { await db.close(); }
});

test('ordem obrigatória, liberação da próxima fase e avisos sem duplicar', async () => {
  const db = await banco();
  try {
    await db.exec(`select crm.start_onboarding('${lead}','tpl1','2026-10-02','${user}')`);
    const ids = (await linhas(db, `select id from crm.onboarding_steps order by ordem`)).map(r => r.id);
    await assert.rejects(db.exec(`select crm.update_onboarding_step('${ids[1]}','Concluido')`), /Coleta de documentos/);
    await db.exec(`select crm.update_onboarding_step('${ids[0]}','Concluido')`);
    const [f1, f2] = await linhas(db, `select status, concluida_em is not null feito from crm.onboarding_steps order by ordem limit 2`);
    assert.equal(f1.feito, true);
    assert.equal(f2.status, 'Em Andamento', 'próxima fase liberada automaticamente');
    await db.exec(`select crm.update_onboarding_step('${ids[0]}','Concluido')`);
    await db.exec('reset role');
    const liberadas = await linhas(db, `select count(*)::int n from crm.onboarding_notifications where tipo = 'liberada'`);
    assert.equal(liberadas[0].n, 1, 'concluir de novo não reenvia');
    // Mudar prazo marca o convite do Outlook para atualizar.
    await db.exec(`update crm.onboarding_steps set calendar_dirty = false where id = '${ids[1]}'`);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false); select crm.update_onboarding_step('${ids[1]}', null, null, '2026-10-20')`);
    await db.exec('reset role');
    assert.equal((await linhas(db, `select calendar_dirty from crm.onboarding_steps where id = '${ids[1]}'`))[0].calendar_dirty, true);
    // Apagar fase com convite enfileira o cancelamento no Outlook.
    await db.exec(`update crm.onboarding_steps set calendar_event_id = 'evt-1' where id = '${ids[2]}'; delete from crm.onboarding_steps where id = '${ids[2]}'`);
    assert.equal((await linhas(db, `select event_id from crm.calendar_cancellations`))[0].event_id, 'evt-1');
  } finally { await db.close(); }
});

test('worker reserva avisos com dados da fase e conclui sem reenviar', async () => {
  const db = await banco();
  try {
    await db.exec(`select crm.start_onboarding('${lead}','tpl1','2026-10-02','${user}')`);
    await db.exec('reset role');
    const lote = (await linhas(db, `select crm.claim_onboarding_notifications(10) l`))[0].l;
    assert.equal(lote.length, 2);
    const cliente = lote.find((n: any) => n.tipo === 'cliente_pedido');
    assert.equal(cliente.fase.titulo, 'Coleta de documentos');
    assert.equal(cliente.cliente, 'Cliente SA');
    assert.equal(cliente.fase.responsavel.email, 'ana@ciatos.test');
    for (const n of lote) await db.exec(`select crm.finish_onboarding_notification(${n.id}, '${n.lease}', true)`);
    assert.equal((await linhas(db, `select crm.claim_onboarding_notifications(10) l`))[0].l, null);
    const cal = (await linhas(db, `select crm.claim_calendar_work(10) c`))[0].c;
    assert.equal(cal.steps.length, 3, 'todas as fases vão para o Outlook');
    await db.exec(`select crm.finish_calendar_item('step', '${cal.steps[0].id}', true, 'evt-abc')`);
    assert.equal((await linhas(db, `select calendar_event_id, calendar_dirty from crm.onboarding_steps where id = '${cal.steps[0].id}'`))[0].calendar_event_id, 'evt-abc');
  } finally { await db.close(); }
});
