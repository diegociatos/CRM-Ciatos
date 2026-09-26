import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.2';
export const env = (name: string) => Deno.env.get(name);
export const service = () => createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { db: { schema: 'crm' }, auth: { persistSession: false } });
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export async function rpc(db: ReturnType<typeof service>, name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await db.rpc(name, args);
  if (error) throw new Error('database_operation_failed');
  return data;
}
export async function bodyLimited(req: Request, limit = 64000) {
  if (Number(req.headers.get('content-length')) > limit) throw new Error('body_too_large');
  const reader = req.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    size += value.length; if (size > limit) { await reader.cancel(); throw new Error('body_too_large'); } chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}
