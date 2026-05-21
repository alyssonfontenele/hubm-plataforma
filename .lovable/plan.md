## Goal

Isolate admin concerns into single-responsibility hooks and components so future fixes don't cascade. Zero behavior change.

## Risk assessment

`src/routes/_authenticated/admin.tsx` is 2147 lines. The delete, reactivate and rescue flows are not cleanly separated today — they live inside large modals (`UserFormModal`, `UserActionsMenu`, `RescueUserModal`) that also handle form state, sector assignments, password updates, logging, and toast UX. A full single-pass extraction of every dialog body into a standalone component carries real regression risk.

I'll split the refactor into two safe phases. Phase 1 ships the hooks + thin component wrappers the user asked for, with the page consuming them, and leaves the legacy modals intact behind those wrappers. Phase 2 (separate request) can fully dismantle `UserFormModal` once Phase 1 is verified in production.

## Phase 1 — what I'll build now

### Hooks (`src/hooks/`)

1. **`useAdminUsers.ts`** — exports `adminProfilesQueryKey(companyId)` and `useAdminUsers(companyId)`. Wraps the existing `useQuery` against `profiles` with `.is('deleted_at', null)`. Replaces the inline query in `UsersTab`.
2. **`useDeleteUser.ts`** — `useDeleteUser(companyId)` returns a mutation calling `admin-delete-user`, logs the action, invalidates `adminProfilesQueryKey(companyId)` on success. Used by the new `DeleteUserDialog`.
3. **`useReactivateUser.ts`** — `useReactivateUser(companyId)` returns a mutation calling `admin-reactivate-user`, invalidates the query on success. Accepts `{ recovery_email, full_name, global_role }`.
4. **`useRescueByCPF.ts`** — exposes `lookup(cpfDigits)` calling RPC `find_profile_by_cpf`, returning `{ status: 'active' | 'suspended' | 'deleted' | 'not_found', profile }`.

### Components (`src/components/admin/`)

1. **`UserList.tsx`** — pure presentational table. Props: `profiles`, `loading`, `currentUserId`, `onEdit`, `renderActions`. No queries, no business logic.
2. **`DeleteUserDialog.tsx`** — controlled AlertDialog. Props: `open`, `onOpenChange`, `profile`, `adminId`, `companyId`, `onDeleted`. Uses `useDeleteUser` internally. Replaces the "simple delete" AlertDialog block.
3. **`ReactivateUserDialog.tsx`** — controlled AlertDialog with "Usuário já cadastrado / Deseja reativar?" copy. Props: `open`, `onOpenChange`, `payload`, `onReactivated`. Uses `useReactivateUser` internally. Wraps the existing reactivation confirmation step.
4. **`RescueByCPFDialog.tsx`** — controlled modal with the CPF input + lookup flow. Props: `open`, `onOpenChange`, `companyId`, `adminId`, `onResolved`. Uses `useRescueByCPF` internally. Replaces the existing `RescueUserModal`.

### Admin page changes

- `UsersTab` stops calling `useQuery` directly — uses `useAdminUsers`.
- `UsersTab` renders `<UserList />` instead of the inline `<Table>`.
- Delete AlertDialog inside `UserActionsMenu` becomes `<DeleteUserDialog />`.
- `RescueUserModal` is replaced by `<RescueByCPFDialog />`.
- `UserFormModal` keeps its current internals (form + sector assignments) but its reactivation AlertDialog delegates to `<ReactivateUserDialog />`.

### What stays untouched

- `UserFormModal` form body, `EditUserModal`, `HistoryTab`, `SettingsTab`, `SectorsTab`, all toast copy, all logging, all Portuguese text.
- The 2-step "Excluir definitivamente" flow (irreversible delete) — that's a separate UX concern from the simple delete dialog the task targets.

## Verification

- Visual diff: list, delete confirmation, reactivate prompt, CPF rescue modal all render identically.
- All toasts, button labels and dialog copy unchanged (pt-BR).
- Query invalidation still happens on every mutation via `adminProfilesQueryKey`.

## Out of scope (Phase 2)

Fully decomposing `UserFormModal` and `EditUserModal` into smaller pieces. Worth doing, but should be its own task to keep this diff reviewable.
