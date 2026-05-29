import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/contratos/lotes")({
  ssr: false,
  component: LotesPage,
});

function LotesPage() {
  return (
    <div className="rounded-md border border-border bg-surface px-6 py-8 text-center text-sm text-text-muted">
      Lotes — em breve.
    </div>
  );
}
