export interface DadosPontuacao {
  rating: number;
  userRatingCount: number;
  priceLevel?: string | null;
}

const BONUS_PRECO: Record<string, number> = {
  PRICE_LEVEL_MODERATE: 6,
  PRICE_LEVEL_EXPENSIVE: 9,
  PRICE_LEVEL_VERY_EXPENSIVE: 10,
};

/**
 * Pontuação 0–100, usada apenas para ordenar:
 * - nota (4,2 → 0 pts; 5,0 → 50 pts)
 * - nº de avaliações em escala logarítmica (30 → ~20 pts; 1000+ → 40 pts)
 * - preço MODERATE ou acima dá bónus até 10 pts; sem preço não penaliza.
 */
export function pontuar(d: DadosPontuacao, minNota = 4.2): number {
  const nota = Math.max(0, Math.min(1, (d.rating - minNota) / (5 - minNota))) * 50;
  const aval = Math.max(0, Math.min(1, Math.log10(Math.max(1, d.userRatingCount)) / 3)) * 40;
  const preco = d.priceLevel ? (BONUS_PRECO[d.priceLevel] ?? 0) : 0;
  return Math.round(Math.min(100, nota + aval + preco));
}

const ROTULO_PRECO: Record<string, string> = {
  PRICE_LEVEL_FREE: "Gratuito",
  PRICE_LEVEL_INEXPENSIVE: "€",
  PRICE_LEVEL_MODERATE: "€€",
  PRICE_LEVEL_EXPENSIVE: "€€€",
  PRICE_LEVEL_VERY_EXPENSIVE: "€€€€",
};

export function rotuloPreco(priceLevel?: string | null): string {
  return priceLevel ? (ROTULO_PRECO[priceLevel] ?? "") : "";
}
