# LGPD — Proteção de Dados Pessoais — HubM

## Dados coletados e base legal

| Dado | Finalidade | Base legal (LGPD art. 7º) |
|---|---|---|
| Nome completo | Identificação no sistema | Execução de contrato (inc. V) |
| CPF (armazenado como hash bcrypt) | Autenticação única por colaborador | Execução de contrato (inc. V) |
| E-mail de recuperação | Recuperação de senha | Execução de contrato (inc. V) |
| Celular | Contato opcional | Execução de contrato (inc. V) |
| Foto de perfil | Personalização da conta | Consentimento (inc. I) |
| Logs de acesso (admin_logs, audit_log) | Segurança e auditoria | Legítimo interesse (inc. IX) |
| Último acesso (last_login_at) | Gestão de usuários inativos | Legítimo interesse (inc. IX) |

**Dado sensível:** o CPF não é armazenado em texto plano — apenas o hash bcrypt é salvo. Não é possível recuperar o CPF original a partir do banco de dados.

---

## Como o titular exerce seus direitos

### Via sistema (imediato)

Acesse o perfil → seção **"Meus dados"** → utilize os botões:

| Direito (LGPD art. 18) | Ação disponível |
|---|---|
| Acesso (inc. II) | "Exportar meus dados" — download JSON |
| Correção (inc. III) | "Solicitar correção" — nome e e-mail |
| Exclusão (inc. VI) | "Solicitar exclusão" — anonimização imediata |

### Via e-mail (casos complexos)

Envie e-mail para **alysson@mowig.com.br** com o assunto `[LGPD] <tipo de solicitação>`.

Prazo de resposta: **imediato via sistema** ou **até 15 dias** para casos que exijam análise manual (art. 19, §1º).

---

## O que acontece na exclusão

A exclusão por LGPD aplica **anonimização** (não exclusão física), conforme permitido pela lei:

1. Nome substituído por "Usuário removido"
2. E-mail de recuperação substituído por UUID aleatório
3. Hash do CPF substituído por hash de bytes aleatórios (irreversível)
4. Celular removido
5. Acesso revogado imediatamente (`deactivated_at = now()`)
6. Evento registrado em `audit_log` com `reason: lgpd_delete_request`

Logs de auditoria (`admin_logs`, `audit_log`) são mantidos por obrigação legal (controle interno e segurança) com os dados já anonimizados — o `actor_id` permanece mas o nome associado foi removido do perfil.

---

## Responsável pelo tratamento

**Controlador:** Mowig Tecnologia  
**Encarregado (DPO):** Alysson Fontenele — alysson@mowig.com.br  

---

## Notificação à ANPD em caso de incidente

Conforme LGPD art. 48, incidentes que possam acarretar risco ou dano relevante aos titulares devem ser comunicados à ANPD e aos titulares afetados em prazo razoável.

**Procedimento:**

1. Identificar o incidente e o escopo (quais dados, quantos titulares)
2. Acionar alysson@mowig.com.br imediatamente
3. Registrar o incidente em `admin_logs` com `event_type = 'security_incident'`
4. Avaliar obrigatoriedade de notificação (critério: risco relevante)
5. Se aplicável, notificar a ANPD via https://www.gov.br/anpd/
6. Notificar os titulares afetados por e-mail em até 72 horas

**Referência:** ver `docs/disaster-recovery.md` para procedimentos operacionais de resposta a incidentes.

---

## Retenção e eliminação de dados

| Categoria | Retenção | Eliminação |
|---|---|---|
| Perfis de usuários ativos | Enquanto durar o contrato | Anonimização via sistema ou solicitação |
| Logs de auditoria | 5 anos (obrigação legal) | Revisão manual anual |
| Backups Supabase | 7 dias (plano Pro) | Automática pelo Supabase |
