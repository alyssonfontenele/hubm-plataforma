-- Rollback de 20261010030000_search_path_core_batch1.sql — NÃO aplicado automaticamente.
ALTER FUNCTION public.auth_is_active() RESET search_path;
