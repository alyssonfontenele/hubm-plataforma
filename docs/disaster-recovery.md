# Disaster Recovery — HubM

## Inventário de backups

### Banco de dados (Supabase)

| Tipo | Frequência | Retenção | Onde acessar |
|---|---|---|---|
| Backup automático (Point-in-Time Recovery) | Contínuo (WAL) | 7 dias (plano Pro) | Dashboard → Settings → Backups |
| Snapshot diário | Diário às 00:00 UTC | 7 dias | Dashboard → Settings → Backups |

**Importante:** o plano Free não inclui backups automáticos — considerar upgrade para Pro para projetos de produção.

### Código-fonte (Edge Functions + Frontend)

- **Todo o código está no repositório git** (`github.com/alyssonfontenele/hubm-plataforma`)
- Edge Functions: `supabase/functions/` — versionadas e deployadas via MCP ou CLI
- Migrations: `supabase/migrations/` — histórico completo e ordenado por timestamp

### Secrets e variáveis de ambiente

- **Secrets das Edge Functions:** armazenados apenas nos painéis Supabase de cada projeto. Não estão no git.
- **Variáveis Vercel:** armazenadas apenas no painel Vercel. Não estão no git.
- **Ação necessária:** manter uma cópia dos valores em um cofre seguro (ex: 1Password, Bitwarden) com acesso restrito.

---

## Procedimento de restore — banco de dados

### Via painel Supabase

1. Acesse https://supabase.com/dashboard → selecione o projeto a restaurar
2. Vá em **Settings → Backups**
3. Localize o snapshot desejado na lista (por data/hora)
4. Clique em **Restore** ao lado do snapshot
5. Confirme o restore — o banco ficará indisponível por alguns minutos durante o processo
6. Após o restore, verifique as tabelas principais via **Table Editor**
7. Execute qualquer migration pendente se necessário:
   ```bash
   export SUPABASE_ACCESS_TOKEN=<token>
   bash scripts/deploy-migrations.sh <project-ref>
   ```

**Tempo estimado:** 5–15 minutos dependendo do tamanho do banco.

---

## Procedimento de restore — Edge Functions

Se as funções forem perdidas ou corrompidas, recrie a partir do git:

1. Certifique-se que o código está atualizado no repositório:
   ```bash
   git pull origin main
   ```
2. Deploy de cada função via CLI Supabase:
   ```bash
   export SUPABASE_ACCESS_TOKEN=<token>
   npx supabase functions deploy <nome-da-funcao> --project-ref <ref>
   ```
3. Recrie os secrets (ver lista em `SECURITY.md`):
   ```bash
   npx supabase secrets set INTERNAL_SECRET=<valor> --project-ref <ref>
   npx supabase secrets set ALLOWED_ORIGINS=<url> --project-ref <ref>
   # ... demais secrets
   ```

**Tempo estimado:** 10–20 minutos para todas as 6 funções + secrets.

---

## Procedimento de restore — Vercel

Se o projeto Vercel for perdido:

1. Acesse https://vercel.com → **Add New Project** → importar do GitHub
2. Selecione o repositório `hubm-plataforma`
3. Configure o **Framework Preset** como Vite
4. Configure as variáveis de ambiente (ver `SECURITY.md` para a lista):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_COMPANY_SLUG`
5. Faça o deploy. O Vercel usará o código do branch `main` automaticamente.

**Tempo estimado:** 5–10 minutos.

---

## Tempo total estimado de DR completo

| Componente | Tempo |
|---|---|
| Restore do banco Supabase | 5–15 min |
| Recriação de secrets | 10 min |
| Deploy das Edge Functions | 10 min |
| Recriação do projeto Vercel | 5–10 min |
| Verificação e smoke tests | 10 min |
| **Total** | **~45 minutos** |

---

## Checklist de DR trimestral

Execute a cada 3 meses para garantir que o processo funciona:

- [ ] Confirmar que backup automático Supabase está ativo (Settings → Backups de cada projeto)
- [ ] Executar restore de teste no projeto staging:
  ```bash
  bash scripts/deploy-migrations.sh <staging-project-ref>
  ```
- [ ] Verificar que todos os secrets estão documentados no cofre (1Password/Bitwarden)
- [ ] Testar rollback de deploy no Vercel: **Deployments → selecionar deploy anterior → Promote to Production**
- [ ] Verificar que o repositório git tem acesso funcional (clone em máquina limpa)
- [ ] Registrar data e resultado abaixo

### Histórico de execuções

| Data | Executado por | Resultado | Observações |
|---|---|---|---|
| — | — | — | Primeira execução pendente |

---

## Contato de emergência

**Responsável:** Alysson Fontenele — alysson@mowig.com.br  
Em caso de incidente crítico fora do horário comercial, acione diretamente via WhatsApp.
