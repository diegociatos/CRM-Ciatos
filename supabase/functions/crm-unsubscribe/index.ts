import { service, rpc, json } from '../_shared/runtime.ts';
Deno.serve(async req => {
  const token = new URL(req.url).searchParams.get('token') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return json({ error: 'invalid_token' }, 400);
  // GET only confirms intention: security scanners must not cause opt-outs.
  if (req.method === 'GET') return new Response('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Cancelar contatos</title><main><h1>Cancelar contatos</h1><p>Confirme para não receber novos contatos desta empresa.</p><form method="post"><button>Não quero receber novos contatos</button></form></main></html>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; form-action 'self'; frame-ancestors 'none'" } });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try { await rpc(service(), 'unsubscribe_outreach', { token }); return new Response('Solicitação registrada. Você não receberá novos contatos desta empresa.', { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } }); }
  catch { return json({ error: 'try_again' }, 503); }
});
