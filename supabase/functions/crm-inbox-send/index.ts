// Human-reviewed Inbox replies only. This endpoint never starts a cadence.
import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import {env,service,bodyLimited} from '../_shared/runtime.ts';
import {abrirRemetente} from '../_shared/ms365.ts';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-api-version','Access-Control-Allow-Methods':'POST, OPTIONS'};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return respond({error:'Método não permitido.'},405);
 if(env('CRM_LIVE_SEND_ENABLED')!=='true')return respond({error:'Envio real desativado no servidor.'},403);
 const token=req.headers.get('Authorization')||'';
 const caller=createClient(env('SUPABASE_URL')!,env('SUPABASE_ANON_KEY')!,{db:{schema:'crm'},global:{headers:{Authorization:token}},auth:{persistSession:false}});
 const {data:{user},error:authError}=await caller.auth.getUser();
 if(authError||!user)return respond({error:'Entre novamente para responder.'},401);
 let input:Record<string,unknown>;
 try{input=JSON.parse(await bodyLimited(req,10000));}catch{return respond({error:'Resposta inválida.'},400);}
 const cid=String(input.conversation_id||''),rid=String(input.request_id||''),body=String(input.body||'').trim();
 if(!uuid.test(cid)||!uuid.test(rid)||body.length<1||body.length>4000)return respond({error:'Confira a conversa e a mensagem.'},400);
 const {data:visible}=await caller.from('inbox_conversations').select('id').eq('id',cid).maybeSingle();
 if(!visible)return respond({error:'Conversa indisponível nesta empresa.'},403);
 const db=service();
 // Resolve credentials before reservation. A failure here cannot leave an
 // ambiguous pending message. No Graph send occurs until the reservation.
 let sender:Awaited<ReturnType<typeof abrirRemetente>>;
 try{sender=await abrirRemetente(env,db);}catch{return respond({error:'Caixa Microsoft 365 indisponível ou envio desativado.'},503);}
 const {data:reserved,error:reserveError}=await db.rpc('reserve_inbox_reply',{cid,actor:user.id,rid,reply_body:body});
 if(reserveError)return respond({error:reserveError.message||'Não foi possível preparar a resposta.'},403);
 if(!reserved?.send)return respond({status:reserved?.status||'REVIEW',message_id:reserved?.message_id});
 try{
   await sender.enviar({from:reserved.sender,fromName:reserved.sender_name,to:reserved.recipient,
     subject:reserved.subject,text:reserved.body,replyTo:reserved.reply_to});
   const {error}=await db.rpc('finish_inbox_reply',{rid,result:'ACCEPTED'});
   if(error)return respond({status:'REVIEW',message_id:reserved.message_id});
   return respond({status:'ACCEPTED',message_id:reserved.message_id});
 }catch{
   // Graph can time out after accepting the message. Never retry the request.
   await db.rpc('finish_inbox_reply',{rid,result:'REVIEW'});
   return respond({status:'REVIEW',message_id:reserved.message_id});
 }
});
