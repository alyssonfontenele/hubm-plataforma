// Placeholder gravado pela Edge Function delete-user ao anonimizar um perfil.
// Precisa ficar em sincronia com DELETED_USER_PLACEHOLDER_NAME em
// supabase/functions/delete-user/index.ts (constante duplicada por rodar em
// runtimes/deploys separados).
export const DELETED_USER_PLACEHOLDER_NAME = "Usuário excluído";

// deleted_at também é usado por inativações reversíveis (UserActionsMenu.inactivate).
// Só é uma exclusão irreversível quando o nome já foi anonimizado.
export function isProfileDeleted(profile: { full_name: string; deleted_at: string | null }): boolean {
  return !!profile.deleted_at && profile.full_name === DELETED_USER_PLACEHOLDER_NAME;
}
