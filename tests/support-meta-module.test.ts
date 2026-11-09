import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {verifyMetaSignature,normalizeMeta,processMetaWebhook,metaVerify,sendSupportMetaReply,verifySupportMetaAccount} from '../supabase/functions/_shared/supportMeta.ts';

const SECRET='app-secret-test';
const sign=(raw:string,secret=SECRET)=>'sha256='+createHmac('sha256',secret).update(raw).digest('hex');
const envOf=(o:Record<string,string>)=>(n:string)=>o[n];
const ON=envOf({CRM_SUPPORT_META_ENABLED:'true',META_APP_SECRET:SECRET,META_VERIFY_TOKEN:'verify-me',META_TOKEN_WHATSAPP_0A1B2C3D4E5F0A1B2C3D4E5F0A1B2C3D:'tok-wa'});
const fakeDb=(h:Record<string,(a:any)=>any>)=>{const calls:any[]=[];return {calls,rpc:async(name:string,args:any={})=>{calls.push([name,args]);const f=h[name];if(!f)return {data:null,error:null};try{return {data:await f(args),error:null};}catch(e:any){return {data:null,error:{message:e.message}};}}};};
const wa=(messages:any[]=[],statuses:any[]=[])=>({object:'whatsapp_business_account',entry:[{id:'waba',changes:[{field:'messages',value:{messaging_product:'whatsapp',metadata:{phone_number_id:'109876543210'},contacts:[{wa_id:'5531999990001',profile:{name:'Maria'}}],messages,statuses}}]}]});
const ts=String(Math.floor(Date.now()/1000));

test('assinatura: so aceita HMAC valido do corpo exato',async()=>{
 const raw='{"a":1}';
 assert.equal(await verifyMetaSignature(SECRET,raw,sign(raw)),true);
 assert.equal(await verifyMetaSignature(SECRET,raw+' ',sign(raw)),false,'corpo alterado');
 assert.equal(await verifyMetaSignature(SECRET,raw,sign(raw,'outro')),false,'segredo errado');
 for(const bad of [null,'','sha256=','sha1='+'a'.repeat(40),'sha256='+'z'.repeat(64),sign(raw).slice(7)]) assert.equal(await verifyMetaSignature(SECRET,raw,bad as any),false);
 assert.equal(await verifyMetaSignature('',raw,sign(raw,'')),false,'sem segredo configurado nunca valida');
});

test('normalizacao WhatsApp: texto, midia vira aviso, reacao e dados invalidos sao ignorados, status reconhecidos',()=>{
 const {items,ignored}=normalizeMeta(wa([
  {from:'5531999990001',id:'wamid.1',timestamp:ts,type:'text',text:{body:'Olá'}},
  {from:'5531999990001',id:'wamid.2',timestamp:ts,type:'image',image:{id:'m1'}},
  {from:'5531999990001',id:'wamid.3',timestamp:ts,type:'reaction',reaction:{emoji:'👍'}},
  {from:'5531999990001',id:'wamid.4',timestamp:ts,type:'interactive',interactive:{button_reply:{title:'Sim'}}},
  {from:'abc',id:'wamid.5',timestamp:ts,type:'text',text:{body:'x'}},
  {from:'5531999990001',timestamp:ts,type:'text',text:{body:'sem id'}},
  {from:'5531999990001',id:'wamid.6',timestamp:ts,type:'<script>',text:{body:'x'}},
 ],[{id:'wamid.OUT',status:'delivered',timestamp:ts},{id:'wamid.OUT',status:'failed',timestamp:ts,errors:[{code:131047,title:'Re-engagement'}]},{id:'wamid.OUT',status:'weird',timestamp:ts}]));
 const msgs=items.filter(i=>i.kind==='message') as any[],st=items.filter(i=>i.kind==='status') as any[];
 assert.deepEqual(msgs.map(m=>m.ext_id),['wamid.1','wamid.2','wamid.4','wamid.6']);
 assert.equal(msgs[0].name,'Maria');assert.equal(msgs[0].account,'109876543210');assert.equal(msgs[0].text,'Olá');
 assert.match(msgs[1].text,/Mensagem do tipo "image"/);assert.equal(msgs[2].text,'Sim');assert.match(msgs[3].text,/desconhecido/,'tipo estranho nao entra no texto');
 assert.deepEqual(st.map(s=>s.status),['delivered','failed']);assert.match(st[1].error,/código 131047/);
 assert.equal(ignored,4,'descartados: reacao, contato invalido, sem id e status desconhecido');
});

test('normalizacao Instagram: ignora eco, mensagem do proprio perfil e sem mid; futuro e limitado',()=>{
 const future=Date.now()+3600e3;
 const {items,ignored}=normalizeMeta({object:'instagram',entry:[{id:'17841400000001',messaging:[
  {sender:{id:'1000000000001'},recipient:{id:'17841400000001'},timestamp:Date.now(),message:{mid:'m1',text:'Oi'}},
  {sender:{id:'17841400000001'},recipient:{id:'1000000000001'},timestamp:Date.now(),message:{mid:'m2',text:'eco',is_echo:true}},
  {sender:{id:'17841400000001'},timestamp:Date.now(),message:{mid:'m3',text:'proprio'}},
  {sender:{id:'1000000000001'},timestamp:future,message:{mid:'m4',attachments:[{type:'image'}]}},
  {sender:{id:'1000000000001'},timestamp:Date.now(),message:{text:'sem mid'}},
  {sender:{id:'1000000000001'},recipient:{id:'17841400000001'},timestamp:Date.now(),read:{mid:'mid.OUT1'}},
 ]}]});
 assert.deepEqual((items as any[]).map(i=>i.ext_id),['m1','m4','mid.OUT1']);
 assert.deepEqual((items as any[])[2].kind+':'+(items as any[])[2].status,'status:read','leitura do Instagram vira evidencia de leitura');
 assert.match((items as any[])[1].text,/sem texto/);assert.ok(Date.parse((items as any[])[1].at)<=Date.now()+6*60000,'timestamp futuro limitado');
 assert.equal(ignored,3);
 assert.deepEqual(normalizeMeta({object:'page',entry:[]}),{items:[],ignored:1});
 assert.deepEqual(normalizeMeta(null).items,[]);
});

test('webhook: desligado/sem segredo/assinatura invalida nao tocam o banco; valido roteia por empresa e ignora conta desconhecida',async()=>{
 const raw=JSON.stringify(wa([{from:'5531999990001',id:'wamid.1',timestamp:ts,type:'text',text:{body:'Olá'}}],[{id:'wamid.OUT',status:'read',timestamp:ts}]));
 const db=fakeDb({resolve_support_meta_account:a=>a.acct==='109876543210'?{organization_id:'org-1'}:null});
 assert.equal((await processMetaWebhook(db,envOf({}),raw,sign(raw))).status,503);
 assert.equal((await processMetaWebhook(db,envOf({CRM_SUPPORT_META_ENABLED:'true'}),raw,sign(raw))).status,503);
 assert.equal((await processMetaWebhook(db,ON,raw,sign(raw,'x'))).status,401);
 assert.equal((await processMetaWebhook(db,ON,raw,null)).status,401);
 assert.equal(db.calls.length,0,'nada foi ao banco antes da assinatura');
 assert.equal((await processMetaWebhook(db,ON,'nao-json',sign('nao-json'))).status,400);
 const ok=await processMetaWebhook(db,ON,raw,sign(raw));
 assert.deepEqual([ok.status,ok.body],[200,{processed:2,skipped:0}]);
 const ing=db.calls.find(c=>c[0]==='ingest_support_meta')![1];assert.equal(ing.org,'org-1');assert.equal(ing.chan,'whatsapp');assert.equal(ing.contact,'5531999990001');assert.equal(ing.contact_name,'Maria');
 assert.equal(db.calls.find(c=>c[0]==='apply_support_meta_status')![1].st,'read');
 // conta nao cadastrada/desabilitada: ignorada com 200 (nao fica reenviando)
 const none=fakeDb({resolve_support_meta_account:()=>null});
 assert.deepEqual((await processMetaWebhook(none,ON,raw,sign(raw))).body,{processed:0,skipped:2});
 assert.equal(none.calls.filter(c=>c[0]!=='resolve_support_meta_account').length,0);
 // falha de banco: 500 para a Meta reenviar
 const bad=fakeDb({resolve_support_meta_account:()=>({organization_id:'o'}),ingest_support_meta:()=>{throw new Error('Intake limit reached');}});
 assert.equal((await processMetaWebhook(bad,ON,raw,sign(raw))).status,500);
});

test('verificacao do webhook (GET): so com token e modo corretos e desafio simples',async()=>{
 const u=(q:string)=>new URL('https://x.test/f?'+q);
 const ok=metaVerify(ON,u('hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345'));assert.equal(ok.status,200);assert.equal(await ok.text(),'12345');
 for(const q of ['hub.mode=subscribe&hub.verify_token=errado&hub.challenge=1','hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=1','hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=<script>','hub.mode=subscribe&hub.verify_token=verify-me'])
  assert.equal(metaVerify(ON,u(q)).status,403);
 assert.equal(metaVerify(envOf({META_VERIFY_TOKEN:'verify-me'}),u('hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=1')).status,403,'desligado nao responde');
});

const reserved=(over:any={})=>({send:true,message_id:'m1',channel:'whatsapp',account_id:'109876543210',token_ref:'META_TOKEN_WHATSAPP_0A1B2C3D4E5F0A1B2C3D4E5F0A1B2C3D',to:'5531999990001',body:'Olá',...over});
const res=(status:number,body:any)=>new Response(JSON.stringify(body),{status});
test('envio: aceita com id, 4xx falha, timeout/5xx/429/sem id e incerto, nunca reenvia, token so do servidor',async()=>{
 const run=async(f:(u:string,i:any)=>Promise<Response>,r=reserved(),e=ON)=>{const db=fakeDb({finish_support_meta_reply:()=>null});const out=await sendSupportMetaReply(db,e,'rid-1',r,f as any);return {out,fin:db.calls[0][1]};};
 let seen:any;
 const a=await run(async(u,i)=>{seen={u,i};return res(200,{messages:[{id:'wamid.NEW'}]});});
 assert.equal(a.out,'ACCEPTED');assert.deepEqual([a.fin.result,a.fin.ext_id],['ACCEPTED','wamid.NEW']);
 assert.equal(seen.u,'https://graph.facebook.com/v21.0/109876543210/messages');assert.equal(seen.i.headers.Authorization,'Bearer tok-wa');
 assert.deepEqual(JSON.parse(seen.i.body),{messaging_product:'whatsapp',recipient_type:'individual',to:'5531999990001',type:'text',text:{preview_url:false,body:'Olá'}});
 const ig=await run(async(_u,i)=>{seen=JSON.parse(i.body);return res(200,{message_id:'mid.1'});},reserved({channel:'instagram',token_ref:'META_TOKEN_INSTAGRAM_0A1B2C3D4E5F0A1B2C3D4E5F0A1B2C3D'}),envOf({CRM_SUPPORT_META_ENABLED:'true',META_TOKEN_INSTAGRAM_0A1B2C3D4E5F0A1B2C3D4E5F0A1B2C3D:'t'}));
 assert.equal(ig.out,'ACCEPTED');assert.deepEqual(seen,{recipient:{id:'5531999990001'},messaging_type:'RESPONSE',message:{text:'Olá'}});
 const f=await run(async()=>res(400,{error:{code:131047,message:'segredo do cliente'}}));
 assert.equal(f.out,'FAILED');assert.match(f.fin.failure,/HTTP 400, código 131047/);assert.ok(!/segredo/.test(f.fin.failure));
 for(const make of [()=>res(500,{}),()=>res(429,{}),()=>res(408,{}),()=>res(200,{}),()=>res(200,'x')]){
  const u=await run(async()=>make());assert.equal(u.out,'REVIEW',String(make));assert.equal(u.fin.result,'REVIEW');
 }
 const t=await run(async()=>{throw new Error('timeout');});assert.equal(t.out,'REVIEW');
 // credencial ausente ou nome de segredo fora do padrao: falha antes de qualquer chamada
 let called=0;
 for(const r of [reserved({token_ref:'META_TOKEN_WHATSAPP_FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'}),reserved({token_ref:'META_TOKEN_WHATSAPP_0A1B2C3D4E5F'}),reserved({token_ref:'SUPABASE_SERVICE_ROLE_KEY'}),reserved({token_ref:'META_APP_SECRET'}),reserved({token_ref:undefined}),reserved({channel:'telegram'})]){
  const x=await run(async()=>{called++;return res(200,{});},r,envOf({CRM_SUPPORT_META_ENABLED:'true',SUPABASE_SERVICE_ROLE_KEY:'s',META_APP_SECRET:SECRET,META_TOKEN_WHATSAPP_0A1B2C3D4E5F0A1B2C3D4E5F0A1B2C3D:'tok-wa'}));
  assert.equal(x.out,'FAILED');
 }
 assert.equal(called,0,'segredo arbitrario nunca e lido nem enviado');
 // falha ao registrar o resultado aceito: fica para conferencia
 const dbErr={rpc:async()=>({data:null,error:{message:'x'}})};
 assert.equal(await sendSupportMetaReply(dbErr,ON,'rid',reserved(),(async()=>res(200,{messages:[{id:'w'}]})) as any),'REVIEW');
});

test('webhook: item bloqueado nao impede os demais do lote; qualquer falha devolve 500 para reentrega',async()=>{
 const raw=JSON.stringify(wa([{from:'5531911111111',id:'wamid.NEW',timestamp:ts,type:'text',text:{body:'novo contato'}},{from:'5531999990001',id:'wamid.OLD',timestamp:ts,type:'text',text:{body:'contato existente'}}]));
 const db=fakeDb({resolve_support_meta_account:()=>({organization_id:'o'}),ingest_support_meta:a=>{if(a.ext_id==='wamid.NEW')throw new Error('Intake limit reached');return {status:'stored'};}});
 const out=await processMetaWebhook(db,ON,raw,sign(raw));
 assert.equal(out.status,500);assert.deepEqual([out.body.processed,out.body.failed],[1,1]);
 assert.equal(db.calls.filter(c=>c[0]==='ingest_support_meta').length,2,'o segundo item foi tentado mesmo apos a falha do primeiro');
});

test('verificacao de posse: so verifica quando o token da empresa acessa exatamente a conta; nunca usa segredo fora do padrao',async()=>{
 const REF='META_TOKEN_WHATSAPP_0A1B2C3D4E5F0A1B2C3D4E5F0A1B2C3D';
 const target={account_id:'109876543210',token_ref:REF};
 const run=async(f:any,t:any=target,e:any=ON)=>{const db=fakeDb({mark_support_meta_verified:()=>null});return {out:await verifySupportMetaAccount(db,e,'org-1','whatsapp',t,f),db};};
 let seen:any;
 const ok=await run(async(u:string,i:any)=>{seen={u,i};return res(200,{id:'109876543210'});});
 assert.equal(ok.out,'verified');assert.equal(seen.u,'https://graph.facebook.com/v21.0/109876543210?fields=id');assert.equal(seen.i.headers.Authorization,'Bearer tok-wa');
 assert.deepEqual(ok.db.calls[0],['mark_support_meta_verified',{org:'org-1',chan:'whatsapp',acct:'109876543210'}]);
 for(const [f,expected] of [[async()=>res(200,{id:'999'}),'rejected'],[async()=>res(403,{error:{}}),'rejected'],[async()=>res(404,{}),'rejected'],[async()=>res(500,{}),'unavailable'],[async()=>{throw new Error('net');},'unavailable']] as any[]){
  const r=await run(f);assert.equal(r.out,expected);assert.equal(r.db.calls.length,0,'nada e marcado sem prova');
 }
 let called=0;
 for(const t of [{...target,token_ref:'SUPABASE_SERVICE_ROLE_KEY'},{...target,token_ref:'META_APP_SECRET'},{...target,token_ref:'META_TOKEN_WHATSAPP_FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF'},{...target,account_id:'12'},{token_ref:REF}])
  assert.equal((await run(async()=>{called++;return res(200,{id:'x'});},t)).out,'unavailable');
 assert.equal(called,0);
});
