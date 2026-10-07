import type { Config } from "./config.js";
import { temSiteProprio } from "./dominios.js";
import type { Lugar } from "./places.js";
import { eTelemovel, normalizarTelefone, type TelefoneNormalizado } from "./telefone.js";
import { contemPalavras, normalizarNomeNegocio } from "./texto.js";

export type Resultado = { ok: true } | { ok: false; filtro: number; motivo: string };

const OK: Resultado = { ok: true };
const falha = (filtro: number, motivo: string): Resultado => ({ ok: false, filtro, motivo });

export function telefoneDoLugar(l: Lugar): TelefoneNormalizado | null {
  return normalizarTelefone(l.internationalPhoneNumber) ?? normalizarTelefone(l.nationalPhoneNumber);
}

/** Filtros 1 a 4 — só usam os dados devolvidos pela Places API (sem custo extra). */
export function filtrosBasicos(l: Lugar, f: Config["filtros"]): Resultado {
  if (l.businessStatus !== "OPERATIONAL") return falha(1, `estado no Google: ${l.businessStatus ?? "desconhecido"}`);

  const n = l.userRatingCount ?? 0;
  const nota = l.rating ?? 0;
  if (n < f.minAvaliacoes) return falha(2, `só ${n} avaliações (mínimo ${f.minAvaliacoes})`);
  if (nota < f.minNota) return falha(2, `nota ${nota} (mínimo ${f.minNota})`);

  const tel = telefoneDoLugar(l);
  if (!tel) return falha(3, "sem telefone português");
  if (!eTelemovel(tel, f.prefixosTelemovel)) return falha(3, `telefone fixo ou não móvel (${tel.legivel})`);

  if (temSiteProprio(l.websiteUri, f.dominiosQueNaoContamComoSite)) return falha(4, `tem website: ${l.websiteUri}`);

  if (l.formattedAddress && !/portugal/i.test(l.formattedAddress)) return falha(1, `fora de Portugal (${l.formattedAddress})`);
  return OK;
}

/** Filtro 5 (parte local): nome de cadeia/franquia conhecida. */
export function eCadeiaConhecida(nome: string, cadeias: string[]): string | null {
  for (const c of cadeias) if (contemPalavras(nome, c)) return c;
  return null;
}

/**
 * Filtro 5 (parte paga): o mesmo nome normalizado aparece noutro place_id em Portugal?
 * Recebe os resultados de uma pesquisa pelo nome.
 */
export function nomeRepetidoNoutroLocal(l: Lugar, resultados: Lugar[]): Lugar | null {
  const alvo = normalizarNomeNegocio(l.displayName?.text ?? "");
  if (!alvo) return null;
  return (
    resultados.find(
      (r) =>
        r.id !== l.id &&
        normalizarNomeNegocio(r.displayName?.text ?? "") === alvo &&
        (!r.formattedAddress || /portugal/i.test(r.formattedAddress)),
    ) ?? null
  );
}
