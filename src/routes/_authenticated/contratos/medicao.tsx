import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// Rota legada — medição agora acontece dentro do workspace (/contratos)
export const Route = createFileRoute("/_authenticated/contratos/medicao")({
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
