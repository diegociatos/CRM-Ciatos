import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
test('platform console manages contracts, quotas, access, finance and support without tenant escalation',async()=>{
 const db=new PGlite();const owner='11111111-1111-4111-8111-111111111111',master='22222222-2222-4222-8222-222222222222',staff='33333333-3333-4333-8333-333333333333';
 const api=async(action:string,payload:any={})=>(await db.query<any>('select crm.platform_console($1,$2::jsonb) result',[action,JSON.stringify(payload)])).rows[0].result;
 const as=async(id:string)=>db.exec(`select set_config('request.jwt.claim.sub','${id}',false)`);
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;`);
 const files=readdirSync('supabase/migrations').sort();for(let i=0;i<files.length;i++){
 await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
 if(i===0)await db.exec(`insert into auth.users values('${owner}'),('${master}'),('${staff}');insert into crm.profiles(id,nome,email,papel) values('${owner}','Owner','owner@example.test','ADMIN'),('${master}','Master','master@example.test','SDR'),('${staff}','Staff','staff@example.test','SDR');`);
 }
 await db.exec('set role authenticated');await as(owner);
 const org=(await api('client_save',{name:'Cliente de teste',cnpj:'11222333000181',brand_name:'Marca teste',color:'#123456'})).id;
 await assert.rejects(api('client_save',{name:'Duplicada',cnpj:'11222333000181'}));
 assert.equal((await db.query<any>(`select crm.tenant_member('${org}') ok`)).rows[0].ok,false,'owner console must not grant operational access');
 const plan=(await api('plan_save',{name:'Plano teste',monthly_cents:9900,annual_cents:99000,max_users:1,max_leads:1,active:true})).id;
 const account={organization_id:org,plan_id:plan,status:'active',billing_cycle:'monthly',price_cents:8900,onboarding:'ready'};
 await api('account_save',account);
 await api('member_save',{organization_id:org,user_id:master,role:'ADMIN',is_master:true,active:true});
 // Idempotent upsert at the user limit must continue to work.
 await api('member_save',{organization_id:org,user_id:master,role:'ADMIN',is_master:true,active:true});
 await assert.rejects(api('member_save',{organization_id:org,user_id:staff,role:'SDR',is_master:false,active:true}),/Limite/);
 await assert.rejects(api('member_save',{organization_id:org,user_id:master,role:'ADMIN',is_master:false,active:true}),/outro master/);
 await as(master);
 await assert.rejects(api('snapshot'),/exclusivo/);
 await assert.rejects(api('settings_save',{product_name:'Invadido'}));
 await assert.rejects(db.exec(`update crm.platform_accounts set status='internal'`));
 const lead=(await db.query<any>(`insert into crm.leads(organization_id,nome,email) values('${org}','Contato','contact@example.test') returning id`)).rows[0].id;
 await assert.rejects(db.exec(`insert into crm.leads(organization_id,nome) values('${org}','Excedente')`),/Limite/);
 const cadence=(await db.query<any>(`select crm.create_cadence('${org}','Teste','Assunto','Mensagem',2) id`)).rows[0].id;
 await db.exec(`select crm.set_cadence_state('${cadence}','ACTIVE');select crm.enroll_lead('${cadence}','${lead}',true)`);
 await as(owner);await api('account_save',{...account,status:'suspended'});
 await as(master);assert.equal((await db.query(`select * from crm.leads where organization_id='${org}'`)).rows.length,0);
 assert.equal((await db.query<any>(`select crm.tenant_member('${org}') ok`)).rows[0].ok,false);
 await as(owner);await api('account_save',account);
 await as(master);assert.equal((await db.query<any>(`select status from crm.sequence_enrollments where organization_id='${org}'`)).rows[0].status,'PAUSED','reactivation must not restart messages');
 await as(owner);await api('account_save',{...account,status:'trial',trial_ends_on:'2000-01-01'});
 await as(master);assert.equal((await db.query<any>(`select crm.tenant_member('${org}') ok`)).rows[0].ok,false);
 await as(owner);await api('account_save',{...account,status:'past_due'});
 await as(master);assert.equal((await db.query<any>(`select crm.tenant_member('${org}') ok`)).rows[0].ok,true);
 await as(owner);
 const invoice={organization_id:org,reference:'TEST-1',description:'Mensalidade teste',amount_cents:8900,due_on:'2026-10-01',status:'pending'};
 const invoiceId=(await api('invoice_save',invoice)).id;
 await api('invoice_save',{...invoice,id:invoiceId,status:'paid'});
 await assert.rejects(api('invoice_save',{...invoice,id:invoiceId,amount_cents:1,status:'pending'}),/liquidado/);
 await api('invoice_save',{...invoice,id:invoiceId,amount_cents:1,status:'void',notes:'Pagamento registrado incorretamente'});
 const ticketId=(await api('ticket_save',{organization_id:org,subject:'Configurar acesso',body:'Dúvida teste',priority:'high',status:'open'})).id;
 await assert.rejects(api('ticket_save',{id:ticketId,subject:'Configurar acesso',priority:'high',status:'resolved'}),/resolução/);
 await api('ticket_save',{id:ticketId,organization_id:org,subject:'Configurar acesso',priority:'normal',status:'resolved',resolution:'Acesso revisado'});
 await assert.rejects(api('settings_save',{product_name:'Teste',terms_url:'javascript:alert(1)'}));
 await api('settings_save',{product_name:'CRM teste',support_email:'support@example.test',terms_url:'https://example.test/terms',privacy_url:'https://example.test/privacy'});
 const snapshot=await api('snapshot');
 assert.equal(snapshot.clients.find((c:any)=>c.id===org).account.price_cents,8900);
 assert.equal(snapshot.invoices[0].amount_cents,8900,'paid amount is immutable');
 assert.equal(snapshot.invoices[0].status,'void');assert.equal(snapshot.tickets[0].status,'resolved');
 assert.equal(snapshot.settings.product_name,'CRM teste');assert.ok(snapshot.audit.length>=10);
 await api('plan_save',{id:plan,name:'Plano teste',monthly_cents:10000,annual_cents:100000,max_users:2,max_leads:2,active:true});
 await api('member_save',{organization_id:org,user_id:staff,role:'SDR',active:true});
 await assert.rejects(api('plan_save',{id:plan,name:'Plano teste',monthly_cents:10000,annual_cents:100000,max_users:1,max_leads:2,active:true}),/menor/);
 assert.equal((await api('snapshot')).clients.find((c:any)=>c.id===org).account.price_cents,8900,'catalog price never rewrites contracts');
 await db.exec('reset role;set role anon');await assert.rejects(api('snapshot'));
 }finally{await db.close();}
});
