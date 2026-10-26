-- Roteiro de teste do isolamento do lojista (J558). Cada bloco é uma chamada independente (begin ... rollback), só SELECT/INSERT desfeito.
-- Antes da migração: o lojista enxerga linhas (ex.: companies=3, sectors=6). Depois: TODAS as linhas devem ser 0.
-- O colaborador deve ter as MESMAS contagens antes e depois. Qualquer diferença para o colaborador = reverter na hora
-- (supabase/tests/portal_lojista_rls_reverter.sql). Quando criar tabela nova em public, inclua-a aqui e na migração.

-- ===== BLOCO 1 · LOJISTA (esperado: linhas = 0 em todas) =====
begin;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"tipo":"lojista"}}',true);
set local role authenticated;
select * from (
  select 'companies' as tabela, count(*) as linhas from public.companies union all
  select 'profiles' as tabela, count(*) as linhas from public.profiles union all
  select 'sectors' as tabela, count(*) as linhas from public.sectors union all
  select 'sector_members' as tabela, count(*) as linhas from public.sector_members union all
  select 'folders' as tabela, count(*) as linhas from public.folders union all
  select 'resources' as tabela, count(*) as linhas from public.resources union all
  select 'resource_permissions' as tabela, count(*) as linhas from public.resource_permissions union all
  select 'access_logs' as tabela, count(*) as linhas from public.access_logs union all
  select 'announcements' as tabela, count(*) as linhas from public.announcements union all
  select 'integrations' as tabela, count(*) as linhas from public.integrations union all
  select 'admin_logs' as tabela, count(*) as linhas from public.admin_logs union all
  select 'profile_sector_requests' as tabela, count(*) as linhas from public.profile_sector_requests union all
  select 'cargos' as tabela, count(*) as linhas from public.cargos union all
  select 'cargo_permissions' as tabela, count(*) as linhas from public.cargo_permissions union all
  select 'profile_cargos' as tabela, count(*) as linhas from public.profile_cargos union all
  select 'cargo_sectors' as tabela, count(*) as linhas from public.cargo_sectors union all
  select 'email_rate_limits' as tabela, count(*) as linhas from public.email_rate_limits union all
  select 'company_features' as tabela, count(*) as linhas from public.company_features union all
  select 'auth_rate_limits' as tabela, count(*) as linhas from public.auth_rate_limits union all
  select 'audit_log' as tabela, count(*) as linhas from public.audit_log union all
  select 'schema_migrations' as tabela, count(*) as linhas from public.schema_migrations union all
  select 'tarefas_slas' as tabela, count(*) as linhas from public.tarefas_slas union all
  select 'tarefas_modelos' as tabela, count(*) as linhas from public.tarefas_modelos union all
  select 'tarefas' as tabela, count(*) as linhas from public.tarefas union all
  select 'tarefas_atribuicoes' as tabela, count(*) as linhas from public.tarefas_atribuicoes union all
  select 'tarefas_eventos' as tabela, count(*) as linhas from public.tarefas_eventos union all
  select 'tarefas_checklist_itens' as tabela, count(*) as linhas from public.tarefas_checklist_itens union all
  select 'tarefas_anexos' as tabela, count(*) as linhas from public.tarefas_anexos union all
  select 'tarefas_validacoes' as tabela, count(*) as linhas from public.tarefas_validacoes union all
  select 'apps' as tabela, count(*) as linhas from public.apps
) x where linhas <> 0 order by tabela;   -- lista vazia = APROVADO
rollback;

-- ===== BLOCO 2 · COLABORADOR (admin ativo real; compare antes x depois) =====
begin;
select set_config('request.jwt.claims', json_build_object('sub',(select id from public.profiles where global_role='admin' and active order by created_at limit 1),'role','authenticated','app_metadata','{}'::json)::text, true);
set local role authenticated;
select * from (
  select 'companies' as tabela, count(*) as linhas from public.companies union all
  select 'profiles' as tabela, count(*) as linhas from public.profiles union all
  select 'sectors' as tabela, count(*) as linhas from public.sectors union all
  select 'sector_members' as tabela, count(*) as linhas from public.sector_members union all
  select 'folders' as tabela, count(*) as linhas from public.folders union all
  select 'resources' as tabela, count(*) as linhas from public.resources union all
  select 'resource_permissions' as tabela, count(*) as linhas from public.resource_permissions union all
  select 'access_logs' as tabela, count(*) as linhas from public.access_logs union all
  select 'announcements' as tabela, count(*) as linhas from public.announcements union all
  select 'integrations' as tabela, count(*) as linhas from public.integrations union all
  select 'admin_logs' as tabela, count(*) as linhas from public.admin_logs union all
  select 'profile_sector_requests' as tabela, count(*) as linhas from public.profile_sector_requests union all
  select 'cargos' as tabela, count(*) as linhas from public.cargos union all
  select 'cargo_permissions' as tabela, count(*) as linhas from public.cargo_permissions union all
  select 'profile_cargos' as tabela, count(*) as linhas from public.profile_cargos union all
  select 'cargo_sectors' as tabela, count(*) as linhas from public.cargo_sectors union all
  select 'email_rate_limits' as tabela, count(*) as linhas from public.email_rate_limits union all
  select 'company_features' as tabela, count(*) as linhas from public.company_features union all
  select 'auth_rate_limits' as tabela, count(*) as linhas from public.auth_rate_limits union all
  select 'audit_log' as tabela, count(*) as linhas from public.audit_log union all
  select 'schema_migrations' as tabela, count(*) as linhas from public.schema_migrations union all
  select 'tarefas_slas' as tabela, count(*) as linhas from public.tarefas_slas union all
  select 'tarefas_modelos' as tabela, count(*) as linhas from public.tarefas_modelos union all
  select 'tarefas' as tabela, count(*) as linhas from public.tarefas union all
  select 'tarefas_atribuicoes' as tabela, count(*) as linhas from public.tarefas_atribuicoes union all
  select 'tarefas_eventos' as tabela, count(*) as linhas from public.tarefas_eventos union all
  select 'tarefas_checklist_itens' as tabela, count(*) as linhas from public.tarefas_checklist_itens union all
  select 'tarefas_anexos' as tabela, count(*) as linhas from public.tarefas_anexos union all
  select 'tarefas_validacoes' as tabela, count(*) as linhas from public.tarefas_validacoes union all
  select 'apps' as tabela, count(*) as linhas from public.apps
) x order by tabela;
rollback;

-- ===== BLOCO 3 · LOJISTA, ESCRITA (rode UM por vez; esperado: ERRO 42501 "new row violates row-level security policy") =====
-- Antes da migração estes INSERTs passavam na RLS (e só falhavam por FK = 23503).
-- 3a
begin; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"tipo":"lojista"}}',true); set local role authenticated;
insert into public.access_logs (profile_id, action) values ('00000000-0000-4000-8000-0000000000a1', (enum_range(null::public.log_action))[1]); rollback;
-- 3b
begin; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"tipo":"lojista"}}',true); set local role authenticated;
insert into public.profile_sector_requests (profile_id) values ('00000000-0000-4000-8000-0000000000a1'); rollback;
-- 3c
begin; select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"tipo":"lojista"}}',true); set local role authenticated;
insert into public.profiles (id, company_id, full_name, auth_type, active, global_role) values ('00000000-0000-4000-8000-0000000000a1', (select id from public.companies limit 1), 'Teste lojista', 'google', false, 'member'); rollback;
