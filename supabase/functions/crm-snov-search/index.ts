// Radar company discovery. No LLM call and no email reveal: Snov.io company
// search can consume Snov credits, so each task/page is persisted before polling.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
import { env, service, json, bodyLimited } from '../_shared/runtime.ts';
import { SnovAdapter } from '../_shared/snov.ts';
import { snovCompanyFilters, snovCompanies } from '../_shared/snovCompanySearch.ts';

const cors = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS' };
const respond = (value:unknown,status=200) => { const r=json(value,status); for(const [k,v] of Object.entries(cors))r.headers.set(k,v); return r; };
const idOk = (value:unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value||''));
const messageFor = (error:unknown) => {
  const code = error instanceof Error ? error.message : '';
  if(code==='snov_402'||code==='snov_403')return 'A busca de empresas não está disponível no plano ou saldo atual do Snov.io. Confira o acesso à Database Search API.';
  if(code==='snov_429')return 'O Snov.io limitou as consultas. Aguarde e retome esta lista.';
  if(code==='snov_400')return 'O Snov.io não reconheceu algum filtro. Revise o segmento e a localização e crie uma nova lista.';
  if(code==='snov_invalid_search'||code==='invalid_provider_result')return 'O Snov.io não retornou uma busca válida para este setor ou localização. Revise os filtros e crie uma nova lista.';
  return 'Não foi possível consultar o Snov.io. Os resultados já encontrados foram preservados.';
};

Deno.serve(async req => {
  if(req.method==='OPTIONS')return respond({});
  if(req.method!=='POST')return respond({error:'method_not_allowed'},405);
  if(env('CRM_SNOV_ENABLED')!=='true'||!env('SNOV_CLIENT_ID')||!env('SNOV_CLIENT_SECRET'))return respond({error:'Conexão Snov.io não configurada no servidor.'},503);
  let input:any;
  try { input=JSON.parse(await bodyLimited(req,2000)); } catch { return respond({error:'Requisição inválida.'},400); }
  const org=String(input.organization_id||''), jobId=String(input.jobId||'');
  if(!idOk(org)||!idOk(jobId))return respond({error:'Lista ou empresa inválida.'},400);
  const caller=createClient(env('SUPABASE_URL')!,env('SUPABASE_ANON_KEY')!,{db:{schema:'crm'},global:{headers:{Authorization:req.headers.get('Authorization')||''}}});
  const {data:auth}=await caller.auth.getUser();
  if(!auth.user)return respond({error:'Não autenticado.'},401);
  const {data:member}=await caller.rpc('tenant_member',{org,admin_only:true});
  if(!member)return respond({error:'Sem permissão para pesquisar nesta empresa.'},403);
  // The global Snov account is owned by Grupo Ciatos. A SaaS customer must
  // have its own connection before this route can be opened to its members.
  const {data:owner}=await caller.rpc('group_admin');
  if(!owner&&auth.user.email?.toLowerCase()!=='diegociatos@gmail.com')return respond({error:'Esta conta Snov.io pertence ao Grupo Ciatos.'},403);
  const db=service();
  const {data:job,error:lookupError}=await db.from('mining_jobs').select('*').eq('organization_id',org).eq('id',jobId).maybeSingle();
  if(lookupError||!job)return respond({error:'Lista do Radar não encontrada.'},404);
  if(job.status!=='Running')return respond({status:job.status,foundCount:Number(job.dados?.foundCount)||0});
  const original=job.dados||{};
  if(original.sourceProvider==='snov')return respond({error:'Esta lista importada não pode iniciar uma nova busca.'},400);
  const filters=original.filters||{};
  let searchFilters:Record<string,unknown>;
  try { searchFilters=snovCompanyFilters(filters); } catch { return respond({error:'Informe um segmento para a busca.'},400); }
  const page=Math.max(1,Math.min(25,Number(original.snovPage)||1));
  if(original.snovLeaseUntil&&Date.parse(original.snovLeaseUntil)>Date.now())return respond({status:'Running',pending:true,foundCount:Number(original.foundCount)||0});
  const leaseToken=crypto.randomUUID();
  const leaseUntil=new Date(Date.now()+45000).toISOString();
  const {data:claimed,error:claimError}=await db.from('mining_jobs').update({dados:{...original,sourceProvider:'snov_database',snovPage:page,snovLeaseToken:leaseToken,snovLeaseUntil:leaseUntil}})
    .eq('organization_id',org).eq('id',jobId).eq('status','Running').eq('updated_at',job.updated_at).select('*').maybeSingle();
  if(claimError)return respond({error:'Não foi possível reservar a consulta.'},503);
  if(!claimed)return respond({status:'Running',pending:true,foundCount:Number(original.foundCount)||0});
  let stamp=claimed.updated_at;
  let state=claimed.dados;
  const save=async (next:Record<string,unknown>,status='Running') => {
    const {data,error}=await db.from('mining_jobs').update({dados:next,status}).eq('organization_id',org).eq('id',jobId)
      .eq('status','Running').eq('updated_at',stamp).select('updated_at').maybeSingle();
    if(error||!data)throw new Error('job_changed');
    stamp=data.updated_at;state=next;
  };
  let hash=String(state.snovTaskHash||'');
  try {
    const adapter=new SnovAdapter(env);
    if(!hash){
      hash=await adapter.startCompanySearch(searchFilters,page);
      await save({...state,snovTaskHash:hash});
    }
    const result=await adapter.companySearchResult(hash);
    if(result?.status!=='completed'){
      if(result?.error)throw new Error('snov_result_unavailable');
      if(result?.status==='failed'||(Number(state.snovPendingPolls)||0)>=30)throw new Error('snov_result_unavailable');
      await save({...state,snovPendingPolls:(Number(state.snovPendingPolls)||0)+1,snovLeaseToken:null,snovLeaseUntil:null});
      return respond({status:'Running',pending:true,foundCount:Number(state.foundCount)||0});
    }
    const parsed=snovCompanies(result,filters);
    const rows=parsed.companies.map(company=>({organization_id:org,job_id:jobId,snov_prospect_id:company.domain,cnpj_raw:null,dados:{
      name:company.name,tradeName:company.name,cnpj:'',cnpjRaw:'',segment:String(filters.segment||''),
      city:company.location.split(',')[0]?.trim()||'',state:String(filters.state||''),
      phone:'',phoneCompany:'Não localizado',emailCompany:'Não localizado',website:company.domain,
      partners:[],contactName:'',contactPhone:'',contactEmail:'',scoreIa:0,icpScore:0,reason:'',
      size:company.size,snovEmployeeRange:company.size,snovIndustry:company.industry,
      sources:[`https://${company.domain}`],sourceProvider:'snov_database',contact_source:'Snov.io Database Search',
      contact_basis:null,isGarimpo:true,verificadoReceita:false,
    }}));
    if(rows.length){
      const {error}=await db.from('mining_leads').upsert(rows,{onConflict:'job_id,snov_prospect_id',ignoreDuplicates:true});
      if(error)throw new Error('database_operation_failed');
    }
    const {count,error:countError}=await db.from('mining_leads').select('id',{count:'exact',head:true}).eq('organization_id',org).eq('job_id',jobId);
    if(countError)throw new Error('database_operation_failed');
    const foundCount=count||0,empty=rows.length===0?(Number(state.paginasVazias)||0)+1:0;
    const target=Math.min(500,Math.max(1,Number(state.targetCount)||100));
    const completed=foundCount>=target||empty>=3||page>=25||page>=parsed.totalPages;
    const status=completed?'Completed':'Running';
    await save({...state,foundCount,pagesFetched:(Number(state.pagesFetched)||0)+1,paginasVazias:empty,
      snovPage:page+1,snovTaskHash:null,snovPendingPolls:0,snovLeaseToken:null,snovLeaseUntil:null,updatedAt:new Date().toISOString()},status);
    return respond({status,foundCount,adicionadas:rows.length});
  } catch(error) {
    if(error instanceof Error&&error.message==='job_changed')return respond({status:'Running',pending:true});
    const message=messageFor(error);
    // Preserve the provider task hash: Resume polls the same result instead of
    // starting a second paid request for this page.
    await db.from('mining_jobs').update({status:'Failed',dados:{...state,snovTaskHash:hash||null,snovLeaseToken:null,snovLeaseUntil:null,
      lastError:message,lastErrorCode:'SNOV_SEARCH_FAILED',lastErrorProvider:'snov'}}).eq('organization_id',org).eq('id',jobId)
      .eq('status','Running').eq('updated_at',stamp);
    return respond({status:'Failed',error:message,foundCount:Number(state.foundCount)||0});
  }
});
