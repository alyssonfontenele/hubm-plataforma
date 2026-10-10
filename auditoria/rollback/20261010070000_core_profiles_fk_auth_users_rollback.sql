-- Rollback de 20261010070000_core_profiles_fk_auth_users.sql.
-- A migration original ainda não foi aplicada nesta sessão — este arquivo é
-- preparado por simetria com os demais lotes, para uso se/quando a FK vier a
-- ser criada e precisar ser revertida.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
