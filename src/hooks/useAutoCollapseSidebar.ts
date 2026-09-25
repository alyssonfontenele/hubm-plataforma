import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useSidebar } from "@/components/ui/sidebar";

/**
 * Recolhe a sidebar ao entrar em uma rota /app/apps/* (o app embutido ganha o
 * espaço todo) e restaura o estado anterior (aberta/fechada) ao sair.
 */
export function useAutoCollapseSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { open, setOpen } = useSidebar();
  const isAppsRoute = pathname.startsWith("/app/apps/");
  const wasAppsRoute = useRef(false);
  const previousOpen = useRef(open);

  useEffect(() => {
    if (isAppsRoute && !wasAppsRoute.current) {
      previousOpen.current = open;
      setOpen(false);
    } else if (!isAppsRoute && wasAppsRoute.current) {
      setOpen(previousOpen.current);
    }
    wasAppsRoute.current = isAppsRoute;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAppsRoute]);
}
