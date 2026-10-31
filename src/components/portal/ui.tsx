// Portal Mowig (J661) — peças pequenas compartilhadas (pílula de situação, aviso, copiar).
import { useState, type ReactNode } from "react";
import type { TomPilula } from "@/lib/portal-api";

export function Pilula({ tom = "neutro", children }: { tom?: TomPilula; children: ReactNode }) {
  return <span className={`portal-pilula portal-pilula-${tom}`}>{children}</span>;
}

export function Aviso({ tipo, children }: { tipo: "erro" | "info" | "ok"; children: ReactNode }) {
  return (
    <div
      className={`portal-aviso portal-aviso-${tipo}`}
      role={tipo === "erro" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

/** Copia o texto; sem a API de área de transferência (http, navegador antigo) cai no execCommand. */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* tenta o plano B */
  }
  try {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.setAttribute("readonly", "");
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(campo);
    return ok;
  } catch {
    return false;
  }
}

export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [copiado, setCopiado] = useState<"nao" | "sim" | "falhou">("nao");
  return (
    <>
      <button
        type="button"
        className="portal-botao"
        onClick={() =>
          void copiarTexto(texto).then((ok) => {
            setCopiado(ok ? "sim" : "falhou");
            window.setTimeout(() => setCopiado("nao"), 3000);
          })
        }
      >
        {rotulo}
      </button>
      <span className="portal-meta" role="status" aria-live="polite">
        {copiado === "sim" && "Código copiado."}
        {copiado === "falhou" && "Não foi possível copiar. Selecione o código e copie."}
      </span>
    </>
  );
}
