# Monitoramento de Uptime — HubM

## 1. UptimeRobot — configuração

UptimeRobot (https://uptimerobot.com) oferece plano gratuito com até 50 monitores e verificação a cada 5 minutos.

### Monitores a configurar

| Monitor | URL | Tipo |
|---|---|---|
| HubM Mowig | `https://hubm.mowig.ind.br` | HTTP(s) |
| Moveria | `https://moveria.app.br` | HTTP(s) |
| Admin / SuperAdmin | `https://admin.mowig.ind.br` | HTTP(s) |

### Configuração de cada monitor

1. Faça login em https://uptimerobot.com
2. Clique em **Add New Monitor**
3. **Monitor Type:** HTTP(s)
4. **Friendly Name:** ex. `HubM Mowig`
5. **URL:** endereço conforme tabela acima
6. **Monitoring Interval:** 5 minutes
7. **Alert Contacts:** adicionar email `alysson@mowig.com.br`
8. Clique em **Create Monitor**

### Alertas de email

Em **My Settings → Alert Contacts**, crie um contato:
- **Type:** E-mail
- **Email:** alysson@mowig.com.br
- Vincule o contato a todos os monitores criados

### Interpretando relatórios

- **Uptime %:** percentual do período em que o serviço respondeu com HTTP 2xx/3xx. Meta: ≥ 99,5%.
- **Response time:** tempo médio de resposta em ms. Valores acima de 2000ms indicam lentidão.
- **Downtime events:** cada evento lista início, fim e duração. Use para correlacionar com deploys ou incidentes.

O painel público de status pode ser compartilhado via **Status Pages** no UptimeRobot.

---

## 2. Alertas de Edge Functions no Supabase

Para monitorar erros (HTTP 500) nas Edge Functions:

1. Acesse o painel Supabase do projeto da empresa
2. Vá em **Edge Functions** → selecione a função (ex: `recover-cpf-password`)
3. Clique em **Logs** — filtre por `status:500`
4. No menu **Alerts** (se disponível no seu plano), configure:
   - Condição: `status_code >= 500`
   - Destino: email `alysson@mowig.com.br`

Para planos gratuitos, inspecione os logs manualmente a cada semana ou configure um cron externo que chame as funções e verifique o status HTTP.

### Logs de segurança via admin_logs

A tabela `admin_logs` registra eventos de segurança automaticamente:

```sql
SELECT event_type, metadata, created_at
FROM admin_logs
WHERE event_type IS NOT NULL
ORDER BY created_at DESC
LIMIT 50;
```

Eventos críticos a monitorar:

| event_type | Significado | Ação |
|---|---|---|
| `lockout_triggered` | 5+ tentativas de recuperação de senha por CPF | Verificar se é ataque de força bruta |
| `login_failure` | Falha de login | Normal em volume baixo; investigar picos |
| `user_deleted` | Exclusão de usuário | Confirmar que foi ação legítima de admin |

---

## 3. Rotina de verificação semanal

Todo início de semana:

1. Verificar relatório UptimeRobot dos últimos 7 dias
2. Verificar logs de `lockout_triggered` na `admin_logs` de cada projeto
3. Verificar o CI (GitHub Actions) — aba **Security** → Dependabot alerts
4. Rodar `npm audit` localmente e resolver vulnerabilidades `high`/`critical`
