# Processo de Offboarding — HubM

## Quando executar

O offboarding deve ser executado **no mesmo dia** do desligamento do colaborador, idealmente antes do fim do expediente. Nunca deixar para o dia seguinte.

## Quem executa

Administrador da empresa no painel HubM (role `admin`). Em caso de ausência, o responsável de RH deve contatar alysson@mowig.com.br para execução emergencial.

---

## O que o sistema faz automaticamente

Ao clicar em **"Desligar colaborador"** no menu de ações do usuário:

1. **Marca `deactivated_at = now()`** no perfil — timestamp permanente do desligamento
2. **Seta `active = false`** — bloqueia login imediatamente via `auth_is_active()`
3. **Revoga todas as sessões ativas** — chamada para a Edge Function `delete-user`
4. **Registra evento `user_deleted`** no `admin_logs` com `reason: offboarding`

O bloqueio é imediato: a função `auth_is_active()` retorna `false` para qualquer query RLS assim que `deactivated_at` é preenchido.

---

## O que precisa ser feito manualmente

| Ação | Responsável | Prazo |
|---|---|---|
| Remoção de acessos Google Workspace (Drive, Gmail, Meet) | TI / RH | Mesmo dia |
| Revogação de acessos a ferramentas externas (Slack, Notion, etc.) | TI | Mesmo dia |
| Transferência de arquivos e responsabilidades | Gestor | 48 horas |
| Arquivamento da conta de email corporativa | TI | 30 dias |
| Documentação da saída no sistema de RH | RH | 5 dias úteis |

---

## Como verificar que o acesso foi revogado

### Via painel HubM

O usuário desligado aparece na lista com status inativo. Não consegue mais fazer login.

### Via Supabase Dashboard

```sql
SELECT id, full_name, active, deactivated_at, last_login_at
FROM profiles
WHERE id = '<uuid-do-usuario>';
```

Deve retornar `active = false` e `deactivated_at` preenchido.

### Via admin_logs

```sql
SELECT event_type, metadata, created_at
FROM admin_logs
WHERE event_type = 'user_deleted'
  AND metadata->>'reason' = 'offboarding'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Reativação (caso de erro)

Se o offboarding foi executado por engano, um admin pode reverter manualmente via Supabase Dashboard:

```sql
UPDATE profiles
SET active = true,
    deactivated_at = NULL
WHERE id = '<uuid-do-usuario>';
```

Após isso, o usuário precisará redefinir a senha (as sessões foram revogadas).
