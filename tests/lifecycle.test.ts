import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { SnovAdapter, snovListRows, verifiedResult } from '../supabase/functions/_shared/snov.ts';

const org='00000000-0000-4000-8000-000000000001';
const uid='11111111-1111-4111-8111-111111111111';
async function setup() {
  const db=new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.test_clock() returns timestamptz language sql stable as $$ select current_setting('test.clock')::timestamptz $$;
    select set_config('test.clock','2026-09-28T15:00:00Z',false);
    grant usage on schema auth to authenticated,service_role;`);
  const files=readdirSync('supabase/migrations').sort();
  // Deterministic clock only in the test harness; all production SQL is otherwise unchanged.
  for(let i=0;i<files.length;i++) {
    await db.exec(readFileSync(`supabase/migrations/${files[i]}`,'utf8').replace(/\bnow\(\)/g,'public.test_clock()'));
    if(i===0) await db.exec(`insert into auth.users values('${uid}'); insert into crm.profiles(id,nome,email,papel) values('${uid}','Test','test@example.test','ADMIN');`);
  }
  await db.exec(`select set_config('request.jwt.claim.sub','${uid}',false);`);
  return db;
}
async function enroll(db:PGlite,live=false) {
  const lead=(await db.query<any>(`insert into crm.leads(organization_id,nome,email,email_verified_at,contact_basis,contact_source)
    values('${org}','Test','test@example.test',public.test_clock(),'test basis','test source') returning id`)).rows[0].id;
  const seq=(await db.query<any>(`select crm.create_cadence('${org}','Teste','Assunto','Corpo',2) id`)).rows[0].id;
  await db.exec(`select crm.set_cadence_state('${seq}','ACTIVE'); select crm.enroll_lead('${seq}','${lead}',${!live});`);
  return {lead,seq};
}
async function claim(db:PGlite) {return (await db.query<any>('select crm.claim_outreach() job')).rows[0].job;}
async function gate(db:PGlite,j:any) {return (await db.query<any>(`select crm.authorize_dispatch(${j.id},'${j.lease}') result`)).rows[0].result;}

test('simulation progresses persistently, delayed handoff and stale completions are fenced',async()=>{
  const db=await setup();try{
    await enroll(db);const j=await claim(db);assert.equal((await gate(db,j)).allowed,true);
    await db.exec(`select crm.finish_outreach(${j.id},'${j.lease}','simulated');`);
    await assert.rejects(db.exec(`select crm.finish_outreach(${j.id},'${j.lease}','simulated');`));
    assert.equal(await claim(db),null);
    await db.exec(`select set_config('test.clock','2026-09-30T15:00:00Z',false);`);
    const followup=await claim(db);assert.equal(followup.kind,'NOTIFY_HUMAN');
    await gate(db,followup);await db.exec(`select crm.finish_outreach(${followup.id},'${followup.lease}','handoff',null,'Ligar');`);
    assert.equal((await db.query<any>('select status from crm.sequence_enrollments')).rows[0].status,'PAUSED');
    assert.equal((await db.query('select * from crm.human_handoffs')).rows.length,1);
  }finally{await db.close();}
});
test('live quotas reserve atomically and business hours defer instead of sending',async()=>{
  const db=await setup();try{
    await db.exec(`update crm.outreach_policy set live_enabled=true,sender='sender@example.test',daily_limit=1,mailbox_daily_limit=1;`);
    await enroll(db,true);const first=await claim(db);assert.equal((await gate(db,first)).allowed,true);
    await enroll(db,true);const second=await claim(db);assert.equal((await gate(db,second)).reason,'daily_limit');
    await db.exec(`select set_config('test.clock','2026-10-03T15:00:00Z',false);`);
    const weekend=await claim(db);assert.equal((await gate(db,weekend)).reason,'business_hours');
  }finally{await db.close();}
});
test('expired pre-dispatch lease retries; uncertain post-dispatch work never resends',async()=>{
  const db=await setup();try{
    await enroll(db);const old=await claim(db);
    await db.exec(`select set_config('test.clock','2026-09-28T15:06:00Z',false)`);
    const next=await claim(db);assert.equal(next.id,old.id);assert.notEqual(next.lease,old.lease);
    await assert.rejects(db.exec(`select crm.finish_outreach(${old.id},'${old.lease}','simulated')`));
    await gate(db,next);
    await db.exec(`select set_config('test.clock','2026-09-28T15:12:00Z',false)`);
    assert.equal(await claim(db),null);
    assert.equal((await db.query<any>('select status from crm.automation_jobs')).rows[0].status,'FAILED');
    assert.equal((await db.query('select * from crm.human_handoffs')).rows.length,1);
    assert.equal(await claim(db),null);
  }finally{await db.close();}
});
test('changed contact cannot use previous verification; unsubscribe preserves original recipient',async()=>{
  const db=await setup();try{
    const {lead}=await enroll(db);const j=await claim(db);
    await db.exec(`update crm.leads set email='changed@example.test' where id='${lead}'`);
    assert.equal((await gate(db,j)).reason,'contact_changed');
    await db.exec(`select crm.unsubscribe_outreach('${j.optout_token}')`);
    assert.equal((await db.query<any>('select email from crm.suppression_list')).rows[0].email,'test@example.test');
    assert.equal((await db.query<any>('select email_verified_at from crm.leads')).rows[0].email_verified_at,null);
  }finally{await db.close();}
});
test('AI quota, low confidence handoff, enrichment dedup and erasure',async()=>{
  const db=await setup();try{
    const {lead}=await enroll(db);
    await db.exec(`update crm.outreach_policy set ai_daily_limit=1`);
    const run=(await db.query<any>(`select crm.reserve_ai_run('${org}','${lead}') id`)).rows[0].id;
    await assert.rejects(db.exec(`select crm.reserve_ai_run('${org}','${lead}')`));
    await db.exec(`select crm.complete_ai_run(${run},'openai','mock','{"action":"human","confidence":0.5,"summary":"Review"}',10,20)`);
    assert.equal((await db.query<any>('select status from crm.sequence_enrollments')).rows[0].status,'PAUSED');
    const a=(await db.query<any>(`select crm.reserve_enrichment('${org}','${lead}','verify','test@example.test') id`)).rows[0].id;
    const b=(await db.query<any>(`select crm.reserve_enrichment('${org}','${lead}','verify','test@example.test') id`)).rows[0].id;
    assert.equal(a,b);
    await db.exec(`update crm.enrichment_requests set status='WAITING' where id='${a}';select crm.complete_enrichment('${a}',true,'[]');`);
    await db.exec(`select crm.erase_lead('${lead}')`);
    assert.equal((await db.query('select * from crm.leads')).rows.length,0);
    assert.equal((await db.query('select * from crm.suppression_list')).rows.length,1);
    assert.equal((await db.query<any>('select antes from crm.audit_logs')).rows[0].antes,null);
  }finally{await db.close();}
});
test('Snov disabled by default; unknown/catch-all never verifies; API requests are fixed',async()=>{
  let calls=0;
  await assert.rejects(new SnovAdapter(()=>undefined,async()=>{calls++;return Response.json({});}).start('discover','example.test'));
  assert.equal(calls,0);
  assert.equal(verifiedResult({status:'completed',data:[{email:'a@example.test',result:{smtp_status:'unknown'}}]},'a@example.test'),false);
  const requests:string[]=[];
  const adapter=new SnovAdapter(n=>({CRM_SNOV_ENABLED:'true',SNOV_CLIENT_ID:'fake',SNOV_CLIENT_SECRET:'fake'})[n],async(url)=>{
    requests.push(String(url)); return Response.json(requests.length===1?{access_token:'fake'}:{meta:{task_hash:'abc'}});
  });
  await adapter.start('discover','example.test');
  await assert.rejects(adapter.result('discover','https://evil.test/'));
  assert.deepEqual(requests,['https://api.snov.io/v1/oauth/access_token','https://api.snov.io/v2/domain-search/prospects/start']);
});
test('Snov lists use fixed read routes and do not treat an imported email as freshly verified',async()=>{
  const calls:string[]=[];
  const adapter=new SnovAdapter(n=>({CRM_SNOV_ENABLED:'true',SNOV_CLIENT_ID:'fake',SNOV_CLIENT_SECRET:'fake'})[n],async(url)=>{
    calls.push(String(url));return Response.json(calls.length===1?{access_token:'fake'}:{success:true,prospects:[]});
  });
  await adapter.lists();
  await adapter.listProspects(41281293,1);
  await assert.rejects(adapter.listProspects(0,1));
  assert.deepEqual(calls.map(u=>u.split('?')[0]),['https://api.snov.io/v1/oauth/access_token','https://api.snov.io/v1/get-user-lists','https://api.snov.io/v1/prospect-list']);
  const rows=snovListRows({success:true,prospects:[{id:'abc123456789',name:'Ana Exemplo',emails:[{email:'ana@example.test',isVerified:true}]},{id:'xyz987654321',name:'Bia',emails:[{email:'bia@example.test'},{email:'bia2@example.test'}]}]});
  assert.equal(rows.length,2);
  assert.equal(rows[0].emailCompany,'ana@example.test');
  assert.equal(rows[1].emailCompany,'');
  assert.equal((rows[0] as any).email_verified_at,undefined);
});
