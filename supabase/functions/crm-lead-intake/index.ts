import { env, service, rpc, json, bodyLimited } from '../_shared/runtime.ts';
// Recebe leads dos sites do grupo (formulário de diagnóstico). Autenticação por segredo próprio;
// a empresa de destino vem da configuração do servidor, nunca do corpo da requisição.
const enc = new TextEncoder();
function igual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const secret = env('CRM_LEAD_INTAKE_SECRET'), org = env('CRM_LEAD_INTAKE_ORG_ID');
  const auth = req.headers.get('Authorization') ?? '';
  if (!secret || !org || !igual(auth, `Bearer ${secret}`)) return json({ error: 'unauthorized' }, 401);
  try {
    const body = JSON.parse(await bodyLimited(req, 12000));
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return json({ error: 'invalid_lead' }, 400);
    if (!body.email && !body.telefone) return json({ error: 'invalid_lead' }, 400);
    const out = await rpc(service(), 'capture_site_lead', { org, p: body });
    return json({ status: out?.status ?? 'ok' });
  } catch { return json({ error: 'retry_lead' }, 503); }
});
