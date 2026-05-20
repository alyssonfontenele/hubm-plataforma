import { useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackPage,
});

function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : "";
    const params = new URLSearchParams(hash);

    const type = params.get("type");
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");

    if (!accessToken) {
      window.location.replace("/login");
      return;
    }

    const handleAuth = async () => {
      try {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken ?? "",
        });
      } catch (e) {
        console.error("Failed to set session from callback", e);
        window.location.replace("/login");
        return;
      }

      if (type === "recovery") {
        window.location.replace("/change-password");
      } else {
        window.location.replace("/app");
      }
    };

    void handleAuth();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
    </div>
  );
}
