import { supabase } from "@/integrations/supabase/client";

const ALLOWED_GOOGLE_DOMAIN = "mowig.com.br";

export async function signInWithGoogle(redirectTo: string) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        hd: ALLOWED_GOOGLE_DOMAIN,
        prompt: "select_account",
      },
    },
  });
  if (error) throw error;
}

/** Pure digits, e.g. "12345678901" */
export function cpfToDigits(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

/** "000.000.000-00" */
export function maskCpf(value: string): string {
  const d = cpfToDigits(value).slice(0, 11);
  const parts = [
    d.slice(0, 3),
    d.slice(3, 6),
    d.slice(6, 9),
    d.slice(9, 11),
  ];
  let out = parts[0];
  if (parts[1]) out += "." + parts[1];
  if (parts[2]) out += "." + parts[2];
  if (parts[3]) out += "-" + parts[3];
  return out;
}

export function isValidCpf(cpf: string): boolean {
  const d = cpfToDigits(cpf);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  return true;
}

export function cpfToEmail(cpf: string): string {
  return `${cpfToDigits(cpf)}@hubm.internal`;
}

export async function signInWithCpf(cpf: string, password: string) {
  const email = cpfToEmail(cpf);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function recoverPasswordByCpf(cpf: string, redirectTo: string) {
  // Look up recovery email by cpf_hash so we send the reset to the user's real inbox.
  // We store the digits-only CPF directly in cpf_hash for the lookup; if the project
  // uses a different hashing scheme this should be adapted in one place.
  const cpfDigits = cpfToDigits(cpf);
  const { data, error } = await supabase
    .from("profiles")
    .select("recovery_email")
    .eq("cpf_hash", cpfDigits)
    .maybeSingle();

  if (error) throw error;
  if (!data?.recovery_email) {
    throw new Error("Nenhum e-mail de recuperação cadastrado para este CPF.");
  }

  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
    data.recovery_email,
    { redirectTo },
  );
  if (resetErr) throw resetErr;
  return data.recovery_email;
}
