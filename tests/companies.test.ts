import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('company registration, shared users and complete operational isolation',async()=>{
 const db=new PGlite();const admin='11111111-1111-4111-8111-111111111111',member='22222222-2222-4222-8222-222222222222',outsider='33333333-3333-4333-8333-333333333333';
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;`);
 const files=readdirSync('supabase/migrations').sort();for(let i=0;i<files.length;i++){
  await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
  if(i===0)await db.exec(`insert into auth.users values('${admin}'),('${member}'),('${outsider}');insert into crm.profiles(id,nome,email,papel) values('${admin}','Admin','admin@example.test','ADMIN'),('${member}','Equipe','equipe@example.test','SDR'),('${outsider}','Outro','outro@example.test','SDR');`);
 }
 await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${admin}',false);`);
 const a=(await db.query<any>(`select crm.save_company(null,'Contabilidade','{"cnpj":"exemplo"}') id`)).rows[0].id;
 const b=(await db.query<any>(`select crm.save_company(null,'Jurídico','{}') id`)).rows[0].id;
 assert.equal((await db.query(`select * from crm.my_companies()`)).rows.length,3);
 await db.exec(`select crm.set_company_member('${a}','equipe@example.test','SDR');select crm.set_company_member('${b}','equipe@example.test','CLOSER');select crm.set_company_member('${b}','outro@example.test','SDR');`);
 const leadA=(await db.query<any>(`insert into crm.leads(organization_id,nome,cnpj_raw,owner_id) values('${a}','Cliente A','00000000000000','${member}') returning id`)).rows[0].id;
 const leadB=(await db.query<any>(`insert into crm.leads(organization_id,nome,cnpj_raw) values('${b}','Cliente B','00000000000000') returning id`)).rows[0].id;
 await assert.rejects(db.exec(`insert into crm.leads(organization_id,nome,cnpj_raw) values('${a}','Duplicado','00000000000000')`));
 await assert.rejects(db.exec(`insert into crm.leads(organization_id,owner_id) values('${a}','${outsider}')`));
 await assert.rejects(db.exec(`update crm.leads set organization_id='${b}' where id='${leadA}'`));
 await assert.rejects(db.exec(`insert into crm.interactions(organization_id,lead_id,tipo) values('${b}','${leadA}','NOTE')`));
 await assert.rejects(db.exec(`insert into crm.agenda_events(organization_id,lead_id,titulo,inicio) values('${b}','${leadA}','Cruzado',now())`));
 for(const org of [a,b]){
  const lead=org===a?leadA:leadB;
  await db.exec(`update crm.config set dados=jsonb_build_object('company','${org}') where organization_id='${org}';
   insert into crm.onboarding_templates(id,organization_id,dados) values('same-id','${org}','{}');
   insert into crm.user_goals(organization_id,user_id,mes,ano) values('${org}','${member}',0,2026);
   insert into crm.interactions(organization_id,lead_id,tipo) values('${org}','${lead}','NOTE');
   insert into crm.agenda_events(organization_id,lead_id,titulo,inicio) values('${org}','${lead}','Atividade',now());
   insert into crm.scripts(organization_id,dados) values('${org}','{}');
   insert into crm.email_templates(organization_id,nome,assunto,corpo) values('${org}','Template','Assunto','Corpo');
   insert into crm.mining_jobs(organization_id) values('${org}');`);
 }
 const job=(await db.query<any>(`select id from crm.mining_jobs where organization_id='${a}'`)).rows[0].id;
 await assert.rejects(db.exec(`insert into crm.mining_leads(organization_id,job_id) values('${b}','${job}')`));
 await db.exec(`insert into crm.mining_leads(organization_id,job_id) values('${a}','${job}');select set_config('request.jwt.claim.sub','${member}',false);`);
 assert.equal((await db.query<any>(`select crm.company_role('${b}') role`)).rows[0].role,'CLOSER');
 await assert.rejects(db.exec(`select crm.save_company(null,'Não autorizado','{}')`));
 await assert.rejects(db.exec(`select crm.set_company_member('${a}','outro@example.test','ADMIN')`));
 await assert.rejects(db.exec(`update crm.profiles set papel='ADMIN' where id='${member}'`));
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);select crm.set_company_member('${a}','equipe@example.test','SDR',false);select set_config('request.jwt.claim.sub','${member}',false);`);
 assert.equal((await db.query<any>(`select crm.tenant_member('${a}') allowed`)).rows[0].allowed,false);
 assert.equal((await db.query<any>(`select crm.tenant_member('${b}') allowed`)).rows[0].allowed,true);
 for(const table of ['leads','config','interactions','agenda_events','scripts','onboarding_templates','email_templates','user_goals','mining_jobs','mining_leads','audit_logs']){
  assert.equal((await db.query(`select * from crm.${table} where organization_id='${a}'`)).rows.length,0,table+' must not leak');
 }
 await assert.rejects(db.exec(`insert into crm.leads(organization_id,nome) values('${a}','Intruso')`));
 const update=await db.query(`update crm.leads set nome='Intruso' where id='${leadA}' returning id`);assert.equal(update.rows.length,0);
 assert.equal((await db.query(`select * from crm.leads where organization_id='${b}'`)).rows.length,1);
 assert.equal((await db.query(`select * from crm.company_users('${a}')`)).rows.length,0);
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
 await assert.rejects(db.exec(`select crm.set_company_member('${a}','admin@example.test','SDR',false)`));
 assert.equal((await db.query<any>(`select live_enabled from crm.outreach_policy where organization_id='${a}'`)).rows[0].live_enabled,false);

 // Platform ownership and customer master access must remain separate.
 await db.exec(`select crm.assign_company_master('${a}','equipe@example.test');select set_config('request.jwt.claim.sub','${member}',false);`);
 assert.equal((await db.query<any>(`select crm.platform_admin() allowed`)).rows[0].allowed,false);
 assert.equal((await db.query<any>(`select crm.can_manage_company('${a}') allowed`)).rows[0].allowed,true);
 assert.equal((await db.query<any>(`select crm.can_manage_company('${b}') allowed`)).rows[0].allowed,false);
 await db.exec(`select crm.save_company('${a}','Empresa editada','{}');select crm.set_company_member('${a}','outro@example.test','ADMIN');`);
 await assert.rejects(db.exec(`select * from crm.platform_clients()`));
 await assert.rejects(db.exec(`select crm.save_company(null,'Cliente indevido','{}')`));
 await assert.rejects(db.exec(`select crm.save_company('${b}','Empresa invadida','{}')`));
 await assert.rejects(db.exec(`select crm.assign_company_master('${b}','equipe@example.test')`));
 await assert.rejects(db.exec(`insert into crm.platform_admins(user_id) values('${member}')`));
 await assert.rejects(db.exec(`update crm.organization_members set is_master=true where user_id='${member}'`));
 await assert.rejects(db.exec(`select crm.set_company_member('${a}','equipe@example.test','SDR',false)`));
 await db.exec(`select set_config('request.jwt.claim.sub','${outsider}',false)`);
 assert.equal((await db.query<any>(`select crm.can_manage_company('${a}') allowed`)).rows[0].allowed,false,'ordinary company ADMIN cannot become master');
 await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false)`);
 const clients=(await db.query<any>(`select * from crm.platform_clients()`)).rows;
 assert.equal(clients.find(c=>c.id===a).master_email,'equipe@example.test');
 }finally{await db.close();}
});
