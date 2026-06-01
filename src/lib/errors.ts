export type HubMErrorKind =
  | 'network'       // falha de rede, timeout
  | 'unauthorized'  // sessão expirada, sem permissão
  | 'not_found'     // recurso não existe
  | 'conflict'      // CPF já cadastrado, nome duplicado
  | 'validation'    // input inválido
  | 'rate_limit'    // lockout, muitas tentativas
  | 'unknown'       // fallback

export type HubMError = {
  kind: HubMErrorKind
  message: string      // mensagem técnica (para log)
  userMessage: string  // mensagem para exibir ao usuário
  raw?: unknown        // erro original
}

const USER_MESSAGES: Record<HubMErrorKind, string> = {
  network:      'Sem conexão com o servidor. Verifique sua internet e tente novamente.',
  unauthorized: 'Sua sessão expirou. Faça login novamente.',
  not_found:    'O recurso solicitado não foi encontrado.',
  conflict:     'Este registro já existe. Verifique os dados e tente novamente.',
  validation:   'Os dados informados são inválidos. Corrija e tente novamente.',
  rate_limit:   'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',
  unknown:      'Ocorreu um erro. Tente novamente ou contate o suporte.',
}

function extractStatus(raw: unknown): number | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r['status'] === 'number') return r['status']
  if (typeof r['statusCode'] === 'number') return r['statusCode']
  return undefined
}

function extractCode(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  if (typeof r['code'] === 'string') return r['code']
  return undefined
}

function extractMessage(raw: unknown): string {
  if (raw == null) return 'Unknown error'
  if (typeof raw === 'string') return raw
  if (raw instanceof Error) return raw.message
  if (typeof raw === 'object') {
    const r = raw as Record<string, unknown>
    if (typeof r['message'] === 'string') return r['message']
    if (typeof r['error_description'] === 'string') return r['error_description']
  }
  return String(raw)
}

export function classifyError(raw: unknown): HubMError {
  const message = extractMessage(raw)
  const status = extractStatus(raw)
  const code = extractCode(raw)

  // Erros de rede: TypeError de fetch ou mensagens típicas de conectividade
  if (
    raw instanceof TypeError ||
    /failed to fetch|network request failed|load failed|networkerror/i.test(message)
  ) {
    return { kind: 'network', message, userMessage: USER_MESSAGES.network, raw }
  }

  // Erros por status HTTP
  if (status === 401) {
    return { kind: 'unauthorized', message, userMessage: USER_MESSAGES.unauthorized, raw }
  }
  if (status === 403) {
    return { kind: 'unauthorized', message, userMessage: 'Você não tem permissão para realizar esta ação.', raw }
  }
  if (status === 404) {
    return { kind: 'not_found', message, userMessage: USER_MESSAGES.not_found, raw }
  }
  if (status === 409) {
    return { kind: 'conflict', message, userMessage: USER_MESSAGES.conflict, raw }
  }
  if (status === 422) {
    return { kind: 'validation', message, userMessage: USER_MESSAGES.validation, raw }
  }
  if (status === 429) {
    return { kind: 'rate_limit', message, userMessage: USER_MESSAGES.rate_limit, raw }
  }

  // Códigos PostgREST (PGRST*)
  if (typeof code === 'string' && code.startsWith('PGRST')) {
    // PGRST301 = JWT expired, PGRST302 = JWT invalid
    if (code === 'PGRST301' || code === 'PGRST302') {
      return { kind: 'unauthorized', message, userMessage: USER_MESSAGES.unauthorized, raw }
    }
    // PGRST204 = recurso não encontrado via PostgREST
    if (code === 'PGRST204' || code === 'PGRST116') {
      return { kind: 'not_found', message, userMessage: USER_MESSAGES.not_found, raw }
    }
    return { kind: 'unknown', message, userMessage: USER_MESSAGES.unknown, raw }
  }

  // Códigos de erro do Postgres direto (23505 = unique violation, 23514 = check violation)
  if (code === '23505') {
    return { kind: 'conflict', message, userMessage: USER_MESSAGES.conflict, raw }
  }
  if (code === '23514' || code === '23503') {
    return { kind: 'validation', message, userMessage: USER_MESSAGES.validation, raw }
  }

  // Mensagens de erro conhecidas do Supabase Auth
  if (/email.*already.*registered|user.*already.*exists/i.test(message)) {
    return { kind: 'conflict', message, userMessage: 'Este e-mail já está cadastrado.', raw }
  }
  if (/invalid.*password|incorrect.*password|invalid login/i.test(message)) {
    return { kind: 'validation', message, userMessage: 'CPF ou senha incorretos.', raw }
  }
  if (/email.*not.*confirmed/i.test(message)) {
    return { kind: 'unauthorized', message, userMessage: 'Confirme seu e-mail antes de continuar.', raw }
  }
  if (/rate.*limit|too many requests|email.*rate.*limit/i.test(message)) {
    return { kind: 'rate_limit', message, userMessage: USER_MESSAGES.rate_limit, raw }
  }
  if (/jwt.*expired|token.*expired|session.*expired/i.test(message)) {
    return { kind: 'unauthorized', message, userMessage: USER_MESSAGES.unauthorized, raw }
  }

  return { kind: 'unknown', message, userMessage: USER_MESSAGES.unknown, raw }
}

// Exemplo de uso em componente:
// import { classifyError } from '@/lib/errors'
// import { ok, err } from '@/lib/result'
// import type { Result } from '@/lib/result'
//
// async function createUser(data: FormData): Promise<Result<User, HubMError>> {
//   try {
//     const { data: user, error } = await supabase.from('profiles').insert(data).select().single()
//     if (error) return err(classifyError(error))
//     return ok(user)
//   } catch (e) {
//     return err(classifyError(e))
//   }
// }
//
// // No componente:
// const result = await createUser(data)
// if (!result.ok) {
//   if (result.error.kind === 'conflict') toast.error(result.error.userMessage)
//   else if (result.error.kind === 'unauthorized') navigate('/login')
//   else toast.error(result.error.userMessage)
//   return
// }
// // aqui result.value está tipado e seguro
