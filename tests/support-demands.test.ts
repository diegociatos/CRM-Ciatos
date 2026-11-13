import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const user='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222';
const org='00000000-0000-4000-8000-000000000001', org2='00000000-0000-4000-8000-000000000002';
const req='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
async function banco(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;`);
 const files=readdirSync('supabase/migrations').sort();
 for(let i=0;i<files.length;i++){
  await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
  if(i===1) await db.exec(`insert into auth.users values('${user}');insert into crm.profiles(id,nome,email,papel) values('${user}','Admin','admin@test.local','ADMIN');`);
 }
 await db.exec(`insert into auth.users values('${other}');insert into crm.profiles(id,nome,email,papel) values('${other}','Other','other@test.local','SDR');insert into crm.organizations(id,nome,slug) values('${org2}','Other','other');insert into crm.organization_members(organization_id,user_id) values('${org2}','${other}');`);
 return db;
}
async function actor(db:PGlite,id=user){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);}
async function scalar<T=any>(db:PGlite,sql:string){return (await db.query<{v:T}>(`select (${sql}) v`)).rows[0].v;}
test('demands: audited lifecycle, nullable client, idempotency, clear fields and optimistic concurrency',async()=>{
 const db=await banco();try{
 await actor(db);
 const create=`crm.create_support_demand('${org}','  Pedido fiscal  ','Contexto',null,'HIGH',now(),'${user}','${req}')`;
 const id=await scalar(db,create);
 assert.equal(await scalar(db,create),id);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity`),1);
 assert.equal(await scalar(db,`select title from crm.support_demands where id='${id}'`),'Pedido fiscal');
 assert.equal(await scalar(db,`crm.update_support_demand('${id}',1,'{"status":"IN_PROGRESS","priority":"URGENT"}')`),2);
 await assert.rejects(db.exec(`select crm.update_support_demand('${id}',1,'{"title":"stale"}')`),/reload/);
 assert.equal(await scalar(db,`crm.update_support_demand('${id}',2,'{}')`),2);
 assert.equal(await scalar(db,`crm.update_support_demand('${id}',2,'{"status":"RESOLVED","assigned_to":null,"due_at":null}')`),3);
 assert.equal(await scalar(db,`select resolved_at is not null and assigned_to is null and due_at is not null and sla_due from crm.support_demands where id='${id}'`),true);
 await db.exec(`select crm.update_support_demand('${id}',3,'{"status":"OPEN"}')`);
 assert.equal(await scalar(db,`select resolved_at is null from crm.support_demands where id='${id}'`),true);
 const note=await scalar(db,`crm.add_support_demand_note('${id}','  Nota interna  ','${req}')`);
 assert.equal(await scalar(db,`crm.add_support_demand_note('${id}','Nota interna','${req}')`),note);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity where kind='NOTE'`),1);
 const changes=await scalar(db,`select changes from crm.support_demand_activity where kind='UPDATED' order by created_at,id limit 1`);
 assert.ok(changes.before);assert.ok(changes.after);
 for(const patch of ['{"title":null}','{"priority":"INVALID"}','{"status":"INVALID"}','{"organization_id":"'+org2+'"}','{"created_by":"'+other+'"}','{"version":99}','{"description":123}','[]'])
  await assert.rejects(db.query(`select crm.update_support_demand($1,4,$2::jsonb)`,[id,patch]));
 await assert.rejects(db.exec(`select crm.add_support_demand_note('${id}',' ')`),/Invalid note/);
 await assert.rejects(db.exec(`select crm.create_support_demand('${org}','x')`));
 assert.equal(await scalar(db,`select version from crm.support_demands where id='${id}'`),4);
 }finally{await db.close();}
});
test('demands: tenant isolation, direct-write denial, active membership and protected RPCs',async()=>{
 const db=await banco();try{
 await db.exec(`insert into crm.leads(id,organization_id,nome) values('33333333-3333-4333-8333-333333333333','${org2}','Foreign');`);
 await actor(db);
 const id=await scalar(db,`crm.create_support_demand('${org}','Solicitação')`);
 await assert.rejects(db.exec(`select crm.create_support_demand('${org2}','Foreign')`),/Forbidden/);
 await assert.rejects(db.exec(`select crm.create_support_demand('${org}','Wrong lead','', '33333333-3333-4333-8333-333333333333')`),/Invalid lead/);
 await assert.rejects(db.exec(`select crm.create_support_demand('${org}','Wrong owner','',null,'NORMAL',null,'${other}')`),/Invalid assignee/);
 await assert.rejects(db.exec(`select crm.update_support_demand('${id}',1,'{"lead_id":"33333333-3333-4333-8333-333333333333"}')`),{code:'23514'});
 await assert.rejects(db.exec(`select crm.update_support_demand('${id}',1,'{"assigned_to":"${other}"}')`),/Invalid assignee/);
 for(const sql of [`insert into crm.support_demands(organization_id,title,created_by) values('${org}','Bypass','${user}')`,`update crm.support_demands set title='Bypass'`,`delete from crm.support_demands`,`insert into crm.support_demand_activity(organization_id,demand_id,actor_id,kind) values('${org}','${id}','${user}','CREATED')`,`update crm.support_demand_activity set body='tamper'`,`delete from crm.support_demand_activity`]) await assert.rejects(db.exec(sql),/permission denied/);
 await actor(db,other);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands`),0);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity`),0);
 await assert.rejects(db.exec(`select crm.update_support_demand('${id}',1,'{"title":"cross tenant"}')`),/unavailable/);
 await assert.rejects(db.exec(`select crm.add_support_demand_note('${id}','cross tenant')`),/unavailable/);
 await db.exec(`reset role; update crm.organization_members set ativo=false where organization_id='${org}' and user_id='${user}';`);
 await actor(db);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands`),0);
 await assert.rejects(db.exec(`select crm.create_support_demand('${org}','Blocked')`),/Forbidden/);
 await assert.rejects(db.exec(`select crm.add_support_demand_note('${id}','Blocked')`),/unavailable/);
 await db.exec(`reset role; update crm.organization_members set ativo=true where organization_id='${org}' and user_id='${user}';update crm.profiles set ativo=false where id='${user}';`);
 await actor(db);
 await assert.rejects(db.exec(`select crm.update_support_demand('${id}',1,'{}')`),/unavailable/);
 await db.exec(`reset role;update crm.profiles set ativo=true where id='${user}';update crm.organizations set ativo=false where id='${org}';`);
 await actor(db);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands`),0);
 await assert.rejects(db.exec(`select crm.create_support_demand('${org}','Inactive company')`),/Forbidden/);
 await db.exec('reset role;set role anon');
 for(const sql of [`select * from crm.support_demands`,`select * from crm.support_demand_activity`,`select crm.create_support_demand('${org}','Anonymous')`,`select crm.update_support_demand('${id}',1,'{}')`,`select crm.add_support_demand_note('${id}','Anonymous')`]) await assert.rejects(db.exec(sql),/permission denied/);
 }finally{await db.close();}
});
test('demands: privacy export and erasure stay scoped to immutable client links',async()=>{
 const db=await banco();try{
 await actor(db);
 const lead=(await db.query<{id:string}>(`insert into crm.leads(organization_id,nome,email) values('${org}','Client A','privacy@example.test') returning id`)).rows[0].id;
 const second=(await db.query<{id:string}>(`insert into crm.leads(organization_id,nome,email) values('${org}','Client B','second@example.test') returning id`)).rows[0].id;
 const id=await scalar(db,`crm.create_support_demand('${org}','Solicitação privada A','Dados de A','${lead}')`);
 const linked=await scalar(db,`crm.create_support_demand('${org}','Solicitação privada B','Dados de B','${second}')`);
 const internal=await scalar(db,`crm.create_support_demand('${org}','Demanda interna')`);
 await db.exec(`select crm.add_support_demand_note('${id}','Nota privada A');select crm.add_support_demand_note('${linked}','Nota privada B');`);
 // Reassign, unlink and link an internal demand all fail atomically.
 for(const [demand,next] of [[id,second],[id,null],[internal,lead],[linked,lead]]){
  await assert.rejects(db.query(`select crm.update_support_demand($1,1,$2::jsonb)`,[demand,JSON.stringify({lead_id:next,title:'Must not save'})]),
   (error:any)=>error.code==='23514' && /contato.*não pode ser alterado/.test(error.message));
 }
 assert.equal(await scalar(db,`crm.update_support_demand('${id}',1,'{"lead_id":"${lead}"}')`),1,'same contact is a no-op');
 assert.equal(await scalar(db,`crm.update_support_demand('${internal}',1,'{"lead_id":null}')`),1,'same internal link is a no-op');
 assert.equal(await scalar(db,`crm.update_support_demand('${linked}',1,'{"lead_id":"${second}","status":"IN_PROGRESS"}')`),2,'unchanged contact allows other edits');
 assert.equal(await scalar(db,`select title from crm.support_demands where id='${id}'`),'Solicitação privada A');
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity where demand_id='${id}'`),2,'rejected/no-op changes append no audit');
 await db.exec('reset role');
 const conversation=(await db.query<{id:string}>(`insert into crm.inbox_conversations(organization_id,lead_id) values('${org}','${lead}') returning id`)).rows[0].id;
 await db.exec(`insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,body,received_at) values('${conversation}','${org}','INBOUND','microsoft365','Mensagem preservada','2026-11-01T12:00:00Z');`);
 await actor(db);
 const exported=await scalar(db,`crm.lead_privacy_export('${lead}')`);
 assert.equal(exported.inbox_messages.length,1,'existing inbox privacy export preserved');
 assert.equal(exported.inbox_messages[0].body,'Mensagem preservada');
 assert.equal(exported.inbox_messages[0].conversation_id,conversation);
 assert.deepEqual(Object.keys(exported).sort(),['lead','interactions','events','ai_runs','handoffs','inbox_messages','support_demands','support_demand_activity','support_demand_tasks'].sort());
 assert.deepEqual(exported.support_demand_tasks,[],'task export is empty when no tasks belong to this contact');
 assert.deepEqual(exported.support_demands.map((d:any)=>d.id),[id]);
 assert.equal(exported.support_demand_activity.length,2);
 assert.ok(exported.support_demand_activity.every((a:any)=>a.demand_id===id));
 assert.ok(!JSON.stringify(exported).includes('Dados de B'));
 const secondExport=await scalar(db,`crm.lead_privacy_export('${second}')`);
 assert.deepEqual(secondExport.support_demands.map((d:any)=>d.id),[linked]);
 assert.ok(secondExport.support_demand_activity.every((a:any)=>a.demand_id===linked));
 await actor(db,other);
 await assert.rejects(db.exec(`select crm.lead_privacy_export('${lead}')`),/Forbidden/);
 await assert.rejects(db.exec(`select crm.erase_lead('${lead}')`),/Forbidden/);
 await actor(db);
 await db.exec(`select crm.erase_lead('${lead}')`);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands where id='${id}'`),0);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity where demand_id='${id}'`),0);
 assert.equal(await scalar(db,`select count(*)::int from crm.leads where id='${lead}'`),0);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands where id='${linked}'`),1,'A erasure preserves B demand');
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity where demand_id='${linked}'`),3,'A erasure preserves B history');
 assert.equal(await scalar(db,`select count(*)::int from crm.leads where id='${second}'`),1);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands where id='${internal}'`),1);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity where demand_id='${internal}'`),1);
 await db.exec(`delete from crm.leads where id='${second}'`);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands where id='${linked}'`),0,'ordinary lead deletion also cascades');
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demand_activity where demand_id='${linked}'`),0);
 assert.equal(await scalar(db,`select count(*)::int from crm.support_demands where id='${internal}'`),1);
 }finally{await db.close();}
});
