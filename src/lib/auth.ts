import { supabase, getAuthClient } from "@/integrations/supabase/client";

export async function isGoogleDomainAllowed(domain: string): Promise<boolean> {
  const slug = import.meta.env.VITE_COMPANY_SLUG as string | undefined;
  if (!slug) return false;
  const { data } = await supabase
    .from("companies")
    .select("allowed_domains")
    .eq("slug", slug)
    .maybeSingle();
  const allowed: string[] = data?.allowed_domains ?? [];
  if (allowed.includes("*")) return true;
  return allowed.map((d: string) => d.toLowerCase()).includes(domain.toLowerCase());
}

export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export async function signInWithGoogle(redirectTo: string) {
  const { error } = await getAuthClient().auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      scopes: `openid email profile ${GOOGLE_CALENDAR_SCOPE}`,
      queryParams: {
        prompt: "select_account",
        access_type: "offline",
      },
    },
  });
  if (error) throw error;
}

// ---------- CPF ----------

const INVALID_CPF_SEQUENCES = new Set([
  "00000000000",
  "11111111111",
  "22222222222",
  "33333333333",
  "44444444444",
  "55555555555",
  "66666666666",
  "77777777777",
  "88888888888",
  "99999999999",
]);

export function cpfToDigits(cpf: string): string {
  return cpf.replace(/\D/g, "");
}

export function maskCpf(value: string): string {
  const d = cpfToDigits(value).slice(0, 11);
  const parts = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9), d.slice(9, 11)];
  let out = parts[0];
  if (parts[1]) out += "." + parts[1];
  if (parts[2]) out += "." + parts[2];
  if (parts[3]) out += "-" + parts[3];
  return out;
}

export function isValidCpf(cpf: string): boolean {
  const d = cpfToDigits(cpf);
  if (d.length !== 11) return false;
  if (INVALID_CPF_SEQUENCES.has(d)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i], 10) * (10 - i);
  let rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(d[9], 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i], 10) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10) rest = 0;
  if (rest !== parseInt(d[10], 10)) return false;

  return true;
}
export const validateCPF = isValidCpf;

export function cpfToEmail(cpf: string): string {
  return `${cpfToDigits(cpf)}@hubm.internal`;
}

// ---------- Cellphone (BR) ----------

export function cellphoneToDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function maskCellphone(value: string): string {
  const d = cellphoneToDigits(value).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function isValidCellphone(value: string): boolean {
  const d = cellphoneToDigits(value);
  if (d.length !== 11) return false;
  const ddd = parseInt(d.slice(0, 2), 10);
  if (ddd < 11 || ddd > 99) return false;
  if (d[2] !== "9") return false;
  return true;
}

// ---------- Auth flows ----------

export async function signInWithCpf(cpf: string, password: string) {
  const email = cpfToEmail(cpf);
  const isSuperadmin = import.meta.env.VITE_IS_SUPERADMIN === 'true';
  const coreUrl = import.meta.env.VITE_SUPABASE_CORE_URL as string | undefined;
  console.log('[auth:signInWithCpf]', {
    email,
    isSuperadmin,
    coreUrl: coreUrl ?? '(não definida)',
    usingCore: isSuperadmin && !!coreUrl,
  });
  const { error } = await getAuthClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function recoverPasswordByCpf(cpf: string, redirectTo: string) {
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

  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(data.recovery_email, {
    redirectTo,
  });
  if (resetErr) throw resetErr;
  return data.recovery_email;
}
