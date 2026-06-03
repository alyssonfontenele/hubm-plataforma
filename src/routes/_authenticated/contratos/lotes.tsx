import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// Rota legada — Kanban agora vive no workspace /contratos
export const Route = createFileRoute("/_authenticated/contratos/lotes")({
  ssr: false,
  component: RedirectToWorkspace,
});

function RedirectToWorkspace() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/contratos", replace: true });
  }, [navigate]);
  return null;
}
