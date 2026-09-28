import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { renderBroadcast } from '../supabase/functions/_shared/outreach.ts';

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
  await db.exec(`insert into auth.users values('${user}'); insert into crm.profiles(id,nome,email,papel) values('${user}','A','a@example.test','ADMIN');`);
  for (const path of migrations.slice(2)) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
  return db;
}
const comoUsuario = (db: PGlite) => db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
const um = async <T>(db: PGlite, sql: string) => (await db.query<{ v: T }>(`select (${sql}) v`)).rows[0].v;

test('importação: cliente da carteira, deduplicação e complemento sem sobrescrever', async () => {
  const db = await banco();
  try {
    await comoUsuario(db);
    const linhas = [
      { razao_social: 'Alfa Ltda', nome_fantasia: 'Alfa', cnpj: '11.222.333/0001-81', contato: 'Ana', email: 'ANA@alfa.test', tags: 'Simples; Newsletter' },
      { razao_social: 'Alfa Ltda', cnpj: '11222333000181', telefone: '31 99999-0000' },
      { contato: 'Sem empresa', email: 'invalido' },
      {},
    ];
    const r = await um<any>(db, `crm.import_leads('${org}','cliente','${JSON.stringify(linhas)}'::jsonb, array['Carteira 2026'])`);
    assert.equal(r.inseridos, 2);
    assert.equal(r.atualizados, 1);
    assert.equal(r.ignorados, 1);
    const alfa = (await db.query<any>(`select * from crm.leads where cnpj_raw='11222333000181'`)).rows[0];
    assert.equal(alfa.relacao, 'cliente');
    assert.equal(alfa.status, 'Fechado (Ganho)');
    assert.equal(alfa.email, 'ana@alfa.test');
    assert.equal(alfa.telefone, '31 99999-0000');
    assert.deepEqual(alfa.tags, ['Carteira 2026', 'Newsletter', 'Simples']);
    assert.match(alfa.contact_basis, /relação contratual/);
    // Reimportar por e-mail não sobrescreve o que já existe.
    await db.exec(`select crm.import_leads('${org}','cliente','[{"email":"ana@alfa.test","contato":"Outra Pessoa","cidade":"BH"}]'::jsonb)`);
    const depois = (await db.query<any>(`select nome, cidade from crm.leads where cnpj_raw='11222333000181'`)).rows[0];
    assert.equal(depois.nome, 'Ana');
    assert.equal(depois.cidade, 'BH');
  } finally { await db.close(); }
});

test('comunicado: público, envio desligado, lote com limite diário e descadastro', async () => {
  const db = await banco();
  try {
    await comoUsuario(db);
    await db.exec(`select crm.import_leads('${org}','cliente','[{"nome_fantasia":"A","email":"a@x.test","tags":"VIP"},{"nome_fantasia":"B","email":"b@x.test"},{"nome_fantasia":"C","email":"c@x.test"}]'::jsonb)`);
    await db.exec(`select crm.import_leads('${org}','prospect','[{"nome_fantasia":"Frio","email":"frio@x.test"}]'::jsonb)`);
    // Prospect sem verificação não entra em comunicado; filtro por etiqueta funciona.
    assert.equal((await um<any>(db, `crm.broadcast_audience_count('${org}','{"relacao":"todos"}')`)).total, 3);
    assert.equal((await um<any>(db, `crm.broadcast_audience_count('${org}','{"relacao":"cliente","tags":["VIP"]}')`)).total, 1);

    const bid = await um<string>(db, `crm.save_broadcast('${org}',null,'Aviso','Novidade para {{company}}','Olá {{name}}','{"relacao":"cliente"}')`);
    await assert.rejects(db.exec(`select crm.launch_broadcast('${bid}')`), /desligado/);

    await db.exec(`reset role; update crm.outreach_policy set live_enabled=true, sender='contato@envio.test', daily_limit=2 where organization_id='${org}';`);
    await comoUsuario(db);
    assert.equal((await um<any>(db, `crm.launch_broadcast('${bid}')`)).total, 3);
    await assert.rejects(db.exec(`select crm.launch_broadcast('${bid}')`), /já foi disparado/);

    await db.exec('reset role');
    const lote = await um<any>(db, `crm.claim_broadcast_batch(20)`);
    assert.equal(lote.recipients.length, 2, 'respeita o limite diário');
    for (const r of lote.recipients) await db.exec(`select crm.finish_broadcast_recipient('${r.id}','${r.lease_token}',true,'msg-${r.email}')`);
    assert.equal(await um<any>(db, `crm.claim_broadcast_batch(20)`), null, 'limite do dia atingido');

    // Descadastro pelo link do comunicado suprime o contato da empresa.
    await db.exec(`select crm.unsubscribe_outreach('${lote.recipients[0].optout_token}')`);
    assert.equal(await um<boolean>(db, `(select opt_out from crm.leads where lower(email)='${lote.recipients[0].email}')`), true);

    // Evento do Resend correlaciona com o comunicado; evento antigo de outro sistema é ignorado.
    await db.exec(`select crm.record_outreach_event('evt-1','msg-${lote.recipients[1].email}','email.delivered',now())`);
    assert.equal(await um<number>(db, `(select count(*)::int from crm.message_events where broadcast_id='${bid}')`), 1);
    await db.exec(`select crm.record_outreach_event('evt-2','msg-de-outro-sistema','email.delivered',now()-interval '1 hour')`);
    await assert.rejects(db.exec(`select crm.record_outreach_event('evt-3','msg-recente','email.delivered',now())`));
  } finally { await db.close(); }
});

test('cadência com vários e-mails e cliente da carteira sem verificação Snov', async () => {
  const db = await banco();
  try {
    await comoUsuario(db);
    const passos = [{ assunto: 'Oi {{name}}', corpo: 'Primeiro' }, { assunto: 'Seguindo', corpo: 'Segundo', espera_dias: 3 }];
    const sid = await um<string>(db, `crm.create_cadence_v2('${org}','Reativação','cliente','${JSON.stringify(passos)}'::jsonb, 5)`);
    const passosDb = (await db.query<any>(`select ordem, tipo, delay_minutes from crm.outreach_steps where sequence_id='${sid}' order by ordem`)).rows;
    assert.deepEqual(passosDb.map(p => [p.tipo, p.delay_minutes]), [['EMAIL', 0], ['EMAIL', 3 * 1440], ['NOTIFY_HUMAN', 5 * 1440]]);
    await assert.rejects(db.exec(`select crm.create_cadence_v2('${org}','X','cliente','[{"assunto":"a","corpo":"b"},{"assunto":"c","corpo":"d","espera_dias":0}]'::jsonb)`));

    await db.exec(`select crm.set_cadence_state('${sid}','ACTIVE')`);
    await db.exec(`select crm.import_leads('${org}','cliente','[{"nome_fantasia":"Cli","email":"cli@x.test"},{"nome_fantasia":"Sem email"}]'::jsonb)`);
    const ids = (await db.query<{ id: string }>(`select id from crm.leads`)).rows.map(r => `'${r.id}'`).join(',');
    await assert.rejects(db.exec(`select crm.enroll_leads('${sid}',array[${ids}]::uuid[],false)`), /desligado/);
    const r = await um<any>(db, `crm.enroll_leads('${sid}',array[${ids}]::uuid[],true)`);
    assert.deepEqual(r, { inscritos: 1, ignorados: 1 });

    // Envio real para cliente da carteira não exige e-mail verificado.
    await db.exec(`reset role; update crm.outreach_policy set live_enabled=true, sender='contato@envio.test' where organization_id='${org}';
      update crm.sequence_enrollments set dry_run=false;`);
    const job = await um<any>(db, `crm.claim_outreach()`);
    const gate = await um<any>(db, `crm.authorize_dispatch(${job.id},'${job.lease}')`);
    assert.notEqual(gate.reason, 'contact_review_required');
    if (gate.allowed) assert.equal(gate.sender, 'contato@envio.test');
  } finally { await db.close(); }
});

test('comunicado vira HTML seguro com descadastro', () => {
  const m = renderBroadcast({ assunto: 'Aviso para {{company}}', corpo: 'Olá {{name}},\n\nVeja <b>isto</b>: https://grupociatos.com.br\nAté mais', empresa_remetente: 'Ciatos Contabilidade' },
    { name: 'Ana', company: 'Alfa' }, 'https://unsub.test/x');
  assert.equal(m.subject, 'Aviso para Alfa');
  assert.match(m.html, /&lt;b&gt;isto&lt;\/b&gt;/);
  assert.match(m.html, /<a href="https:\/\/grupociatos\.com\.br"/);
  assert.match(m.html, /unsub\.test\/x/);
  assert.match(m.text, /unsub\.test\/x/);
  assert.throws(() => renderBroadcast({ assunto: 'Quebra\nBcc: x', corpo: 'a', empresa_remetente: 'X' }, {}, 'u'));
});
