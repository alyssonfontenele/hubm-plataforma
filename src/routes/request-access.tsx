import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_GOOGLE_DOMAINS } from "@/lib/auth";

export const Route = createFileRoute("/request-access")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Solicitar acesso — HubM" }],
  }),
  component: RequestAccessPage,
});

type CargoItem = {
  id: string;
  name: string;
  description: string | null;
};

const DOMAIN_SLUG: Record<string, string> = {
  "mowig.com.br":   "mowig",
  "hubmkt.com.br":  "mowig",
  "moveria.com.br": "mowig",
};

function RequestAccessPage() {
  const navigate = useNavigate();
  const [cargos, setCargos]               = useState<CargoItem[]>([]);
  const [selectedCargoId, setSelectedCargoId] = useState<string | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [userEmail, setUserEmail]         = useState<string | null>(null);
  const [companyId, setCompanyId]         = useState<string | null>(null);
  const [userId, setUserId]               = useState<string | null>(null);
  const [fullName, setFullName]           = useState("");
  const [ready, setReady]                 = useState(false);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user || user.app_metadata?.provider !== "google") {
        void navigate({ to: "/login" });
        return;
      }

      const domain = (user.email ?? "").split("@")[1]?.toLowerCase() ?? "";
      if (!ALLOWED_GOOGLE_DOMAINS.includes(domain)) {
        await supabase.auth.signOut();
        void navigate({ to: "/login" });
        return;
      }

      // Guard: if profile already exists, send back to login
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      if (prof) {
        void navigate({ to: "/login" });
        return;
      }

      setUserEmail(user.email ?? null);
      setUserId(user.id);
      setFullName((user.user_metadata?.full_name as string | undefined) ?? user.email ?? "");

      const slug = DOMAIN_SLUG[domain];
      let cId: string | null = null;
      if (slug) {
        const { data: co } = await supabase
          .from("companies")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        cId = co?.id ?? null;
      }
      if (!cId) {
        const { data: co } = await supabase
          .from("companies")
          .select("id")
          .limit(1)
          .maybeSingle();
        cId = co?.id ?? null;
      }
      setCompanyId(cId);

      if (cId) {
        const { data: rows } = await supabase
          .from("cargos")
          .select("id, name, description")
          .eq("company_id", cId)
          .order("name", { ascending: true });
        setCargos((rows ?? []) as CargoItem[]);
      }

      setReady(true);
    };
    void init();
  }, [navigate]);

  const handleSubmit = async () => {
    if (!userId || !companyId || !selectedCargoId) return;
    setSubmitting(true);
    try {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: userId,
        company_id: companyId,
        full_name: fullName,
        auth_type: "google",
        active: false,
        recovery_email: userEmail,
      });
      if (profileError) throw profileError;

      const { error: reqError } = await supabase
        .from("profile_sector_requests")
        .insert({ profile_id: userId, cargo_id: selectedCargoId, sector_id: null });
      if (reqError) throw reqError;

      await supabase.auth.signOut();
      toast.success("Solicitação enviada. Aguarde a aprovação do administrador.");
      void navigate({ to: "/login" });
    } catch (err) {
      const msg = err instanceof Error ? err.message :
        (err as { message?: string })?.message ?? "Erro ao enviar solicitação.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    await supabase.auth.signOut();
    void navigate({ to: "/login" });
  };

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10 bg-background">
      <div className="w-full max-w-md">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold tracking-tight text-text-primary">HubM</h1>
          <p className="mt-1 text-sm text-text-secondary">Mowig</p>
        </header>

        <div className="bg-surface border border-border rounded-lg p-6 space-y-5">
          <header className="space-y-1">
            <h2 className="text-base font-semibold text-text-primary">Solicitar acesso</h2>
            <p className="text-xs text-text-muted">
              Selecione o cargo que melhor descreve sua função. O administrador revisará sua
              solicitação.
            </p>
            {userEmail && (
              <p className="text-xs text-text-secondary pt-1">
                Conta:{" "}
                <span className="font-medium">{userEmail}</span>
              </p>
            )}
          </header>

          {cargos.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              Nenhum cargo disponível. Contate o administrador.
            </p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Cargos disponíveis</legend>
              {cargos.map((c) => (
                <label
                  key={c.id}
                  className="flex items-start gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-accent-light transition-colors"
                >
                  <input
                    type="radio"
                    name="cargo"
                    value={c.id}
                    checked={selectedCargoId === c.id}
                    onChange={() => setSelectedCargoId(c.id)}
                    className="h-4 w-4 mt-0.5 border-border accent-text-primary shrink-0"
                  />
                  <div>
                    <span className="text-sm text-text-primary font-medium">{c.name}</span>
                    {c.description && (
                      <p className="text-xs text-text-muted mt-0.5">{c.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </fieldset>
          )}

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || !selectedCargoId}
              className="w-full h-11 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90 disabled:opacity-60"
            >
              {submitting ? "Enviando…" : !selectedCargoId ? "Selecione um cargo" : "Enviar solicitação"}
            </button>
            <button
              type="button"
              onClick={() => void handleCancel()}
              className="w-full text-xs text-text-secondary hover:text-text-primary py-1"
            >
              Cancelar e voltar ao login
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
