
import { MiningJob, MiningLead, CompanySize, ProspectCompany } from '../types';
import { prospectCompanies } from './geminiService';
import { miningApi } from './api';

class MiningEngine {
  private activeIntervals: Record<string, any> = {};
  private jobsCache: MiningJob[] = [];
  private leadsCache: MiningLead[] = [];

  constructor() {
    setTimeout(() => this.hydrate(), 2000);
  }

  private async hydrate() {
    try {
      this.jobsCache = await miningApi.getJobs();
      this.leadsCache = await miningApi.getLeads();
      this.jobsCache.filter(j => j.status === 'Running').forEach(j => this.startWorker(j.id));
    } catch (e) { console.error('[Mining] hydrate error', e); }
  }

  public getJobs(): MiningJob[] {
    // refresh async in background
    miningApi.getJobs().then(j => this.jobsCache = j).catch(() => {});
    return this.jobsCache;
  }

  public getLeadsByJob(jobId: string): MiningLead[] {
    return this.leadsCache.filter(l => l.jobId === jobId && !l.isImported);
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

    try { await miningApi.createJob(job); } catch (e) { console.error('[Mining] createJob API error', e); }
    this.jobsCache.push(job);
    this.startWorker(job.id);
    return job;
  }

  public async controlJob(jobId: string, action: 'pause' | 'resume' | 'cancel') {
    const job = this.jobsCache.find(j => j.id === jobId);
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
    try { await miningApi.updateJob(jobId, { status: job.status, updatedAt: job.updatedAt }); } catch (e) { /* silent */ }
    window.dispatchEvent(new CustomEvent('ciatos-mining-update'));
  }

  public async markAsImported(cnpjRaw: string) {
    const lead = this.leadsCache.find(l => l.cnpjRaw === cnpjRaw);
    if (!lead) return;
    lead.isImported = true;
    try { await miningApi.updateLead(lead.id, { isImported: true }); } catch (e) { /* silent */ }
    window.dispatchEvent(new CustomEvent('ciatos-mining-update'));
  }

  private startWorker(jobId: string) {
    if (this.activeIntervals[jobId]) return;
    this.activeIntervals[jobId] = setInterval(async () => {
      await this.processNextPage(jobId);
    }, 15000);
  }

  private stopWorker(jobId: string) {
    if (this.activeIntervals[jobId]) {
      clearInterval(this.activeIntervals[jobId]);
      delete this.activeIntervals[jobId];
    }
  }

  private async processNextPage(jobId: string) {
    const job = this.jobsCache.find(j => j.id === jobId);
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
        const newLeadsCount = await this.persistLeads(jobId, data.companies, data.sources);
        job.foundCount += newLeadsCount;
        job.pagesFetched += 1;
      } else if (job.pagesFetched > 3) {
        await this.finalizeJob(job);
        return;
      }

      job.updatedAt = new Date().toISOString();
      try {
        await miningApi.updateJob(jobId, { foundCount: job.foundCount, pagesFetched: job.pagesFetched, updatedAt: job.updatedAt });
      } catch (e) { /* silent */ }

      if (job.foundCount >= job.targetCount) {
        await this.finalizeJob(job);
      }
    } catch (err) {
      job.errors += 1;
      if (job.errors > 5) job.status = 'Failed';
      try { await miningApi.updateJob(jobId, { errors: job.errors, status: job.status }); } catch (e) { /* silent */ }
    }
  }

  private async persistLeads(jobId: string, companies: ProspectCompany[], groundingSources: any[]): Promise<number> {
    const existingCnpjs = new Set(this.leadsCache.map(l => l.cnpjRaw));

    const groundedUris = groundingSources
      .filter(chunk => chunk.web && chunk.web.uri)
      .map(chunk => chunk.web.uri);

    const newLeads: MiningLead[] = [];
    companies.forEach(c => {
      if (c.cnpjRaw && !existingCnpjs.has(c.cnpjRaw)) {
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
        newLeads.push(mLead);
        this.leadsCache.push(mLead);
        existingCnpjs.add(c.cnpjRaw);
      }
    });

    if (newLeads.length > 0) {
      try { await miningApi.bulkImportLeads(newLeads); } catch (e) { console.error('[Mining] bulkImport error', e); }
    }
    return newLeads.length;
  }

  private async finalizeJob(job: MiningJob) {
    job.status = 'Completed';
    job.updatedAt = new Date().toISOString();
    this.stopWorker(job.id);
    try { await miningApi.updateJob(job.id, { status: 'Completed', updatedAt: job.updatedAt }); } catch (e) { /* silent */ }
    window.dispatchEvent(new CustomEvent('ciatos-mining-update'));
  }
}

export const miningEngine = new MiningEngine();
