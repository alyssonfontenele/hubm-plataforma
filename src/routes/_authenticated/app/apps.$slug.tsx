import { createFileRoute } from "@tanstack/react-router";
import { useApps } from "@/hooks/useApps";
import { useFocusMode } from "@/hooks/useFocusMode";
import { AppIframe } from "@/components/app-iframe";

export const Route = createFileRoute("/_authenticated/app/apps/$slug")({
  ssr: false,
  head: () => ({ meta: [{ title: "App — HubM" }] }),
  component: AppEmbed,
});

const TOPBAR_HEIGHT = "56px";

function AppEmbed() {
  const { slug } = Route.useParams();
  const { data: apps, isLoading } = useApps();
  const { focus } = useFocusMode();

  const app = apps?.find((a) => a.slug === slug) ?? null;
  const height = focus ? "100vh" : `calc(100vh - ${TOPBAR_HEIGHT})`;

  if (!isLoading && !app) {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <p className="text-sm text-text-muted">App não encontrado.</p>
      </div>
    );
  }

  return <AppIframe src={app?.url ?? null} title={app?.name ?? "App"} />;
}
