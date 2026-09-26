import { env, service, rpc, json, bodyLimited } from '../_shared/runtime.ts';
// Trusted mailbox/calendar bridge only. Resend delivery webhooks do not imply replies.
Deno.serve(async req => {
  if(req.method!=='POST') return json({error:'method_not_allowed'},405);
  if(!env('CRM_INBOUND_SECRET') || req.headers.get('Authorization')!==`Bearer ${env('CRM_INBOUND_SECRET')}`) return json({error:'unauthorized'},401);
  try {
    const body=JSON.parse(await bodyLimited(req,4000));
    if(!['reply','meeting'].includes(body.kind) || typeof body.message_id!=='string' || typeof body.event_id!=='string' || !body.event_id || body.event_id.length>200 || !Number.isFinite(Date.parse(body.occurred_at))) return json({error:'invalid_event'},400);
    await rpc(service(),'record_outreach_event',{event_id:`inbound:${body.event_id}`,mid:body.message_id,kind:body.kind,happened:body.occurred_at});
    return json({status:'accepted'});
  } catch { return json({error:'retry_event'},503); }
});
