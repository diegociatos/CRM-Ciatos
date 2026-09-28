// E-mails do onboarding do cliente (equipe e cliente) e convites do Outlook.
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const dataBr = (iso?: string | null) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : 'sem prazo';
const primeiroNome = (n?: string | null) => (n || '').trim().split(/\s+/)[0] || '';
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);

export interface Aviso {
  tipo: string; para: string; para_nome?: string | null; empresa: string; lead_id?: string | null; referencia: string;
  cliente?: string | null; contato?: string | null; reply_to?: string | null;
  fase?: { titulo: string; descricao?: string | null; prazo?: string | null; executor: string; ordem: number; total: number; responsavel?: { nome: string; email: string } | null } | null;
  itens?: { fase: string; cliente: string; prazo: string | null; lead_id: string }[] | null;
}

function layout(empresa: string, titulo: string, corpo: string, botao?: { texto: string; url: string }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f5f5f0"><div style="max-width:600px;margin:0 auto;padding:24px;font-family:Georgia,'Times New Roman',serif;color:#1e293b">
<div style="background:#0a192f;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;border-bottom:4px solid #c5a059"><p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#dfc696">${esc(empresa)} · Onboarding</p><h1 style="margin:6px 0 0;font-size:20px;line-height:1.3">${esc(titulo)}</h1></div>
<div style="background:#fff;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 12px 12px;padding:24px;line-height:1.6">${corpo}
${botao ? `<p style="margin:24px 0 0"><a href="${esc(botao.url)}" style="background:#c5a059;color:#0a192f;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:700;display:inline-block">${esc(botao.texto)}</a></p>` : ''}</div>
<p style="font-size:12px;color:#64748b;margin:14px 4px 0">Mensagem automática do CRM ${esc(empresa)}.</p></div></body></html>`;
}

const caixaFase = (a: Aviso) => a.fase ? `<div style="border:1px solid #e2e8f0;border-left:4px solid #c5a059;border-radius:8px;padding:14px 16px;margin:16px 0;background:#fafaf7">
<p style="margin:0;font-weight:700">${esc(a.fase.titulo)}</p>
${a.fase.descricao ? `<p style="margin:6px 0 0;color:#475569">${esc(a.fase.descricao)}</p>` : ''}
<p style="margin:8px 0 0;font-size:14px">Prazo: <strong>${dataBr(a.fase.prazo)}</strong> · Fase ${a.fase.ordem + 1} de ${a.fase.total}${a.cliente ? ` · Cliente: <strong>${esc(a.cliente)}</strong>` : ''}</p></div>` : '';

/** Monta assunto, HTML e resposta para um aviso da fila. */
export function renderAviso(a: Aviso, appUrl: string): { subject: string; html: string; replyTo?: string | null } {
  const link = (lead?: string | null) => `${appUrl}/?onboarding=${lead || a.lead_id || ''}`;
  const ola = `<p style="margin:0 0 12px">Olá${primeiroNome(a.para_nome) ? `, ${esc(primeiroNome(a.para_nome))}` : ''},</p>`;
  const f = a.fase; const cli = a.cliente || 'cliente';
  switch (a.tipo) {
    case 'atribuida':
      return { subject: `Nova fase para você: ${f?.titulo} · ${cli}`, html: layout(a.empresa, 'Você é o responsável por uma fase', `${ola}<p>Você é o responsável por esta fase do onboarding de <strong>${esc(cli)}</strong>:</p>${caixaFase(a)}<p>O convite já está no seu calendário do Outlook.</p>`, { texto: 'Abrir no CRM', url: link() }) };
    case 'liberada':
      return { subject: `Sua vez: ${f?.titulo} · ${cli}`, html: layout(a.empresa, 'A fase anterior foi concluída', `${ola}<p>A fase anterior do onboarding de <strong>${esc(cli)}</strong> terminou. Agora é a sua vez:</p>${caixaFase(a)}`, { texto: 'Abrir no CRM', url: link() }) };
    case 'lembrete_antes':
      return { subject: `Faltam 2 dias: ${f?.titulo} · ${cli}`, html: layout(a.empresa, 'Prazo se aproximando', `${ola}<p>Esta fase vence em 2 dias:</p>${caixaFase(a)}`, { texto: 'Abrir no CRM', url: link() }) };
    case 'lembrete_dia':
      return { subject: `Vence hoje: ${f?.titulo} · ${cli}`, html: layout(a.empresa, 'Esta fase vence hoje', `${ola}${caixaFase(a)}<p>Se já concluiu, marque como concluída no CRM para liberar a próxima fase.</p>`, { texto: 'Abrir no CRM', url: link() }) };
    case 'atrasada': {
      const dias = f?.prazo ? diasEntre(f.prazo, a.referencia) : 0;
      return { subject: `Atrasada ${dias} dia(s): ${f?.titulo} · ${cli}`, html: layout(a.empresa, `Fase atrasada há ${dias} dia(s)`, `${ola}<p>Esta fase passou do prazo e está segurando o onboarding de <strong>${esc(cli)}</strong>:</p>${caixaFase(a)}<p>Se o prazo mudou, atualize no CRM.</p>`, { texto: 'Resolver no CRM', url: link() }) };
    }
    case 'cliente_pedido':
    case 'cliente_lembrete': {
      const resp = f?.responsavel;
      const atrasado = a.tipo === 'cliente_lembrete' && f?.prazo && f.prazo < a.referencia;
      const titulo = a.tipo === 'cliente_pedido' ? 'Precisamos de você para seguir' : atrasado ? 'Ainda aguardamos o seu retorno' : 'Lembrete do seu onboarding';
      const olaCli = `<p style="margin:0 0 12px">Olá${primeiroNome(a.contato) ? `, ${esc(primeiroNome(a.contato))}` : ''},</p>`;
      const corpo = `${olaCli}<p>${a.tipo === 'cliente_pedido'
          ? `Para darmos andamento ao seu início com a <strong>${esc(a.empresa)}</strong>, precisamos que você conclua esta etapa:`
          : atrasado ? `A etapa abaixo passou do prazo combinado e o seu início com a <strong>${esc(a.empresa)}</strong> depende dela:` : 'Passando para lembrar desta etapa do seu início conosco:'}</p>
${caixaFase({ ...a, cliente: null })}
<p>É só <strong>responder a este e-mail</strong> com o que for necessário${resp ? `, ou falar direto com <strong>${esc(resp.nome)}</strong> (${esc(resp.email)})` : ''}.</p>`;
      return { subject: a.tipo === 'cliente_pedido' ? `${a.empresa}: ${f?.titulo}` : `${atrasado ? 'Pendente' : 'Lembrete'}: ${f?.titulo} (prazo ${dataBr(f?.prazo)})`,
        html: layout(a.empresa, titulo, corpo), replyTo: resp?.email || a.reply_to };
    }
    case 'resumo': {
      const linhas = (a.itens || []).map(i => {
        const venc = i.prazo && i.prazo < a.referencia ? `<span style="color:#b91c1c">atrasada desde ${dataBr(i.prazo)}</span>` : i.prazo === a.referencia ? '<strong>vence hoje</strong>' : `até ${dataBr(i.prazo)}`;
        return `<li style="margin:0 0 8px"><a href="${esc(link(i.lead_id))}" style="color:#0a192f;font-weight:700">${esc(i.fase)}</a> · ${esc(i.cliente)} · ${venc}</li>`;
      }).join('');
      const n = (a.itens || []).length;
      return { subject: `Seu onboarding hoje: ${n} fase(s) pedindo atenção`, html: layout(a.empresa, 'Resumo do seu dia', `${ola}<p>Estas fases estão atrasadas ou vencem nos próximos 3 dias:</p><ul style="padding-left:18px">${linhas}</ul>`, { texto: 'Ver minhas fases', url: `${appUrl}/?onboarding=minhas` }) };
    }
    default: throw new Error('tipo_desconhecido');
  }
}

/** Evento de dia inteiro (prazo da fase) para o Outlook do responsável. */
export function eventoFase(s: { titulo: string; descricao?: string | null; prazo: string; cliente?: string | null; executor: string; resp_email: string; resp_nome?: string | null; lead_id: string }, appUrl: string) {
  const fim = new Date(Date.parse(`${s.prazo}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  return {
    subject: `Onboarding · ${s.titulo} — ${s.cliente || 'cliente'}`,
    body: { contentType: 'HTML', content: `<p><strong>Prazo da fase:</strong> ${esc(s.titulo)}${s.executor === 'cliente' ? ' (executada pelo cliente; acompanhe)' : ''}</p>${s.descricao ? `<p>${esc(s.descricao)}</p>` : ''}<p><a href="${esc(`${appUrl}/?onboarding=${s.lead_id}`)}">Abrir no CRM</a></p>` },
    start: { dateTime: `${s.prazo}T00:00:00`, timeZone: 'America/Sao_Paulo' },
    end: { dateTime: `${fim}T00:00:00`, timeZone: 'America/Sao_Paulo' },
    isAllDay: true, showAs: 'free', isReminderOn: true, reminderMinutesBeforeStart: 15 * 60,
    responseRequested: false, allowNewTimeProposals: false,
    attendees: [{ emailAddress: { address: s.resp_email, name: s.resp_nome || s.resp_email }, type: 'required' }],
  };
}

/** Compromisso da Agenda do CRM (com horário). */
export function eventoAgenda(e: { titulo: string; inicio: string; fim?: string | null; descricao?: string | null; cliente?: string | null; convidados: string[] }) {
  const ini = new Date(e.inicio); const fim = e.fim ? new Date(e.fim) : new Date(ini.getTime() + 3600e3);
  const utc = (d: Date) => d.toISOString().replace(/Z$/, '');
  return {
    subject: e.cliente ? `${e.titulo} — ${e.cliente}` : e.titulo,
    body: { contentType: 'HTML', content: `${e.descricao ? `<p>${esc(e.descricao)}</p>` : ''}<p>Compromisso criado no CRM Ciatos.</p>` },
    start: { dateTime: utc(ini), timeZone: 'UTC' }, end: { dateTime: utc(fim > ini ? fim : new Date(ini.getTime() + 3600e3)), timeZone: 'UTC' },
    isReminderOn: true, reminderMinutesBeforeStart: 30, allowNewTimeProposals: false,
    attendees: e.convidados.map(address => ({ emailAddress: { address }, type: 'required' })),
  };
}
