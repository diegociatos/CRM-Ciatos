
import { MiningJob, MiningLead, CompanySize, ProspectCompany } from '../types';
import { prospectCompanies } from './geminiService';

// SINCRONIZADO COM APP.TSX v63
const STORAGE_JOBS_KEY = 'ciatos_mining_jobs_v63';
const STORAGE_LEADS_KEY = 'ciatos_mining_leads_v63';
const MAIN_CRM_KEY = 'ciatos_leads_v63';

class MiningEngine {
  private activeIntervals: Record<string, any> = {};

  constructor() {
    setTimeout(() => this.hydrateBackgroundJobs(), 3000);
  }

  public getJobs(): MiningJob[] {
    const saved = localStorage.getItem(STORAGE_JOBS_KEY);
    return saved ? JSON.parse(saved) : [];
  }

  public getLeadsByJob(jobId: string): MiningLead[] {
    const saved = localStorage.getItem(STORAGE_LEADS_KEY);
    const leads: MiningLead[] = saved ? JSON.parse(saved) : [];
    return leads.filter(l => l.jobId === jobId && !l.isImported);
  }

  public async createJob(params: {
    segmentName: string;
    state: string;
    city: string;
    size: CompanySize | 'all';
    taxRegime: string;
    targetCount: number;
    fiscalFilter: 'Dívida Ativa' | 'Indiferente';
    autoCreateSegment: boolean;
    enrich: boolean;
  }): Promise<MiningJob> {
    const job: MiningJob = {
      id: `job-${Math.random().toString(36).substr(2, 9)}`,
      name: params.segmentName,
      status: 'Running',
      version: 63,
      configPayload: { ...params },
      filters: {
        segment: params.segmentName,
        state: params.state,
        city: params.city,
        size: params.size,
        taxRegime: params.taxRegime,
        fiscalFilter: params.fiscalFilter
      },
      targetCount: params.targetCount,
      foundCount: 0,
      pagesFetched: 0,
      errors: 0,
      autoCreateSegment: params.autoCreateSegment,
      enrich: params.enrich,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastNotificationMilestone: 0
    };

    this.saveJob(job);
    this.startWorker(job.id);
    return job;
  }

  public controlJob(jobId: string, action: 'pause' | 'resume' | 'cancel') {
    const jobs = this.getJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;

    if (action === 'pause') {
      job.status = 'Paused';
      this.stopWorker(jobId);
    } else if (action === 'resume') {
      job.status = 'Running';
      this.startWorker(jobId);
    } else if (action === 'cancel') {
      job.status = 'Cancelled';
      this.stopWorker(jobId);
    }

    job.updatedAt = new Date().toISOString();
    this.saveJob(job);
  }

  public markAsImported(cnpjRaw: string) {
    const savedLeads = localStorage.getItem(STORAGE_LEADS_KEY);
    if (!savedLeads) return;
    let leads: MiningLead[] = JSON.parse(savedLeads);
    leads = leads.map(l => l.cnpjRaw === cnpjRaw ? { ...l, isImported: true } : l);
    localStorage.setItem(STORAGE_LEADS_KEY, JSON.stringify(leads));
    window.dispatchEvent(new CustomEvent('ciatos-mining-update'));
  }

  private startWorker(jobId: string) {
    if (this.activeIntervals[jobId]) return;
    this.activeIntervals[jobId] = setInterval(async () => {
      await this.processNextPage(jobId);
    }, 15000); // Intervalo seguro para Google Search
  }

  private stopWorker(jobId: string) {
    if (this.activeIntervals[jobId]) {
      clearInterval(this.activeIntervals[jobId]);
      delete this.activeIntervals[jobId];
    }
  }

  private async processNextPage(jobId: string) {
    const jobs = this.getJobs();
    const job = jobs.find(j => j.id === jobId);
    if (!job || job.status !== 'Running') {
      this.stopWorker(jobId);
      return;
    }

    try {
      const data = await prospectCompanies(
        job.filters.segment,
        job.filters.city,
        job.filters.state,
        job.filters.size === 'all' ? undefined : job.filters.size as CompanySize,
        job.filters.taxRegime,
        job.pagesFetched + 1
      );

      if (data.companies && data.companies.length > 0) {
        const newLeadsCount = this.persistLeads(jobId, data.companies, data.sources);
        job.foundCount += newLeadsCount;
        job.pagesFetched += 1;
      } else if (job.pagesFetched > 3) {
        this.finalizeJob(job);
        return;
      }

      job.updatedAt = new Date().toISOString();
      this.saveJob(job);
      
      if (job.foundCount >= job.targetCount) {
        this.finalizeJob(job);
      }
    } catch (err) {
      job.errors += 1;
      if (job.errors > 5) job.status = 'Failed';
      this.saveJob(job);
    }
  }

  private persistLeads(jobId: string, companies: ProspectCompany[], groundingSources: any[]): number {
    const savedLeads = localStorage.getItem(STORAGE_LEADS_KEY);
    let allLeads: MiningLead[] = savedLeads ? JSON.parse(savedLeads) : [];
    
    const mainCRMLeads = JSON.parse(localStorage.getItem(MAIN_CRM_KEY) || '[]');
    const existingCnpjs = new Set(mainCRMLeads.map((l: any) => l.cnpjRaw));
    const miningCnpjs = new Set(allLeads.map(l => l.cnpjRaw));
    
    const groundedUris = groundingSources
      .filter(chunk => chunk.web && chunk.web.uri)
      .map(chunk => chunk.web.uri);

    let addedCount = 0;
    companies.forEach(c => {
      if (c.cnpjRaw && !existingCnpjs.has(c.cnpjRaw) && !miningCnpjs.has(c.cnpjRaw)) {
        const mLead: MiningLead = {
          ...c,
          id: `mlead-${Math.random().toString(36).substr(2, 9)}`,
          jobId,
          tradeName: c.tradeName || c.name || 'Empresa Localizada',
          phoneCompany: c.phone || 'Não localizado',
          emailCompany: c.emailCompany || 'Não localizado',
          partners: c.partners || ["Pendente"],
          contactName: c.decisionMakerName || 'Proprietário',
          contactPhone: c.decisionMakerPhoneFormatted || '—',
          contactEmail: c.email || '—',
          scoreIa: c.icpScore || 3,
          debtStatus: c.debtStatus || "Regular",
          debtValueEst: c.estimatedRevenue || "—",
          sources: groundedUris.length > 0 ? groundedUris : ['google_search'],
          isGarimpo: true,
          createdAt: new Date().toISOString(),
          website: c.website || ''
        };
        allLeads.push(mLead);
        addedCount++;
      }
    });

    localStorage.setItem(STORAGE_LEADS_KEY, JSON.stringify(allLeads));
    return addedCount;
  }

  private finalizeJob(job: MiningJob) {
    job.status = 'Completed';
    job.updatedAt = new Date().toISOString();
    this.saveJob(job);
    this.stopWorker(job.id);
  }

  private saveJob(job: MiningJob) {
    const jobs = this.getJobs();
    const index = jobs.findIndex(j => j.id === job.id);
    if (index >= 0) jobs[index] = job;
    else jobs.push(job);
    localStorage.setItem(STORAGE_JOBS_KEY, JSON.stringify(jobs));
    window.dispatchEvent(new CustomEvent('ciatos-mining-update'));
  }

  private hydrateBackgroundJobs() {
    const jobs = this.getJobs();
    jobs.filter(j => j.status === 'Running').forEach(j => this.startWorker(j.id));
  }
}

export const miningEngine = new MiningEngine();
