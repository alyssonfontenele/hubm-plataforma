// Portal Mowig (J661) — a CSP do vercel.json precisa liberar o host da API do portal em connect-src (e nada além do necessário).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PORTAL_API_URL } from "@/lib/portal";

const vercel = JSON.parse(readFileSync(resolve(__dirname, "../../../vercel.json"), "utf-8")) as {
  headers: { headers: { key: string; value: string }[] }[];
};
const csp = vercel.headers[0].headers.find((h) => h.key === "Content-Security-Policy")!.value;
const diretiva = (nome: string) =>
  (
    csp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${nome} `)) ?? ""
  )
    .split(/\s+/)
    .slice(1);

describe("CSP do vercel.json", () => {
  it("connect-src inclui o host da API do portal (origem exata, https)", () => {
    const origem = new URL(PORTAL_API_URL).origin;
    expect(origem.startsWith("https://")).toBe(true);
    expect(diretiva("connect-src")).toContain(origem);
  });

  it("connect-src mantém o Supabase e não abre curinga geral", () => {
    const c = diretiva("connect-src");
    expect(c).toContain("https://*.supabase.co");
    expect(c).not.toContain("*");
    expect(c).not.toContain("https:");
  });

  it("QR do PIX (data:) é permitido em img-src e não há unsafe-eval nem embutir o portal em outro site", () => {
    expect(diretiva("img-src")).toContain("data:");
    expect(csp).not.toContain("unsafe-eval");
    expect(diretiva("frame-ancestors")).toEqual(["'none'"]);
  });
});
