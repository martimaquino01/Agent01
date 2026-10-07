export const DOMINIOS_QUE_NAO_CONTAM_PADRAO = [
  "facebook.com",
  "fb.com",
  "fb.me",
  "instagram.com",
  "booksy.com",
  "fresha.com",
  "thefork.pt",
  "thefork.com",
  "tripadvisor.*",
  "linktr.ee",
  "sites.google.com",
  "business.site",
  "negocio.site",
  "wa.me",
  "api.whatsapp.com",
];

/** Extrai o hostname (sem "www.") de um URL, aceitando URLs sem protocolo. */
export function extrairHost(uri: string): string | null {
  const limpo = uri.trim();
  if (!limpo) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(limpo) ? limpo : `http://${limpo}`);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (!host.includes(".")) return null;
    return host.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * true se o host pertence a um dos domínios da lista (o próprio domínio ou um subdomínio).
 * "tripadvisor.*" aceita qualquer terminação: tripadvisor.pt, tripadvisor.com.pt, ...
 */
export function hostNaLista(host: string, lista: string[]): boolean {
  return lista.some((dominio) => {
    const d = dominio.toLowerCase().replace(/^www\./, "");
    if (d.endsWith(".*")) {
      const base = d.slice(0, -2).replace(/\./g, "\\.");
      return new RegExp(`(^|\\.)${base}\\.[a-z]{2,}(\\.[a-z]{2,})?$`).test(host);
    }
    return host === d || host.endsWith(`.${d}`);
  });
}

/**
 * Decide se o websiteUri devolvido pelo Google conta como "site próprio".
 * Vazio ou só redes sociais / plataformas de reservas => NÃO conta.
 */
export function temSiteProprio(websiteUri: string | null | undefined, lista: string[] = DOMINIOS_QUE_NAO_CONTAM_PADRAO): boolean {
  if (!websiteUri || !websiteUri.trim()) return false;
  const host = extrairHost(websiteUri);
  if (!host) return false; // lixo no campo => tratamos como sem site
  return !hostNaLista(host, lista);
}
