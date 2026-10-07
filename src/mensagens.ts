import fs from "node:fs";
import { z } from "zod";
import { caminho } from "./caminhos.js";
import { chamarClaude, extrairJson, textoDaResposta, type OpcoesClaude } from "./claude.js";
import { validarMensagem, type RegrasMensagem } from "./validacaoMensagens.js";

export type Versao = "A" | "B";

export interface PedidoMensagem {
  id: number;
  nome: string;
  cidade: string;
  setor: string;
  versao: Versao;
  /** "bom dia" ou "boa tarde", conforme o bloco de envio */
  saudacao: string;
}

export interface MensagemGerada {
  texto: string;
  /** Vazio se passou em todas as verificações. */
  problemas: string[];
}

const esquemaResposta = z.object({
  mensagens: z.array(z.object({ id: z.number().int(), texto: z.string() })),
});

const ESQUEMA_JSON = {
  type: "object",
  properties: {
    mensagens: {
      type: "array",
      items: {
        type: "object",
        properties: { id: { type: "integer" }, texto: { type: "string" } },
        required: ["id", "texto"],
        additionalProperties: false,
      },
    },
  },
  required: ["mensagens"],
  additionalProperties: false,
} as const;

export function lerInstrucoes(ficheiro: string): string {
  const p = caminho(ficheiro);
  if (!fs.existsSync(p)) throw new Error(`Não encontrei o ficheiro de instruções ${ficheiro}.`);
  return fs.readFileSync(p, "utf8");
}

function sistema(instrucoes: string): string {
  return `Escreves a primeira mensagem de WhatsApp que o Martim, da Elmavere (agência de criação de websites), vai enviar à mão a pequenos negócios portugueses. Escreve em português europeu.

Segue rigorosamente as instruções do Martim:

<instrucoes>
${instrucoes}
</instrucoes>

Para cada negócio recebes: id, nome, cidade, setor, versão (A ou B) e a saudação a usar. Escreve o texto final, pronto a enviar, exatamente como deve aparecer no WhatsApp. Escreve o nome do negócio tal como é dado. Devolve JSON no formato {"mensagens": [{"id": <id>, "texto": "<mensagem>"}]}, com uma entrada por negócio.`;
}

function pedido(lote: PedidoMensagem[], correcoes: Map<number, string[]>): string {
  const linhas = lote.map((l) => {
    const base = { id: l.id, nome: l.nome, cidade: l.cidade, setor: l.setor, versao: l.versao, saudacao: l.saudacao };
    const erros = correcoes.get(l.id);
    return erros?.length ? { ...base, corrigir: `A versão anterior foi rejeitada porque ${erros.join("; ")}.` } : base;
  });
  return `Escreve as mensagens para estes negócios:\n\n${JSON.stringify(linhas, null, 2)}`;
}

/**
 * Gera e valida as mensagens. As que falharem a validação são regeneradas
 * (com o motivo da rejeição) até `maxTentativas` vezes.
 */
export async function gerarMensagens(
  o: OpcoesClaude,
  instrucoes: string,
  leads: PedidoMensagem[],
  regras: RegrasMensagem,
  aoProgredir?: (msg: string) => void,
): Promise<Map<number, MensagemGerada>> {
  const resultado = new Map<number, MensagemGerada>();
  const correcoes = new Map<number, string[]>();
  let pendentes = [...leads];

  for (let tentativa = 1; tentativa <= o.config.maxTentativasMensagens && pendentes.length; tentativa++) {
    aoProgredir?.(
      tentativa === 1
        ? `A escrever ${pendentes.length} mensagens…`
        : `A reescrever ${pendentes.length} mensagem(ns) que não passaram na validação (tentativa ${tentativa})…`,
    );
    let lidas: z.infer<typeof esquemaResposta>["mensagens"] = [];
    try {
      const resposta = await chamarClaude(o, {
        max_tokens: 16000,
        system: sistema(instrucoes),
        output_config: { effort: o.config.esforcoMensagens, format: { type: "json_schema", schema: ESQUEMA_JSON } },
        messages: [{ role: "user", content: pedido(pendentes, correcoes) }],
      });
      lidas = esquemaResposta.parse(extrairJson(textoDaResposta(resposta))).mensagens;
    } catch (e) {
      aoProgredir?.(`Resposta inválida do modelo (${(e as Error).message}); a tentar de novo.`);
      continue;
    }

    const porId = new Map(lidas.map((m) => [m.id, m.texto.trim()]));
    const aindaPendentes: PedidoMensagem[] = [];
    for (const lead of pendentes) {
      const texto = porId.get(lead.id);
      if (!texto) {
        correcoes.set(lead.id, ["não foi devolvida nenhuma mensagem para este id"]);
        aindaPendentes.push(lead);
        continue;
      }
      const problemas = validarMensagem(texto, lead.nome, regras);
      const anterior = resultado.get(lead.id);
      if (!anterior || problemas.length <= anterior.problemas.length) resultado.set(lead.id, { texto, problemas });
      if (problemas.length) {
        correcoes.set(lead.id, problemas);
        aindaPendentes.push(lead);
      }
    }
    pendentes = aindaPendentes;
  }
  return resultado;
}
