// Edge Function: crm-admin-users
// Convida e desativa usuários do CRM (service role). Só ADMIN do CRM chama.
//
// ATENÇÃO: o auth.users é COMPARTILHADO com o Chekly. Se o e-mail já tem conta
// (ex.: usuário do Chekly), NÃO recriamos nem trocamos a senha dele — só
// liberamos o acesso ao CRM criando a linha em crm.profiles.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PAPEIS = ['ADMIN', 'MANAGER', 'SDR', 'CLOSER', 'OPERATIONAL', 'CS', 'MARKETING'];

// Origens para onde o link de convite pode voltar (evita open redirect).
function origemPermitida(o: unknown): string {
  const lista = (Deno.env.get('CRM_APP_URLS') || 'https://crm-ciatos.pages.dev,http://localhost:3000')
    .split(',').map(s => s.trim()).filter(Boolean);
  return typeof o === 'string' && lista.includes(o) ? o : lista[0];
}

function senhaAleatoria(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return `${btoa(String.fromCharCode(...b)).replace(/[^a-zA-Z0-9]/g, '')}Aa1!`;
}

const esc = (s: string) => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]!));

async function enviarEmail(to: string, assunto: string, html: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('CRM_EMAIL_FROM') || 'CRM Ciatos <nao-responder@envio.grupociatos.com.br>';
  if (!key || Deno.env.get('CRM_LIVE_SEND_ENABLED') !== 'true') return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: assunto, html }),
    });
    return r.ok;
  } catch { return false; }
}

function htmlConvite(nome: string, link: string, contaExistente: boolean): string {
  const corpo = contaExistente
    ? `Seu acesso ao <strong>CRM Ciatos</strong> foi liberado. Entre com o mesmo e-mail e a senha que você já usa nos sistemas do Grupo Ciatos.`
    : `Sua conta no <strong>CRM Ciatos</strong> foi criada. Clique no botão abaixo para <strong>definir sua senha</strong>. O link é pessoal e expira.`;
  const botao = contaExistente ? 'Acessar o CRM' : 'Definir minha senha';
  return `
  <div style="font-family: Georgia, 'Times New Roman', serif; color:#0a192f; max-width:520px; margin:0 auto;">
    <div style="background:#0a192f; color:#fff; padding:20px 24px; border-radius:12px 12px 0 0; border-bottom:4px solid #c5a059;">
      <h1 style="margin:0; font-size:20px;">Bem-vindo ao CRM Ciatos</h1>
    </div>
    <div style="border:1px solid #e2e8f0; border-top:0; border-radius:0 0 12px 12px; padding:24px;">
      <p style="margin:0 0 12px;">Olá${nome ? ', ' + esc(nome) : ''},</p>
      <p style="margin:0 0 16px;">${corpo}</p>
      <p style="margin:0 0 20px;"><a href="${link}" style="background:#c5a059; color:#0a192f; text-decoration:none; padding:12px 20px; border-radius:10px; font-weight:700; display:inline-block;">${botao}</a></p>
      <p style="margin:0; color:#64748b; font-size:13px;">Se você não esperava este convite, ignore este e-mail.</p>
    </div>
  </div>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método não permitido' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const asCaller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: me } = await asCaller.auth.getUser();
  if (!me?.user) return json({ error: 'Não autenticado' }, 401);

  const admin = createClient(url, service, { db: { schema: 'crm' } });
  const { data: caller } = await admin.from('profiles').select('papel, ativo').eq('id', me.user.id).maybeSingle();
  if (!caller?.ativo || caller.papel !== 'ADMIN') return json({ error: 'Somente administradores do CRM gerenciam usuários' }, 403);
  const legacyOrg = '00000000-0000-4000-8000-000000000001';
  const { data: membership } = await admin.from('organization_members').select('papel').eq('organization_id', legacyOrg).eq('user_id', me.user.id).eq('ativo', true).maybeSingle();
  if (membership?.papel !== 'ADMIN') return json({ error: 'Administração legada restrita ao Grupo Ciatos.' }, 403);

  let p: any;
  try { p = await req.json(); } catch { return json({ error: 'JSON inválido' }, 400); }

  try {
    if (p.action === 'create') {
      const email = String(p.email ?? '').trim().toLowerCase();
      const nome = String(p.nome ?? '').trim();
      const papel = String(p.papel ?? 'SDR').toUpperCase();
      const departamento = String(p.departamento ?? 'Comercial');
      if (!/^\S+@\S+\.\S+$/.test(email) || !nome) return json({ error: 'Nome e e-mail válidos são obrigatórios' }, 400);
      if (!PAPEIS.includes(papel)) return json({ error: 'Papel inválido' }, 400);
      const origem = origemPermitida(p.redirectTo);

      // Já existe conta no auth (Chekly ou convite anterior)? Procura pelo e-mail.
      let userId: string | null = null;
      for (let page = 1; page <= 20 && !userId; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw error;
        userId = data.users.find(u => (u.email || '').toLowerCase() === email)?.id ?? null;
        if (data.users.length < 1000) break;
      }
      const contaExistente = !!userId;
      if (userId) {
        const { data: tenants, error: tenantError } = await admin.from('organization_members').select('organization_id').eq('user_id',userId);
        if (tenantError || tenants?.some(t => t.organization_id !== legacyOrg)) return json({ error: 'Gerencie este usuário pelo provisionamento multiempresa.' },403);
      }

      if (!userId) {
        const { data: created, error } = await admin.auth.admin.createUser({
          email, password: senhaAleatoria(), email_confirm: true, user_metadata: { nome },
        });
        if (error) throw error;
        userId = created.user!.id;
      }

      const { error: eProf } = await admin.from('profiles').upsert(
        { id: userId, nome, email, papel, departamento, ativo: true },
        { onConflict: 'id' },
      );
      if (eProf) throw eProf;
      const { error: eMember } = await admin.from('organization_members').upsert({ organization_id: legacyOrg, user_id: userId, papel: ['ADMIN','MANAGER'].includes(papel) ? 'ADMIN' : 'MEMBER', ativo: true });
      if (eMember) throw eMember;

      let link = origem;
      if (!contaExistente) {
        const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: origem } });
        if (error) throw error;
        link = (data as any)?.properties?.action_link ?? origem;
      }
      const emailEnviado = await enviarEmail(
        email,
        contaExistente ? 'Seu acesso ao CRM Ciatos foi liberado' : 'Convite — defina sua senha no CRM Ciatos',
        htmlConvite(nome, link, contaExistente),
      );
      return json({ user: { id: userId }, contaExistente, emailEnviado, inviteLink: emailEnviado ? null : link });
    }

    if (p.action === 'deactivate') {
      const { data: memberships, error: memberError } = await admin.from('organization_members').select('organization_id').eq('user_id',p.id);
      if (memberError || !memberships?.length || memberships.some(t=>t.organization_id!==legacyOrg)) return json({error:'Usuário fora deste workspace.'},403);
      if (p.id === me.user.id) return json({ error: 'Você não pode desativar o próprio acesso' }, 400);
      // Só tira o acesso ao CRM. A conta no auth continua (pode ser usada no Chekly).
      const { error } = await admin.from('profiles').update({ ativo: false }).eq('id', p.id);
      if (error) throw error;
      return json({ ok: true });
    }

    if (p.action === 'set-role') {
      const { data: memberships, error: memberError } = await admin.from('organization_members').select('organization_id').eq('user_id',p.id);
      if (memberError || !memberships?.length || memberships.some(t=>t.organization_id!==legacyOrg)) return json({error:'Usuário fora deste workspace.'},403);
      const papel = String(p.papel ?? '').toUpperCase();
      if (!PAPEIS.includes(papel)) return json({ error: 'Papel inválido' }, 400);
      const { error } = await admin.from('profiles').update({ papel }).eq('id', p.id);
      if (error) throw error;
      const { error: memberUpdateError } = await admin.from('organization_members').update({papel:['ADMIN','MANAGER'].includes(papel)?'ADMIN':'MEMBER'}).eq('organization_id',legacyOrg).eq('user_id',p.id);
      if (memberUpdateError) throw memberUpdateError;
      return json({ ok: true });
    }

    return json({ error: 'Ação desconhecida' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message || 'Erro ao processar' }, 400);
  }
});
