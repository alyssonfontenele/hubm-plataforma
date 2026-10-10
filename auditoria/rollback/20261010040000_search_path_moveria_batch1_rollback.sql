-- Rollback de 20261010040000_search_path_moveria_batch1.sql — NÃO aplicado automaticamente.
ALTER FUNCTION public.auth_company_id() RESET search_path;
ALTER FUNCTION public.auth_global_role() RESET search_path;
ALTER FUNCTION public.auth_is_active() RESET search_path;
ALTER FUNCTION public.is_sector_member(uuid) RESET search_path;
ALTER FUNCTION public.validate_google_domain_dynamic() RESET search_path;
