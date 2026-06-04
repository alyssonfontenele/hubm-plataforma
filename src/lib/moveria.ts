/**
 * Zero-fill exibição apenas — nunca gravar no banco.
 * "1234" → "01234", "234" → "00234", "10000" → "10000", "ABC" → "ABC"
 */
export function formatCodigoCliente(codigo: string | null | undefined): string {
  if (!codigo) return "";
  const trimmed = codigo.trim();
  if (/^\d+$/.test(trimmed) && trimmed.length < 5) {
    return trimmed.padStart(5, "0");
  }
  return trimmed;
}
