import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    void navigate({ to: session ? "/app" : "/login" });
  }, [loading, session, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="h-3 w-24 bg-accent-light rounded animate-pulse" />
    </div>
  );
}
