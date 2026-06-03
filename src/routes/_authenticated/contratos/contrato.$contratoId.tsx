import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

// Rota legada — redireciona para o workspace master-detail via search param
export const Route = createFileRoute("/_authenticated/contratos/contrato/$contratoId")({
  ssr: false,
  component: RedirectToWorkspace,
});

function RedirectToWorkspace() {
  const { contratoId } = Route.useParams();
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/contratos", search: { id: contratoId }, replace: true });
  }, [contratoId, navigate]);
  return null;
}
