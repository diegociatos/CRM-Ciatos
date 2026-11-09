import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', agent='33333333-3333-4333-8333-333333333333', seller='44444444-4444-4444-8444-444444444444', boss='55555555-5555-4555-8555-555555555555';
const org='00000000-0000-4000-8000-000000000001', org2='00000000-0000-4000-8000-000000000002';
async function banco(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;`);
 const files=readdirSync('supabase/migrations').sort();
 for(let i=0;i<files.length;i++){
  await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
  if(i===1) await db.exec(`insert into auth.users values('${admin}');insert into crm.profiles(id,nome,email,papel) values('${admin}','Admin','admin@test.local','ADMIN');`);
 }
 await db.exec(`insert into auth.users values('${other}'),('${agent}'),('${seller}'),('${boss}');
  insert into crm.profiles(id,nome,email,papel) values('${other}','Other','o@t.l','SDR'),('${agent}','Agente','a@t.l','SDR'),('${seller}','Vendedor','s@t.l','SDR'),('${boss}','Gestor','b@t.l','MANAGER');
  insert into crm.organizations(id,nome,slug) values('${org2}','Other','other');
  insert into crm.organization_members(organization_id,user_id) values('${org2}','${other}');
  insert into crm.organization_members(organization_id,user_id,papel,operating_role) values('${org}','${agent}','MEMBER','SDR'),('${org}','${seller}','MEMBER','SDR'),('${org}','${boss}','MEMBER','MANAGER');
  update crm.organization_members set papel='ADMIN' where organization_id='${org}' and user_id='${admin}';`);
 return db;
}
async function actor(db:PGlite,id=admin){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);}
async function scalar<T=any>(db:PGlite,sql:string){return (await db.query<{v:T}>(`select (${sql}) v`)).rows[0].v;}
let n=0;
async function lead(db:PGlite,o=org,name='Cliente'){await db.exec('reset role');return (await db.query<any>(`insert into crm.leads(organization_id,nome,empresa,email,cnpj_raw) values('${o}','${name}','Empresa ${name}','${name.toLowerCase().replace(/\W/g,'')}@cliente.test','${String(++n).padStart(14,'0')}') returning id`)).rows[0].id as string;}
async function conversation(db:PGlite,l:string,o=org,subject='Dúvida'){await db.exec('reset role');return (await db.query<any>(`insert into crm.inbox_conversations(organization_id,lead_id,subject) values('${o}','${l}','${subject}') returning id`)).rows[0].id as string;}
async function message(db:PGlite,c:string,direction:string,opts:{cls?:string|null;status?:string|null;at?:string;body?:string;o?:string}={}){
 await db.exec('reset role');
 return (await db.query<any>(`insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,sender,recipient,body,classification,delivery_status,received_at) values('${c}','${opts.o||org}','${direction}','${direction==='INTERNAL'?'crm':'microsoft365'}','x','y','${opts.body||'texto'}',${opts.cls?`'${opts.cls}'`:'null'},${opts.status?`'${opts.status}'`:'null'},${opts.at?`'${opts.at}'`:'now()'}) returning id`)).rows[0].id as string;}
const conv=(db:PGlite,c:string)=>db.query<any>(`select awaiting_human,first_human_reply_at,last_customer_message_at,reopen_count,status,resolved_at,resolution_note from crm.inbox_conversations where id='${c}'`).then(r=>r.rows[0]);
const queue=async(db:PGlite,scope:string,o=org,extra='')=>(await scalar(db,`crm.support_queue('${o}','${scope}','' ${extra})`)) as {total:number;rows:any[]};

test('perfil Suporte: atribuido so por administrador, negado fora do atendimento e sem acesso a leads',async()=>{
 const db=await banco();try{
 const l=await lead(db);await conversation(db,l);const l2=await lead(db,org,'SemConversa');
 await actor(db,seller);
 assert.ok(Number(await scalar(db,`select count(*)::int from crm.leads`))>=2,'acesso de quem ja existe nao muda');
 await assert.rejects(db.exec(`select crm.set_support_profile('${org}','${agent}',true)`),/Forbidden/);
 await actor(db);
 await assert.rejects(db.exec(`select crm.set_support_profile('${org}','${admin}',true)`),/Invalid member/,'nunca a si mesmo/administrador');
 await assert.rejects(db.exec(`select crm.set_support_profile('${org2}','${other}',true)`),/Forbidden/,'outra empresa');
 await db.exec(`select crm.set_support_profile('${org}','${agent}',true)`);
 assert.equal(await scalar(db,`select operating_role from crm.organization_members where organization_id='${org}' and user_id='${agent}'`),'SUPPORT');
 await actor(db,agent);
 assert.equal(await scalar(db,`select count(*)::int from crm.leads`),0,'Suporte nao le a tabela de leads');
 assert.equal(await scalar(db,`crm.tenant_member('${org}')`),false);
 assert.equal(await scalar(db,`crm.support_member('${org}')`),true);
 assert.equal(await scalar(db,`(select count(*)::int from crm.my_companies())`),1,'Suporte ainda enxerga a propria empresa');
 const contacts=await db.query<any>(`select * from crm.support_contacts('${org}',array['${l}','${l2}']::uuid[])`);
 assert.deepEqual(contacts.rows.map(r=>r.id),[l],'so contatos com conversa');
 await assert.rejects(db.exec(`select crm.save_support_desk_settings('${org}',2,10)`),/Forbidden/);
 await assert.rejects(db.exec(`select crm.support_desk_overview('${org}',now()-interval '1 day',now())`),/Forbidden/);
 await assert.rejects(db.exec(`select crm.support_queue('${org2}','open')`),/Forbidden/);
 assert.equal(await scalar(db,`(select count(*)::int from crm.inbox_conversations)`),1);
 assert.equal(await scalar(db,`(crm.get_support_settings('${org}')->>'can_manage')`),'false');
 await db.exec(`select crm.create_support_demand('${org}','Demanda do Suporte','',null,'NORMAL',null,null,gen_random_uuid())`);
 await actor(db);
 await assert.rejects(db.exec(`select crm.set_support_profile('${org}','${agent}',false,'ADMIN')`),/Invalid role/);
 await db.exec(`select crm.set_support_profile('${org}','${agent}',false,'CS')`);
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_audit where action like 'SUPPORT_PROFILE%')`),2);
 await actor(db,agent);
 assert.ok(Number(await scalar(db,`select count(*)::int from crm.leads`))>=2,'ao reverter volta ao acesso do perfil escolhido');
 }finally{await db.close();}
});

test('atendimento: resposta humana aceita, incerta, fora de ordem, nota interna e reabertura',async()=>{
 const db=await banco();try{
 const l=await lead(db);const c=await conversation(db,l);
 await message(db,c,'INBOUND',{cls:'automatic',at:'2026-01-01T10:00:00Z'});
 assert.equal((await conv(db,c)).awaiting_human,false,'resposta automatica do cliente nao exige retorno');
 await message(db,c,'INBOUND',{cls:'review',at:'2026-01-01T10:05:00Z'});
 let s=await conv(db,c);assert.equal(s.awaiting_human,true);assert.equal(s.first_human_reply_at,null);
 await message(db,c,'INTERNAL',{});
 assert.equal((await conv(db,c)).awaiting_human,true,'nota interna nao e resposta');
 const out=await message(db,c,'OUTBOUND',{status:'SENDING',at:'2026-01-01T10:20:00Z'});
 s=await conv(db,c);assert.equal(s.awaiting_human,true,'enviando nao conta');assert.equal(s.first_human_reply_at,null);
 await actor(db,boss);
 assert.equal((await queue(db,'uncertain')).total,1);
 await db.exec(`reset role;update crm.inbox_messages set delivery_status='REVIEW' where id='${out}'`);
 s=await conv(db,c);assert.equal(s.awaiting_human,true,'resultado incerto nao conta como resposta');
 await db.exec(`update crm.inbox_messages set delivery_status='ACCEPTED' where id='${out}'`);
 s=await conv(db,c);assert.equal(s.awaiting_human,false);assert.ok(s.first_human_reply_at);
 await actor(db,boss);assert.equal((await queue(db,'uncertain')).total,0);
 await message(db,c,'INBOUND',{cls:'review',at:'2026-01-02T09:00:00Z'});
 s=await conv(db,c);assert.equal(s.awaiting_human,true);assert.ok(s.first_human_reply_at);
 await message(db,c,'OUTBOUND',{status:'ACCEPTED',at:'2026-01-02T09:30:00Z'});
 assert.equal((await conv(db,c)).awaiting_human,false);
 await message(db,c,'INBOUND',{cls:'review',at:'2026-01-02T09:10:00Z'});
 assert.equal((await conv(db,c)).awaiting_human,false,'evento fora de ordem');
 await actor(db,boss);
 await assert.rejects(db.exec(`select crm.support_resolve('${c}','  ')`),/Resolution note required/);
 await db.exec(`select crm.support_resolve('${c}','Guia enviada e confirmada')`);
 s=await conv(db,c);assert.equal(s.status,'CLOSED');assert.ok(s.resolved_at);assert.equal(s.resolution_note,'Guia enviada e confirmada');assert.equal(s.awaiting_human,false);
 await assert.rejects(db.exec(`select crm.support_resolve('${c}','de novo')`),/unavailable/);
 await db.exec(`select crm.update_inbox_conversation('${c}','OPEN',null)`);
 s=await conv(db,c);assert.equal(s.reopen_count,1);assert.equal(s.resolved_at,null);assert.equal(s.resolution_note,null);
 }finally{await db.close();}
});

test('fila e painel: escopos coerentes, assumir sem corrida, gestor e isolamento entre empresas',async()=>{
 const db=await banco();try{
 const a=await conversation(db,await lead(db,org,'Alfa'));const b=await conversation(db,await lead(db,org,'Beta'));await conversation(db,await lead(db,org,'Gama'));
 const x=await conversation(db,await lead(db,org2,'Externo'),org2);
 await message(db,a,'INBOUND',{cls:'hot',at:new Date(Date.now()-6*3600e3).toISOString()});
 await message(db,b,'INBOUND',{cls:'review'});
 await message(db,x,'INBOUND',{cls:'review',o:org2});
 await db.exec(`update crm.inbox_conversations set created_at=now()-interval '6 hours' where id='${a}'`);
 await actor(db,boss);
 assert.equal((await queue(db,'awaiting_first')).total,2);
 const att=await queue(db,'attention');assert.equal(att.total,1,'so a de 6h passou do prazo de 1a resposta de 4h');assert.equal(att.rows[0].id,a);assert.equal(att.rows[0].reply_overdue,true);
 assert.equal((await queue(db,'unassigned')).total,3);
 assert.ok(!(await queue(db,'all')).rows.some(r=>r.id===x),'outra empresa nao aparece');
 assert.equal(((await scalar(db,`crm.support_queue('${org}','all','Alfa')`)) as any).total,1);
 await actor(db,agent);
 assert.equal(await scalar(db,`crm.support_assume('${a}')`),true);assert.equal(await scalar(db,`crm.support_assume('${a}')`),true);
 await actor(db,seller);
 assert.equal(await scalar(db,`crm.support_assume('${a}')`),false);
 await assert.rejects(db.exec(`select crm.support_resolve('${a}','tentativa indevida')`),/assigned to another/);
 await actor(db,agent);
 assert.equal((await queue(db,'mine')).total,1);
 assert.equal(await scalar(db,`crm.support_queue_counts('${org}')->>'mine'`),'1');
 await actor(db,boss);
 const ov=await scalar(db,`crm.support_desk_overview('${org}',now()-interval '1 day',now()+interval '1 day')`);
 assert.equal(ov.received,3);assert.equal(ov.awaiting_first,(await queue(db,'awaiting_first')).total);assert.equal(ov.unassigned,(await queue(db,'unassigned')).total);assert.equal(ov.attention,1);
 assert.equal(ov.auto_confirmation.enabled,false);
 assert.equal(ov.channels.find((c:any)=>c.channel==='email').status,'not_configured');
 assert.equal(ov.channels.find((c:any)=>c.channel==='whatsapp').status,'not_configured');
 assert.equal(((await scalar(db,`crm.support_queue('${org}','received','',50,0,null,now()-interval '1 day',now()+interval '1 day')`)) as any).total,ov.received);
 const empty=await scalar(db,`crm.support_desk_overview('${org}',now()+interval '1 day',now()+interval '2 days')`);
 assert.equal(empty.received,0);
 await assert.rejects(db.exec(`select crm.support_desk_overview('${org}',now(),now()-interval '1 day')`),/Invalid period/);
 await actor(db,seller);
 await assert.rejects(db.exec(`select crm.support_desk_overview('${org}',now()-interval '1 day',now())`),/Forbidden/);
 await actor(db,other);
 await assert.rejects(db.exec(`select crm.support_queue('${org}','open')`),/Forbidden/);
 await actor(db,boss);
 await assert.rejects(db.exec(`select crm.save_support_desk_settings('${org}',1,10)`),/Forbidden/);
 await actor(db);
 await db.exec(`select crm.save_support_desk_settings('${org}',8,48)`);
 await actor(db,boss);
 assert.equal((await queue(db,'attention')).total,0,'com 8 h a conversa de 6 h nao esta atrasada');
 assert.equal(await scalar(db,`crm.get_support_desk_settings('${org}')->>'first_response_hours'`),'8');
 }finally{await db.close();}
});

test('revisao: legado nao burla conclusao/atribuicao, confirmacao atrasada e reabertura mantem a espera correta',async()=>{
 const db=await banco();try{
 await actor(db);
 await db.exec(`select crm.set_support_profile('${org}','${agent}',true)`);
 const c=await conversation(db,await lead(db,org,'Revisao'));
 await message(db,c,'INBOUND',{cls:'review',at:'2026-03-01T10:00:00Z'});
 await actor(db,boss);
 await db.exec(`select crm.support_assume('${c}')`);
 // Suporte nao fecha nem rouba atendimento de outra pessoa pela RPC antiga
 await actor(db,agent);
 await assert.rejects(db.exec(`select crm.update_inbox_conversation('${c}','CLOSED',null)`),/justificativa/);
 await assert.rejects(db.exec(`select crm.update_inbox_conversation('${c}','IN_PROGRESS','${agent}')`),/assigned to another/);
 await actor(db,boss);
 // confirmacao atrasada de uma resposta antiga nao recria pendencia ja atendida
 const old=await message(db,c,'OUTBOUND',{status:'SENDING',at:'2026-03-01T09:00:00Z'});
 await message(db,c,'OUTBOUND',{status:'ACCEPTED',at:'2026-03-01T11:00:00Z'});
 assert.equal((await conv(db,c)).awaiting_human,false);
 await db.exec(`update crm.inbox_messages set delivery_status='ACCEPTED' where id='${old}'`);
 assert.equal((await conv(db,c)).awaiting_human,false,'resposta das 11h continua valendo');
 // fechar sem resposta aceita e reabrir restaura a espera
 const c2=await conversation(db,await lead(db,org,'Reabre'));
 await message(db,c2,'INBOUND',{cls:'hot',at:'2026-03-02T10:00:00Z'});
 await actor(db,boss);
 await db.exec(`select crm.support_resolve('${c2}','Resolvido por telefone')`);
 assert.equal((await conv(db,c2)).awaiting_human,false);
 await db.exec(`select crm.update_inbox_conversation('${c2}','OPEN',null)`);
 const s=await conv(db,c2);assert.equal(s.awaiting_human,true,'cliente continua sem resposta aceita');assert.equal(s.reopen_count,1);
 assert.equal((await queue(db,'awaiting_first')).rows.some((r:any)=>r.id===c2),true);
 // conversa fechada nao fica pendente por confirmacao tardia
 await db.exec(`reset role`);
 const c3=await conversation(db,await lead(db,org,'Fechada'));
 await message(db,c3,'INBOUND',{cls:'review',at:'2026-03-03T10:00:00Z'});
 const late=await message(db,c3,'OUTBOUND',{status:'SENDING',at:'2026-03-03T09:00:00Z'});
 await db.exec(`update crm.inbox_conversations set status='CLOSED' where id='${c3}'`);
 await db.exec(`update crm.inbox_messages set delivery_status='ACCEPTED' where id='${late}'`);
 assert.equal((await conv(db,c3)).awaiting_human,false,'fechada nao aguarda');
 }finally{await db.close();}
});
