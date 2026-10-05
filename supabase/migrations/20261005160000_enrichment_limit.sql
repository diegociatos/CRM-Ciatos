begin;
-- O teto de consultas pagas ao Snov.io era fixo em 25/dia por empresa: uma
-- lista de 300 contatos levava 12 dias. Passa a ser configurável por empresa
-- (padrão continua 25) e quem bate no teto espera, em vez de ir para revisão.
alter table crm.outreach_policy add column enrichment_daily_limit integer not null default 25
  check (enrichment_daily_limit between 0 and 5000);

create or replace function crm.reserve_enrichment(org uuid,lid uuid,operation text,value text) returns uuid
language plpgsql security definer set search_path=crm,pg_temp as $$
declare rid uuid; teto integer; begin
 select enrichment_daily_limit into teto from crm.outreach_policy where organization_id=org for update;
 if not found or not exists(select 1 from crm.leads where id=lid and organization_id=org and not opt_out) then raise exception 'Invalid lead'; end if;
 select id into rid from crm.enrichment_requests where organization_id=org and lead_id=lid and kind=operation and input=value;
 if found then return rid; end if;
 if (select count(*) from crm.enrichment_requests where organization_id=org and created_at>=date_trunc('day',now()))>=teto then raise exception 'Enrichment quota exceeded'; end if;
 insert into crm.enrichment_requests(organization_id,lead_id,kind,input) values(org,lid,operation,value) returning id into rid;
 return rid;
end $$;

-- Quem já tem consulta em andamento no Snov.io é atendido antes dos contatos
-- novos: com fila grande, o resultado ficava esperando a lista inteira passar.
create or replace function crm.claim_sdr_lead() returns jsonb language plpgsql security definer set search_path=crm,pg_temp as $$
declare q crm.sdr_queue; l crm.leads; begin
 update crm.sdr_queue set status='REVIEW',reason='Tempo de enriquecimento excedido; revisar antes de repetir.' where status='RUNNING' and locked_at<now()-interval '5 minutes';
 select a.* into q from crm.sdr_queue a join crm.sdr_settings s on s.organization_id=a.organization_id and s.enabled
 join crm.organizations o on o.id=a.organization_id and o.ativo
 where a.status='PENDING' and a.next_at<=now() order by (a.attempts>0) desc, a.next_at for update of a skip locked limit 1;
 if not found then return null; end if;
 select * into l from crm.leads where id=q.lead_id;
 if l.opt_out or exists(select 1 from crm.suppression_list where organization_id=q.organization_id and lower(email)=lower(l.email)) then
 update crm.sdr_queue set status='STOPPED',reason='Não contatar' where id=q.id; return null; end if;
 update crm.sdr_queue set status='RUNNING',lease=gen_random_uuid(),locked_at=now(),attempts=attempts+1 where id=q.id returning * into q;
 return to_jsonb(q)||jsonb_build_object('lead',to_jsonb(l));
end $$;
commit;
