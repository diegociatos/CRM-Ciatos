import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cifrar, decifrar, assinarState, verificarState, enviarGraph, abrirRemetente, urlAutorizacao } from '../supabase/functions/_shared/ms365.ts';

const env = (n: string) => ({ CRM_CRYPTO_KEY: 'k'.repeat(48), CRM_LIVE_SEND_ENABLED: 'true' } as Record<string, string>)[n];

test('segredos cifrados voltam iguais e não aparecem em claro', async () => {
  const cif = await cifrar(env, 'segredo-do-app');
  assert.doesNotMatch(cif, /segredo/);
  assert.equal(await decifrar(env, cif), 'segredo-do-app');
  await assert.rejects(decifrar((n: string) => n === 'CRM_CRYPTO_KEY' ? 'x'.repeat(48) : undefined, cif));
  await assert.rejects(cifrar(() => undefined, 'a'), /crypto_not_configured/);
});

test('state do login é assinado, detecta adulteração e expira', async () => {
  const st = await assinarState(env, { uid: 'u1', origin: 'https://crm.grupociatos.com.br' });
  assert.equal((await verificarState(env, st))?.uid, 'u1');
  const [corpo, sig] = st.split('.');
  assert.equal(await verificarState(env, `${corpo}x.${sig}`), null);
  assert.equal(await verificarState(env, st, -1), null);
  assert.match(urlAutorizacao({ tenant_id: 't', client_id: 'c' }, 'https://cb', st), /offline_access/);
});

test('Graph: envia pela caixa remetente, com resposta e nome', async () => {
  let url = ''; let body: any = null;
  await enviarGraph('tok', { from: 'envio@grupociatos.com.br', fromName: 'Ciatos', to: 'a@b.test', subject: 'Oi', html: '<p>x</p>', replyTo: 'atende@grupociatos.com.br' },
    async (u, init) => { url = String(u); body = JSON.parse(String(init!.body)); return new Response(null, { status: 202 }); });
  assert.match(url, /users\/envio%40grupociatos\.com\.br\/sendMail$/);
  assert.equal(body.message.body.contentType, 'HTML');
  assert.equal(body.message.from.emailAddress.name, 'Ciatos');
  assert.equal(body.message.replyTo[0].emailAddress.address, 'atende@grupociatos.com.br');
  await assert.rejects(enviarGraph('tok', { from: 'x@y.test', to: 'a@b.test', subject: 's', text: 't' },
    async () => Response.json({ error: { message: 'ErrorSendAsDenied' } }, { status: 403 })), /SendAsDenied/);
});

test('remetente renova o token e regrava o refresh rotacionado', async () => {
  const integ = { tenant_id: 't', client_id: 'c', client_secret_cif: await cifrar(env, 's'), refresh_token_cif: await cifrar(env, 'r1'), envia_como: 'envio@grupociatos.com.br' };
  let gravado = '';
  const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: integ, error: null }) }) }),
    update: (v: any) => { gravado = v.refresh_token_cif; return { eq: async () => ({}) }; } }) };
  const r = await abrirRemetente(env, db, {}, async (u, init) => {
    assert.match(String(u), /oauth2\/v2\.0\/token$/);
    assert.match(String(init!.body), /refresh_token=r1/);
    return Response.json({ access_token: 'at', refresh_token: 'r2' });
  });
  assert.equal(r.enviaComoPadrao, 'envio@grupociatos.com.br');
  assert.equal(await decifrar(env, gravado), 'r2');
  await assert.rejects(abrirRemetente((n: string) => n === 'CRM_LIVE_SEND_ENABLED' ? 'false' : env(n), db), /live_disabled/);
});
