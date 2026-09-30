import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { env, service, json, bodyLimited } from '../_shared/runtime.ts';
import { SnovAdapter, snovListRows } from '../_shared/snov.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS' };
const respond = (value:unknown,status=200) => { const r=json(value,status); for(const [k,v] of Object.entries(cors)) r.headers.set(k,v); return r; };
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return respond({});
  if(req.method!=='POST')return respond({error:'method_not_allowed'},405);
  if(env('CRM_SNOV_ENABLED')!=='true'||!env('SNOV_CLIENT_ID')||!env('SNOV_CLIENT_SECRET'))return respond({error:'snov_not_configured'},503);
  try {
    const caller=createClient(env('SUPABASE_URL')!,env('SUPABASE_ANON_KEY')!,{db:{schema:'crm'},global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
    const {data:auth}=await caller.auth.getUser();if(!auth.user)return respond({error:'unauthorized'},401);
    const input=JSON.parse(await bodyLimited(req,2000));
    if(!/^[0-9a-f-]{36}$/i.test(String(input.organization_id||'')))return respond({error:'invalid_company'},400);
    const {data:member}=await caller.rpc('tenant_member',{org:input.organization_id,admin_only:true});
    if(!member)return respond({error:'forbidden'},403);
    // The server credentials belong to the platform account. Never expose its
    // lists to admins of a customer workspace in a future SaaS deployment.
    const {data:owner}=await caller.rpc('group_admin');
    if(!owner&&auth.user.email?.toLowerCase()!=='diegociatos@gmail.com')return respond({error:'forbidden'},403);
    const adapter=new SnovAdapter(env);const db=service();
    const raw=await adapter.lists();
    if(!Array.isArray(raw))throw new Error('invalid_provider_result');
    const lists=raw.filter((l:any)=>!l.isDeleted&&Number.isSafeInteger(Number(l.id))&&Number(l.id)>0).slice(0,500).map((l:any)=>({id:Number(l.id),name:String(l.name||'Lista sem nome').slice(0,120),contacts:Math.max(0,Number(l.contacts)||0)}));
    if(input.action==='lists')return respond({lists});
    if(input.action!=='import')return respond({error:'invalid_action'},400);
    const listId=Number(input.list_id),page=Number(input.page||1);
    const selected=lists.find((l:any)=>l.id===listId);
    if(!selected||!Number.isSafeInteger(page)||page<1||page>1000)return respond({error:'invalid_list_page'},400);
    const result=await adapter.listProspects(listId,page);
    const rows=snovListRows(result);
    let {data:job,error:lookupError}=await db.from('mining_jobs').select('id').eq('organization_id',input.organization_id).contains('dados',{sourceProvider:'snov',snovListId:String(listId)}).maybeSingle();
    if(lookupError)throw new Error('database_operation_failed');
    if(!job){
      const created=await db.from('mining_jobs').insert({organization_id:input.organization_id,created_by:auth.user.id,status:'Completed',dados:{name:`Snov.io · ${selected.name}`,sourceProvider:'snov',snovListId:String(listId),version:1,foundCount:0,targetCount:Math.max(1,selected.contacts),filters:{segment:'',city:'',state:'',size:'',taxRegime:'',fiscalFilter:''}}}).select('id').single();
      if(created.error){const again=await db.from('mining_jobs').select('id').eq('organization_id',input.organization_id).contains('dados',{sourceProvider:'snov',snovListId:String(listId)}).single();if(again.error)throw new Error('database_operation_failed');job=again.data;} else job=created.data;
    }
    if(rows.length){
      const saved=await db.from('mining_leads').upsert(rows.map((p:any)=>({organization_id:input.organization_id,job_id:job!.id,snov_prospect_id:p.snovProspectId,cnpj_raw:null,dados:{...p,contact_basis:null,contact_source:'Snov.io',jobId:job!.id,partners:[],segment:'',scoreIa:0}})),{onConflict:'job_id,snov_prospect_id',ignoreDuplicates:true});
      if(saved.error)throw new Error('database_operation_failed');
    }
    const {count}=await db.from('mining_leads').select('id',{count:'exact',head:true}).eq('organization_id',input.organization_id).eq('job_id',job.id);
    await db.from('mining_jobs').update({dados:{name:`Snov.io · ${selected.name}`,sourceProvider:'snov',snovListId:String(listId),version:1,foundCount:count||0,targetCount:Math.max(1,selected.contacts),filters:{segment:'',city:'',state:'',size:'',taxRegime:'',fiscalFilter:''}}}).eq('id',job.id).eq('organization_id',input.organization_id);
    return respond({job_id:job.id,imported:rows.length,total:count||0,next_page:Array.isArray(result.prospects)&&result.prospects.length===100&&page<1000?page+1:null});
  } catch {return respond({error:'snov_import_failed'},502);}
});
