// Radar: buscas e resultados ficam em crm.mining_jobs / crm.mining_leads.
// Cada "página" é processada no servidor (Edge Function crm-ia → Claude + web
// search + validação na Receita). O navegador só dispara as páginas em série
// enquanto a busca estiver "Running" e mantém um cache para as telas.

import { MiningJob, MiningLead, CompanySize } from '../types';
import { supabase } from '../lib/supabase';
import { processarPaginaRadar } from './geminiService';

const EVENTO = 'ciatos-mining-update';
const emitir = () => window.dispatchEvent(new CustomEvent(EVENTO));
const esperar = (ms: number) => new Promise(r => setTimeout(r, ms));

interface JobRow { id: string; status: string; dados: any; created_at: string; updated_at: string }
interface MLeadRow { id: string; job_id: string; cnpj_raw: string | null; imported: boolean; dados: any; created_at: string }

const jobDeRow = (r: JobRow): MiningJob => ({ ...r.dados, id: r.id, status: r.status as MiningJob['status'], createdAt: r.created_at, updatedAt: r.updated_at });
const leadDeRow = (r: MLeadRow): MiningLead => ({ ...r.dados, id: r.id, jobId: r.job_id, cnpjRaw: r.cnpj_raw || '', isImported: r.imported, createdAt: r.created_at });

export class MiningEngine {
  constructor(private organizationId:string){}
  private disposed=false;
  public dispose(){this.disposed=true;this.workers.clear();this.jobs=[];this.leads={};}
  private jobs: MiningJob[] = [];
  private leads: Record<string, MiningLead[]> = {};
  private workers = new Set<string>();
  private iniciado = false;

  /** Carrega as buscas e retoma as que estão rodando. Idempotente. */
  public async init() {
    await this.refresh();
    if (this.iniciado||this.disposed) return;
    this.iniciado = true;
    this.jobs.filter(j => j.status === 'Running').forEach(j => this.startWorker(j.id));
  }

  public getJobs(): MiningJob[] {
    return this.jobs;
  }

  public getLeadsByJob(jobId: string): MiningLead[] {
    return (this.leads[jobId] || []).filter(l => !l.isImported);
  }

  public async refresh() {
    const { data, error } = await supabase.from('mining_jobs').select('*').eq('organization_id',this.organizationId).order('created_at', { ascending: false });
    if (error) { console.error('[Radar]', error.message); return; }
    if(this.disposed)return;
    this.jobs = (data as JobRow[]).map(jobDeRow);
    emitir();
  }

  public async loadLeads(jobId: string) {
    const { data, error } = await supabase.from('mining_leads').select('*')
      .eq('organization_id',this.organizationId).eq('job_id', jobId).eq('imported', false).order('created_at', { ascending: false }).limit(1000);
    if (error) { console.error('[Radar]', error.message); return; }
    this.leads[jobId] = (data as MLeadRow[]).map(leadDeRow);
    emitir();
  }

  public async createJob(params: {
    segmentName: string; state: string; city: string; size: CompanySize | 'all';
    taxRegime: string; targetCount: number; fiscalFilter: 'Dívida Ativa' | 'Indiferente';
    autoCreateSegment: boolean; enrich: boolean;
  }): Promise<MiningJob> {
    const { data: u } = await supabase.auth.getUser();
    const dados = {
      name: params.segmentName,
      version: 1,
      configPayload: { ...params },
      filters: {
        segment: params.segmentName, state: params.state, city: params.city,
        size: params.size, taxRegime: params.taxRegime, fiscalFilter: params.fiscalFilter,
      },
      targetCount: params.targetCount,
      foundCount: 0, pagesFetched: 0, errors: 0,
      autoCreateSegment: params.autoCreateSegment, enrich: params.enrich,
      lastNotificationMilestone: 0,
    };
    const { data, error } = await supabase.from('mining_jobs')
      .insert({ organization_id:this.organizationId,status: 'Running', created_by: u.user?.id ?? null, dados }).select().single();
    if (error) throw new Error(`Criar busca: ${error.message}`);
    const job = jobDeRow(data as JobRow);
    await this.refresh();
    this.startWorker(job.id);
    return job;
  }

  public async controlJob(jobId: string, action: 'pause' | 'resume' | 'cancel' | 'delete') {
    if (action === 'delete') {
      this.workers.delete(jobId);
      const { error } = await supabase.from('mining_jobs').delete().eq('organization_id',this.organizationId).eq('id', jobId);
      if (error) alert(`Excluir busca: ${error.message}`);
      delete this.leads[jobId];
      await this.refresh();
      return;
    }
    const status = action === 'pause' ? 'Paused' : action === 'resume' ? 'Running' : 'Cancelled';
    const job = this.jobs.find(j => j.id === jobId);
    const { error } = await supabase.from('mining_jobs')
      .update({ status, dados: { ...(job || {}), status } }).eq('organization_id',this.organizationId).eq('id', jobId);
    if (error) return alert(`Atualizar busca: ${error.message}`);
    await this.refresh();
    if (status === 'Running') this.startWorker(jobId);
    else this.workers.delete(jobId);
  }

  public deleteJob(jobId: string) {
    return this.controlJob(jobId, 'delete');
  }

  public async markAsImported(jobId: string, cnpjRaw: string) {
    await supabase.from('mining_leads').update({ imported: true }).eq('organization_id',this.organizationId).eq('job_id', jobId).eq('cnpj_raw', cnpjRaw);
    if (this.leads[jobId]) this.leads[jobId] = this.leads[jobId].map(l => l.cnpjRaw === cnpjRaw ? { ...l, isImported: true } : l);
    emitir();
  }

  /** Processa páginas em série (nunca duas ao mesmo tempo para o mesmo job). */
  private async startWorker(jobId: string) {
    if (this.disposed||this.workers.has(jobId)) return;
    this.workers.add(jobId);
    let falhasSeguidas = 0;
    while (this.workers.has(jobId)) {
      const job = this.jobs.find(j => j.id === jobId);
      if (!job || job.status !== 'Running') break;
      try {
        const r = await processarPaginaRadar(jobId,this.organizationId);
        falhasSeguidas = 0;
        await this.refresh();
        if (this.leads[jobId]) await this.loadLeads(jobId);
        if (r.status !== 'Running') break;
      } catch (e) {
        falhasSeguidas++;
        console.error('[Radar] página falhou:', e);
        if (falhasSeguidas >= 3) {
          await supabase.from('mining_jobs').update({ status: 'Failed', dados: { ...job, status: 'Failed', lastError: String((e as Error).message || e) } }).eq('organization_id',this.organizationId).eq('id', jobId);
          await this.refresh();
          alert(`A busca "${job.name}" foi interrompida: ${(e as Error).message}`);
          break;
        }
        await esperar(10000);
      }
      await esperar(2000);
    }
    this.workers.delete(jobId);
  }
}
