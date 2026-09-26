begin;
create function crm.complete_ai_run(rid bigint,provider_name text,model_name text,decision jsonb,tokens_in integer,tokens_out integer) returns void
language plpgsql security definer set search_path=crm,pg_temp as $$ declare r crm.ai_runs; address text; begin
 select * into r from crm.ai_runs where id=rid for update;
 if not found or r.status<>'RUNNING' then raise exception 'Invalid AI run'; end if;
 if decision->>'action' not in ('continue','human','stop') or (decision->>'confidence')::numeric not between 0 and 1 then raise exception 'Invalid decision'; end if;
 update crm.ai_runs set provider=provider_name,model=model_name,action=decision->>'action',output=decision,confidence=(decision->>'confidence')::numeric,
 tokens_in=complete_ai_run.tokens_in,tokens_out=complete_ai_run.tokens_out,status='DONE',completed_at=now() where id=rid;
 if decision->>'action'='stop' then
   select email into address from crm.leads where id=r.lead_id;
   perform crm.suppress_contact(r.organization_id,address,'ai_stop_review');
 end if;
 if decision->>'action'<>'continue' or (decision->>'confidence')::numeric<0.85 then
   update crm.sequence_enrollments set status='PAUSED',stop_reason='ai_review' where lead_id=r.lead_id and status='ACTIVE';
   insert into crm.human_handoffs(organization_id,lead_id,reason,ai_summary,suggested_action)
   values(r.organization_id,r.lead_id,'Análise da IA',left(decision->>'summary',2000),'Avaliar contexto e realizar contato humano se apropriado.');
 end if;
end $$;
revoke all on function crm.complete_ai_run(bigint,text,text,jsonb,integer,integer) from public,anon,authenticated;
grant execute on function crm.complete_ai_run(bigint,text,text,jsonb,integer,integer) to service_role;
commit;
