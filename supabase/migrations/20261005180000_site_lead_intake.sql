-- Entrada de leads vindos dos sites do grupo (formulário de diagnóstico).
-- Só a Edge Function crm-lead-intake (service_role) chama esta função; o navegador não.
-- O lead entra como prospect em "Qualificação", na fila de ligação, SEM inscrição em cadência
-- (quem pediu diagnóstico não recebe e-mail frio). Reenvio do mesmo e-mail/telefone atualiza o lead.
create or replace function crm.capture_site_lead(org uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = crm, pg_temp as $$
declare
  v_email text; v_tel text; v_nome text; v_emp text; v_digits text;
  existente uuid; novo uuid; v_tags text[]; v_dados jsonb; v_src text;
begin
  if not exists (select 1 from crm.organizations where id = org) then raise exception 'Empresa inválida.'; end if;
  if jsonb_typeof(p) <> 'object' then raise exception 'Payload inválido.'; end if;

  v_email := nullif(lower(trim(coalesce(p->>'email',''))), '');
  if v_email is not null and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then v_email := null; end if;
  v_tel := nullif(left(regexp_replace(coalesce(p->>'telefone',''), '[^0-9+() -]', '', 'g'), 30), '');
  v_digits := nullif(regexp_replace(coalesce(v_tel,''), '\D', '', 'g'), '');
  v_nome := nullif(left(trim(coalesce(p->>'nome','')), 200), '');
  v_emp := nullif(left(trim(coalesce(p->>'empresa','')), 200), '');
  if v_email is null and v_tel is null then raise exception 'Lead sem e-mail e sem telefone.'; end if;

  v_src := left('Site · ' || coalesce(nullif(p->>'origem',''), 'acesso direto'), 1000);
  v_tags := array_remove(array[
    'site', 'inbound',
    case when nullif(p->>'utm_campaign','') is not null then 'campanha:' || left(p->>'utm_campaign', 60) end,
    case when nullif(p->>'utm_source','') is not null then 'fonte:' || left(p->>'utm_source', 40) end
  ], null);
  v_dados := jsonb_strip_nulls(jsonb_build_object(
    'tradeName', v_emp, 'companyEmail', v_email,
    'regime', nullif(left(p->>'regime',100),''), 'faturamento', nullif(left(p->>'faturamento',100),''),
    'setor', nullif(left(p->>'setor',100),''), 'notes', nullif(left(p->>'mensagem',2000),''),
    'origemSite', jsonb_strip_nulls(jsonb_build_object(
      'origem', nullif(left(p->>'origem',200),''), 'utm_source', nullif(left(p->>'utm_source',100),''),
      'utm_medium', nullif(left(p->>'utm_medium',100),''), 'utm_campaign', nullif(left(p->>'utm_campaign',100),''),
      'utm_content', nullif(left(p->>'utm_content',100),''), 'utm_term', nullif(left(p->>'utm_term',100),''),
      'landing_page', nullif(left(p->>'landing_page',200),''), 'page_path', nullif(left(p->>'page_path',200),''),
      'referrer', nullif(left(p->>'referrer',300),''), 'recebido_em', nullif(left(p->>'recebido_em',40),''))),
    'ultimoPedidoSite', now()));

  if v_email is not null then
    select id into existente from crm.leads where organization_id = org and lower(email) = v_email limit 1;
  end if;
  if existente is null and v_digits is not null then
    select id into existente from crm.leads
      where organization_id = org and regexp_replace(coalesce(telefone,''), '\D', '', 'g') = v_digits limit 1;
  end if;

  if existente is not null then
    update crm.leads set
      nome = coalesce(nullif(nome,''), v_nome),
      email = coalesce(nullif(email,''), v_email),
      telefone = coalesce(nullif(telefone,''), v_tel),
      empresa = coalesce(nullif(empresa,''), v_emp),
      segmento = coalesce(nullif(segmento,''), nullif(left(p->>'setor',100),'')),
      tags = (select coalesce(array_agg(distinct t), '{}') from unnest(tags || v_tags) t),
      in_queue = true,
      dados = dados || v_dados
    where id = existente;
    return jsonb_build_object('status', 'atualizado', 'id', existente);
  end if;

  insert into crm.leads(organization_id, nome, email, telefone, empresa, status, phase_id, in_queue,
                        segmento, relacao, tags, contact_basis, contact_source, dados)
  values (org, v_nome, v_email, v_tel, v_emp, 'Qualificação', 'ph-qualificado', true,
          nullif(left(p->>'setor',100),''), 'prospect', v_tags,
          'Pedido de diagnóstico pelo formulário do site, com consentimento', v_src, v_dados)
  returning id into novo;
  return jsonb_build_object('status', 'criado', 'id', novo);
end $$;

revoke all on function crm.capture_site_lead(uuid, jsonb) from public, anon, authenticated;
grant execute on function crm.capture_site_lead(uuid, jsonb) to service_role;
