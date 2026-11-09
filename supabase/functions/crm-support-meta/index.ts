// Webhook oficial da Meta (WhatsApp Cloud API e Instagram). Desligado por padrao: exige CRM_SUPPORT_META_ENABLED=true,
// META_APP_SECRET (assinatura), META_VERIFY_TOKEN (verificacao) e a conta habilitada pela empresa no banco.
// Publicar SEM verificacao de JWT (a Meta nao envia JWT): a autenticidade vem da assinatura X-Hub-Signature-256.
import { env, service, json, bodyLimited } from '../_shared/runtime.ts';
import { metaVerify, processMetaWebhook } from '../_shared/supportMeta.ts';

Deno.serve(async req => {
  if (req.method === 'GET') return metaVerify(env, new URL(req.url));
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let raw: string; try { raw = await bodyLimited(req, 512000); } catch { return json({ error: 'body_too_large' }, 413); }
  const result = await processMetaWebhook(service(), env, raw, req.headers.get('X-Hub-Signature-256'));
  return json(result.body, result.status);
});
