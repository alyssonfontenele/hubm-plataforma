import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isGoogleDomainAllowed } from "@/lib/auth";
import type { Session } from "@supabase/supabase-js";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

async function handleSession(session: Session) {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", session.user.id)
    .maybeSingle();

  if (profileError) {
    console.error("[auth.callback] falha ao consultar profile", profileError);
    toast.error("Falha ao carregar seu perfil. Tente novamente.");
    window.location.replace("/login");
    return;
  }

  // New Google user with no profile → send to request-access
  if (!profile) {
    const isGoogle = session.user.app_metadata?.provider === "google";
    const domain = (session.user.email ?? "").split("@")[1]?.toLowerCase() ?? "";
    if (isGoogle && await isGoogleDomainAllowed(domain)) {
      window.location.replace("/request-access");
      return;
    }
    if (isGoogle) {
      toast.error("Seu domínio de e-mail não tem acesso autorizado.");
    }
    window.location.replace("/login");
    return;
  }

  if (profile.must_change_password) {
    window.location.replace("/change-password");
  } else {
    window.location.replace("/app");
  }
}

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // 1. Hash-based tokens (legacy / password-recovery flow)
    const hash = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "";
    const hashParams = new URLSearchParams(hash);
    const type = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    if (accessToken) {
      supabase.auth
        .setSession({ access_token: accessToken, refresh_token: refreshToken ?? "" })
        .then(({ error }) => {
          if (error) {
            console.error("Failed to set session from callback hash", error);
            window.location.replace("/login");
          } else {
            window.location.replace(type === "recovery" ? "/change-password" : "/app");
          }
        });
      return;
    }

    // 2. Error params in URL search
    const search = new URLSearchParams(window.location.search);
    if (search.get("error") || search.get("error_code")) {
      toast.error("Link inválido ou expirado. Solicite um novo.");
      window.location.replace("/login");
      return;
    }

    // 3. PKCE flow: aguarda o Supabase trocar o ?code= pela sessão.
    //    `detectSessionInUrl` roda na inicialização do client (module load),
    //    ou seja, ANTES deste efeito montar e assinar onAuthStateChange — a
    //    troca pode terminar antes da assinatura, e o listener só recebe
    //    INITIAL_SESSION (com sessão já presente), nunca SIGNED_IN. O código
    //    antigo só tratava SIGNED_IN, então esse caso ficava 10s parado e
    //    caía no /login sem nenhum profile criado nem mensagem de erro.
    let settled = false;

    const finish = (session: Session) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
      void handleSession(session);
    };

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        subscription.unsubscribe();
        toast.error("Não foi possível concluir o login. Tente novamente.");
        window.location.replace("/login");
      }
    }, 10_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled) return;
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        finish(session);
      }
    });

    // Checagem imediata: cobre o caso da sessão já ter sido estabelecida por
    // detectSessionInUrl antes mesmo do listener acima ser assinado.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !settled) finish(data.session);
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
    </div>
  );
}
