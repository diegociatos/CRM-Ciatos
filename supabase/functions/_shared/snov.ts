import type { Env, Requester } from './outreach.ts';
export class SnovAdapter {
  private token = '';
  constructor(private env: Env, private request: Requester = fetch) {}
  private async call(path: string, data?: URLSearchParams) {
    if (this.env('CRM_SNOV_ENABLED') !== 'true') throw new Error('snov_disabled');
    if (!this.token) {
      if (!this.env('SNOV_CLIENT_ID') || !this.env('SNOV_CLIENT_SECRET')) throw new Error('snov_not_configured');
      const response = await this.request('https://api.snov.io/v1/oauth/access_token', { method: 'POST', signal: AbortSignal.timeout(15000),
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.env('SNOV_CLIENT_ID')!, client_secret: this.env('SNOV_CLIENT_SECRET')! }) });
      if (!response.ok) throw new Error('snov_auth_failed');
      this.token = (await response.json()).access_token;
      if (!this.token) throw new Error('snov_auth_failed');
    }
    // Never follow provider-supplied URLs or redirects; only fixed API routes.
    const response = await this.request(`https://api.snov.io${path}`, { method: data ? 'POST' : 'GET', body: data,
      redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${this.token}` } });
    if (!response.ok) throw new Error(`snov_${response.status}`);
    return await response.json();
  }
  async start(kind: string, value: string) {
    if (kind === 'reveal') {
      if (!/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new Error('invalid_task');
      return this.call(`/v2/domain-search/prospects/search-emails/start/${value}`, new URLSearchParams());
    }
    if (kind === 'verify') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error('invalid_email');
      return this.call('/v2/email-verification/start', new URLSearchParams({ 'emails[]': value }));
    }
    if (kind !== 'discover' || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/i.test(value) || value.length>253) throw new Error('invalid_domain');
    return this.call('/v2/domain-search/prospects/start', new URLSearchParams({ domain: value, page: '1' }));
  }
  async result(kind: string, hash: string) {
    if (!/^[a-zA-Z0-9_-]{1,200}$/.test(hash)) throw new Error('invalid_task');
    return this.call(kind === 'verify' ? `/v2/email-verification/result?task_hash=${hash}` : kind === 'reveal' ? `/v2/domain-search/prospects/search-emails/result/${hash}` : `/v2/domain-search/prospects/result/${hash}`);
  }
}
export function snovCandidates(result: any): Array<{name:string;position:string;hash:string;emails:Array<{email:string}>}> {
  const entries = Array.isArray(result.data) ? result.data : result.data ? [result.data] : [];
  return entries.slice(0,20).map((p: any) => ({
    name: String(p.name || [p.first_name,p.last_name].filter(Boolean).join(' ')).slice(0,200),
    position: String(p.position || '').slice(0,200),
    hash: String(p.search_emails_start || '').match(/^https:\/\/api\.snov\.io\/v2\/domain-search\/prospects\/search-emails\/start\/([a-zA-Z0-9_-]{1,200})$/)?.[1] || '',
    emails: (Array.isArray(p.emails) ? p.emails : []).slice(0,3).map((e: any) => ({email: String(e.email || '').slice(0,254)})),
  }));
}
export function verifiedResult(data: any, email: string): boolean {
  const entry = data?.status === 'completed' && Array.isArray(data.data) ? data.data.find((r: any) => r.email?.toLowerCase() === email.toLowerCase()) : null;
  return entry?.result?.smtp_status === 'valid' && entry.result.is_valid_format === true && entry.result.is_disposable === false && entry.result.is_gibberish === false;
}
