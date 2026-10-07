import type { Config } from "./config.js";

export type TipoPedido = "placesTextSearch" | "placesTextSearchNome" | "placesDetails" | "anthropic";

export interface UsoAnthropic {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  server_tool_use?: { web_search_requests?: number | null } | null;
}

/** Onde se guarda o uso mensal da Google (BaseDados). */
export interface RegistoUsoMensal {
  usoMensal(sku: string): number;
  incrementarUso(sku: string): void;
}

type TipoPlaces = Exclude<TipoPedido, "anthropic">;
const SKU_QUOTA: Record<TipoPlaces, "placesTextSearchCompleto" | "placesTextSearchNome" | "placesDetails"> = {
  placesTextSearch: "placesTextSearchCompleto",
  placesTextSearchNome: "placesTextSearchNome",
  placesDetails: "placesDetails",
};

export class LimiteCustoAtingido extends Error {
  constructor(public readonly gastoEur: number, public readonly limiteEur: number) {
    super(`Limite de custo atingido: ${gastoEur.toFixed(2)} € estimados (limite ${limiteEur.toFixed(2)} €).`);
  }
}

/**
 * Conta cada pedido pago e estima o custo em euros, com base nos preços de config.json.
 * Se `descontarQuotaGratuitaGoogle` estiver ativo e houver um registo de uso mensal, os pedidos
 * à Google dentro da quota gratuita do mês contam como 0 €.
 */
export class Contador {
  readonly pedidos: Record<TipoPedido, number> = { placesTextSearch: 0, placesTextSearchNome: 0, placesDetails: 0, anthropic: 0 };
  readonly anthropic = { input: 0, output: 0, cacheEscrita: 0, cacheLeitura: 0, pesquisasWeb: 0 };
  /** Pedidos à Google que ficaram dentro da quota gratuita mensal. */
  gratuitosGoogle = 0;
  private usd = 0;
  private usdGoogle = 0;
  private usdAnthropic = 0;

  constructor(
    private readonly custo: Config["custo"],
    private readonly uso?: RegistoUsoMensal,
  ) {}

  get gastoEur(): number {
    return this.usd * this.custo.cambioUsdParaEur;
  }

  get limiteEur(): number {
    return this.custo.limiteEurPorExecucao;
  }

  /** Limite para a fase de pesquisa: deixa uma reserva para gerar as mensagens no fim. */
  get limitePesquisaEur(): number {
    return Math.max(0, this.custo.limiteEurPorExecucao - this.custo.reservaEurParaMensagens);
  }

  private dentroDaQuota(tipo: TipoPlaces): boolean {
    if (!this.uso || !this.custo.descontarQuotaGratuitaGoogle) return false;
    const sku = SKU_QUOTA[tipo];
    return this.uso.usoMensal(sku) < this.custo.quotaGratuitaMensalGoogle[sku];
  }

  private precoPedido(tipo: TipoPlaces): number {
    if (this.dentroDaQuota(tipo)) return 0;
    const p = this.custo.precosUsd;
    return {
      placesTextSearch: p.placesTextSearchCompletoPor1000,
      placesTextSearchNome: p.placesTextSearchNomePor1000,
      placesDetails: p.placesDetailsPor1000,
    }[tipo] / 1000;
  }

  /** Lança LimiteCustoAtingido se o próximo pedido deste tipo fizer passar o limite indicado. */
  verificar(tipo: TipoPlaces | "anthropicEstimado", limiteEur = this.limitePesquisaEur, estimativaUsd?: number): void {
    const proximo = tipo === "anthropicEstimado" ? (estimativaUsd ?? 0.05) : this.precoPedido(tipo);
    const depois = (this.usd + proximo) * this.custo.cambioUsdParaEur;
    if (depois > limiteEur) throw new LimiteCustoAtingido(this.gastoEur, limiteEur);
  }

  registarPlaces(tipo: TipoPlaces): void {
    const preco = this.precoPedido(tipo);
    if (preco === 0 && this.dentroDaQuota(tipo)) this.gratuitosGoogle++;
    this.pedidos[tipo]++;
    this.usd += preco;
    this.usdGoogle += preco;
    this.uso?.incrementarUso(SKU_QUOTA[tipo]);
  }

  registarAnthropic(uso: UsoAnthropic): number {
    const p = this.custo.precosUsd;
    const escrita = uso.cache_creation_input_tokens ?? 0;
    const leitura = uso.cache_read_input_tokens ?? 0;
    const pesquisas = uso.server_tool_use?.web_search_requests ?? 0;
    this.pedidos.anthropic++;
    this.anthropic.input += uso.input_tokens;
    this.anthropic.output += uso.output_tokens;
    this.anthropic.cacheEscrita += escrita;
    this.anthropic.cacheLeitura += leitura;
    this.anthropic.pesquisasWeb += pesquisas;
    const usd =
      (uso.input_tokens * p.anthropicInputPorMilhao +
        uso.output_tokens * p.anthropicOutputPorMilhao +
        escrita * p.anthropicCacheEscritaPorMilhao +
        leitura * p.anthropicCacheLeituraPorMilhao) /
        1_000_000 +
      (pesquisas * p.anthropicPesquisaWebPor1000) / 1000;
    this.usd += usd;
    this.usdAnthropic += usd;
    return usd;
  }

  /** Média do custo por pedido à Anthropic até agora (para prever o próximo). */
  mediaAnthropicUsd(): number {
    if (!this.pedidos.anthropic) return 0.06;
    const p = this.custo.precosUsd;
    const a = this.anthropic;
    const total =
      (a.input * p.anthropicInputPorMilhao +
        a.output * p.anthropicOutputPorMilhao +
        a.cacheEscrita * p.anthropicCacheEscritaPorMilhao +
        a.cacheLeitura * p.anthropicCacheLeituraPorMilhao) /
        1_000_000 +
      (a.pesquisasWeb * p.anthropicPesquisaWebPor1000) / 1000;
    return total / this.pedidos.anthropic;
  }

  resumo(leads?: number): string {
    const p = this.pedidos;
    const a = this.anthropic;
    const eur = (usd: number) => `${(usd * this.custo.cambioUsdParaEur).toFixed(2).replace(".", ",")} €`;
    const gratis = this.gratuitosGoogle ? ` — ${this.gratuitosGoogle} dentro da quota gratuita mensal` : "";
    const linhas = [
      `Google Places: ${p.placesTextSearch} pesquisas, ${p.placesTextSearchNome} pesquisas de nome, ${p.placesDetails} detalhes${gratis} → ${eur(this.usdGoogle)}`,
      `Anthropic: ${p.anthropic} pedidos, ${a.pesquisasWeb} pesquisas web, ${a.input.toLocaleString("pt-PT")} tokens de entrada, ${a.output.toLocaleString("pt-PT")} de saída → ${eur(this.usdAnthropic)}`,
      `Custo estimado desta execução: ${eur(this.usd)} (limite ${this.limiteEur.toFixed(2).replace(".", ",")} €)`,
    ];
    if (leads) linhas.push(`Custo médio por lead aprovado: ${eur(this.usd / leads)}`);
    return linhas.join("\n");
  }
}
