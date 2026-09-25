import { useEffect } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppTopbar } from "@/components/app-topbar";
import { useSidebar } from "@/components/ui/sidebar";

interface FocusModeChromeProps {
  revealed: boolean;
  onHide: () => void;
}

/**
 * Sidebar + topbar como overlay do modo foco: ocultos por padrão, aparecem
 * ao encostar no hot corner e somem ao tirar o mouse da área ou apertar Esc.
 */
export function FocusModeChrome({ revealed, onHide }: FocusModeChromeProps) {
  const { setOpen } = useSidebar();

  useEffect(() => {
    if (revealed) setOpen(true);
  }, [revealed, setOpen]);

  useEffect(() => {
    if (!revealed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onHide();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [revealed, onHide]);

  return (
    <div
      onMouseLeave={onHide}
      className={`transition-opacity duration-150 ease-out ${
        revealed ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      <AppSidebar className="shadow-2xl" />
      <div className="fixed inset-x-0 top-0 z-50 md:pl-(--sidebar-width) shadow-lg">
        <AppTopbar />
      </div>
    </div>
  );
}
