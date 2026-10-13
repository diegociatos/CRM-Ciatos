export type Attempt = { provider: 'microsoft365' | 'resend'; status: 'accepted' | 'failed' | 'unavailable' | 'unknown'; error?: string };

/** Recovery credentials stay inside the server and the recipient's email. */
export async function prepararLinkConvite(auth: any, email: string, origin: string, existing: boolean): Promise<string> {
  if (existing) return origin;
  const { data, error } = await auth.generateLink({ type: 'recovery', email, options: { redirectTo: origin } });
  if (error || !data?.properties?.hashed_token) throw new Error('invite_link_failed');
  return `${origin}/#type=recovery&token_hash=${encodeURIComponent(data.properties.hashed_token)}`;
}

/** Never log raw provider exceptions, bodies, recipient addresses or message HTML. */
export async function enviarConviteEmail(opts: {
  microsoft: () => Promise<unknown>; resendKey?: string; resendFrom: string;
  to: string; assunto: string; html: string;
}, request: typeof fetch = fetch, log: (attempt: Attempt) => void = a => console.info('crm_invitation_delivery', a)) {
  const attempts: Attempt[] = [];
  const record = (a: Attempt) => { attempts.push(a); log(a); };
  try {
    await opts.microsoft();
    record({ provider: 'microsoft365', status: 'accepted' });
    return { status: 'accepted', provider: 'microsoft365', attempts };
  } catch (error) {
    // A transport timeout may occur AFTER acceptance. Do not send duplicates via fallback.
    const code = error instanceof Error ? error.message : '';
    if (error instanceof Error && ['TimeoutError', 'AbortError', 'TypeError'].includes(error.name)) {
      record({ provider: 'microsoft365', status: 'unknown', error: 'transport_outcome_unknown' });
      return { status: 'unknown', provider: 'microsoft365', attempts };
    }
    const httpStatus = (error as { status?: unknown })?.status;
    record({ provider: 'microsoft365', status: code === 'ms365_not_connected' ? 'unavailable' : 'failed',
      error: code === 'ms365_not_connected' ? 'not_connected'
        : typeof httpStatus === 'number' && Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599
          ? `http_${httpStatus}` : 'provider_rejected_or_configuration_failed' });
  }
  if (!opts.resendKey) {
    record({ provider: 'resend', status: 'unavailable', error: 'not_configured' });
    return { status: 'failed', provider: null, attempts };
  }
  try {
    const response = await request('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${opts.resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: opts.resendFrom, to: [opts.to], subject: opts.assunto, html: opts.html }),
    });
    if (!response.ok) {
      record({ provider: 'resend', status: 'failed', error: `http_${response.status}` });
      return { status: 'failed', provider: 'resend', attempts };
    }
    record({ provider: 'resend', status: 'accepted' });
    return { status: 'accepted', provider: 'resend', attempts };
  } catch {
    record({ provider: 'resend', status: 'unknown', error: 'transport_outcome_unknown' });
    return { status: 'unknown', provider: 'resend', attempts };
  }
}
