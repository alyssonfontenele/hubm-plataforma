import { useCallback, useEffect, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Modo foco para apps embutidos (/app/apps/*): sidebar e topbar somem por
 * padrão e só voltam, como overlay, quando revealed() é chamado (hot corner).
 */
export function useFocusMode() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const focus = pathname.startsWith("/app/apps/");
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!focus) setRevealed(false);
  }, [focus]);

  const reveal = useCallback(() => setRevealed(true), []);
  const hide = useCallback(() => setRevealed(false), []);

  return { focus, revealed, reveal, hide };
}
