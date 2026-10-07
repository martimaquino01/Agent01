import dns from "node:dns/promises";
import { normalizarNomeNegocio, normalizarTexto, slugCompacto, slugHifen } from "./texto.js";

export interface ResultadoDns {
  encontrado: boolean;
  dominio?: string;
  detalhe?: string;
}

/** Domínios óbvios a testar: nomesemespacos.pt/.com e nome-com-hifens.pt/.com. */
export function dominiosObvios(nome: string): string[] {
  const out = new Set<string>();
  for (const slug of [slugCompacto(nome), slugHifen(nome)]) {
    if (slug.length < 3 || slug.length > 63) continue;
    out.add(`${slug}.pt`);
    out.add(`${slug}.com`);
  }
  return [...out];
}

function textoDaPagina(html: string): string {
  return normalizarTexto(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " "),
  );
}

/** A página parece ser do mesmo negócio? (contém o nome completo, ou o telemóvel). */
export function paginaEDoNegocio(html: string, nome: string, telefoneNacional?: string): boolean {
  const texto = ` ${textoDaPagina(html)} `;
  const nomeNorm = normalizarNomeNegocio(nome);
  if (nomeNorm.length >= 4 && texto.includes(` ${nomeNorm} `)) return true;
  if (telefoneNacional) {
    const soDigitos = html.replace(/\D/g, "");
    if (soDigitos.includes(telefoneNacional)) return true;
  }
  return false;
}

async function resolve(dominio: string): Promise<boolean> {
  try {
    const r = await Promise.race([
      dns.lookup(dominio),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000)),
    ]);
    return !!r;
  } catch {
    return false;
  }
}

async function obterHtml(dominio: string): Promise<string | null> {
  for (const url of [`https://${dominio}`, `http://${dominio}`, `https://www.${dominio}`]) {
    try {
      const r = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(7000),
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ElmavereLeadAgent/1.0" },
      });
      if (!r.ok) continue;
      const tipo = r.headers.get("content-type") ?? "";
      if (!tipo.includes("html") && !tipo.includes("text")) continue;
      return (await r.text()).slice(0, 500_000);
    } catch {
      /* tenta o próximo */
    }
  }
  return null;
}

/** Filtro 7: testa por DNS e HTTP os domínios óbvios. Gratuito (não usa APIs pagas). */
export async function verificarDominiosObvios(nome: string, telefoneNacional?: string): Promise<ResultadoDns> {
  for (const dominio of dominiosObvios(nome)) {
    if (!(await resolve(dominio))) continue;
    const html = await obterHtml(dominio);
    if (html && paginaEDoNegocio(html, nome, telefoneNacional)) {
      return { encontrado: true, dominio, detalhe: `o domínio ${dominio} responde com conteúdo do negócio` };
    }
  }
  return { encontrado: false };
}
