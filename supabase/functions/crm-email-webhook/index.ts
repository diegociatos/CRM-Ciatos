import { env, service, rpc, json, bodyLimited } from '../_shared/runtime.ts';
import { verifyWebhook } from '../_shared/outreach.ts';
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = env('RESEND_WEBHOOK_SECRET');
  if (!secret) return json({ error: 'not_configured' }, 503);
  try {
    const raw = await bodyLimited(req);
    if (!await verifyWebhook(raw, req.headers, secret)) return json({ error: 'invalid_signature' }, 401);
    const event = JSON.parse(raw);
    const accepted = ['email.sent','email.delivered','email.opened','email.clicked','email.bounced','email.complained'];
    if (!accepted.includes(event.type)) return json({ status: 'ignored' });
    if (!event.data?.email_id || !Number.isFinite(Date.parse(event.created_at))) return json({ error: 'invalid_event' }, 400);
    await rpc(service(), 'record_outreach_event', { event_id: req.headers.get('svix-id'), mid: event.data.email_id, kind: event.type, happened: event.created_at });
    return json({ status: 'accepted' });
  } catch { return json({ error: 'retry_event' }, 503); }
});
