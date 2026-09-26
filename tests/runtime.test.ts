import { aiCenterQueries } from '../lib/aiCenterQueries.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { renderMessage, sendEmail, decide, validateDecision, verifyWebhook } from '../supabase/functions/_shared/outreach.ts';

test('templates reject headers, unresolved variables and preserve opt-out', () => {
  assert.throws(() => renderMessage({ subject: 'Hi\nBcc: x', body: 'body' }, {}, 'https://example.test'));
  assert.throws(() => renderMessage({ subject: '{{unknown}}', body: 'body' }, {}, 'https://example.test'));
  assert.match(renderMessage({ subject: 'Oi {{name}}', body: 'Olá {{company}}' }, { name: 'Ana', company: 'ACME' }, 'https://example.test/unsub').text, /unsub/);
});
test('live sends fail closed without explicit flag, never call transport', async () => {
  let called = false;
  await assert.rejects(sendEmail(() => undefined, {} as any, async () => { called = true; return new Response(); }));
  assert.equal(called, false);
});
test('AI requires valid confidence and sends uncertain decisions to humans', () => {
  assert.equal(validateDecision({ action: 'continue', confidence: 0.5, summary: 'Review' }).action, 'human');
  assert.throws(() => validateDecision({ action: 'send', confidence: 1, summary: '' }));
  assert.throws(() => validateDecision({ action: 'continue', confidence: NaN, summary: '' }));
});
test('OpenAI and Claude adapters use server contracts with mocked transport', async () => {
  for (const provider of ['openai','anthropic']) {
    const result = await decide(name => ({ CRM_AI_ENABLED: 'true', CRM_AI_PROVIDER: provider, CRM_OPENAI_MODEL: 'test-model', CRM_CLAUDE_MODEL: 'test-model', OPENAI_API_KEY: 'fake', ANTHROPIC_API_KEY: 'fake' })[name], {}, async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      assert.equal(body.model, 'test-model');
      if (provider === 'openai') assert.equal(body.store, false);
      const text = JSON.stringify({ action: 'human', confidence: 0.95, summary: 'Contato solicitado' });
      return Response.json(provider === 'openai' ? { status: 'completed', output: [{ content: [{ type: 'output_text', text }] }] } : { stop_reason: 'end_turn', content: [{ type: 'text', text }] });
    });
    assert.equal(result.decision.action, 'human');
  }
});
test('webhook HMAC rejects modified body and expired replay', async () => {
  const secret = btoa('a-test-secret-long-enough'); const raw = '{"type":"email.delivered"}';
  const timestamp = Math.floor(Date.now()/1000).toString();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('a-test-secret-long-enough'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`evt.${timestamp}.${raw}`)))));
  const headers = new Headers({ 'svix-id': 'evt', 'svix-timestamp': timestamp, 'svix-signature': `v1,${signature}` });
  assert.equal(await verifyWebhook(raw, headers, secret), true);
  assert.equal(await verifyWebhook(raw+' ', headers, secret), false);
  assert.equal(await verifyWebhook(raw, headers, secret, Date.now()+600000), false);
});

test('migrations, tenant isolation, durable scheduler, fencing, suppression and webhook replay', async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, service_role; grant execute on function auth.uid() to authenticated,service_role;`);
    const migrations = readdirSync('supabase/migrations').sort();
    for (const path of migrations.slice(0, 2)) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
    const user = '11111111-1111-4111-8111-111111111111'; const other = '22222222-2222-4222-8222-222222222222';
    const org = '00000000-0000-4000-8000-000000000001';
    await db.exec(`insert into auth.users values('${user}'),('${other}'); insert into crm.profiles(id,nome,email,papel) values('${user}','A','a@example.test','ADMIN'),('${other}','B','b@example.test','SDR');`);
    for (const path of migrations.slice(2)) await db.exec(readFileSync(`supabase/migrations/${path}`, 'utf8'));
    await db.exec(`insert into crm.organizations(id,nome,slug) values('${other}','Other','other');
      delete from crm.organization_members where user_id='${other}';
      insert into crm.organization_members(organization_id,user_id,papel) values('${other}','${other}','ADMIN');
      insert into crm.leads(id,organization_id,nome,email) values('${user}','${org}','Ana','ana@example.test'),('${other}','${other}','B','b@example.test');
      set role authenticated; select set_config('request.jwt.claim.sub','${user}',false);`);
    assert.equal((await db.query('select * from crm.leads')).rows.length, 1);
    for (const [table, order] of aiCenterQueries) {
      await db.query(`select * from crm.${table} where organization_id='${org}' ${order ? `order by ${order} desc` : ''} limit 200`);
    }
    await assert.rejects(db.exec(`select crm.claim_outreach()`));
    await assert.rejects(db.exec(`update crm.outreach_policy set live_enabled=true`));
    const sid = (await db.query<{ id: string }>(`select crm.create_cadence('${org}','Teste','Olá {{name}}','Mensagem') as id`)).rows[0].id;
    await db.exec(`select crm.set_cadence_state('${sid}','ACTIVE')`);
    await assert.rejects(db.exec(`select crm.enroll_lead('${sid}','${other}',true)`));
    await assert.rejects(db.exec(`select crm.enroll_lead('${sid}','${user}',false)`));
    await db.exec(`select crm.enroll_lead('${sid}','${user}',true)`);
    await assert.rejects(db.exec(`select crm.enroll_lead('${sid}','${user}',true)`));
    await db.exec('reset role');
    const job = (await db.query<{ j: any }>('select crm.claim_outreach() j')).rows[0].j;
    assert.equal(job.dry_run, true); assert.equal(job.lead.name, 'Ana');
    assert.equal((await db.query<{ j: any }>('select crm.claim_outreach() j')).rows[0].j, null);
    await assert.rejects(db.exec(`select crm.finish_outreach(${job.id},'${other}','simulated')`));
    await db.exec(`select crm.suppress_contact('${org}','ana@example.test','test')`);
    const gate = (await db.query<{ gate: any }>(`select crm.authorize_dispatch(${job.id},'${job.lease}') gate`)).rows[0].gate;
    assert.equal(gate.allowed, false);
    assert.equal((await db.query<{ opt_out: boolean }>(`select opt_out from crm.leads where id='${user}'`)).rows[0].opt_out, true);
    await db.exec(`update crm.automation_jobs set provider_message_id='msg-1' where id=${job.id};
      select crm.record_outreach_event('evt-1','msg-1','email.bounced',now());
      select crm.record_outreach_event('evt-1','msg-1','email.bounced',now());`);
    assert.equal((await db.query('select * from crm.message_events')).rows.length, 1);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${other}',false)`);
    assert.equal((await db.query('select * from crm.automation_jobs')).rows.length, 0);
    assert.equal((await db.query('select * from crm.outreach_steps')).rows.length, 0);
    await assert.rejects(db.exec(`select crm.set_cadence_state('${sid}','PAUSED')`));
  } finally { await db.close(); }
});
