import fs from "node:fs";
import { z } from "zod";
import { caminho } from "./caminhos.js";
import { DOMINIOS_QUE_NAO_CONTAM_PADRAO } from "./dominios.js";

const esquemaConfig = z.object({
  leadsPorExecucao: z.number().int().positive().default(50),
  custo: z.object({
    limiteEurPorExecucao: z.number().positive().default(3),
    reservaEurParaMensagens: z.number().min(0).default(0.15),
    cambioUsdParaEur: z.number().positive().default(0.92),
    descontarQuotaGratuitaGoogle: z.boolean().default(true),
    quotaGratuitaMensalGoogle: z
      .object({
        placesTextSearchCompleto: z.number().int().min(0),
        placesTextSearchNome: z.number().int().min(0),
        placesDetails: z.number().int().min(0),
      })
      .default({ placesTextSearchCompleto: 1000, placesTextSearchNome: 5000, placesDetails: 1000 }),
    precosUsd: z.object({
      placesTextSearchCompletoPor1000: z.number().min(0),
      placesTextSearchNomePor1000: z.number().min(0),
      placesDetailsPor1000: z.number().min(0),
      anthropicInputPorMilhao: z.number().min(0),
      anthropicOutputPorMilhao: z.number().min(0),
      anthropicCacheEscritaPorMilhao: z.number().min(0),
      anthropicCacheLeituraPorMilhao: z.number().min(0),
      anthropicPesquisaWebPor1000: z.number().min(0),
    }),
  }),
  filtros: z.object({
    minAvaliacoes: z.number().int().min(0).default(30),
    minNota: z.number().min(0).max(5).default(4.2),
    prefixosTelemovel: z.array(z.string()).default(["91", "92", "93", "96"]),
    dominiosQueNaoContamComoSite: z.array(z.string()).default(DOMINIOS_QUE_NAO_CONTAM_PADRAO),
    verificarNomeDuplicadoEmPortugal: z.boolean().default(true),
    verificacaoDnsHttp: z.boolean().default(true),
    verificacaoWeb: z.boolean().default(true),
    diasParaVoltarAVerificarDescartados: z.number().int().min(0).default(90),
  }),
  pesquisa: z.object({
    idioma: z.string().default("pt-PT"),
    regiao: z.string().default("PT"),
    resultadosPorPesquisa: z.number().int().min(1).max(20).default(20),
    maxPesquisasPorExecucao: z.number().int().positive().default(400),
  }),
  anthropic: z.object({
    modelo: z.string().default("claude-sonnet-5-5"),
    ferramentaPesquisaWeb: z.enum(["web_search_20250305", "web_search_20260209"]).default("web_search_20250305"),
    maxPesquisasWebPorVerificacao: z.number().int().min(1).max(10).default(3),
    esforcoVerificacao: z.enum(["low", "medium", "high"]).default("low"),
    esforcoMensagens: z.enum(["low", "medium", "high"]).default("medium"),
    usarFallbackAutomatico: z.boolean().default(true),
    maxTentativasMensagens: z.number().int().min(1).max(10).default(4),
  }),
  mensagens: z.object({
    ficheiroInstrucoes: z.string().default("instrucoes-mensagens.md"),
    maxFrases: z.number().int().positive().default(3),
    naoContarSaudacaoInicial: z.boolean().default(true),
    palavrasProibidas: z.array(z.string()).default([]),
  }),
  sheet: z.object({
    blocoManha: z.string().default("Manhã (10h–12h)"),
    blocoTarde: z.string().default("Tarde (15h–17h)"),
    estados: z.array(z.string()).min(2),
  }),
});
export type Config = z.infer<typeof esquemaConfig>;

const esquemaCategorias = z.array(z.object({ setor: z.string(), termo: z.string(), tipo: z.string().optional() })).min(1);
export type Categoria = z.infer<typeof esquemaCategorias>[number];

const esquemaCidades = z.object({
  cidades: z
    .array(z.object({ nome: z.string(), regiao: z.string(), populacaoMilhares: z.number().optional(), consulta: z.string().optional() }))
    .min(1),
});
export type Cidade = z.infer<typeof esquemaCidades>["cidades"][number];

const esquemaCadeias = z.object({ cadeias: z.array(z.string()) });

function lerJson<T>(ficheiro: string, esquema: z.ZodType<T>): T {
  const p = caminho(ficheiro);
  let bruto: unknown;
  try {
    bruto = JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    throw new Error(`Não foi possível ler ${ficheiro}: ${(e as Error).message}`);
  }
  const r = esquema.safeParse(bruto);
  if (!r.success) throw new Error(`O ficheiro ${ficheiro} tem erros:\n${z.prettifyError(r.error)}`);
  return r.data;
}

export interface ConfigCompleta {
  config: Config;
  categorias: Categoria[];
  cidades: Cidade[];
  cadeias: string[];
}

export function carregarConfig(): ConfigCompleta {
  return {
    config: lerJson("config.json", esquemaConfig),
    categorias: lerJson("config/categorias.json", esquemaCategorias),
    cidades: lerJson("config/cidades.json", esquemaCidades).cidades,
    cadeias: lerJson("config/cadeias.json", esquemaCadeias).cadeias,
  };
}
