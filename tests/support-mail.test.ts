import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mapGraphMessage,processSupportMailbox,processSupportOutbox,reconcileSupportOutbox,sentAckMatch,supportPagePath} from '../supabase/functions/_shared/supportMail.ts';

const box='suporte@empresa.test';
const on=(name:string)=>(n:string)=>n===name?'true':undefined;
const enabled=on('CRM_SUPPORT_MAIL_ENABLED');
const msg=(over:any={})=>({id:'AAA',subject:'Preciso de ajuda',from:{emailAddress:{address:'Cliente@Externo.test',name:'Cliente'}},receivedDateTime:'2026-03-01T10:00:00Z',conversationId:'conv-1',isDraft:false,uniqueBody:{content:'<p>Olá, <b>preciso</b> da guia.</p>'},internetMessageHeaders:[],...over});
const fakeDb=(handlers:Record<string,(args:any)=>any>)=>{const calls:any[]=[];return {calls,rpc:async(name:string,args:any={})=>{calls.push([name,args]);const h=handlers[name];if(!h)return {data:null,error:null};try{return {data:await h(args),error:null};}catch(e:any){return {data:null,error:{message:e.message}};}}};};

test('mapeamento: mensagem espontanea vira atendimento; automaticas, listas, no-reply e proprias sao ignoradas',()=>{
 const ok=mapGraphMessage(msg(),box) as any;
 assert.equal(ok.args.verified,false,'sem Authentication-Results nao e verificado');
 assert.equal((mapGraphMessage(msg({internetMessageHeaders:[{name:'Authentication-Results',value:'spf=pass; dkim=pass; dmarc=pass action=none'}]}),box) as any).args.verified,true);
 assert.equal(ok.args.sender,'cliente@externo.test');assert.equal(ok.args.thread,'conv-1');assert.equal(ok.args.ext_id,'graph:suporte@empresa.test:AAA');assert.match(ok.args.mail_body,/preciso/);assert.ok(!/<b>/.test(ok.args.mail_body));
 const h=(name:string,value:string)=>({internetMessageHeaders:[{name,value}]});
 const cases:[any,string][]=[[{isDraft:true},'draft'],[{from:{emailAddress:{address:box}}},'own_mailbox'],[{from:{emailAddress:{address:'no-reply@x.test'}}},'no_reply'],[{from:{emailAddress:{address:'MAILER-DAEMON@x.test'}}},'no_reply'],
  [h('Auto-Submitted','auto-replied'),'auto_submitted'],[h('X-Ciatos-Auto','ack'),'own_auto_message'],[h('Precedence','bulk'),'bulk'],[h('List-Unsubscribe','<x>'),'mailing_list'],[h('X-Auto-Response-Suppress','All'),'auto_response_suppress'],[{from:{emailAddress:{address:'nao-e-email'}}},'invalid_sender']];
 for(const [over,reason] of cases) assert.deepEqual(mapGraphMessage(msg(over),box),{skip:reason});
 assert.ok('args' in (mapGraphMessage(msg(h('Auto-Submitted','no')),box) as any),'Auto-Submitted: no nao e automatica');
 assert.equal((mapGraphMessage(msg({conversationId:undefined}),box) as any).args.thread,'msg:AAA');
 assert.match((mapGraphMessage(msg({uniqueBody:{content:''}}),box) as any).args.mail_body,/sem texto legível/);
});

test('leitura: desligada nao le; pagina valida, ingere so o que e atendimento e repete com seguranca',async()=>{
 const noGraph=async()=>{throw new Error('nao deveria ler');};
 assert.equal(await processSupportMailbox(fakeDb({}),()=>undefined,noGraph),'disabled');
 const acc={organization_id:'o1',mailbox:box,watermark:'2026-03-01T09:00:00Z',next_path:null,lease:'lease-1'};
 const db=fakeDb({claim_support_account:()=>acc,ingest_support_email:()=>({status:'stored'}),finish_support_account:()=>null});
 const asked:string[]=[];
 const graph=async(_m:string,path:string)=>{asked.push(path);return {value:[msg({id:'1'}),msg({id:'2',from:{emailAddress:{address:'no-reply@x.test'}}}),msg({id:'3',receivedDateTime:'2026-03-01T11:00:00Z'})]};};
 assert.equal(await processSupportMailbox(db,enabled,graph),'synced');
 assert.match(asked[0],/\/users\/suporte%40empresa\.test\/mailFolders\/inbox\/messages\?/);assert.match(asked[0],/receivedDateTime\+ge\+2026-03-01T08%3A59%3A00/);
 const ingested=db.calls.filter(c=>c[0]==='ingest_support_email');assert.equal(ingested.length,2,'a automatica nao e ingerida');
 assert.equal(ingested[0][1].org,'o1');assert.equal(ingested[0][1].box,box);
 const fin=db.calls.find(c=>c[0]==='finish_support_account')![1];assert.equal(fin.through_at,'2026-03-01T11:00:00Z');assert.equal(fin.failure,null);assert.equal(fin.token,'lease-1');
 // falha do Graph: nao avanca a marca e registra mensagem generica
 const bad=fakeDb({claim_support_account:()=>acc,finish_support_account:()=>null});
 assert.equal(await processSupportMailbox(bad,enabled,async()=>{throw new Error('boom segredo');}),'needs_configuration');
 const f=bad.calls.find(c=>c[0]==='finish_support_account')![1];assert.equal(f.through_at,acc.watermark);assert.ok(!/segredo/.test(f.failure));
 // erro ao gravar uma mensagem: nada avanca (a pagina sera reprocessada; o banco ignora duplicadas)
 const half=fakeDb({claim_support_account:()=>acc,ingest_support_email:()=>{throw new Error('db');},finish_support_account:()=>null});
 assert.equal(await processSupportMailbox(half,enabled,graph),'needs_configuration');
 assert.equal(half.calls.find(c=>c[0]==='finish_support_account')![1].through_at,acc.watermark);
 // nada a fazer
 assert.equal(await processSupportMailbox(fakeDb({claim_support_account:()=>null}),enabled,noGraph),'idle');
});

test('paginacao: so segue links do Graph da mesma caixa e pasta',()=>{
 const ok=`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(box)}/mailFolders/inbox/messages?$skiptoken=abc`;
 assert.match(supportPagePath(ok,box),/^\/users\/suporte%40empresa\.test\/mailFolders\/inbox\/messages\?/);
 for(const bad of ['https://evil.test/v1.0/users/x/mailFolders/inbox/messages','https://graph.microsoft.com/v1.0/users/outra%40x.test/mailFolders/inbox/messages','https://graph.microsoft.com/v1.0/users/'+encodeURIComponent(box)+'/messages','https://user:pw@graph.microsoft.com/v1.0/users/'+encodeURIComponent(box)+'/mailFolders/inbox/messages']) assert.throws(()=>supportPagePath(bad,box));
});

test('confirmacao: envia uma vez com cabecalhos de controle; 4xx falha; timeout/5xx e incerto; nunca reenvia sozinho',async()=>{
 const job={id:'job-1',mailbox:box,recipient:'c@x.test',subject:'Recebemos',body:'Protocolo ATD-000001'};
 const sent:any[]=[];
 const db=fakeDb({claim_support_outbox:()=>job,finish_support_outbox:()=>null});
 assert.equal(await processSupportOutbox(db,enabled,async m=>{sent.push(m);}),'accepted');
 assert.equal(sent.length,1);assert.equal(sent[0].headers['X-Ciatos-Auto'],'ack');assert.equal(sent[0].headers['X-Ciatos-Outbox'],'job-1');assert.equal(sent[0].headers['X-Auto-Response-Suppress'],'All');assert.equal(sent[0].from,box);
 assert.deepEqual(db.calls.find(c=>c[0]==='finish_support_outbox')![1],{oid:'job-1',outcome:'ACCEPTED',failure:null});
 for(const [err,expected,outcome] of [[{status:400},'failed','FAILED'],[{status:401},'failed','FAILED'],[{status:429},'uncertain','UNCERTAIN'],[{status:503},'uncertain','UNCERTAIN'],[new Error('timeout'),'uncertain','UNCERTAIN']] as any[]){
  const d=fakeDb({claim_support_outbox:()=>job,finish_support_outbox:()=>null});
  assert.equal(await processSupportOutbox(d,enabled,async()=>{throw err;}),expected);
  assert.equal(d.calls.find(c=>c[0]==='finish_support_outbox')![1].outcome,outcome);
 }
 assert.equal(await processSupportOutbox(fakeDb({claim_support_outbox:()=>null}),enabled,async()=>{throw new Error('x');}),'idle');
 assert.equal(await processSupportOutbox(db,()=>undefined,async()=>{throw new Error('desligado');}),'disabled');
});

test('reconciliacao: confere Itens Enviados e so conclui "nao enviado" com listagem completa',async()=>{
 const uncertain=[{id:'j1',mailbox:box,started_at:'2026-03-01T10:00:00Z'},{id:'j2',mailbox:box,started_at:'2026-03-01T10:00:00Z'},{id:'j3',mailbox:box,started_at:'2026-03-01T10:00:00Z'}];
 const db=fakeDb({list_support_outbox_uncertain:()=>uncertain,reconcile_support_outbox:()=>null});
 const graph=async(_m:string,path:string)=>{
  if(path.includes('j3')) return null;
  return {value:[{id:'s1',internetMessageHeaders:[{name:'X-Ciatos-Outbox',value:'j1'}]}]};
 };
 // j3 lanca erro de listagem (inconclusivo)
 const g=async(m:string,p:string)=>{if(uncertain[2]&&db.calls.filter(c=>c[0]==='reconcile_support_outbox').length>=2)throw new Error('graph down');return graph(m,p);};
 assert.equal(await reconcileSupportOutbox(db,g),2);
 const calls=db.calls.filter(c=>c[0]==='reconcile_support_outbox').map(c=>c[1]);
 assert.deepEqual(calls,[{oid:'j1',found_in_sent:true},{oid:'j2',found_in_sent:false}]);
 // listagem paginada sem achar: inconclusivo
 const paged=fakeDb({list_support_outbox_uncertain:()=>[uncertain[1]],reconcile_support_outbox:()=>null});
 assert.equal(await reconcileSupportOutbox(paged,async()=>({value:[],'@odata.nextLink':'https://graph.microsoft.com/x'})),0);
 assert.ok(sentAckMatch([{internetMessageHeaders:[{name:'x-ciatos-outbox',value:'abc'}]}],'abc'));
 assert.equal(sentAckMatch(undefined,'abc'),false);
});
