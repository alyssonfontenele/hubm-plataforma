# Edge Functions — HubM

Todas as funções rodam em Deno (Supabase Edge Runtime). Autenticação interna via header `x-internal-secret` (nunca exposto ao frontend). CORS dinâmico via variável `ALLOWED_ORIGINS`.

---

## 1. create-cpf-user

**Propósito:** Criar um novo usuário com autenticação por CPF.

**Autenticação:** `x-internal-secret` (chamada server-to-server pelo frontend via service key)

**Input (POST body):**
```json
{
  "full_name": "string (obrigatório)",
  "cpf": "string — 11 dígitos, formatado ou não (obrigatório)",
  "recovery_email": "string | null",
  "cellphone": "string | null",
  "company_id": "uuid (obrigatório)",
  "global_role": "admin | manager | member | viewer | operational",
  "initial_password": "string | null — gerada automaticamente se omitida"
}
```

**Output:**
```json
{ "success": true, "user_id": "uuid" }
{ "error": "already registered" }   // 400
{ "error": "Requisição inválida" }  // 400 — CPF inválido
```

**Validações:** CPF com 11 dígitos, dígitos verificadores, não-repetição. Não aceita CPF já cadastrado e ativo.

---

## 2. delete-user

**Propósito:** Remover um usuário do Supabase Auth (hard delete).

**Autenticação:** Nenhuma no nível da função (controle via chamada autenticada do frontend admin).

**Input (POST body):**
```json
{ "user_id": "uuid" }
```

**Output:**
```json
{ "success": true }
{ "error": "Requisição inválida" }  // 400 — UUID inválido
{ "error": "<mensagem do Supabase>" } // 400
```

---

## 3. resend-access

**Propósito:** Reenviar email de acesso a um usuário CPF existente.

**Autenticação:** JWT Supabase com `global_role = 'admin'`.

**Input (POST body):**
```json
{ "profile_id": "uuid" }
```

**Output:**
```json
{ "ok": true }
{ "error": "unauthorized" }  // 401
{ "error": "forbidden" }     // 403 — não é admin
{ "error": "not_found" }     // 404
{ "error": "no_recovery_email" } // 400
```

---

## 4. recover-cpf-password

**Propósito:** Gerar e enviar link de recuperação de senha por CPF. Endpoint público.

**Autenticação:** Nenhuma (público). Protegido por rate limiting: máx. 5 tentativas / 15 min por CPF.

**Input (POST body):**
```json
{ "cpf": "string — 11 dígitos, formatado ou não" }
```

**Output:** Sempre `{ "ok": true }` — nunca revela se o CPF existe ou está em lockout.

**Rate limiting:** Tabela `auth_rate_limits` — chave = SHA-256(cpfDigits). Lockout de 15 min após 5 tentativas. Reset após envio bem-sucedido.

---

## 5. send-email

**Propósito:** Proxy para a API Brevo (envio de email transacional). Uso exclusivamente interno.

**Autenticação:** Header `x-internal-secret` obrigatório.

**Input (POST body):**
```json
{
  "to": "string | string[] — email(s) de destino",
  "subject": "string",
  "html": "string",
  "sender_name": "string (opcional)",
  "sender_email": "string (opcional)"
}
```

**Output:**
```json
{ "success": true, "messageId": "string" }
{ "error": "Unauthorized" }         // 401
{ "error": "Requisição inválida" }  // 400
{ "error": "rate_limit_exceeded" }  // 429 — máx. 5 emails / 60 min por destinatário
```

---

## 6. admin-notify

**Propósito:** Proxy autenticado para `send-email`. Permite que o frontend admin envie emails sem expor o `INTERNAL_SECRET` no bundle.

**Autenticação:** JWT Supabase com `global_role = 'admin'` ou `'manager'`.

**Input (POST body):**
```json
{
  "to": "string[] — emails de destino (validados com regex)",
  "subject": "string",
  "html": "string",
  "sender_name": "string (opcional)",
  "sender_email": "string (opcional)"
}
```

**Output:**
```json
{ "ok": true }
{ "error": "unauthorized" }        // 401
{ "error": "forbidden" }           // 403 — role insuficiente
{ "error": "Requisição inválida" } // 400 — campos ausentes ou inválidos
{ "error": "send_failed" }         // 502 — erro no send-email
```
