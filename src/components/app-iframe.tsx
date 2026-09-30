import { useState } from "react";
import { useFocusMode } from "@/hooks/useFocusMode";
import { Skeleton } from "@/components/ui/skeleton";

const TOPBAR_HEIGHT = "56px";

// Permissões de todo mini-app embutido (Estoque de Chapas, Quadros de
// Produção — public.apps). "identity-credentials-get" é necessário para o
// login Google via FedCM dentro de um iframe cross-origin (ex.: Quadros); os
// demais apps simplesmente não usam essa permissão, então declará-la sempre
// não muda nada para eles.
const ALLOW = "clipboard-read; clipboard-write; identity-credentials-get";

/**
 * Iframe compartilhado por todo app embutido em tela cheia em
 * /app/apps/$slug (public.apps). Extraído de AppEmbed (apps.$slug.tsx) sem
 * mudar seu comportamento — altura, skeleton de carregamento e atributos do
 * iframe permanecem idênticos.
 */
export function AppIframe({ src, title }: { src: string | null; title: string }) {
  const { focus } = useFocusMode();
  const [loaded, setLoaded] = useState(false);
  const height = focus ? "100vh" : `calc(100vh - ${TOPBAR_HEIGHT})`;

  return (
    <div className="relative" style={{ height }}>
      {!loaded && (
        <div className="absolute inset-0 p-4">
          <Skeleton className="h-full w-full" />
        </div>
      )}
      {src && (
        <iframe
          src={src}
          title={title}
          onLoad={() => setLoaded(true)}
          allow={ALLOW}
          style={{
            height,
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
