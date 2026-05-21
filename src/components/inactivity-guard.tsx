import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS = 60 * 1000; // 60 seconds

export function InactivityGuard() {
  const navigate = useNavigate();
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(60);
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningRef = useRef(false);

  const clearAll = () => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
  };

  const logout = useCallback(async () => {
    clearAll();
    warningRef.current = false;
    setWarning(false);
    await supabase.auth.signOut();
    toast.error("Sessão encerrada por inatividade.");
    void navigate({ to: "/login" });
  }, [navigate]);

  const startInactivity = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
    inactivityTimer.current = setTimeout(() => {
      warningRef.current = true;
      setSecondsLeft(60);
      setWarning(true);
      const startedAt = Date.now();
      countdownTimer.current = setInterval(() => {
        const remaining = Math.max(0, 60 - Math.floor((Date.now() - startedAt) / 1000));
        setSecondsLeft(remaining);
      }, 250);
      warningTimer.current = setTimeout(() => {
        void logout();
      }, WARNING_MS);
    }, INACTIVITY_MS);
  }, [logout]);

  const resetTimer = useCallback(() => {
    if (warningRef.current) return; // ignore until user explicitly continues
    startInactivity();
  }, [startInactivity]);

  const continueSession = () => {
    if (warningTimer.current) clearTimeout(warningTimer.current);
    if (countdownTimer.current) clearInterval(countdownTimer.current);
    warningRef.current = false;
    setWarning(false);
    startInactivity();
  };

  useEffect(() => {
    startInactivity();
    const events: (keyof DocumentEventMap)[] = ["mousemove", "keydown", "touchstart"];
    events.forEach((e) => document.addEventListener(e, resetTimer, { passive: true }));
    return () => {
      clearAll();
      events.forEach((e) => document.removeEventListener(e, resetTimer));
    };
  }, [startInactivity, resetTimer]);

  if (!warning) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inactivity-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/90 backdrop-blur-sm px-4"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-2xl">
        <h2 id="inactivity-title" className="text-lg font-semibold text-text-primary">
          Sessão prestes a expirar
        </h2>
        <p className="mt-2 text-sm text-text-secondary">
          Sua sessão está prestes a expirar por inatividade. Clique para continuar.
        </p>
        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="text-sm text-text-muted tabular-nums">
            Encerrando em{" "}
            <span className="font-semibold text-text-primary">{secondsLeft}s</span>
          </div>
          <Button
            onClick={continueSession}
            className="bg-text-primary text-background hover:bg-text-primary/90"
          >
            Continuar conectado
          </Button>
        </div>
      </div>
    </div>
  );
}
