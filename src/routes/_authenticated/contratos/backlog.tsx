import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contratos/backlog")({
  ssr: false,
  component: BacklogPage,
});

function BacklogPage() {
  return (
    <div className="rounded-md border border-border bg-surface px-6 py-8 text-center text-sm text-text-muted">
      Meu Backlog — em breve.
    </div>
  );
}
