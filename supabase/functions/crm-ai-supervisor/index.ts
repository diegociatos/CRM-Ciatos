import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { env, service, rpc, json, bodyLimited } from '../_shared/runtime.ts';
import { decide } from '../_shared/outreach.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
Deno.serve(async req => {
  if(req.method==='OPTIONS') return new Response('',{headers:cors});
  const respond=(data:unknown,status=200)=>{const r=json(data,status);Object.entries(cors).forEach(([k,v])=>r.headers.set(k,v));return r;};
  if(req.method!=='POST') return respond({error:'method_not_allowed'},405);
  if(env('CRM_AI_ENABLED')!=='true') return respond({error:'ai_disabled'},503);
  const db=service(); let run: number | undefined;
  try {
    const caller=createClient(env('SUPABASE_URL')!,env('SUPABASE_ANON_KEY')!,{db:{schema:'crm'},global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
    const {data:user}=await caller.auth.getUser();if(!user.user) return respond({error:'unauthorized'},401);
    const input=JSON.parse(await bodyLimited(req,4000));
    const {data:allowed,error:permissionError}=await caller.rpc('tenant_member',{org:input.organization_id,admin_only:true});
    if(permissionError || !allowed) return respond({error:'forbidden'},403);
    const {data:lead,error}=await db.from('leads').select('id,empresa,segmento,opt_out').eq('id',input.lead_id).eq('organization_id',input.organization_id).single();
    if(error || lead.opt_out) return respond({error:'invalid_lead'},400);
    run=await rpc(db,'reserve_ai_run',{org:input.organization_id,lid:lead.id});
    const result=await decide(env,{company:lead.empresa,segment:lead.segmento,note:String(input.note || '').slice(0,2000)});
    await rpc(db,'complete_ai_run',{rid:run,provider_name:result.provider,model_name:result.model,decision:result.decision,tokens_in:result.tokens_in,tokens_out:result.tokens_out});
    return respond(result.decision);
  } catch {
    if(run) await db.from('ai_runs').update({status:'FAILED',completed_at:new Date().toISOString()}).eq('id',run);
    return respond({error:'ai_review_failed'},502);
  }
});
