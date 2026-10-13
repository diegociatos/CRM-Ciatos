import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { enviarConviteEmail, prepararLinkConvite } from '../supabase/functions/_shared/invitations.ts';

const base = { resendFrom: 'crm@example.test', to: 'recipient@example.test', assunto: 'Convite', html: 'secret-recovery-token' };
test('Microsoft acceptance is explicit; fallback is not called', async () => {
  const result = await enviarConviteEmail({ ...base, microsoft: async () => true }, async () => { throw Error('unexpected'); }, () => {});
  assert.equal(result.status, 'accepted'); assert.equal(result.provider, 'microsoft365');
  assert.equal(result.attempts.length, 1);
});
test('fallback accepts or reports HTTP failure without leaking secrets', async () => {
  for (const status of [200, 401, 429, 500]) {
    const logs: unknown[] = [];
    const result = await enviarConviteEmail({ ...base, resendKey: 'secret-key', microsoft: async () => { throw Error('secret-access-token'); } },
      async () => new Response('{}', { status }), a => logs.push(a));
    assert.equal(result.status, status === 200 ? 'accepted' : 'failed');
    assert.equal(result.attempts[1].error, status === 200 ? undefined : `http_${status}`);
    assert.doesNotMatch(JSON.stringify([result, logs]), /secret-|recipient@example/);
  }
});
test('missing fallback configuration and unknown transport outcomes are explicit', async () => {
  const missing = await enviarConviteEmail({ ...base, microsoft: async () => { throw Error('ms365_not_connected'); } }, fetch, () => {});
  assert.equal(missing.status, 'failed'); assert.equal(missing.attempts[1].error, 'not_configured');
  const uncertain = await enviarConviteEmail({ ...base, resendKey: 'key', microsoft: async () => { throw new DOMException('secret', 'TimeoutError'); } },
    async () => { throw Error('fallback must not run'); }, () => {});
  assert.equal(uncertain.status, 'unknown'); assert.equal(uncertain.attempts.length, 1);
  const resendUncertain = await enviarConviteEmail({ ...base, resendKey: 'key', microsoft: async () => { throw Error('ms365_not_connected'); } },
    async () => { throw new TypeError('secret'); }, () => {});
  assert.equal(resendUncertain.status, 'unknown');
});
test('active accounts use login URL; pending accounts generate recovery without password mutation', async () => {
  const calls: any[] = [];
  const auth = { generateLink: async (p: any) => { calls.push(p); return { data: { properties: { hashed_token: 'token' } } }; } };
  assert.equal(await prepararLinkConvite(auth, base.to, 'https://crm.test', true), 'https://crm.test');
  assert.equal(calls.length, 0);
  assert.match(await prepararLinkConvite(auth, base.to, 'https://crm.test', false), /token_hash=token/);
  assert.deepEqual(calls[0], { type: 'recovery', email: base.to, options: { redirectTo: 'https://crm.test' } });
});

// Execute the actual Edge handler with fake Auth/DB/providers. No network or real invitations.
async function handlerFixture({ allowed = true, member = true, pending = true, action = 'resend-invite' } = {}) {
  let handler: (request: Request) => Promise<Response>;
  let generated = 0;
  const mutations: string[] = [];
  const db = { from(table: string) {
    const query: any = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: table === 'profiles'
      ? { id: 'target', nome: 'Recipient', email: base.to, ativo: true, papel: 'ADMIN' }
      : member ? { user_id: 'target' } : null }) };
    return query;
  }, auth: { admin: {
    listUsers: async () => ({ data: { users: [{ id: 'target', email: base.to, app_metadata: { crm_password_change_required: pending } }] } }),
    getUserById: async () => ({ data: { user: { id: 'target', email: base.to, app_metadata: { crm_password_change_required: pending } } } }),
    generateLink: async () => { generated++; return { data: { properties: { hashed_token: 'secret-recovery-token' } } }; },
    createUser: async () => { mutations.push('create'); throw Error('unexpected'); },
    updateUserById: async () => { mutations.push('password'); throw Error('unexpected'); },
  } } };
  const caller = { auth: { getUser: async () => ({ data: { user: { id: 'caller' } } }) }, schema: () => ({ rpc: async () => ({ data: allowed }) }) };
  const source = readFileSync('supabase/functions/crm-admin-users/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  const javascript = ts.transpile(source, { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None });
  new Function('createClient', 'abrirRemetente', 'enviarConviteEmail', 'prepararLinkConvite', 'Deno', javascript)(
    (_url: string, key: string) => key === 'service' ? db : caller,
    async () => ({ enviaComoPadrao: 'crm@example.test', enviar: async () => true }),
    enviarConviteEmail, prepararLinkConvite,
    { env: { get: (key: string) => key === 'SUPABASE_SERVICE_ROLE_KEY' ? 'service' : 'https://crm.test' }, serve: (fn: any) => { handler = fn; } });
  const response = await handler!(new Request('https://edge.test', { method: 'POST', body: JSON.stringify({ action, organization_id: 'org', id: 'target', email: base.to, nome: 'Recipient' }) }));
  return { response, result: await response.json(), mutations, generated };
}
test('resend handler preserves pending and active account passwords and never exposes recovery token', async () => {
  for (const pending of [true, false]) {
    const { response, result, mutations, generated } = await handlerFixture({ pending });
    assert.equal(response.status, 200); assert.deepEqual(mutations, []);
    assert.equal(generated, pending ? 1 : 0); assert.equal(result.contaExistente, !pending);
    assert.equal(result.delivery.status, 'accepted'); assert.doesNotMatch(JSON.stringify(result), /token|inviteLink/);
  }
});
test('resend rejects callers without company permission and targets outside active membership', async () => {
  for (const options of [{ allowed: false }, { member: false }]) {
    const result = await handlerFixture(options);
    assert.equal(result.response.status, 403); assert.equal(result.generated, 0); assert.deepEqual(result.mutations, []);
  }
});
test('repeated create reuses active or pending identity without changing password', async () => {
  for (const pending of [true, false]) {
    const result = await handlerFixture({ action: 'create', pending });
    assert.equal(result.response.status, 200); assert.deepEqual(result.mutations, []);
    assert.equal(result.generated, pending ? 1 : 0);
    assert.doesNotMatch(JSON.stringify(result.result), /token|inviteLink/);
  }
});
