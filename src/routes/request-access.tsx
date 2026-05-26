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

type SectorItem = {
  id: string;
  name: string;
  icon: string | null;
  group_name: string | null;
};

const DOMAIN_SLUG: Record<string, string> = {
  "mowig.com.br": "mowig",
  "hubmkt.com.br": "mowig",
  "moveria.com.br": "mowig",
};

function RequestAccessPage() {
  const navigate = useNavigate();
  const [sectors, setSectors] = useState<SectorItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [ready, setReady] = useState(false);

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

      // Guard: if profile already exists, send back to login for proper handling
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
          .from("sectors")
          .select("id, name, icon, group_name")
          .eq("company_id", cId)
          .eq("active", true)
          .order("name", { ascending: true });
        setSectors((rows ?? []) as SectorItem[]);
      }

      setReady(true);
    };
    void init();
  }, [navigate]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleSubmit = async () => {
    if (!userId || !companyId || selected.size === 0) return;
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

      const { error: reqError } = await supabase.from("profile_sector_requests").insert(
        Array.from(selected).map((sid) => ({ profile_id: userId, sector_id: sid }))
      );
      if (reqError) throw reqError;

      await supabase.auth.signOut();
      toast.success("Solicitação enviada. Aguarde a aprovação do administrador.");
      void navigate({ to: "/login" });
    } catch {
      toast.error("Erro ao enviar solicitação. Tente novamente.");
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

  // Group sectors by group_name
  const grouped = sectors.reduce<Record<string, SectorItem[]>>((acc, s) => {
    const key = s.group_name ?? "";
    (acc[key] ??= []).push(s);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped).sort((a, b) =>
    a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)
  );

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
              Selecione os setores que você precisa acessar. O administrador revisará sua
              solicitação.
            </p>
            {userEmail && (
              <p className="text-xs text-text-secondary pt-1">
                Conta:{" "}
                <span className="font-medium">{userEmail}</span>
              </p>
            )}
          </header>

          {sectors.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              Nenhum setor disponível no momento.
            </p>
          ) : (
            <fieldset className="space-y-4">
              <legend className="sr-only">Setores disponíveis</legend>
              {groupKeys.map((groupKey) => (
                <div key={groupKey} className="space-y-1.5">
                  {groupKey !== "" && (
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-muted px-1">
                      {groupKey}
                    </p>
                  )}
                  {grouped[groupKey].map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-accent-light transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggle(s.id)}
                        className="h-4 w-4 rounded border-border accent-text-primary shrink-0"
                      />
                      {s.icon && (
                        <span className="text-base leading-none shrink-0">{s.icon}</span>
                      )}
                      <span className="text-sm text-text-primary">{s.name}</span>
                    </label>
                  ))}
                </div>
              ))}
            </fieldset>
          )}

          <div className="space-y-2 pt-1">
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting || selected.size === 0}
              className="w-full h-11 rounded-md bg-text-primary text-background text-sm font-medium hover:bg-text-primary/90 disabled:opacity-60"
            >
              {submitting
                ? "Enviando…"
                : selected.size === 0
                  ? "Selecione ao menos um setor"
                  : `Enviar solicitação (${selected.size} setor${selected.size > 1 ? "es" : ""})`}
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
