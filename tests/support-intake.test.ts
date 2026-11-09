import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', agent='33333333-3333-4333-8333-333333333333', boss='55555555-5555-4555-8555-555555555555';
const org='00000000-0000-4000-8000-000000000001', org2='00000000-0000-4000-8000-000000000002';
const box='suporte@empresa.test';
async function banco(){
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;`);
 const files=readdirSync('supabase/migrations').sort();
 for(let i=0;i<files.length;i++){
  await db.exec(readFileSync('supabase/migrations/'+files[i],'utf8'));
  if(i===1) await db.exec(`insert into auth.users values('${admin}');insert into crm.profiles(id,nome,email,papel) values('${admin}','Admin','admin@test.local','ADMIN');`);
 }
 await db.exec(`insert into auth.users values('${other}'),('${agent}'),('${boss}');
  insert into crm.profiles(id,nome,email,papel) values('${other}','Other','o@t.l','ADMIN'),('${agent}','Agente','a@t.l','SDR'),('${boss}','Gestor','b@t.l','MANAGER');
  insert into crm.organizations(id,nome,slug) values('${org2}','Other','other');
  insert into crm.organization_members(organization_id,user_id,papel,operating_role) values('${org2}','${other}','ADMIN','ADMIN');
  insert into crm.organization_members(organization_id,user_id,papel,operating_role) values('${org}','${agent}','MEMBER','SUPPORT'),('${org}','${boss}','MEMBER','MANAGER');
  update crm.organization_members set papel='ADMIN' where organization_id='${org}' and user_id='${admin}';`);
 return db;
}
async function actor(db:PGlite,id=admin){await db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`);}
async function server(db:PGlite){await db.exec('reset role');}
async function scalar<T=any>(db:PGlite,sql:string){return (await db.query<{v:T}>(`select (${sql}) v`)).rows[0].v;}
const q=(s:string)=>s.replace(/'/g,"''");
const TEXT_SUBJECT='Recebemos sua mensagem - protocolo {{protocolo}}';
const TEXT_BODY='Olá {{nome}}, recebemos sua mensagem e ela foi registrada com o protocolo {{protocolo}}. Uma pessoa da equipe vai analisar e retornar.';
async function enable(db:PGlite,o=org,ack=false,mailbox=box){
 await actor(db,o===org?admin:other);
 if(ack){await db.exec(`select crm.save_support_ack_template('${o}','${q(TEXT_SUBJECT)}','${q(TEXT_BODY)}')`);await db.exec(`select crm.approve_support_ack_template('${o}')`);}
 await db.exec(`select crm.save_support_channel('${o}','${mailbox}',true,${ack})`);
 await server(db);
}
let n=0;
const ingest=async(db:PGlite,o:string,a:{ext?:string;thread?:string;from?:string;name?:string;subject?:string;body?:string;at?:string;auto?:boolean;box?:string;verified?:boolean}={})=>{
 await server(db);
 return (await scalar(db,`crm.ingest_support_email('${o}','${a.ext||'m'+(++n)}','${a.thread||'t'+n}','${a.from||'cliente@externo.test'}','${a.name??'Cliente Externo'}','${a.subject||'Dúvida'}','${a.body||'Preciso de ajuda.'}','${a.at||new Date().toISOString()}',${a.auto?'true':'false'},'${a.box||(o===org?box:'outra@empresa.test')}',${a.verified===false?'false':'true'})`)) as any;
};

test('ingestao: canal desligado nao importa; e-mail espontaneo vira atendimento com protocolo, idempotente e sem virar lead',async()=>{
 const db=await banco();try{
 await server(db);
 await assert.rejects(db.exec(`select crm.ingest_support_email('${org}','x','t','a@b.test','A','s','b',now(),false,'${box}',true)`),/Channel disabled/);
 await enable(db);
 const r=await ingest(db,org,{ext:'e1',thread:'th1'});
 assert.equal(r.status,'stored');assert.equal(r.created,true);assert.match(r.protocol,/^ATD-\d{6}$/);
 assert.deepEqual(await ingest(db,org,{ext:'e1',thread:'th1'}),{status:'duplicate'},'mesmo id externo nao duplica');
 const again=await ingest(db,org,{ext:'e2',thread:'th1',body:'Segunda mensagem'});
 assert.equal(again.created,false);assert.equal(again.conversation_id,r.conversation_id,'mesmo assunto = mesmo atendimento');
 const other_subject=await ingest(db,org,{ext:'e3',thread:'th2',subject:'Outro assunto'});
 assert.notEqual(other_subject.conversation_id,r.conversation_id,'assunto diferente da mesma pessoa fica separado');
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_people where organization_id='${org}')`),1,'uma pessoa por e-mail');
 await ingest(db,org,{ext:'e4',thread:'th3',from:'CLIENTE@externo.test'});
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_people where organization_id='${org}')`),1,'e-mail sem diferenciar maiusculas');
 await ingest(db,org,{ext:'e5',thread:'th4',from:'cliente2@externo.test',name:'Cliente Externo'});
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_people where organization_id='${org}')`),2,'nome igual nao une identidades');
 assert.equal(await scalar(db,`(select count(*)::int from crm.leads)`),0,'nao cria lead');
 assert.equal(await scalar(db,`(select awaiting_human from crm.inbox_conversations where id='${r.conversation_id}')`),true);
 // automaticas, no-reply e a propria caixa sao ignoradas
 for(const a of [{auto:true},{from:'no-reply@x.test'},{from:'MAILER-DAEMON@x.test'},{from:box}]) assert.equal((await ingest(db,org,a)).status,'skipped');
 // fila e painel enxergam a pessoa sem lead; protocolo pesquisavel
 await actor(db,boss);
 const list=await scalar(db,`crm.support_queue('${org}','all','${r.protocol}')`) as any;
 assert.equal(list.total,1);assert.equal(list.rows[0].email,'cliente@externo.test');assert.equal(list.rows[0].source,'support_mail');
 const c=await db.query<any>(`select * from crm.support_conversation_contacts('${org}',array['${r.conversation_id}']::uuid[])`);
 assert.equal(c.rows[0].is_person,true);assert.equal(c.rows[0].email,'cliente@externo.test');
 // reabertura do mesmo assunto
 await server(db);
 await db.exec(`update crm.inbox_conversations set status='CLOSED' where id='${r.conversation_id}'`);
 const back=await ingest(db,org,{ext:'e6',thread:'th1',body:'Voltei'});
 assert.equal(back.conversation_id,r.conversation_id);
 assert.equal(await scalar(db,`(select reopen_count from crm.inbox_conversations where id='${r.conversation_id}')`),1);
 assert.equal(await scalar(db,`(select awaiting_human from crm.inbox_conversations where id='${r.conversation_id}')`),true);
 }finally{await db.close();}
});

test('isolamento: mesma pessoa em duas empresas, caixa unica, protocolo por empresa e configuracao so de administrador',async()=>{
 const db=await banco();try{
 await enable(db,org);await enable(db,org2,false,'outra@empresa.test');
 const a=await ingest(db,org,{ext:'x1',thread:'tx',from:'mesma@pessoa.test'});
 const b=await ingest(db,org2,{ext:'x1',thread:'tx',from:'mesma@pessoa.test'});
 assert.equal(a.protocol,b.protocol,'protocolo e sequencial por empresa');assert.notEqual(a.conversation_id,b.conversation_id);
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_people)`),2,'a mesma pessoa e um registro por empresa');
 await actor(db,other);
 await assert.rejects(db.exec(`select crm.save_support_channel('${org2}','${box}',true,false)`),/outra empresa/,'caixa pertence a uma empresa');
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_people)`),1);
 assert.equal(await scalar(db,`(select count(*)::int from crm.inbox_conversations)`),1);
 await actor(db,agent);
 await assert.rejects(db.exec(`select crm.save_support_channel('${org}','x@y.test',true,false)`),/Forbidden/);
 await assert.rejects(db.exec(`select crm.get_support_channel('${org}')`),/Forbidden/,'agente nao ve configuracao do canal');
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_channel_accounts)`),0);
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_people)`),1,'Suporte le pessoas da propria empresa');
 for(const fn of ["crm.ingest_support_email('"+org+"','z','z','a@b.test','A','s','b',now(),false,'x@y.test',true)","crm.claim_support_outbox()","crm.claim_support_account()","crm.reserve_support_reply('"+a.conversation_id+"','"+agent+"',gen_random_uuid(),'x')"]) await assert.rejects(db.exec(`select ${fn}`),/permission denied/);
 await actor(db,boss);
 assert.equal(await scalar(db,`crm.get_support_channel('${org}')->'account'->>'mailbox'`),box);
 }finally{await db.close();}
});

test('confirmacao automatica: texto aprovado, desligada por padrao, uma por atendimento/remetente, nunca depois de resposta humana',async()=>{
 const db=await banco();try{
 await enable(db,org,false);
 const none=await ingest(db,org,{ext:'a1',thread:'ta1',from:'p1@x.test'});
 assert.equal(none.ack_queued,false,'desligada por padrao');
 await actor(db);
 await assert.rejects(db.exec(`select crm.save_support_channel('${org}','${box}',true,true)`),/Aprove o texto/);
 await assert.rejects(db.exec(`select crm.save_support_ack_template('${org}','Recebido','Recebemos sua mensagem e responderemos em 24 horas.')`),/protocolo/);
 await assert.rejects(db.exec(`select crm.save_support_ack_template('${org}','Recebido {{protocolo}}','Recebemos sua mensagem {{protocolo}} e responderemos em até 24 horas.')`),/prazos/);
 await assert.rejects(db.exec(`select crm.save_support_ack_template('${org}','Recebido {{protocolo}}','Recebemos sua mensagem {{protocolo}} {{segredo}} com atenção.')`),/Placeholder/);
 await db.exec(`select crm.save_support_ack_template('${org}','${q(TEXT_SUBJECT)}','${q(TEXT_BODY)}')`);
 await assert.rejects(db.exec(`select crm.save_support_channel('${org}','${box}',true,true)`),/Aprove o texto/,'rascunho nao habilita');
 await db.exec(`select crm.approve_support_ack_template('${org}')`);
 await db.exec(`select crm.save_support_channel('${org}','${box}',true,true)`);
 const first=await ingest(db,org,{ext:'a2',thread:'ta2',from:'p2@x.test',name:'Maria'});
 assert.equal(first.ack_queued,true);
 const ob=await db.query<any>(`select * from crm.support_outbox where conversation_id='${first.conversation_id}'`);
 assert.equal(ob.rows.length,1);assert.equal(ob.rows[0].status,'QUEUED');assert.match(ob.rows[0].body,new RegExp(first.protocol));assert.match(ob.rows[0].body,/Maria/);assert.ok(!/\{\{/.test(ob.rows[0].body+ob.rows[0].subject));
 assert.equal((await ingest(db,org,{ext:'a3',thread:'ta2',from:'p2@x.test'})).ack_queued,false,'segunda mensagem do mesmo assunto nao gera nova confirmacao');
 assert.equal((await ingest(db,org,{ext:'a4',thread:'ta3',from:'p2@x.test'})).ack_queued,false,'mesmo remetente em 24 h nao recebe outra');
 // editar o texto exige nova aprovacao e desliga o envio
 await actor(db);
 await db.exec(`select crm.save_support_ack_template('${org}','${q(TEXT_SUBJECT)}','${q(TEXT_BODY+' Obrigado.')}')`);
 assert.equal(await scalar(db,`(select auto_ack_enabled from crm.support_channel_accounts where organization_id='${org}')`),false);
 // confirmacao nao e resposta humana: o cliente continua aguardando
 await server(db);
 const claimed=await scalar(db,`crm.claim_support_outbox()`) as any;
 assert.equal(claimed,null,'sem confirmacao habilitada o worker nao envia');
 await actor(db);
 await db.exec(`select crm.approve_support_ack_template('${org}')`);await db.exec(`select crm.save_support_channel('${org}','${box}',true,true)`);
 await server(db);
 const job=await scalar(db,`crm.claim_support_outbox()`) as any;
 assert.equal(job.status,'SENDING');assert.equal(job.mailbox,box);assert.equal(job.attempts,1);
 assert.equal(await scalar(db,`crm.claim_support_outbox()`),null,'o mesmo item nao e reivindicado duas vezes');
 await db.exec(`select crm.finish_support_outbox('${job.id}','ACCEPTED')`);
 await assert.rejects(db.exec(`select crm.finish_support_outbox('${job.id}','FAILED')`),/Not sending/);
 const st=await db.query<any>(`select status,evidence from crm.support_outbox where id='${job.id}'`);
 assert.equal(st.rows[0].status,'ACCEPTED');assert.equal(st.rows[0].evidence,'provider_accepted');
 assert.equal(await scalar(db,`(select awaiting_human from crm.inbox_conversations where id='${job.conversation_id}')`),true,'confirmacao nao conta como resposta humana');
 assert.equal(await scalar(db,`(select first_human_reply_at is null from crm.inbox_conversations where id='${job.conversation_id}')`),true);
 // resposta humana aceita antes do envio cancela a confirmacao
 const second=await ingest(db,org,{ext:'a5',thread:'ta5',from:'p5@x.test'});
 await db.exec(`insert into crm.inbox_messages(conversation_id,organization_id,direction,provider,sender,recipient,body,delivery_status,received_at) values('${second.conversation_id}','${org}','OUTBOUND','microsoft365','${box}','p5@x.test','Olá','ACCEPTED',now())`);
 assert.equal(await scalar(db,`crm.claim_support_outbox()`),null);
 assert.equal(await scalar(db,`(select status from crm.support_outbox where conversation_id='${second.conversation_id}')`),'CANCELLED');
 }finally{await db.close();}
});

test('confirmacao automatica: falha, resultado incerto, reconciliacao e reenvio so depois de conferir',async()=>{
 const db=await banco();try{
 await enable(db,org,true);
 const mk=async(email:string)=>{const r=await ingest(db,org,{from:email});return r.conversation_id as string;};
 const c1=await mk('f1@x.test');
 let job=await scalar(db,`crm.claim_support_outbox()`) as any;
 await db.exec(`select crm.finish_support_outbox('${job.id}','FAILED','HTTP 400')`);
 await actor(db,boss);
 assert.equal(((await scalar(db,`crm.support_queue('${org}','ack_failed')`)) as any).total,1);
 assert.equal(((await scalar(db,`crm.support_queue('${org}','attention')`)) as any).total,1,'falha de confirmacao pede atencao');
 assert.equal(((await scalar(db,`crm.support_desk_overview('${org}',now()-interval '1 day',now()+interval '1 day')`)) as any).ack_failed,1);
 await db.exec(`select crm.resolve_support_outbox('${job.id}','retry')`);
 assert.equal(await scalar(db,`(select status from crm.support_outbox where id='${job.id}')`),'QUEUED');
 // timeout apos a chamada: incerto. Nao pode ser reenviado direto.
 await server(db);
 job=await scalar(db,`crm.claim_support_outbox()`) as any;
 assert.equal(job.attempts,2);
 await db.exec(`select crm.finish_support_outbox('${job.id}','UNCERTAIN','timeout')`);
 await actor(db,boss);
 await assert.rejects(db.exec(`select crm.resolve_support_outbox('${job.id}','retry')`),/Ação inválida/);
 await server(db);
 assert.equal(await scalar(db,`crm.claim_support_outbox()`),null,'incerto nunca e reenviado sozinho');
 // reconciliacao: encontrada em Itens Enviados -> aceita com evidencia
 await db.exec(`update crm.support_outbox set finished_at=now()-interval '5 minutes' where id='${job.id}'`);
 assert.equal(((await scalar(db,`crm.list_support_outbox_uncertain()`)) as any[]).length,1);
 await db.exec(`select crm.reconcile_support_outbox('${job.id}',true)`);
 const done=await db.query<any>(`select status,evidence from crm.support_outbox where id='${job.id}'`);
 assert.equal(done.rows[0].status,'ACCEPTED');assert.equal(done.rows[0].evidence,'sent_items_match');
 // nao encontrada: so vira falha depois da janela; depois disso pode ser reenviada por decisao humana
 const c2=await mk('f2@x.test');
 const j2=await scalar(db,`crm.claim_support_outbox()`) as any;
 await db.exec(`select crm.finish_support_outbox('${j2.id}','UNCERTAIN','x')`);
 await db.exec(`select crm.reconcile_support_outbox('${j2.id}',false)`);
 assert.equal(await scalar(db,`(select status from crm.support_outbox where id='${j2.id}')`),'UNCERTAIN','ainda dentro da janela');
 await db.exec(`update crm.support_outbox set started_at=now()-interval '20 minutes' where id='${j2.id}'`);
 await db.exec(`select crm.reconcile_support_outbox('${j2.id}',false)`);
 assert.equal(await scalar(db,`(select status from crm.support_outbox where id='${j2.id}')`),'UNCERTAIN','ausencia em Itens Enviados nao autoriza reenvio');
 assert.match(await scalar(db,`(select last_error from crm.support_outbox where id='${j2.id}')`),/confira a caixa/);
 // envio interrompido (SENDING parado) vira incerto
 const c3=await mk('f3@x.test');
 const j3=await scalar(db,`crm.claim_support_outbox()`) as any;
 await db.exec(`update crm.support_outbox set started_at=now()-interval '10 minutes' where id='${j3.id}'`);
 await scalar(db,`crm.claim_support_outbox()`);
 assert.equal(await scalar(db,`(select status from crm.support_outbox where id='${j3.id}')`),'UNCERTAIN');
 // gestor confirma manualmente
 await actor(db,boss);
 await db.exec(`select crm.resolve_support_outbox('${j3.id}','confirm_not_sent')`);
 assert.equal(await scalar(db,`(select status from crm.support_outbox where id='${j3.id}')`),'FAILED');
 await db.exec(`select crm.resolve_support_outbox('${j3.id}','cancel')`);
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_audit where action like 'OUTBOX_%')`),3);
 assert.ok(c1&&c2&&c3);
 }finally{await db.close();}
});

test('resposta humana a pessoa sem lead: idempotente, pela caixa da empresa, sem roubar atendimento e privacidade',async()=>{
 const db=await banco();try{
 await enable(db,org);
 const r=await ingest(db,org,{from:'cli@externo.test',name:'Cli'});
 const rid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
 await server(db);
 const res=await scalar(db,`crm.reserve_support_reply('${r.conversation_id}','${agent}','${rid}','Olá, vamos ajudar.')`) as any;
 assert.equal(res.send,true);assert.equal(res.sender,box);assert.equal(res.recipient,'cli@externo.test');
 const again=await scalar(db,`crm.reserve_support_reply('${r.conversation_id}','${agent}','${rid}','Olá, vamos ajudar.')`) as any;
 assert.equal(again.send,false,'mesmo pedido nao reenvia');
 await assert.rejects(db.exec(`select crm.reserve_support_reply('${r.conversation_id}','${other}',gen_random_uuid(),'x')`),/unavailable/,'outra empresa');
 // incerto -> mensagem sai da fila de resposta apenas quando aceita
 assert.equal(await scalar(db,`(select awaiting_human from crm.inbox_conversations where id='${r.conversation_id}')`),true);
 await db.exec(`select crm.finish_inbox_reply('${rid}','ACCEPTED')`);
 assert.equal(await scalar(db,`(select awaiting_human from crm.inbox_conversations where id='${r.conversation_id}')`),false);
 // privacidade: so administrador exporta/apaga
 await actor(db,agent);
 await assert.rejects(db.exec(`select crm.support_person_export('${org}',(select id from crm.support_people limit 1))`),/Forbidden/);
 await actor(db);
 const person=await scalar(db,`(select id from crm.support_people limit 1)`);
 const exp=await scalar(db,`crm.support_person_export('${org}','${person}')`) as any;
 assert.equal(exp.conversations.length,1);assert.equal(exp.messages.length,2);
 await db.exec(`select crm.support_person_erase('${org}','${person}')`);
 assert.equal(await scalar(db,`(select count(*)::int from crm.inbox_conversations)`),0,'exclusao leva atendimentos e mensagens');
 }finally{await db.close();}
});

test('revisao: caixa trocada, remetente nao autenticado, outro participante no mesmo thread e confirmacao presa a caixa de origem',async()=>{
 const db=await banco();try{
 await enable(db,org,true);
 await assert.rejects(ingest(db,org,{box:'antiga@empresa.test'}),/Mailbox changed/);
 // sem autenticacao do remetente: atendimento criado, mas nenhuma confirmacao para um possivel falsificado
 const spoof=await ingest(db,org,{from:'vitima@x.test',verified:false});
 assert.equal(spoof.status,'stored');assert.equal(spoof.ack_queued,false);
 // outro participante no mesmo thread vira atendimento proprio
 const a=await ingest(db,org,{ext:'t1',thread:'shared',from:'um@x.test'});
 const b=await ingest(db,org,{ext:'t2',thread:'shared',from:'dois@x.test'});
 assert.notEqual(a.conversation_id,b.conversation_id);
 assert.equal(await scalar(db,`(select person_id from crm.inbox_conversations where id='${b.conversation_id}') <> (select person_id from crm.inbox_conversations where id='${a.conversation_id}')`),true);
 // confirmacao enfileirada pela caixa antiga e cancelada se a caixa mudar antes do envio
 const c=await ingest(db,org,{from:'tres@x.test'});
 await actor(db);
 await db.exec(`select crm.save_support_channel('${org}','nova@empresa.test',true,true)`);
 await server(db);
 assert.equal(await scalar(db,`crm.claim_support_outbox()`),null);
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_outbox where status='CANCELLED' and conversation_id='${c.conversation_id}')`),1);
 }finally{await db.close();}
});
