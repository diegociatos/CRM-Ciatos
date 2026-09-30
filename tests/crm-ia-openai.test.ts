import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiBillingError, requestOpenAiStructured } from '../supabase/functions/_shared/crmIaOpenAi.ts';

const schema = { type: 'object', properties: { subject: { type: 'string' } }, required: ['subject'], additionalProperties: false };

test('IA GPT usa saída estruturada sem busca web nem armazenamento da resposta', async () => {
  let sent: any;
  const request = async (url: string | URL | Request, init?: RequestInit) => {
    sent = { url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ status: 'completed', output: [
      { type: 'message', content: [{ type: 'output_text', text: '{"subject":"Olá"}' }] },
    ] }), { status: 200 });
  };
  const result = await requestOpenAiStructured('test-token', 'test-model', 'Instruções', 'Escrever e-mail', schema, 'crm_email', request as typeof fetch);
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  assert.equal(sent.body.store, false);
  assert.equal(sent.body.tools, undefined);
  assert.equal(sent.body.text.format.type, 'json_schema');
  assert.equal(sent.body.text.format.strict, true);
  assert.equal(JSON.stringify(sent.body).includes('test-token'), false);
  assert.equal((sent.headers as Record<string, string>).Authorization, 'Bearer test-token');
  assert.equal(result.text, '{"subject":"Olá"}');
});

test('IA GPT não aceita resposta vazia', async () => {
  const request = async () => new Response(JSON.stringify({ status: 'completed', output: [] }), { status: 200 });
  await assert.rejects(requestOpenAiStructured('test-token', 'test-model', '', '', schema, 'crm_email', request as typeof fetch), /ai_empty/);
});

test('falta de créditos GPT produz erro específico sem expor resposta do provedor', async () => {
  const request = async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'detalhes privados' } }), { status: 429 });
  await assert.rejects(requestOpenAiStructured('test-token', 'test-model', '', '', schema, 'crm_email', request as typeof fetch), AiBillingError);
});
