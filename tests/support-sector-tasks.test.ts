import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { clientMonthCsv, reportCsvCell } from '../lib/supportTasks';

test('CSV neutralizes formulas and quotes, without pretending to be the complete dataset', () => {
  assert.equal(reportCsvCell(' \t=1+1'), '"\' \t=1+1"');
  assert.equal(reportCsvCell('A "B"'), '"A ""B"""');
  assert.match(clientMonthCsv({ opened: 1, resolved: 0, open_now: 1, total: 1, avg_resolution_hours: null, items: [{ id: 'x', title: '+formula', status: 'OPEN', created_at: '2026-11-01', resolved_at: null, due_at: null, assigned_to: null }] }), /'\+formula/);
});

test('sector tasks enforce tenant/confidential access, parent serialization, idempotence and monthly report scope', async t => {
  const db = new PGlite();
  const admin='11111111-1111-4111-8111-111111111111', agent='22222222-2222-4222-8222-222222222222', other='33333333-3333-4333-8333-333333333333';
  const org='00000000-0000-4000-8000-000000000001', org2='00000000-0000-4000-8000-000000000002';
  const lead='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  let serial=0;
  const taskId=()=>`55555555-5555-4555-8555-${String(++serial).padStart(12,'0')}`;
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;`);
    const files = readdirSync('supabase/migrations').sort();
    for(let i=0;i<files.length;i++) {
      await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
      if(i===1) await db.exec(`insert into auth.users values('${admin}');insert into crm.profiles(id,nome,email,papel) values('${admin}','Admin','admin@example.test','ADMIN');`);
    }
    await db.exec(`insert into auth.users values('${agent}'),('${other}');insert into crm.profiles(id,nome,email,papel) values('${agent}','Agente','agent@example.test','SDR'),('${other}','Outro','other@example.test','SDR');insert into crm.organizations(id,nome,slug) values('${org2}','Outra','outra');insert into crm.organization_members(organization_id,user_id,papel) values('${org}','${agent}','MEMBER'),('${org2}','${other}','MEMBER');update crm.organization_members set papel='ADMIN' where organization_id='${org}' and user_id='${admin}';insert into crm.leads(id,organization_id,nome) values('${lead}','${org}','Cliente de teste');`);
    const actor=async(id:string)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
    const create=async(conf=false)=> (await db.query<{id:string}>('select crm.create_support_demand($1,$2,related_lead=>$3,assignee=>$4,is_confidential=>$5) id',[org,'Solicitação de teste',lead,admin,conf])).rows[0].id;
    const get=async(id:string)=>(await db.query<any>('select * from crm.support_demands where id=$1',[id])).rows[0];
    const body={title:'Analisar pendência',sector:'LEGAL',assigned_to:agent,due_at:'2026-11-20T12:00:00Z',required:true,status:'OPEN',result:''};
    const save=async(id:string,key:string,data=body,version?:number)=> (await db.query<any>('select crm.save_support_task($1,$2,$3,$4::jsonb) version',[id,version ?? (await get(id)).version,key,JSON.stringify(data)])).rows[0].version;
    const resolve=async(id:string)=>db.query('select crm.update_support_demand($1,$2,$3::jsonb)',[id,(await get(id)).version,JSON.stringify({status:'RESOLVED'})]);
    await actor(admin); const demand=await create(), confidential=await create(true), key=taskId();
    await t.test('task creates a single audit, bumps parent and retries without duplicating', async()=>{
      const v=(await get(demand)).version;
      assert.equal(await save(demand,key),v+1);assert.equal(await save(demand,key,body,v),v+1);
      assert.equal((await db.query<any>('select count(*)::int n from crm.support_demand_tasks where demand_id=$1',[demand])).rows[0].n,1);
      assert.equal((await db.query<any>("select count(*)::int n from crm.support_demand_activity where demand_id=$1 and changes ? 'task_after'",[demand])).rows[0].n,1);
      await assert.rejects(save(demand,taskId(),body,v),/changed/);
    });
    await t.test('required tasks prevent closing until completed with a result; legacy requests remain compatible',async()=>{
      await assert.rejects(resolve(demand),/tarefas obrigatórias/);
      await assert.rejects(save(demand,key,{...body,required:false}),/obrigatoriedade/);
      await assert.rejects(save(demand,key,{...body,status:'DONE'}),/check constraint/);
      await save(demand,key,{...body,status:'DONE',result:'Parecer concluído'});await resolve(demand);
      await assert.rejects(save(demand,taskId()),/Reabra/);
      const legacy=await create();await resolve(legacy);assert.equal((await get(legacy)).status,'RESOLVED');
    });
    await t.test('optional pending tasks do not block and waiver requires justification',async()=>{
      const id=await create(),k=taskId();await save(id,k,{...body,required:false});await resolve(id);
      const id2=await create(),k2=taskId();await save(id2,k2);await assert.rejects(save(id2,k2,{...body,status:'WAIVED'}));
      await save(id2,k2,{...body,status:'WAIVED',result:'Escopo dispensado pelo responsável'});await resolve(id2);
    });
    await t.test('confidential execution never gives implicit access and other companies cannot read or mutate',async()=>{
      await assert.rejects(save(confidential,taskId()),/confidencial/);
      await save(confidential,taskId(),{...body,assigned_to:admin});
      await actor(agent);assert.equal((await db.query('select * from crm.support_demand_tasks where demand_id=$1',[confidential])).rows.length,0);
      await assert.rejects(db.query('select crm.save_support_task($1,1,$2,$3::jsonb)',[confidential,taskId(),JSON.stringify(body)]),/unavailable/);
      await actor(other);assert.equal((await db.query('select * from crm.support_demand_tasks')).rows.length,0);
      await assert.rejects(db.query('select crm.save_support_task($1,1,$2,$3::jsonb)',[demand,taskId(),JSON.stringify(body)]),/unavailable/);
      await actor(admin);await assert.rejects(db.exec(`insert into crm.support_demand_tasks(id,organization_id,demand_id,sector,title,due_at) values('${taskId()}','${org}','${demand}','LEGAL','Direto',now())`),/permission denied/);
      await db.exec('reset role;set role anon');await assert.rejects(db.query('select crm.save_support_task($1,1,$2,$3::jsonb)',[demand,taskId(),JSON.stringify(body)]));await actor(admin);
    });
    await t.test('invalid executor, sector, payload and cross-demand task ID are rejected',async()=>{
      const id=await create();await assert.rejects(save(id,taskId(),{...body,assigned_to:other}),/Invalid assignee/);
      await assert.rejects(save(id,taskId(),{...body,sector:'inventado'}),/check constraint/);
      await assert.rejects(db.query('select crm.save_support_task($1,1,$2,$3::jsonb)',[id,taskId(),JSON.stringify({title:'incompleta'})]),/Invalid task/);
      await assert.rejects(save(id,key),/Invalid task/);
    });
    await t.test('month report uses Sao Paulo boundaries, current stock and caller visibility; privacy export includes tasks',async()=>{
      await db.exec('reset role');
      await db.query("update crm.support_demands set created_at='2026-11-01T02:59:59Z',resolved_at=null where id=$1",[confidential]);
      await db.query("update crm.support_demands set created_at='2026-10-01T03:00:00Z',resolved_at='2026-11-01T03:00:00Z' where id=$1",[demand]);
      await actor(admin);
      const report=async()=>(await db.query<any>('select crm.support_client_month($1,$2,$3) r',[org,lead,'2026-11-01'])).rows[0].r;
      const adminReport=await report();assert.ok(adminReport.resolved>=1);assert.equal(adminReport.total,adminReport.items.length);
      const exported=(await db.query<any>('select crm.lead_privacy_export($1) r',[lead])).rows[0].r;assert.ok(exported.support_demand_tasks.length>=2);
      await actor(agent);const memberReport=await report();assert.equal(memberReport.total,adminReport.total-1);
      await actor(other);await assert.rejects(report(),/Forbidden/);
      await actor(admin);await assert.rejects(db.query('select crm.support_client_month($1,$2,$3)',[org,lead,'2026-11-02']),/primeiro dia/);
    });
    await t.test('reopening preserves tasks; FK deletion follows the lead privacy boundary',async()=>{
      await db.query('select crm.update_support_demand($1,$2,$3::jsonb)',[demand,(await get(demand)).version,JSON.stringify({status:'OPEN'})]);
      assert.equal((await db.query<any>('select status from crm.support_demand_tasks where id=$1',[key])).rows[0].status,'DONE');
      await db.exec('reset role');await db.query('delete from crm.leads where id=$1',[lead]);assert.equal((await db.query('select * from crm.support_demand_tasks')).rows.length,0);
    });
  } finally { await db.close(); }
});

