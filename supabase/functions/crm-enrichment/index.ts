import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { env, service, rpc, json, bodyLimited } from '../_shared/runtime.ts';
import { SnovAdapter, verifiedResult } from '../_shared/snov.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('', { headers: cors });
  const respond = (data: unknown, status = 200) => { const r = json(data,status); Object.entries(cors).forEach(([k,v])=>r.headers.set(k,v)); return r; };
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' },405);
  if (env('CRM_SNOV_ENABLED') !== 'true') return respond({ error: 'snov_disabled' },503);
  try {
    const caller = createClient(env('SUPABASE_URL')!,env('SUPABASE_ANON_KEY')!,{db:{schema:'crm'},global:{headers:{Authorization:req.headers.get('Authorization') || ''}}});
    const { data: user } = await caller.auth.getUser(); if (!user.user) return respond({error:'unauthorized'},401);
    const input = JSON.parse(await bodyLimited(req,4000));
    const { data: permitted, error: permError } = await caller.rpc('tenant_member',{org:input.organization_id,admin_only:true});
    if (permError || !permitted) return respond({error:'forbidden'},403);
    const db=service(); const adapter=new SnovAdapter(env);
    if (input.action === 'start') {
      const {data:lead,error}=await db.from('leads').select('id,email,opt_out,contact_basis,contact_source').eq('id',input.lead_id).eq('organization_id',input.organization_id).single();
      if(error || lead.opt_out || !lead.contact_basis || !lead.contact_source) return respond({error:'contact_review_required'},400);
      const value = input.kind === 'verify' ? lead.email : String(input.domain || '').trim().toLowerCase();
      const id=await rpc(db,'reserve_enrichment',{org:input.organization_id,lid:lead.id,operation:input.kind,value});
      // Atomic transition prevents concurrent duplicate credit-consuming requests.
      const {data:claimed,error:claimError}=await db.from('enrichment_requests').update({status:'RUNNING'}).eq('id',id).eq('status','PENDING').select('id').maybeSingle();
      if(claimError) throw new Error('reserve_failed');
      if(!claimed) return respond({id,status:'already_requested'});
      try {
        const result=await adapter.start(input.kind,value);
        const hash=result.data?.task_hash || result.meta?.task_hash;
        if(typeof hash!=='string') throw new Error('invalid_provider_result');
        const {error:saveError}=await db.from('enrichment_requests').update({status:'WAITING',task_hash:hash}).eq('id',id);
        if(saveError) throw new Error('save_failed');
        return respond({id,status:'WAITING'});
      } catch { await db.from('enrichment_requests').update({status:'FAILED'}).eq('id',id); throw new Error('enrichment_failed'); }
    }
    if (input.action === 'poll') {
      const {data:job,error}=await db.from('enrichment_requests').select('*').eq('id',input.id).eq('organization_id',input.organization_id).single();
      if(error) return respond({error:'not_found'},404);
      if(job.status!=='WAITING') return respond({id:job.id,status:job.status,result:job.result});
      if(Date.now()-Date.parse(job.updated_at)<10000) return respond({id:job.id,status:'WAITING'});
      const {error:touchError}=await db.from('enrichment_requests').update({updated_at:new Date().toISOString()}).eq('id',job.id);
      if(touchError) throw new Error('save_failed');
      const result=await adapter.result(job.kind,job.task_hash);
      if(result.status!=='completed') return respond({id:job.id,status:'WAITING'});
      // Keep only useful fields; never retain the whole provider payload.
      const candidates = job.kind==='discover' ? (Array.isArray(result.data)?result.data:[]).slice(0,20).map((p:any)=>({name:String(p.name || '').slice(0,200),first_name:String(p.first_name || '').slice(0,100),last_name:String(p.last_name || '').slice(0,100),position:String(p.position || '').slice(0,200),emails:(Array.isArray(p.emails)?p.emails:[]).slice(0,3).map((e:any)=>({email:String(e.email || '').slice(0,254)}))})) : [];
      const verified=job.kind==='verify' && verifiedResult(result,job.input);
      await rpc(db,'complete_enrichment',{rid:job.id,verified,candidates});
      return respond({id:job.id,status:'DONE',verified,candidates});
    }
    return respond({error:'invalid_action'},400);
  } catch { return respond({error:'enrichment_failed'},502); }
});
