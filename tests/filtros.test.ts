import { describe, expect, it } from "vitest";
import { carregarConfig } from "../src/config.js";
import { eCadeiaConhecida, filtrosBasicos, nomeRepetidoNoutroLocal } from "../src/filtros.js";
import type { Lugar } from "../src/places.js";
import { pontuar, rotuloPreco } from "../src/pontuacao.js";

const { config, cadeias } = carregarConfig();
const f = config.filtros;

const lugar = (extra: Partial<Lugar> = {}): Lugar => ({
  id: "p1",
  displayName: { text: "Barbearia Zé" },
  businessStatus: "OPERATIONAL",
  rating: 4.7,
  userRatingCount: 120,
  internationalPhoneNumber: "+351 912 345 678",
  formattedAddress: "Rua X 1, 4700-000 Braga, Portugal",
  ...extra,
});

describe("filtrosBasicos", () => {
  it("aprova um candidato válido", () => {
    expect(filtrosBasicos(lugar(), f)).toEqual({ ok: true });
  });
  it("1: tem de estar OPERATIONAL", () => {
    expect(filtrosBasicos(lugar({ businessStatus: "CLOSED_TEMPORARILY" }), f)).toMatchObject({ ok: false, filtro: 1 });
  });
  it("2: mínimo de avaliações e nota", () => {
    expect(filtrosBasicos(lugar({ userRatingCount: 29 }), f)).toMatchObject({ ok: false, filtro: 2 });
    expect(filtrosBasicos(lugar({ rating: 4.1 }), f)).toMatchObject({ ok: false, filtro: 2 });
    expect(filtrosBasicos(lugar({ userRatingCount: 30, rating: 4.2 }), f)).toEqual({ ok: true });
  });
  it("3: só telemóveis", () => {
    expect(filtrosBasicos(lugar({ internationalPhoneNumber: "+351 253 123 456" }), f)).toMatchObject({ ok: false, filtro: 3 });
    expect(filtrosBasicos(lugar({ internationalPhoneNumber: undefined }), f)).toMatchObject({ ok: false, filtro: 3 });
    expect(filtrosBasicos(lugar({ internationalPhoneNumber: undefined, nationalPhoneNumber: "962 697 356" }), f)).toEqual({ ok: true });
  });
  it("4: sem site próprio", () => {
    expect(filtrosBasicos(lugar({ websiteUri: "https://barbeariaze.pt" }), f)).toMatchObject({ ok: false, filtro: 4 });
    expect(filtrosBasicos(lugar({ websiteUri: "https://facebook.com/barbeariaze" }), f)).toEqual({ ok: true });
  });
});

describe("cadeias e nomes repetidos", () => {
  it("deteta cadeias por palavras completas", () => {
    expect(eCadeiaConhecida("Midas Braga", cadeias)).toBe("Midas");
    expect(eCadeiaConhecida("Midasol Pneus", cadeias)).toBeNull();
    expect(eCadeiaConhecida("MULTIOPTICAS - Viseu", cadeias)).not.toBeNull();
  });
  it("deteta o mesmo nome noutro place_id", () => {
    const l = lugar();
    const outro = lugar({ id: "p2", displayName: { text: "BARBEARIA ZE, Lda" }, formattedAddress: "Porto, Portugal" });
    expect(nomeRepetidoNoutroLocal(l, [l, outro])?.id).toBe("p2");
    expect(nomeRepetidoNoutroLocal(l, [l, lugar({ id: "p3", displayName: { text: "Barbearia Zé Maria" } })])).toBeNull();
    expect(nomeRepetidoNoutroLocal(l, [lugar({ id: "p4", formattedAddress: "Vigo, Espanha" })])).toBeNull();
  });
});

describe("pontuação", () => {
  it("fica entre 0 e 100 e favorece mais avaliações e melhor nota", () => {
    const fraco = pontuar({ rating: 4.2, userRatingCount: 30 });
    const forte = pontuar({ rating: 4.9, userRatingCount: 800 });
    expect(fraco).toBeGreaterThanOrEqual(0);
    expect(forte).toBeLessThanOrEqual(100);
    expect(forte).toBeGreaterThan(fraco);
  });
  it("preço MODERATE ou acima dá bónus; sem preço não penaliza", () => {
    const base = pontuar({ rating: 4.6, userRatingCount: 100 });
    expect(pontuar({ rating: 4.6, userRatingCount: 100, priceLevel: "PRICE_LEVEL_MODERATE" })).toBeGreaterThan(base);
    expect(pontuar({ rating: 4.6, userRatingCount: 100, priceLevel: "PRICE_LEVEL_INEXPENSIVE" })).toBe(base);
    expect(pontuar({ rating: 4.6, userRatingCount: 100, priceLevel: null })).toBe(base);
  });
  it("rótulos de preço", () => {
    expect(rotuloPreco("PRICE_LEVEL_MODERATE")).toBe("€€");
    expect(rotuloPreco(undefined)).toBe("");
  });
});
