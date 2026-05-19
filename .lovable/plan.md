## Etapa 2 — AppShell (Sidebar + Topbar + Roteamento Autenticado)

### Objetivo
Criar o esqueleto autenticado do HubM: uma rota guard `_authenticated` que protege todas as páginas internas, com Sidebar (navegação por setores) e Topbar (busca, notificações, usuário).

### Estrutura de rotas

```text
src/routes/
  __root.tsx              (existente)
  login.tsx               (existente)
  index.tsx               → redireciona p/ /app ou /login
  _authenticated.tsx      → guard + layout (SidebarProvider + AppSidebar + Topbar + <Outlet/>)
  _authenticated/
    index.tsx             → /app  (placeholder Home — etapa 3)
    sectors.$slug.tsx     → /sectors/:slug (placeholder — etapa 4)
    admin.tsx             → /admin (placeholder — etapa 7)
```

### Componentes novos

- `src/components/app-sidebar.tsx` — Sidebar shadcn `collapsible="icon"`:
  - Header: logo HubM + nome da empresa (de `useAuth().company`)
  - Grupo "Principal": Home (`/app`)
  - Grupo "Setores": itens dinâmicos a partir de `sectorMemberships` → `/sectors/{slug}` com ícone (lucide via nome em `sector.icon`)
  - Grupo "Administração" (visível apenas se `globalRole === 'admin'`): Admin (`/admin`)
  - Footer: botão Sair (`signOut`)
- `src/components/app-topbar.tsx`:
  - `SidebarTrigger` à esquerda
  - Breadcrumb simples baseado em `useRouterState`
  - Campo de busca (visual apenas nesta etapa)
  - Avatar do usuário com dropdown: nome, email, "Sair"
- `src/components/protected-route-helpers.tsx` (se necessário) — utilitário para resolver ícone lucide por nome.

### Guard de autenticação

`src/routes/_authenticated.tsx`:
- Em `beforeLoad`: se não houver sessão no `localStorage` (verificação via `supabase.auth.getSession()`), `throw redirect({ to: '/login', search: { redirect: location.href } })`.
- Component: aguarda `loading` do `AuthContext`; renderiza `<SidebarProvider><AppSidebar/><SidebarInset><AppTopbar/><Outlet/></SidebarInset></SidebarProvider>`.
- Se `profile` for null após carregar (usuário autenticado mas sem perfil): mostra tela de erro com botão Sair.

### Ajustes em arquivos existentes

- `src/routes/index.tsx`: redireciona para `/app` se autenticado, senão `/login`.
- `src/routes/login.tsx`: ler search param `redirect` e navegar para ele após login bem-sucedido (fallback `/app`).
- `src/styles.css`: adicionar tokens `--sidebar-*` se ainda não estiverem definidos pelo template shadcn.

### Detalhes técnicos

- Largura sidebar: usar `w-[var(--sidebar-width)]` (regra Tailwind 4).
- Active state: `useRouterState` + `isActive` no `SidebarMenuButton`.
- O `AuthContext.loading` evita flash; `_authenticated` mostra um skeleton/spinner enquanto `loading === true`.
- Navegação dos setores 100% derivada de `sectorMemberships` — nenhum hardcode.

### Fora de escopo (próximas etapas)
- Conteúdo real da Home (anúncios + grid) — Etapa 3
- Página de Setor com pastas e recursos — Etapa 4
- Modal de recurso — Etapa 5
- Painel Admin funcional — Etapa 7

Confirma para implementar?