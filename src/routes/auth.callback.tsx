import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ALLOWED_GOOGLE_DOMAINS } from "@/lib/auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const hash = window.location.hash.startsWith("#") ? window.location.hash.substring(1) : "";
      const hashParams = new URLSearchParams(hash);
      const type = hashParams.get("type");
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      // 1. Hash-based tokens (legacy / direct token redirects)
      if (accessToken) {
        try {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken ?? "",
          });
        } catch (e) {
          console.error("Failed to set session from callback hash", e);
          window.location.replace("/login");
          return;
        }
        window.location.replace(type === "recovery" ? "/change-password" : "/app");
        return;
      }

      // 2. Error params in search
      const search = new URLSearchParams(window.location.search);
      if (search.get("error") || search.get("error_code")) {
        toast.error("Link inválido ou expirado. Solicite um novo.");
        window.location.replace("/login");
        return;
      }

      // 3. Check existing session (Supabase already set it server-side)
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.user) {
        window.location.replace("/login");
        return;
      }

      // 4. Look up profile
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
    };

    void run();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
    </div>
  );
}
