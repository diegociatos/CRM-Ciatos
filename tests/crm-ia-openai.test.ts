import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AiBillingError, requestOpenAiStructured } from '../supabase/functions/_shared/crmIaOpenAi.ts';

const schema = { type: 'object', properties: { companies: { type: 'array' } }, required: ['companies'], additionalProperties: false };

test('Radar GPT usa busca web, saída estruturada e conserva fontes sem armazenar resposta', async () => {
  let sent: any;
  const request = async (url: string | URL | Request, init?: RequestInit) => {
    sent = { url: String(url), headers: init?.headers, body: JSON.parse(String(init?.body)) };
    return new Response(JSON.stringify({ status: 'completed', output: [
      { type: 'web_search_call', action: { sources: [{ url: 'https://empresa.example/origem' }] } },
      { type: 'message', content: [{ type: 'output_text', text: '{"companies":[]}' }] },
    ] }), { status: 200 });
  };
  const result = await requestOpenAiStructured('test-token', 'test-model', 'Instruções', 'Buscar empresas', schema, 'crm_radar_companies', { state: 'MG' }, request as typeof fetch);
  assert.equal(sent.url, 'https://api.openai.com/v1/responses');
  assert.equal(sent.body.store, false);
  assert.equal(sent.body.tools[0].type, 'web_search');
  assert.equal(sent.body.tools[0].user_location.region, 'MG');
  assert.equal(sent.body.text.format.type, 'json_schema');
  assert.equal(sent.body.text.format.strict, true);
  assert.equal(JSON.stringify(sent.body).includes('test-token'), false);
  assert.equal((sent.headers as Record<string, string>).Authorization, 'Bearer test-token');
  assert.equal(result.text, '{"companies":[]}');
  assert.deepEqual(result.sources, ['https://empresa.example/origem']);
});

test('Radar GPT não aceita resultado sem busca web', async () => {
  const request = async () => new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"companies":[]}' }] }] }), { status: 200 });
  await assert.rejects(requestOpenAiStructured('test-token', 'test-model', '', '', schema, 'crm_radar_companies', {}, request as typeof fetch), /web_search_not_used/);
});

test('falta de créditos GPT produz erro específico sem expor resposta do provedor', async () => {
  const request = async () => new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'detalhes privados' } }), { status: 429 });
  await assert.rejects(requestOpenAiStructured('test-token', 'test-model', '', '', schema, 'crm_radar_companies', {}, request as typeof fetch), AiBillingError);
});
