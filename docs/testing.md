# Testes Automatizados — HubM

## Pré-requisito: instalar Vitest

Vitest ainda não está no `package.json`. Execute uma vez:

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

Depois adicione ao `package.json` em `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

## Como rodar os testes localmente

```bash
# Rodar todos os testes uma vez
npx vitest run

# Modo watch (reexecuta ao salvar)
npx vitest

# Interface visual no browser
npx vitest --ui
```

## Suites de testes

### `src/lib/__tests__/cpf.test.ts` — Validação de CPF

Testa a função `isValidCpf()` de `src/lib/auth.ts`:

| Caso | Comportamento esperado |
|---|---|
| CPF válido conhecido | `true` |
| CPF com todos dígitos iguais (00...0 a 99...9) | `false` |
| CPF com dígitos verificadores errados | `false` |
| CPF com menos de 11 dígitos | `false` |
| CPF formatado com pontos e traço | Mesmo comportamento do sem formatação |

### `src/lib/__tests__/security-log.test.ts` — Log de segurança

Testa `logSecurityEvent()` de `src/lib/security-log.ts` com supabase mockado:

| Caso | Comportamento esperado |
|---|---|
| Evento válido com metadata | Insere na `admin_logs` |
| Evento sem metadata | Usa `{}` como default, não quebra |
| Falha na inserção DB | Não propaga exceção (fire-and-forget) |
| Usuário autenticado | Inclui `admin_id` no registro |
| Sem usuário autenticado | `admin_id: null` |

### `supabase/functions/__tests__/auth-rate-limit.test.ts` — Rate limiting

Testa a lógica de lockout progressivo (lógica pura, sem IO):

| Caso | Comportamento esperado |
|---|---|
| Primeira tentativa | Permite, registra 1 attempt |
| 2ª a 4ª tentativas | Permite, sem lockout |
| 5ª tentativa (limite) | Permite mas aplica lockout de 15 min |
| 6ª tentativa durante lockout | Bloqueia, não incrementa |
| Após lockout expirado | Permite novamente |

### `src/lib/__tests__/rls.test.ts` — Isolamento RLS

Dois modos:
- **Unitário** (sem banco): documenta que as policies existem e o que fazem
- **Integração** (requer banco): verifica isolamento real entre empresas

Os testes de integração são ignorados em CI (`SKIP_INTEGRATION_TESTS=true`).
Para rodar localmente, configure:
```bash
export TEST_JWT_COMPANY_A=<jwt-usuario-empresa-a>
export TEST_JWT_COMPANY_B=<jwt-usuario-empresa-b>
export SKIP_INTEGRATION_TESTS=false
npx vitest run src/lib/__tests__/rls.test.ts
```

## CI — GitHub Actions

O workflow `.github/workflows/tests.yml` roda em todo push e PR para `main`, em paralelo com o `security-audit`. Usa `SKIP_INTEGRATION_TESTS=true` para executar apenas os testes unitários.

## Como adicionar novos testes

1. Criar arquivo em `src/lib/__tests__/` ou `supabase/functions/__tests__/`
2. Importar a função a testar com caminho relativo ou alias `@/`
3. Mockar dependências externas (supabase, fetch) com `vi.mock()`
4. Usar `describe` e `it` do Vitest — sintaxe idêntica ao Jest

Exemplo mínimo:
```ts
import { describe, it, expect } from "vitest";
import { minhaFuncao } from "../minha-lib";

describe("minhaFuncao", () => {
  it("retorna true para entrada válida", () => {
    expect(minhaFuncao("entrada")).toBe(true);
  });
});
```
