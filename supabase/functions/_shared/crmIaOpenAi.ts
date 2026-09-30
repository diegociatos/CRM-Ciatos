export class AiBillingError extends Error {}

export async function requestOpenAiStructured(
  key: string,
  model: string,
  instructions: string,
  input: string,
  schema: Record<string, unknown>,
  schemaName: string,
  radarLocation?: { city?: string; state?: string },
  request: typeof fetch = fetch,
) {
  const web = !!radarLocation;
  const body = {
    model, store: false, instructions, input,
    max_output_tokens: web ? 5000 : 2500,
    text: { format: { type: 'json_schema', name: schemaName, strict: true, schema } },
    ...(web ? {
      tools: [{ type: 'web_search', user_location: { type: 'approximate', country: 'BR', ...(radarLocation.city ? { city: radarLocation.city } : {}), ...(radarLocation.state ? { region: radarLocation.state } : {}) } }],
      tool_choice: 'required', include: ['web_search_call.action.sources'],
    } : {}),
  };
  const response = await request('https://api.openai.com/v1/responses', {
    method: 'POST', signal: AbortSignal.timeout(web ? 120000 : 45000),
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
  if (web && !(data.output || []).some((item: any) => item.type === 'web_search_call')) throw new Error('web_search_not_used');
  const contents = (data.output || []).filter((item: any) => item.type === 'message').flatMap((item: any) => item.content || []);
  const text = contents.filter((item: any) => item.type === 'output_text').map((item: any) => item.text).join('').trim();
  if (!text) throw new Error('ai_empty');
  const sources = (data.output || []).filter((item: any) => item.type === 'web_search_call')
    .flatMap((item: any) => item.action?.sources || []).map((source: any) => source.url).filter(Boolean);
  return { text, sources };
}
