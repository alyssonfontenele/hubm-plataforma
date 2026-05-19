import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({ meta: [{ title: "Home — HubM" }] }),
  component: HomePage,
});

function HomePage() {
  const { profile, company, sectorMemberships } = useAuth();

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-text-primary">
          Olá, {profile?.display_name ?? profile?.full_name}
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          {company?.name} · {sectorMemberships.length} setor(es) disponível(is)
        </p>
      </header>

      <section className="border border-border rounded-lg bg-surface p-6">
        <h2 className="text-sm font-medium text-text-primary mb-2">Avisos</h2>
        <p className="text-sm text-text-muted">
          Nenhum aviso por enquanto. Conteúdo real chega na Etapa 3.
        </p>
      </section>

      <section>
        <h2 className="text-sm font-medium text-text-primary mb-3">Seus setores</h2>
        {sectorMemberships.length === 0 ? (
          <p className="text-sm text-text-muted">
            Você ainda não foi adicionado a nenhum setor.
          </p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sectorMemberships.map((m) => (
              <li
                key={m.sector_id}
                className="border border-border rounded-lg bg-surface p-4"
              >
                <p className="text-sm font-medium text-text-primary">{m.sector.name}</p>
                <p className="text-xs text-text-muted mt-1 capitalize">{m.role}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
