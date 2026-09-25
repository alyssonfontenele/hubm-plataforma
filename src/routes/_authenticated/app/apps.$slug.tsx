import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useApps } from "@/hooks/useApps";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/app/apps/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "App — HubM" }] }),
  component: AppEmbed,
});

const TOPBAR_HEIGHT = "56px";

function AppEmbed() {
  const { slug } = Route.useParams();
  const { data: apps, isLoading } = useApps();
  const [loaded, setLoaded] = useState(false);

  const app = apps?.find((a) => a.slug === slug) ?? null;

  if (!isLoading && !app) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ height: `calc(100vh - ${TOPBAR_HEIGHT})` }}
      >
        <p className="text-sm text-text-muted">App não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="relative" style={{ height: `calc(100vh - ${TOPBAR_HEIGHT})` }}>
      {!loaded && (
        <div className="absolute inset-0 p-4">
          <Skeleton className="h-full w-full" />
        </div>
      )}
      {app && (
        <iframe
          src={app.url}
          title={app.name}
          onLoad={() => setLoaded(true)}
          allow="clipboard-read; clipboard-write"
          style={{
            height: `calc(100vh - ${TOPBAR_HEIGHT})`,
            width: "100%",
            border: 0,
            display: "block",
            visibility: loaded ? "visible" : "hidden",
          }}
        />
      )}
    </div>
  );
}
