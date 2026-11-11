import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {emptyIntake,intakeError,intakePayload} from '../lib/supportIntake';

test('manual call fields validate without implying provider delivery or copying stale call data to email',()=>{
 const d={...emptyIntake(),name:'Ana',phone:'(31) 99999-9999',duration_seconds:120};
 assert.equal(intakeError(d),null);
 assert.ok(intakeError({...d,outcome:'MISSED'}));assert.ok(intakeError({...d,phone:'1'}));
 assert.ok(intakeError({...d,channel:'email',email:''}));
 assert.deepEqual(intakePayload({...d,channel:'email',email:' ANA@EXAMPLE.TEST '}),{channel:'email',name:'Ana',company:'',phone:'(31) 99999-9999',email:'ana@example.test'});
});

test('manual intake uses tenant and confidential demand permissions, keeps idempotency and creates no outbound work',async()=>{
 const db=new PGlite(),admin='11111111-1111-4111-8111-111111111111',agent='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
 const org='00000000-0000-4000-8000-000000000001',org2='00000000-0000-4000-8000-000000000002',rid='44444444-4444-4444-8444-444444444444';
 try{
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,service_role;`);
  const files=readdirSync('supabase/migrations').sort();for(let i=0;i<files.length;i++){
   await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
   if(i===1)await db.exec(`insert into auth.users values('${admin}');insert into crm.profiles(id,nome,email,papel) values('${admin}','Admin','admin@example.test','ADMIN');`);
  }
  await db.exec(`insert into auth.users values('${agent}'),('${other}');insert into crm.profiles(id,nome,email,papel) values('${agent}','Suporte','agent@example.test','SDR'),('${other}','Outro','other@example.test','SDR');insert into crm.organizations(id,nome,slug) values('${org2}','Outra','outra');insert into crm.organization_members(organization_id,user_id,papel,operating_role) values('${org}','${agent}','MEMBER','SUPPORT'),('${org2}','${other}','MEMBER','SUPPORT');update crm.organization_members set papel='ADMIN' where organization_id='${org}' and user_id='${admin}';`);
  const actor=async(id:string)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
  const details={channel:'phone',name:'Ana',phone:'31999999999',email:'ana@example.test',company:'Empresa',direction:'INBOUND',outcome:'CALLBACK',duration_seconds:120};
  const call=async(o=org,key=rid,d=details,conf=true,assigned:string|null=agent)=>{
   const r=await db.query<{id:string}>('select crm.create_support_intake($1,$2::jsonb,$3,$4,$5,$6,$7,$8) id',[o,JSON.stringify(d),'Retornar ligação','Cliente precisa de retorno','HIGH',assigned,conf,key]);return r.rows[0].id;
  };
  await actor(admin);const id=await call();assert.equal(await call(),id);
  await assert.rejects(call(org,rid,{...details,name:'Alterado'}),/different content/);
  await assert.rejects(call(org,rid,details,true,other),/different content/);
  await assert.rejects(call(org,'55555555-5555-4555-8555-555555555555',details,false,other),/Invalid assignee/);
  await assert.rejects(call(org2),/Forbidden/);
  await db.exec('reset role');const row=(await db.query<any>('select * from crm.support_demands where id=$1',[id])).rows[0];
  assert.equal(row.intake.source,'manual');assert.equal(row.intake.channel,'phone');assert.equal(row.intake.outcome,'CALLBACK');assert.equal(row.lead_id,null);assert.ok(row.due_at);assert.equal(row.confidential,true);
  assert.equal((await db.query<any>('select count(*)::int n from crm.support_demands')).rows[0].n,1);
  for(const table of ['leads','sequence_enrollments','automation_jobs','sdr_queue','inbox_messages'])assert.equal((await db.query<any>(`select count(*)::int n from crm.${table}`)).rows[0].n,0,table);
  const audit=(await db.query<any>('select changes from crm.support_demand_activity where demand_id=$1',[id])).rows[0];assert.equal(audit.changes.after.intake.source,'manual');
  await actor(other);assert.equal((await db.query('select * from crm.support_demands where id=$1',[id])).rows.length,0);await assert.rejects(call(),/Forbidden/);
  await db.exec(`reset role;insert into crm.organization_members(organization_id,user_id,papel,operating_role) values('${org}','${other}','MEMBER','SUPPORT');`);
  await actor(other);assert.equal((await db.query('select * from crm.support_demands where id=$1',[id])).rows.length,0,'another member cannot see a confidential intake');
  await actor(agent);assert.equal((await db.query('select * from crm.support_demands where id=$1',[id])).rows.length,1);
  await assert.rejects(db.exec(`update crm.support_demands set intake='{}' where id='${id}'`));
  const own=await call(org,'66666666-6666-4666-8666-666666666666',details,false);assert.ok(own);
  await assert.rejects(call(org,'77777777-7777-4777-8777-777777777777',{...details,phone:'bad'}),/telefone/);
  await db.exec('reset role;set role anon');await assert.rejects(call());
 }finally{await db.close();}
});
