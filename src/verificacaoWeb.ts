import { z } from "zod";
import { chamarClaude, extrairJson, textoDaResposta, type OpcoesClaude } from "./claude.js";

export const esquemaVerificacao = z.object({
  tem_dominio_proprio: z.boolean(),
  dominio: z.string().nullable(),
  tem_varias_lojas: z.boolean(),
  e_franquia: z.boolean(),
  parece_fechado: z.boolean(),
  confianca: z.enum(["alta", "media", "baixa"]),
});
export type Verificacao = z.infer<typeof esquemaVerificacao>;

export interface NegocioAVerificar {
  nome: string;
  cidade: string;
  morada?: string;
  telefone: string;
  setor: string;
}

const SISTEMA = `És um verificador de dados sobre pequenas empresas portuguesas. Usa a pesquisa web para confirmar factos sobre UM negócio concreto e responde no fim com um único objeto JSON, sem mais texto depois dele.

Campos do JSON:
- "tem_dominio_proprio": true se o negócio tem um website num domínio próprio (ex.: nomedonegocio.pt, nomedonegocio.com). NÃO contam: páginas de Facebook ou Instagram, Booksy, Fresha, TheFork, TripAdvisor, linktr.ee, sites.google.com, business.site, negocio.site, wa.me, nem fichas em diretórios ou marketplaces (Páginas Amarelas, Cylex, Zaask, Fixando, Racius, Infoempresas, Uber Eats, Glovo, etc.).
- "dominio": o domínio próprio encontrado (ex.: "barbeariasilva.pt"), ou null.
- "tem_varias_lojas": true se o mesmo negócio tem mais de um estabelecimento físico (várias moradas/lojas com a mesma marca).
- "e_franquia": true se pertence a uma cadeia, rede ou franquia.
- "parece_fechado": true se há indícios fortes de que fechou definitivamente ou trespassou.
- "confianca": "alta", "media" ou "baixa" — quão seguro estás das respostas acima.

Cuidado com homónimos: um negócio com nome parecido noutra cidade NÃO é o mesmo. Confirma pela cidade, morada ou telefone. Não inventes: se não encontrares um site próprio, "tem_dominio_proprio" é false.`;

function pedidoUtilizador(n: NegocioAVerificar, segundaTentativa: boolean): string {
  const dados = [
    `Negócio: ${n.nome}`,
    `Cidade: ${n.cidade}`,
    n.morada ? `Morada (Google): ${n.morada}` : null,
    `Telefone: ${n.telefone}`,
    `Setor: ${n.setor}`,
  ]
    .filter(Boolean)
    .join("\n");
  const instrucao = segundaTentativa
    ? `Uma primeira verificação ficou com confiança baixa. Pesquisa de outra forma: usa o nome exato entre aspas com a cidade, pesquisa também pelo número de telefone, e procura "${n.nome} site oficial" e "${n.nome} lojas".`
    : `Pesquisa "${n.nome} ${n.cidade}".`;
  return `${dados}\n\n${instrucao}\n\nTermina com o objeto JSON.`;
}

async function umaVerificacao(o: OpcoesClaude, n: NegocioAVerificar, segunda: boolean): Promise<Verificacao> {
  const ferramenta = {
    type: o.config.ferramentaPesquisaWeb,
    name: "web_search" as const,
    max_uses: o.config.maxPesquisasWebPorVerificacao,
    user_location: { type: "approximate" as const, country: "PT", city: n.cidade, timezone: "Europe/Lisbon" },
  };
  let ultimoErro: unknown;
  // Até 2 pedidos por tentativa, caso o JSON venha mal formado.
  for (let i = 0; i < 2; i++) {
    const resposta = await chamarClaude(o, {
      max_tokens: 4000,
      system: SISTEMA,
      output_config: { effort: o.config.esforcoVerificacao },
      tools: [ferramenta],
      messages: [{ role: "user", content: pedidoUtilizador(n, segunda) }],
    });
    try {
      return esquemaVerificacao.parse(extrairJson(textoDaResposta(resposta)));
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw new Error(`Resposta da verificação web inválida: ${(ultimoErro as Error)?.message}`);
}

export interface DecisaoVerificacao {
  aprovado: boolean;
  motivo?: string;
  verificacao: Verificacao;
  tentativas: number;
}

/** Filtro 6: verificação na web. Com confiança "baixa", faz uma segunda pesquisa antes de decidir. */
export async function verificarNaWeb(o: OpcoesClaude, n: NegocioAVerificar): Promise<DecisaoVerificacao> {
  let v = await umaVerificacao(o, n, false);
  let tentativas = 1;
  if (v.confianca === "baixa") {
    v = await umaVerificacao(o, n, true);
    tentativas = 2;
  }
  const motivos: string[] = [];
  if (v.tem_dominio_proprio) motivos.push(`tem domínio próprio${v.dominio ? ` (${v.dominio})` : ""}`);
  if (v.tem_varias_lojas) motivos.push("tem várias lojas");
  if (v.e_franquia) motivos.push("é franquia/cadeia");
  if (v.parece_fechado) motivos.push("parece fechado");
  return { aprovado: motivos.length === 0, motivo: motivos.join("; ") || undefined, verificacao: v, tentativas };
}
