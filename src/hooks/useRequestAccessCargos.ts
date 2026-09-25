import { supabase } from "@/integrations/supabase/client";

export type RequestAccessCargo = {
  id: string;
  name: string;
  description: string | null;
};

/**
 * Cargos disponíveis para o fluxo de solicitação de acesso (/request-access).
 * Usa a RPC list_cargos_for_request_access, que resolve a empresa pelo domínio
 * do e-mail autenticado — funciona mesmo sem linha em profiles (primeiro acesso).
 */
export async function fetchRequestAccessCargos(): Promise<RequestAccessCargo[]> {
  const { data, error } = await supabase.rpc("list_cargos_for_request_access");
  if (error) throw error;
  return (data as RequestAccessCargo[] | null) ?? [];
}
