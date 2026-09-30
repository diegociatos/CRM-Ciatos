// IA do CRM — agora roda no servidor (Edge Function crm-ia, Claude).
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

/** Processa uma "página" do Radar no servidor (busca + validação na Receita + gravação). */
export const processarPaginaRadar = (jobId: string,organizationId:string) =>
  chamarIA<{ adicionadas: number; descartadas: number; status: string; foundCount: number }>({ action: 'radar', jobId,organization_id:organizationId });
