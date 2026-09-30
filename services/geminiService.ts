// IA do CRM roda no servidor. A busca do Radar usa Snov.io sem IA.
// O nome do arquivo foi mantido para não mexer nos imports das telas.
import { supabase } from '../lib/supabase';
import { Lead, MasterTemplate, ObjectionAnalysis } from '../types';

async function chamarIA<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('crm-ia', { body });
  if (error) {
    let msg = error.message;
    let code = ''; let provider = '';
    try { const body = await (error as any).context.json(); msg = body.error || msg; code = body.code || ''; provider = body.provider || ''; } catch { /* sem corpo */ }
    throw Object.assign(new Error(msg), { code, provider });
  }
  if (data?.error) throw Object.assign(new Error(data.error), { code: data.code || '', provider: data.provider || '' });
  return data as T;
}

export const solveObjectionIA = (objection: string, lead: Lead, baseScriptBody?: string): Promise<ObjectionAnalysis> =>
  chamarIA<ObjectionAnalysis>({ action: 'objecao',organization_id:lead.organizationId, objecao: objection, lead, script: baseScriptBody });

export const personalizeMasterTemplateIA = (lead: Lead, template: MasterTemplate): Promise<{ subject: string; body: string }> =>
  chamarIA({ action: 'email',organization_id:lead.organizationId, lead, template });

/** Processa uma página da Database Search do Snov.io, sem consumir tokens de IA. */
export async function processarPaginaRadar(jobId:string,organizationId:string):Promise<{status:string;foundCount:number;pending?:boolean}> {
  const {data,error}=await supabase.functions.invoke('crm-snov-search',{body:{jobId,organization_id:organizationId}});
  if(error){
    let message=error.message;
    try { const body=await (error as any).context.json(); message=body.error||message; } catch { /* sem corpo */ }
    throw Object.assign(new Error(message),{status:(error as any).context?.status||0});
  }
  if(data?.error&&data?.status!=='Failed')throw new Error(data.error);
  return data;
}
