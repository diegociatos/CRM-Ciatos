// IA do CRM — agora roda no servidor (Edge Function crm-ia, Claude).
// O nome do arquivo foi mantido para não mexer nos imports das telas.
import { supabase } from '../lib/supabase';
import { Lead, MasterTemplate, ObjectionAnalysis } from '../types';

async function chamarIA<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('crm-ia', { body });
  if (error) {
    let msg = error.message;
    try { msg = (await (error as any).context.json()).error || msg; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export const solveObjectionIA = (objection: string, lead: Lead, baseScriptBody?: string): Promise<ObjectionAnalysis> =>
  chamarIA<ObjectionAnalysis>({ action: 'objecao', objecao: objection, lead, script: baseScriptBody });

export const personalizeMasterTemplateIA = (lead: Lead, template: MasterTemplate): Promise<{ subject: string; body: string }> =>
  chamarIA({ action: 'email', lead, template });

/** Processa uma "página" do Radar no servidor (busca + validação na Receita + gravação). */
export const processarPaginaRadar = (jobId: string) =>
  chamarIA<{ adicionadas: number; descartadas: number; status: string; foundCount: number }>({ action: 'radar', jobId });
