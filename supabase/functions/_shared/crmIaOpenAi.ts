export class AiBillingError extends Error {}

export async function requestOpenAiStructured(
  key: string,
  model: string,
  instructions: string,
  input: string,
  schema: Record<string, unknown>,
  schemaName: string,
  request: typeof fetch = fetch,
) {
  const body = {
    model, store: false, instructions, input,
    max_output_tokens: 2500,
    text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
  };
  const response = await request('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(45000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    if (failure?.error?.code === 'insufficient_quota') throw new AiBillingError('openai_quota');
    throw new Error(`openai_provider_${response.status}`);
  }
  const data = await response.json();
  if (data.status !== 'completed') throw new Error('ai_incomplete');
  const contents = (data.output || []).filter((item: any) => item.type === 'message').flatMap((item: any) => item.content || []);
  const text = contents.filter((item: any) => item.type === 'output_text').map((item: any) => item.text).join('').trim();
  if (!text) throw new Error('ai_empty');
  return { text };
}
