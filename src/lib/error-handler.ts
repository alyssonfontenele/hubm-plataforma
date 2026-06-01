import { toast } from 'sonner'
import type { HubMError } from './errors'

export function handleError(
  error: HubMError,
  opts?: {
    onUnauthorized?: () => void  // ex: navigate('/login')
    onConflict?: () => void      // ex: focar campo CPF
    silent?: boolean             // não exibir toast (componente trata visualmente)
  }
): void {
  console.error(`[HubM] ${error.kind}:`, error.message, error.raw)

  // unauthorized com callback: executa o callback e suprime o toast
  if (error.kind === 'unauthorized' && opts?.onUnauthorized) {
    opts.onUnauthorized()
    return
  }

  if (opts?.silent) return

  toast.error(error.userMessage)

  // conflict: mostra toast E chama callback (ex: focar campo com erro)
  if (error.kind === 'conflict') {
    opts?.onConflict?.()
  }
}
