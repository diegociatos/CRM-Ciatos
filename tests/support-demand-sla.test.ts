import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', member='33333333-3333-4333-8333-333333333333';
const org='00000000-0000-4000-8000-000000000001', org2='00000000-0000-4000-8000-000000000002';
const r1='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', r2='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', r3='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
async function banco(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;`);
 const files=readdirSync('supabase/migrations').sort();
 for(let i=0;i<files.length;i++){
  await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
  if(i===1) await db.exec(`insert into auth.users values('${admin}');insert into crm.profiles(id,nome,email,papel) values('${admin}','Admin','admin@test.local','ADMIN');`);
 }
 await db.exec(`insert into auth.users values('${other}'),('${member}');
  insert into crm.profiles(id,nome,email,papel) values('${other}','Other','other@test.local','SDR'),('${member}','Member','member@test.local','SDR');
  insert into crm.organizations(id,nome,slug) values('${org2}','Other','other');
  insert into crm.organization_members(organization_id,user_id) values('${org2}','${other}');
  insert into crm.organization_members(organization_id,user_id,papel) values('${org}','${member}','MEMBER');
  update crm.organization_members set papel='ADMIN' where organization_id='${org}' and user_id='${admin}';`);
 return db;
}
async function actor(db:PGlite,id=admin){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);}
async function scalar<T=any>(db:PGlite,sql:string){return (await db.query<{v:T}>(`select (${sql}) v`)).rows[0].v;}
const hoursFromNow=(db:PGlite,id:string)=>scalar<number>(db,`(select extract(epoch from (due_at-now()))/3600 from crm.support_demands where id='${id}')::float8`);

test('sla: due date comes from the company policy, explicit dates win, priority change recalculates policy dates only',async()=>{
 const db=await banco();try{
 await actor(db);
 const normal=await scalar(db,`crm.create_support_demand('${org}','Normal','',null,'NORMAL',null,null,'${r1}')`);
 assert.ok(Math.abs(await hoursFromNow(db,normal)-72)<0.1);
 const urgent=await scalar(db,`crm.create_support_demand('${org}','Urgente','',null,'URGENT',null,null,'${r2}')`);
 assert.ok(Math.abs(await hoursFromNow(db,urgent)-4)<0.1);
 const explicit=await scalar(db,`crm.create_support_demand('${org}','Manual','',null,'LOW',now()+interval '10 hours',null,'${r3}')`);
 assert.ok(Math.abs(await hoursFromNow(db,explicit)-10)<0.1);
 let v=await scalar(db,`crm.update_support_demand('${normal}',1,'{"priority":"HIGH"}')`);
 assert.ok(Math.abs(await hoursFromNow(db,normal)-24)<0.1);
 v=await scalar(db,`crm.update_support_demand('${explicit}',1,'{"priority":"URGENT"}')`);
 assert.ok(Math.abs(await hoursFromNow(db,explicit)-10)<0.1,'manual deadline must not be recalculated');
 await db.exec(`select crm.update_support_demand('${normal}',${v-0 ? 2 : 2},'{"due_at":"2030-01-01T00:00:00Z"}')`);
 await db.exec(`select crm.update_support_demand('${normal}',3,'{"priority":"LOW"}')`);
 assert.equal(await scalar(db,`select to_char(due_at at time zone 'UTC','YYYY')  from crm.support_demands where id='${normal}'`),'2030');
 await assert.rejects(db.exec(`select crm.create_support_demand('${org}','Bad','',null,'WRONG')`),/Invalid priority/);
 // custom policy per company
 await db.exec(`select crm.save_support_settings('${org}','{"policies":{"NORMAL":10}}')`);
 const custom=await scalar(db,`crm.create_support_demand('${org}','Custom','',null,'NORMAL',null,null,gen_random_uuid())`);
 assert.ok(Math.abs(await hoursFromNow(db,custom)-10)<0.1);
 assert.equal(await scalar(db,`crm.get_support_settings('${org}')->'policies'->>'URGENT'`),'4');
 }finally{await db.close();}
});

test('settings: only administrators save; triage owner must be an active member of the same company',async()=>{
 const db=await banco();try{
 await actor(db,member);
 await assert.rejects(db.exec(`select crm.save_support_settings('${org}','{"escalate_after_hours":1}')`),/Forbidden/);
 assert.equal(await scalar(db,`crm.get_support_settings('${org}')->>'can_manage'`),'false');
 await actor(db);
 await assert.rejects(db.exec(`select crm.save_support_settings('${org}','{"triage_assignee":"${other}"}')`),/Invalid assignee/);
 await assert.rejects(db.exec(`select crm.save_support_settings('${org}','{"policies":{"BAD":5}}')`),/Invalid settings/);
 await assert.rejects(db.exec(`select crm.save_support_settings('${org}','{"policies":{"LOW":0}}')`));
 await assert.rejects(db.exec(`select crm.save_support_settings('${org}','{"unknown":1}')`),/Invalid settings/);
 await assert.rejects(db.exec(`select crm.save_support_settings('${org2}','{}')`),/Forbidden/);
 await db.exec(`select crm.save_support_settings('${org}','{"triage_assignee":"${member}"}')`);
 const id=await scalar(db,`crm.create_support_demand('${org}','Triagem','',null,'NORMAL',null,null,'${r1}')`);
 assert.equal(await scalar(db,`select assigned_to from crm.support_demands where id='${id}'`),member);
 await actor(db,member);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_alerts where kind='ASSIGNED'`),1);
 await actor(db,other);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_settings`),0,'settings are tenant scoped');
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_alerts`),0);
 await assert.rejects(db.exec(`insert into crm.support_settings(organization_id) values('${org2}')`),/permission denied/);
 await assert.rejects(db.exec(`update crm.support_sla_policies set resolve_hours=1`),/permission denied/);
 // a deactivated triage owner is ignored instead of blocking creation
 await db.exec(`reset role;update crm.organization_members set ativo=false where user_id='${member}' and organization_id='${org}'`);
 await actor(db);
 const orphan=await scalar(db,`crm.create_support_demand('${org}','Sem triagem','',null,'NORMAL',null,null,'${r2}')`);
 assert.equal(await scalar(db,`select assigned_to is null from crm.support_demands where id='${orphan}'`),true);
 }finally{await db.close();}
});

test('alerts: server-only scan, deduplicated, escalates to administrators, read state is private',async()=>{
 const db=await banco();try{
 await actor(db);
 await assert.rejects(db.exec(`select crm.scan_support_demands()`),/permission denied/);
 const late=await scalar(db,`crm.create_support_demand('${org}','Atrasada','',null,'NORMAL',now()-interval '10 hours','${member}','${r1}')`);
 const soon=await scalar(db,`crm.create_support_demand('${org}','Quase','',null,'NORMAL',now()+interval '2 hours','${member}','${r2}')`);
 const orphan=await scalar(db,`crm.create_support_demand('${org}','Sem dono','',null,'NORMAL',now()+interval '30 hours',null,'${r3}')`);
 await db.exec(`reset role;update crm.support_demands set created_at=now()-interval '2 hours',unassigned_since=now()-interval '2 hours' where id='${orphan}'`);
 const first=await scalar(db,`crm.scan_support_demands()`);
 assert.ok(first>=4);
 assert.equal(await scalar(db,`crm.scan_support_demands()`),0,'second run must not duplicate alerts');
 const kinds=async(who:string)=>{await actor(db,who);return (await db.query<{kind:string}>(`select kind from crm.support_demand_alerts order by kind`)).rows.map(r=>r.kind);};
 const mine=await kinds(member);
 assert.ok(mine.includes('OVERDUE')&&mine.includes('DUE_SOON')&&mine.includes('ASSIGNED'));
 assert.ok(!mine.includes('ESCALATED')&&!mine.includes('UNASSIGNED'));
 const boss=await kinds(admin);
 assert.ok(boss.includes('ESCALATED')&&boss.includes('UNASSIGNED'));
 assert.deepEqual(await kinds(other),[]);
 await actor(db,other);
 assert.equal(await scalar(db,`crm.mark_support_alerts_read('${org2}')`),0);
 await assert.rejects(db.exec(`select crm.mark_support_alerts_read('${org}')`),/Forbidden/);
 await actor(db,member);
 assert.ok(await scalar(db,`crm.mark_support_alerts_read('${org}')`)>=3);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_alerts where read_at is null`),0);
 await actor(db,admin);
 assert.ok(await scalar(db,`select count(*)::int from crm.support_demand_alerts where read_at is null`)>=2,'another person read state is untouched');
 // resolved demands stop alerting
 await db.exec(`select crm.update_support_demand('${late}',${await scalar(db,`select version from crm.support_demands where id='${late}'`)},'{"status":"RESOLVED"}')`);
 await db.exec(`reset role`);
 await db.exec(`delete from crm.support_demand_alerts`);
 assert.equal(await scalar(db,`crm.scan_support_demands()`)>0,true);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_alerts where demand_id='${late}'`),0);
 // inactive company is skipped
 await db.exec(`delete from crm.support_demand_alerts;update crm.organizations set ativo=false where id='${org}'`);
 assert.equal(await scalar(db,`crm.scan_support_demands()`),0);
 }finally{await db.close();}
});

test('confidential demands: only creator, assignee and administrators can see or change them',async()=>{
 const db=await banco();try{
 await actor(db,other);
 await db.exec(`reset role;insert into crm.organization_members(organization_id,user_id,papel) values('${org}','${other}','MEMBER')`);
 await actor(db,member);
 const secret=await scalar(db,`crm.create_support_demand('${org}','Sigilo','segredo',null,'NORMAL',null,null,'${r1}',true)`);
 const open=await scalar(db,`crm.create_support_demand('${org}','Aberta','',null,'NORMAL',null,null,'${r2}')`);
 await db.exec(`select crm.add_support_demand_note('${secret}','nota sigilosa')`);
 // another regular member of the same company sees only the non confidential one
 await actor(db,other);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands`),1);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity where demand_id='${secret}'`),0);
 await assert.rejects(db.exec(`select crm.update_support_demand('${secret}',1,'{"title":"x"}')`),/unavailable/);
 await assert.rejects(db.exec(`select crm.add_support_demand_note('${secret}','x')`),/unavailable/);
 assert.equal(await scalar(db,`crm.support_demand_stats('${org}')->>'open'`),'1');
 // creator and administrator see it; assigning it grants the new assignee access
 await actor(db,member);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands`),2);
 await actor(db,admin);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands`),2);
 assert.equal(await scalar(db,`crm.support_demand_stats('${org}')->>'open'`),'2');
 await db.exec(`select crm.update_support_demand('${secret}',1,'{"assigned_to":"${other}"}')`);
 await actor(db,other);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands where id='${secret}'`),1);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_alerts where kind='ASSIGNED'`),1);
 // another company never sees either
 await db.exec(`reset role;insert into crm.organization_members(organization_id,user_id,papel) values('${org2}','${member}','MEMBER')`);
 await actor(db,member);
 assert.equal(await scalar(db,`crm.support_demand_stats('${org2}')->>'open'`),'0');
 // confidentiality cannot be toggled through the patch API
 await actor(db,admin);
 await assert.rejects(db.exec(`select crm.update_support_demand('${open}',1,'{"confidential":"true"}')`),/Invalid patch/);
 assert.equal(await scalar(db,`(crm.support_demand_stats('${org}')->'by_assignee')::text like '%${other}%'`),true);
 }finally{await db.close();}
});

test('stats: counts overdue, unassigned and average resolution by company',async()=>{
 const db=await banco();try{
 await actor(db);
 await db.exec(`select crm.create_support_demand('${org}','Demanda A','',null,'NORMAL',now()-interval '1 hour','${admin}','${r1}')`);
 await db.exec(`select crm.create_support_demand('${org}','Demanda B','',null,'NORMAL',now()+interval '1 hour',null,'${r2}')`);
 const done=await scalar(db,`crm.create_support_demand('${org}','Demanda C','',null,'NORMAL',null,null,'${r3}')`);
 await db.exec(`select crm.update_support_demand('${done}',1,'{"status":"RESOLVED"}')`);
 const s=await scalar(db,`crm.support_demand_stats('${org}')`);
 assert.equal(s.open,2);assert.equal(s.overdue,1);assert.equal(s.unassigned,1);
 assert.notEqual(s.avg_resolution_hours,null);
 await actor(db,other);
 await assert.rejects(db.exec(`insert into crm.support_demand_alerts(organization_id,demand_id,recipient,kind,bucket,title) values('${org2}','${done}','${other}','OVERDUE','x','x')`),/permission denied/);
 assert.equal(await scalar(db,`crm.support_demand_stats('${org}')->>'open'`),'0');
 }finally{await db.close();}
});

const count=(db:PGlite,where:string)=>scalar<number>(db,`select count(*)::int from crm.support_demand_alerts where ${where}`);
const version=(db:PGlite,id:string)=>scalar<number>(db,`select version from crm.support_demands where id='${id}'`);

test('sla: clearing the deadline goes back to the priority policy (counted from creation)',async()=>{
 const db=await banco();try{
 await actor(db);
 const id=await scalar(db,`crm.create_support_demand('${org}','Manual','',null,'URGENT',now()+interval '500 hours',null,'${r1}')`);
 await db.exec(`select crm.update_support_demand('${id}',1,'{"due_at":null}')`);
 assert.equal(await scalar(db,`select sla_due from crm.support_demands where id='${id}'`),true);
 assert.ok(Math.abs(await hoursFromNow(db,id)-4)<0.1,'urgent policy = 4 h from creation');
 // it is policy-driven again, so a priority change recalculates it
 await db.exec(`select crm.update_support_demand('${id}',2,'{"priority":"LOW"}')`);
 assert.ok(Math.abs(await hoursFromNow(db,id)-120)<0.1);
 // an explicit date makes it manual again
 await db.exec(`select crm.update_support_demand('${id}',3,'{"due_at":"2031-01-01T00:00:00Z"}')`);
 assert.equal(await scalar(db,`select sla_due from crm.support_demands where id='${id}'`),false);
 }finally{await db.close();}
});

test('alerts: unassigned alert is issued once per effective unassigned period, including after unassigning',async()=>{
 const db=await banco();try{
 await actor(db);
 const id=await scalar(db,`crm.create_support_demand('${org}','Sem dono','',null,'NORMAL',null,null,'${r1}')`);
 await db.exec(`reset role;update crm.support_demands set unassigned_since=now()-interval '3 hours' where id='${id}'`);
 await db.exec(`select crm.scan_support_demands()`);
 assert.equal(await count(db,`kind='UNASSIGNED' and recipient='${admin}'`),1);
 assert.equal(await scalar(db,`crm.scan_support_demands()`),0);
 // assigned: the period ends, no new alert
 await actor(db);
 await db.exec(`select crm.update_support_demand('${id}',1,'{"assigned_to":"${member}"}')`);
 assert.equal(await scalar(db,`select unassigned_since is null from crm.support_demands where id='${id}'`),true);
 await db.exec(`reset role;select crm.scan_support_demands()`);
 assert.equal(await count(db,`kind='UNASSIGNED'`),1);
 // unassigned again: a new period starts now, so nothing before 1 hour...
 await actor(db);
 await db.exec(`select crm.update_support_demand('${id}',2,'{"assigned_to":null}')`);
 await db.exec(`reset role;select crm.scan_support_demands()`);
 assert.equal(await count(db,`kind='UNASSIGNED'`),1);
 // ...and one more alert once that new period is older than 1 hour
 await db.exec(`update crm.support_demands set unassigned_since=now()-interval '90 minutes' where id='${id}'`);
 await db.exec(`select crm.scan_support_demands()`);
 assert.equal(await count(db,`kind='UNASSIGNED' and recipient='${admin}'`),2);
 assert.equal(await scalar(db,`crm.scan_support_demands()`),0);
 }finally{await db.close();}
});

test('alerts: reopening an overdue demand starts a new alert cycle for the assignee',async()=>{
 const db=await banco();try{
 await actor(db);
 const id=await scalar(db,`crm.create_support_demand('${org}','Vencida','',null,'NORMAL',now()-interval '10 hours','${member}','${r1}')`);
 await db.exec(`reset role;select crm.scan_support_demands()`);
 assert.equal(await count(db,`kind='OVERDUE' and demand_id='${id}'`),1);
 await actor(db);
 await db.exec(`select crm.update_support_demand('${id}',${await version(db,id)},'{"status":"RESOLVED"}')`);
 await db.exec(`reset role;select crm.scan_support_demands()`);
 assert.equal(await count(db,`kind='OVERDUE' and demand_id='${id}'`),1,'resolved demands do not alert');
 await actor(db);
 await db.exec(`select crm.update_support_demand('${id}',${await version(db,id)},'{"status":"IN_PROGRESS"}')`);
 assert.equal(await scalar(db,`select reopen_count from crm.support_demands where id='${id}'`),1);
 await db.exec(`reset role;select crm.scan_support_demands()`);
 assert.equal(await count(db,`kind='OVERDUE' and demand_id='${id}' and recipient='${member}'`),2,'reopened overdue demand warns again');
 assert.equal(await scalar(db,`crm.scan_support_demands()`),0,'and only once');
 // changing between active states is not a reopening
 await actor(db);
 await db.exec(`select crm.update_support_demand('${id}',${await version(db,id)},'{"status":"WAITING"}')`);
 assert.equal(await scalar(db,`select reopen_count from crm.support_demands where id='${id}'`),1);
 }finally{await db.close();}
});
