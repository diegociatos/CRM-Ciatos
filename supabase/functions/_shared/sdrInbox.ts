import { classifyReply } from './sdr.ts';
import type { Env } from './outreach.ts';
const rpc=async(db:any,name:string,args:any={})=>{const r=await db.rpc(name,args);if(r.error)throw new Error(name);return r.data;};
export function graphPagePath(next:string,mailbox:string) {
  const u=new URL(next);const prefix=`/v1.0/users/${encodeURIComponent(mailbox)}/messages`;
  if(u.origin!=='https://graph.microsoft.com'||decodeURIComponent(u.pathname)!==decodeURIComponent(prefix)||u.username||u.password)throw new Error('invalid_graph_page');
  return u.pathname.slice('/v1.0'.length)+u.search;
}
export function replyToken(subject:string) { return subject.match(/\[Ciatos:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i)?.[1]?.toLowerCase(); }
export function replyText(body:any) {
  return String(body?.content||'').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim().slice(0,8000);
}
/** Reads only configured campaign reply mailboxes. Only correlated replies reach the AI. */
export async function processSdrInbox(db:any,env:Env,graph:(method:string,path:string)=>Promise<any>) {
  if(env('CRM_REPLY_READ_ENABLED')!=='true')return 'read_permission_required';
  const cursor=await rpc(db,'claim_sdr_mailbox');if(!cursor)return 'idle';
  let through=cursor.watermark;let next:string|null=null;
  try {
    const base=`/users/${encodeURIComponent(cursor.mailbox)}/messages`;
    const query=new URLSearchParams({'$select':'id,subject,from,receivedDateTime,toRecipients,isDraft','$filter':`receivedDateTime ge ${new Date(Date.parse(cursor.watermark)-60000).toISOString()}`,'$orderby':'receivedDateTime asc','$top':'10'});
    const path=cursor.next_path?graphPagePath(cursor.next_path,cursor.mailbox):`${base}?${query}`;
    const page=await graph('GET',path);if(!Array.isArray(page?.value))throw new Error('invalid_page');
    for(const m of page.value){
      if(Date.parse(m.receivedDateTime)>Date.parse(through))through=m.receivedDateTime;
      const token=replyToken(String(m.subject||''));if(!token||m.isDraft)continue;
      const {data:j,error}=await db.from('automation_jobs').select('id,organization_id,lead_id,enrollment_id,payload,dispatch_started_at').eq('reply_token',token).maybeSingle();if(error)throw new Error('lookup');
      if(!j?.dispatch_started_at||Date.parse(m.receivedDateTime)<Date.parse(j.dispatch_started_at)||String(m.from?.emailAddress?.address||'').toLowerCase()!==String(j.payload?.recipient||'').toLowerCase())continue;
      const {data:p}=await db.from('outreach_policy').select('sender,reply_to').eq('organization_id',j.organization_id).single();
      if(String(p?.reply_to||p?.sender||'').toLowerCase()!==cursor.mailbox)continue;
      const event_key=`graph:${cursor.mailbox}:${m.id}`;
      const {data:exists,error:checkError}=await db.from('sdr_alerts').select('id').eq('event_id',event_key).maybeSingle();if(checkError)throw new Error('lookup');if(exists)continue;
      const detail=await graph('GET',`${base}/${encodeURIComponent(m.id)}?$select=uniqueBody,internetMessageHeaders`);
      const automatic=(detail.internetMessageHeaders||[]).some((h:any)=>h.name.toLowerCase()==='auto-submitted'&&h.value.toLowerCase()!=='no');
      let decision:any={kind:'automatic',confidence:1,summary:'Resposta automática; não é sinal de interesse.'};
      if(!automatic){
        // Pause before a potentially slow classifier; reply is never followed by another scheduled sales message.
        const {error:pauseError}=await db.from('sequence_enrollments').update({status:'PAUSED',stop_reason:'reply_classifying'}).eq('lead_id',j.lead_id).eq('status','ACTIVE');if(pauseError)throw new Error('pause_failed');
        let rid:any;
        try {
          rid=await rpc(db,'reserve_ai_run',{org:j.organization_id,lid:j.lead_id});
          decision=await classifyReply(env,replyText(detail.uniqueBody));
          const {error:auditError}=await db.from('ai_runs').update({status:'DONE',agent:'sdr_reply',provider:env('CRM_AI_PROVIDER')||'openai',model:env((env('CRM_AI_PROVIDER')||'openai')==='openai'?'CRM_OPENAI_MODEL':'CRM_CLAUDE_MODEL')||'disabled',action:decision.kind,output:decision,confidence:decision.confidence,completed_at:new Date().toISOString()}).eq('id',rid);if(auditError)throw new Error('audit_failed');
        }catch{
          if(rid)await db.from('ai_runs').update({status:'FAILED',completed_at:new Date().toISOString()}).eq('id',rid);
          decision={kind:'review',confidence:1,summary:'Resposta recebida. A análise automática não foi concluída; confira a caixa de e-mail.'};
        }
      }
      const body=replyText(detail.uniqueBody)||'(Mensagem sem texto legível; confira a caixa de e-mail.)';
      await rpc(db,'capture_sdr_inbox_reply',{jid:j.id,event_key,category:decision.kind,summary:decision.summary,message_body:body,sender_email:String(m.from?.emailAddress?.address||''),reply_subject:String(m.subject||''),received_at:m.receivedDateTime});
      // One AI classification per invocation; replay this page, skipping persisted event IDs.
      await rpc(db,'finish_sdr_mailbox',{address:cursor.mailbox,token:cursor.lease,next_url:cursor.next_path,through_at:cursor.watermark,failure:null});
      return 'reply_processed';
    }
    next=page['@odata.nextLink']||null;if(next)graphPagePath(next,cursor.mailbox);
    // On paginated scans retain the original watermark until the last page is consumed.
    await rpc(db,'finish_sdr_mailbox',{address:cursor.mailbox,token:cursor.lease,next_url:next,through_at:next?through:new Date(Date.now()-60000).toISOString(),failure:null});
    return 'synced';
  }catch{
    await rpc(db,'finish_sdr_mailbox',{address:cursor.mailbox,token:cursor.lease,next_url:null,through_at:cursor.watermark,failure:'Não foi possível ler respostas. Confira Mail.Read/Mail.Read.Shared e reconecte a caixa.'});
    return 'needs_configuration';
  }
}
