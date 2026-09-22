// Placeholder gravado pela Edge Function delete-user/data-rights ao
// anonimizar um perfil. Precisa ficar em sincronia com
// DELETED_USER_PLACEHOLDER_NAME em supabase/functions/delete-user/index.ts
// (constante duplicada por rodar em runtimes/deploys separados).
export const DELETED_USER_PLACEHOLDER_NAME = "Usuário excluído";

// anonymized_at é a única fonte de verdade para "exclusão irreversível".
// deleted_at/deactivated_at são só inativação reversível (UserActionsMenu.inactivate,
// OffboardingModal) — não indicam exclusão, mesmo que também impeçam login.
export function isProfileDeleted(profile: { anonymized_at: string | null }): boolean {
  return !!profile.anonymized_at;
}
