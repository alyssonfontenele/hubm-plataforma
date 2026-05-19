import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_authenticated/sectors/$slug")({
  head: () => ({ meta: [{ title: "Setor — HubM" }] }),
  component: SectorPage,
});

function SectorPage() {
  const { slug } = Route.useParams();
  const { sectorMemberships } = useAuth();
  const membership = sectorMemberships.find((m) => m.sector.slug === slug);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-4">
      <header>
        <p className="text-xs uppercase tracking-wider text-text-muted">Setor</p>
        <h1 className="text-2xl font-bold text-text-primary">
          {membership?.sector.name ?? slug}
        </h1>
      </header>

      <div className="border border-border rounded-lg bg-surface p-6">
        <p className="text-sm text-text-muted">
          Pastas e recursos chegam na Etapa 4.
        </p>
      </div>
    </div>
  );
}
