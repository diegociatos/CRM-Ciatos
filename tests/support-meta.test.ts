import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const admin='11111111-1111-4111-8111-111111111111', other='22222222-2222-4222-8222-222222222222', agent='33333333-3333-4333-8333-333333333333', boss='55555555-5555-4555-8555-555555555555';
const org='00000000-0000-4000-8000-000000000001', org2='00000000-0000-4000-8000-000000000002';
const WA='109876543210', IG='17841400000001';
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
async function enable(db:PGlite,o=org,chan='whatsapp',acct=WA,verify=true){await actor(db,o===org?admin:other);await db.exec(`select crm.save_support_meta_account('${o}','${chan}','${acct}','Atendimento',true)`);await server(db);if(verify)await db.exec(`select crm.mark_support_meta_verified('${o}','${chan}','${acct}')`);}
let n=0;
const ingest=async(db:PGlite,a:{o?:string;chan?:string;acct?:string;ext?:string;contact?:string;name?:string;body?:string;at?:string}={})=>{
 await server(db);const chan=a.chan||'whatsapp';
 return (await scalar(db,`crm.ingest_support_meta('${a.o||org}','${chan}','${a.acct||(chan==='whatsapp'?WA:IG)}','${a.ext||'x'+(++n)}','${a.contact||(chan==='whatsapp'?'5531999990001':'1000000000001')}','${a.name??'Cliente'}','${a.body||'Preciso de ajuda'}','${a.at||new Date().toISOString()}')`)) as any;
};

test('canal desligado nao importa; WhatsApp e Instagram viram atendimentos por contato, idempotentes e isolados por empresa',async()=>{
 const db=await banco();try{
 await server(db);
 await assert.rejects(ingest(db),/Channel disabled/);
 await enable(db);await enable(db,org,'instagram',IG);
 const r=await ingest(db,{ext:'w1'});
 assert.equal(r.status,'stored');assert.equal(r.created,true);assert.match(r.protocol,/^ATD-\d{6}$/);
 assert.deepEqual(await ingest(db,{ext:'w1'}),{status:'duplicate'});
 const again=await ingest(db,{ext:'w2',body:'Mais uma'});
 assert.equal(again.conversation_id,r.conversation_id,'um contato = um atendimento por canal');
 const ig=await ingest(db,{chan:'instagram',ext:'i1'});
 assert.notEqual(ig.conversation_id,r.conversation_id,'canais diferentes ficam separados');
 const second=await ingest(db,{ext:'w3',contact:'5531999990002'});
 assert.notEqual(second.conversation_id,r.conversation_id,'outro numero = outra pessoa');
 assert.equal(await scalar(db,`(select awaiting_human from crm.inbox_conversations where id='${r.conversation_id}')`),true);
 assert.equal(await scalar(db,`(select count(*)::int from crm.leads)`),0,'nao cria lead');
 assert.equal(await scalar(db,`(select channel||':'||source from crm.inbox_conversations where id='${ig.conversation_id}')`),'instagram:instagram');
 await assert.rejects(ingest(db,{ext:'bad',contact:'abc'}),/Invalid message/);
 await assert.rejects(ingest(db,{ext:'bad2',contact:'123'}),/Invalid message/);
 // outra empresa nao enxerga nem usa a conta da primeira
 await assert.rejects(ingest(db,{o:org2,ext:'o1'}),/Channel disabled/);
 await actor(db,other);await assert.rejects(db.exec(`select crm.save_support_meta_account('${org2}','whatsapp','${WA}','x',true)`),/já está em uso/,'conta verificada por outra empresa nao pode ser reivindicada');
 await server(db);
 assert.equal(await scalar(db,`crm.resolve_support_meta_account('whatsapp','${WA}')->>'organization_id'`),org);
 assert.equal(await scalar(db,`crm.resolve_support_meta_account('whatsapp','999999999')`),null);
 // contato mostra telefone para WhatsApp
 await actor(db,admin);
 assert.equal(await scalar(db,`(select telefone from crm.support_conversation_contacts('${org}',array['${r.conversation_id}']::uuid[]))`),'+5531999990001');
 }finally{await db.close();}
});

test('permissoes: so administrador configura; gestor ve; atendente nao; nome do segredo e derivado',async()=>{
 const db=await banco();try{
 await actor(db,agent);
 await assert.rejects(db.exec(`select crm.save_support_meta_account('${org}','whatsapp','${WA}','x',true)`),/Forbidden/);
 await assert.rejects(db.exec(`select crm.get_support_meta_accounts('${org}')`),/Forbidden/);
 await actor(db,boss);
 await assert.rejects(db.exec(`select crm.save_support_meta_account('${org}','whatsapp','${WA}','x',true)`),/Forbidden/,'gestor sem papel de administrador nao configura');
 const got=await scalar(db,`crm.get_support_meta_accounts('${org}')`);
 assert.equal(got.accounts.length,2);assert.match(got.accounts[0].token_ref,/^META_TOKEN_INSTAGRAM_[0-9A-F]{32}$/);assert.equal(got.can_manage,false);
 await actor(db,admin);
 await assert.rejects(db.exec(`select crm.save_support_meta_account('${org}','whatsapp','abc','x',true)`),/apenas números/);
 await assert.rejects(db.exec(`select crm.save_support_meta_account('${org}','whatsapp','','x',true)`),/Informe o identificador/);
 await assert.rejects(db.exec(`select crm.save_support_meta_account('${org}','telegram','${WA}','x',true)`),/Invalid channel/);
 await assert.rejects(db.exec(`select crm.ingest_support_meta('${org}','whatsapp','${WA}','e','5531999990001','x','y',now())`),/permission denied/,'ingestao e so do servidor');
 await db.exec(`select crm.save_support_meta_account('${org}','whatsapp','${WA}','Atendimento',false)`);
 assert.equal(await scalar(db,`(select enabled from crm.support_meta_accounts where organization_id='${org}')`),false);
 }finally{await db.close();}
});

test('resposta: janela de 24 h, idempotente, estados com evidencia, falha posterior reabre a espera e incerto bloqueia nova resposta',async()=>{
 const db=await banco();try{
 await enable(db);
 const r=await ingest(db,{ext:'in1'});const cid=r.conversation_id;
 const rid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
 await server(db);
 const reserved=await scalar(db,`crm.reserve_support_meta_reply('${cid}','${agent}','${rid}','Olá, já cuidamos disso.')`);
 assert.equal(reserved.send,true);assert.equal(reserved.to,'5531999990001');assert.equal(reserved.channel,'whatsapp');assert.match(reserved.token_ref,/^META_TOKEN_WHATSAPP_[0-9A-F]{32}$/);
 const replay=await scalar(db,`crm.reserve_support_meta_reply('${cid}','${agent}','${rid}','Olá, já cuidamos disso.')`);
 assert.deepEqual([replay.send,replay.status],[false,'SENDING'],'mesmo request nao envia duas vezes');
 await assert.rejects(db.exec(`select crm.reserve_support_meta_reply('${cid}','${agent}','${rid}','Outro texto')`),/Request ID already used/);
 await assert.rejects(db.exec(`select crm.reserve_support_meta_reply('${cid}','${agent}','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2','Segunda')`),/Resultado incerto/,'envio pendente bloqueia outro');
 assert.equal(await scalar(db,`(select first_human_reply_at from crm.inbox_conversations where id='${cid}')`),null,'reservada nao conta como resposta');
 await db.exec(`select crm.finish_support_meta_reply('${rid}','ACCEPTED','wamid.OUT1')`);
 assert.notEqual(await scalar(db,`(select first_human_reply_at from crm.inbox_conversations where id='${cid}')`),null,'aceita pelo provedor conta como primeira resposta');
 assert.equal(await scalar(db,`crm.apply_support_meta_status('${org}','whatsapp','wamid.OUT1','delivered',now())`),'applied');
 assert.equal(await scalar(db,`crm.apply_support_meta_status('${org}','whatsapp','wamid.OUT1','read',now())`),'applied');
 assert.equal(await scalar(db,`crm.apply_support_meta_status('${org}','whatsapp','wamid.OUT1','failed',now(),'x')`),'ignored','entregue nao vira falha');
 assert.equal(await scalar(db,`crm.apply_support_meta_status('${org}','whatsapp','nao-existe','read',now())`),'queued','status de mensagem desconhecida fica guardado (pode chegar antes do id)');
 assert.equal(await scalar(db,`(select delivery_status from crm.inbox_messages where external_id='wamid.OUT1')`),'ACCEPTED');
 assert.notEqual(await scalar(db,`(select read_at from crm.inbox_messages where external_id='wamid.OUT1')`),null);
 // segunda resposta: o canal depois informa falha -> deixa de contar como respondida
 const rid2='cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
 await db.exec(`select crm.reserve_support_meta_reply('${cid}','${agent}','${rid2}','Segunda resposta')`);
 await db.exec(`select crm.finish_support_meta_reply('${rid2}','ACCEPTED','wamid.OUT2')`);
 assert.equal(await scalar(db,`crm.apply_support_meta_status('${org}','whatsapp','wamid.OUT2','failed',now(),'Recusada pelo WhatsApp (código 131047)')`),'applied');
 assert.equal(await scalar(db,`(select delivery_status||':'||delivery_error from crm.inbox_messages where external_id='wamid.OUT2')`),'FAILED:Recusada pelo WhatsApp (código 131047)');
 // incerto bloqueia nova resposta
 const rid3='dddddddd-dddd-4ddd-8ddd-ddddddddddd4';
 await db.exec(`select crm.reserve_support_meta_reply('${cid}','${agent}','${rid3}','Terceira')`);
 await db.exec(`select crm.finish_support_meta_reply('${rid3}','REVIEW',null,'Sem resposta do canal')`);
 await assert.rejects(db.exec(`select crm.reserve_support_meta_reply('${cid}','${agent}','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee5','Quarta')`),/Resultado incerto/);
 await assert.rejects(db.exec(`select crm.finish_support_meta_reply('${rid3}','ACCEPTED','x')`),/Not sending/,'resultado final nao e sobrescrito');
 // janela de 24 h
 const old=await ingest(db,{ext:'old1',contact:'5531999990009',at:new Date(Date.now()-30*3600e3).toISOString()});
 await assert.rejects(db.exec(`select crm.reserve_support_meta_reply('${old.conversation_id}','${agent}','ffffffff-ffff-4fff-8fff-fffffffffff6','Atrasada')`),/janela de 24 horas/);
 // usuario de outra empresa nao responde
 await assert.rejects(db.exec(`select crm.reserve_support_meta_reply('${cid}','${other}','99999999-9999-4999-8999-999999999997','Intruso')`),/Conversation unavailable/);
 }finally{await db.close();}
});

test('limite de novos atendimentos por hora: excedido falha sem perder o que ja existe; mensagens em atendimento aberto continuam entrando',async()=>{
 const db=await banco();try{
 await enable(db);
 for(let i=0;i<100;i++) await ingest(db,{ext:'f'+i,contact:String(5531900000000+i)});
 await assert.rejects(ingest(db,{ext:'f-extra',contact:'5531911111111'}),/Intake limit reached/);
 assert.equal((await ingest(db,{ext:'f-more',contact:String(5531900000000)})).status,'stored','contato existente segue recebendo');
 assert.equal(await scalar(db,`(select count(*)::int from crm.inbox_conversations)`),100);
 // outra empresa nao e afetada
 await enable(db,org2,'whatsapp','222233334444');
 assert.equal((await ingest(db,{o:org2,acct:'222233334444',ext:'o-1',contact:'5531922222222'})).status,'stored');
 }finally{await db.close();}
});

test('painel do gestor: canais refletem o estado real e a fila traz o canal',async()=>{
 const db=await banco();try{
 const from=new Date(Date.now()-86400e3).toISOString(),to=new Date(Date.now()+3600e3).toISOString();
 await actor(db,admin);
 let ov=await scalar(db,`crm.support_desk_overview('${org}','${from}','${to}')`);
 assert.equal(ov.channels.find((c:any)=>c.channel==='whatsapp').status,'not_configured');
 await enable(db);
 await actor(db,admin);
 ov=await scalar(db,`crm.support_desk_overview('${org}','${from}','${to}')`);
 assert.equal(ov.channels.find((c:any)=>c.channel==='whatsapp').status,'awaiting','habilitado, sem evento: aguardando (nao "conectado")');
 await ingest(db,{ext:'p1'});await actor(db,admin);
 ov=await scalar(db,`crm.support_desk_overview('${org}','${from}','${to}')`);
 assert.equal(ov.channels.find((c:any)=>c.channel==='whatsapp').status,'connected');
 assert.equal(ov.channels.find((c:any)=>c.channel==='instagram').status,'not_configured');
 const q=await scalar(db,`crm.support_queue('${org}','open','5531999990001')`);
 assert.equal(q.total,1);assert.equal(q.rows[0].channel,'whatsapp');assert.equal(q.rows[0].whatsapp_id,'5531999990001');
 }finally{await db.close();}
});

test('posse da conta: cadastro sem verificacao nao roteia; reivindicar o id de outra empresa nao captura mensagens',async()=>{
 const db=await banco();try{
 // empresa A cadastra (e habilita) o identificador que sera da empresa B, mas nao consegue verificar
 await enable(db,org,'whatsapp',WA,false);
 await server(db);
 assert.equal(await scalar(db,`crm.resolve_support_meta_account('whatsapp','${WA}')`),null,'nao verificada: nenhum evento roteia');
 await assert.rejects(ingest(db),/Channel disabled/);
 await actor(db,admin);
 assert.equal((await scalar(db,`crm.get_support_meta_accounts('${org}')`)).accounts.find((a:any)=>a.channel==='whatsapp').verified,false);
 // empresa B cadastra o mesmo id (nao e bloqueada pelo cadastro nao verificado) e verifica com o token dela
 await enable(db,org2,'whatsapp',WA,true);
 await server(db);
 assert.equal(await scalar(db,`crm.resolve_support_meta_account('whatsapp','${WA}')->>'organization_id'`),org2);
 // A tenta verificar depois: a unicidade entre contas verificadas impede
 await assert.rejects(db.exec(`select crm.mark_support_meta_verified('${org}','whatsapp','${WA}')`),/duplicate key|unique/);
 assert.equal((await ingest(db,{o:org2,ext:'b1'})).status,'stored');
 await assert.rejects(ingest(db,{o:org,ext:'a1'}),/Channel disabled/,'A nao recebe nada da conta de B');
 // trocar o identificador derruba a verificacao
 await actor(db,other);await db.exec(`select crm.save_support_meta_account('${org2}','whatsapp','999000111','x',true)`);await server(db);
 assert.equal(await scalar(db,`crm.resolve_support_meta_account('whatsapp','999000111')`),null);
 // alvo da verificacao: so administrador; nome do segredo derivado
 await actor(db,agent);await assert.rejects(db.exec(`select crm.get_support_meta_target('${org}','whatsapp')`),/Forbidden/);
 await actor(db,admin);const t=await scalar(db,`crm.get_support_meta_target('${org}','whatsapp')`);
 assert.equal(t.account_id,WA);assert.equal(t.token_ref,'META_TOKEN_WHATSAPP_00000000000040008000000000000001');
 assert.notEqual(t.token_ref,(await (async()=>{await actor(db,other);return scalar(db,`crm.get_support_meta_target('${org2}','whatsapp')`);})()).token_ref,'segredo de cada empresa e distinto');
 await server(db);await assert.rejects(db.exec(`select crm.mark_support_meta_verified('${org}','whatsapp','111')`).then(()=>{}),/Account changed|permission/);
 }finally{await db.close();}
});

test('status adiantado e guardado e reaplicado; falha depois do id; conferencia manual libera resposta incerta; cota de e-mail nao conta Meta',async()=>{
 const db=await banco();try{
 await enable(db);
 const r=await ingest(db,{ext:'in1'});const cid=r.conversation_id;
 const rid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
 await server(db);
 await db.exec(`select crm.reserve_support_meta_reply('${cid}','${agent}','${rid}','Olá')`);
 // o webhook de "falhou" chega ANTES de gravarmos o id devolvido pela Meta
 assert.equal(await scalar(db,`crm.apply_support_meta_status('${org}','whatsapp','wamid.EARLY','delivered',now())`),'queued');
 assert.equal(await scalar(db,`crm.apply_support_meta_status('${org}','whatsapp','wamid.EARLY','failed',now()+interval '1 second','Recusada pelo WhatsApp (código 1)')`),'queued');
 await db.exec(`select crm.finish_support_meta_reply('${rid}','ACCEPTED','wamid.EARLY')`);
 assert.equal(await scalar(db,`(select delivery_status from crm.inbox_messages where external_id='wamid.EARLY')`),'ACCEPTED','entregue chegou primeiro: falha posterior e ignorada');
 assert.notEqual(await scalar(db,`(select delivered_at from crm.inbox_messages where external_id='wamid.EARLY')`),null);
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_meta_pending_status)`),0,'pendentes consumidos');
 assert.equal(await scalar(db,`(select delivery_evidence from crm.inbox_messages where external_id='wamid.EARLY')`),'channel_status');
 // so falha adiantada: a primeira resposta nao fica contada
 const rid2='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
 await db.exec(`select crm.reserve_support_meta_reply('${cid}','${agent}','${rid2}','Segunda')`);
 await db.exec(`select crm.apply_support_meta_status('${org}','whatsapp','wamid.LATE','failed',now(),'Recusada pelo WhatsApp (código 2)')`);
 await db.exec(`select crm.finish_support_meta_reply('${rid2}','ACCEPTED','wamid.LATE')`);
 assert.equal(await scalar(db,`(select delivery_status from crm.inbox_messages where external_id='wamid.LATE')`),'FAILED');
 // incerto: gestor confere; agente comum nao decide
 const rid3='cccccccc-cccc-4ccc-8ccc-ccccccccccc3';
 await db.exec(`select crm.reserve_support_meta_reply('${cid}','${agent}','${rid3}','Terceira')`);
 await db.exec(`select crm.finish_support_meta_reply('${rid3}','REVIEW',null,'Sem resposta do canal')`);
 const mid=await scalar(db,`(select id from crm.inbox_messages where request_id='${rid3}')`);
 await actor(db,agent);await assert.rejects(db.exec(`select crm.resolve_support_meta_reply('${mid}','confirm_not_sent')`),/Unavailable/);
 await actor(db,boss);
 await assert.rejects(db.exec(`select crm.resolve_support_meta_reply('${mid}','retry')`),/Ação inválida/);
 await db.exec(`select crm.resolve_support_meta_reply('${mid}','confirm_not_sent')`);
 assert.equal(await scalar(db,`(select delivery_status from crm.inbox_messages where id='${mid}')`),'FAILED');
 await assert.rejects(db.exec(`select crm.resolve_support_meta_reply('${mid}','confirm_sent')`),/Ação inválida/,'so resolve o que esta a conferir');
 assert.equal(await scalar(db,`(select count(*)::int from crm.support_audit where action='META_REPLY_CONFIRM_NOT_SENT')`),1);
 await server(db);
 // liberado para responder de novo
 assert.equal((await scalar(db,`crm.reserve_support_meta_reply('${cid}','${agent}','dddddddd-dddd-4ddd-8ddd-ddddddddddd4','Quarta')`)).send,true);
 // a cota diaria de e-mail nao conta mensagens do WhatsApp
 assert.equal(await scalar(db,`crm.emails_sent_today('${org}')::int`),0);
 }finally{await db.close();}
});
