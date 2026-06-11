import { useEffect } from "react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { LoaderCircle } from "lucide-react";
import { useTarefasFeature } from "@/hooks/useCompanyFeatures";

export const Route = createFileRoute("/_authenticated/tarefas")({
  ssr: false,
  component: TarefasLayout,
});

function TarefasLayout() {
  const navigate = useNavigate();
  const { hasAccess, isLoading } = useTarefasFeature();

  useEffect(() => {
    if (!isLoading && !hasAccess) {
      void navigate({ to: "/app" });
    }
  }, [isLoading, hasAccess, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <LoaderCircle className="w-5 h-5 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!hasAccess) return null;

  return <Outlet />;
}
