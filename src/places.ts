import { z } from "zod";
import type { Contador } from "./custo.js";

// Pode ser substituído por um servidor simulado nos testes ponta-a-ponta.
const BASE = process.env.ELMAVERE_PLACES_BASE_URL ?? "https://places.googleapis.com/v1";

export const CAMPOS_LUGAR = [
  "id",
  "displayName",
  "websiteUri",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "rating",
  "userRatingCount",
  "priceLevel",
  "businessStatus",
  "primaryType",
  "formattedAddress",
  "googleMapsUri",
] as const;

const esquemaLugar = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  websiteUri: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  internationalPhoneNumber: z.string().optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  priceLevel: z.string().optional(),
  businessStatus: z.string().optional(),
  primaryType: z.string().optional(),
  formattedAddress: z.string().optional(),
  googleMapsUri: z.string().optional(),
});
export type Lugar = z.infer<typeof esquemaLugar>;

const esquemaPesquisa = z.object({ places: z.array(esquemaLugar).optional() });

export class ErroPlaces extends Error {
  constructor(
    message: string,
    public readonly estado: number,
    public readonly motivo?: string,
  ) {
    super(message);
  }
}

export interface OpcoesPlaces {
  apiKey: string;
  idioma: string;
  regiao: string;
  contador: Contador;
}

async function pedir(url: string, init: RequestInit, mascara: string, apiKey: string): Promise<unknown> {
  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const r = await fetch(url, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": mascara,
          ...(init.headers ?? {}),
        },
        signal: AbortSignal.timeout(20_000),
      });
      const corpo = await r.text();
      if (r.ok) return corpo ? JSON.parse(corpo) : {};
      let msg = corpo;
      let motivo: string | undefined;
      try {
        const j = JSON.parse(corpo);
        msg = j?.error?.message ?? corpo;
        motivo = j?.error?.status;
      } catch {
        /* corpo não é JSON */
      }
      const erro = new ErroPlaces(`Google Places respondeu ${r.status}: ${msg}`, r.status, motivo);
      if (r.status === 429 || r.status >= 500) {
        ultimoErro = erro;
        await new Promise((res) => setTimeout(res, 1500 * (tentativa + 1)));
        continue;
      }
      throw erro;
    } catch (e) {
      if (e instanceof ErroPlaces) throw e;
      ultimoErro = e;
      await new Promise((res) => setTimeout(res, 1500 * (tentativa + 1)));
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

/** Text Search (New), com os campos completos (SKU Enterprise). */
export async function pesquisarTexto(
  o: OpcoesPlaces,
  textQuery: string,
  extra: { includedType?: string; pageSize?: number } = {},
): Promise<Lugar[]> {
  o.contador.verificar("placesTextSearch");
  const mascara = CAMPOS_LUGAR.map((c) => `places.${c}`).join(",");
  const corpo = {
    textQuery,
    languageCode: o.idioma,
    regionCode: o.regiao,
    pageSize: extra.pageSize ?? 20,
    ...(extra.includedType ? { includedType: extra.includedType } : {}),
  };
  try {
    const j = await pedir(`${BASE}/places:searchText`, { method: "POST", body: JSON.stringify(corpo) }, mascara, o.apiKey);
    return esquemaPesquisa.parse(j).places ?? [];
  } finally {
    o.contador.registarPlaces("placesTextSearch");
  }
}

/** Text Search só com id/nome/morada (SKU Pro, mais barato) — usado para detetar o mesmo nome noutro local. */
export async function pesquisarNome(o: OpcoesPlaces, nome: string): Promise<Lugar[]> {
  o.contador.verificar("placesTextSearchNome");
  const corpo = { textQuery: nome, languageCode: o.idioma, regionCode: o.regiao, pageSize: 20 };
  try {
    const j = await pedir(
      `${BASE}/places:searchText`,
      { method: "POST", body: JSON.stringify(corpo) },
      "places.id,places.displayName,places.formattedAddress",
      o.apiKey,
    );
    return esquemaPesquisa.parse(j).places ?? [];
  } finally {
    o.contador.registarPlaces("placesTextSearchNome");
  }
}

/** Place Details (New) com a máscara de campos pedida. */
export async function detalhesLugar(o: OpcoesPlaces, placeId: string): Promise<Lugar> {
  o.contador.verificar("placesDetails");
  const qs = new URLSearchParams({ languageCode: o.idioma, regionCode: o.regiao });
  try {
    const j = await pedir(
      `${BASE}/places/${encodeURIComponent(placeId)}?${qs}`,
      { method: "GET" },
      CAMPOS_LUGAR.join(","),
      o.apiKey,
    );
    return esquemaLugar.parse(j);
  } finally {
    o.contador.registarPlaces("placesDetails");
  }
}
