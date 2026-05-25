import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_GOOGLE_DOMAINS } from "@/lib/auth";
import type { Session } from "@supabase/supabase-js";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  component: AuthCallbackPage,
});

async function handleSession(session: Session) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", session.user.id)
    .maybeSingle();

  // New Google user with no profile → send to request-access
  if (!profile) {
    const isGoogle = session.user.app_metadata?.provider === "google";
    const domain = (session.user.email ?? "").split("@")[1]?.toLowerCase() ?? "";
    if (isGoogle && ALLOWED_GOOGLE_DOMAINS.includes(domain)) {
      window.location.replace("/request-access");
      return;
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

    // 3. PKCE flow: wait for Supabase to exchange the code and emit SIGNED_IN.
    //    getSession() called too early returns null while the SDK is still
    //    exchanging the ?code= param — use onAuthStateChange instead.
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        window.location.replace("/login");
      }
    }, 10_000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (settled) return;
      if (event === "SIGNED_IN" && session) {
        settled = true;
        clearTimeout(timeout);
        subscription.unsubscribe();
        void handleSession(session);
      } else if (event === "SIGNED_OUT" || (event === "INITIAL_SESSION" && !session)) {
        // No session arrived — check once more synchronously then give up
        supabase.auth.getSession().then(({ data }) => {
          if (data.session && !settled) {
            settled = true;
            clearTimeout(timeout);
            subscription.unsubscribe();
            void handleSession(data.session);
          }
        });
      }
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
