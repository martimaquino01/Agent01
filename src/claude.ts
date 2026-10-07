import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaMessageParam, MessageCreateParamsNonStreaming } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { Config } from "./config.js";
import type { Contador } from "./custo.js";

export interface OpcoesClaude {
  cliente: Anthropic;
  config: Config["anthropic"];
  contador: Contador;
}

export function criarCliente(apiKey: string): Anthropic {
  return new Anthropic({ apiKey, maxRetries: 3, timeout: 180_000 });
}

export class RecusaModelo extends Error {}

type Pedido = Omit<MessageCreateParamsNonStreaming, "model" | "betas" | "fallbacks" | "messages"> & {
  messages: BetaMessageParam[];
};

const BETA_FALLBACK = "server-side-fallback-2026-07-01";

/**
 * Faz um pedido ao Claude:
 * - regista o custo de cada resposta no contador;
 * - continua automaticamente quando a pesquisa web devolve "pause_turn";
 * - pede fallback automático do lado do servidor se o modelo recusar (configurável);
 * - lança RecusaModelo se mesmo assim a resposta for uma recusa.
 */
export async function chamarClaude(o: OpcoesClaude, pedido: Pedido): Promise<BetaMessage> {
  const mensagens = [...pedido.messages];
  let usarFallback = o.config.usarFallbackAutomatico;

  for (let continuacoes = 0; continuacoes <= 4; continuacoes++) {
    let resposta: BetaMessage;
    try {
      resposta = await o.cliente.beta.messages.create({
        ...pedido,
        model: o.config.modelo,
        messages: mensagens,
        ...(usarFallback ? { betas: [BETA_FALLBACK], fallbacks: "default" as const } : {}),
      });
    } catch (e) {
      // Se a conta/modelo não aceitar o fallback automático, repete sem ele.
      if (usarFallback && e instanceof Anthropic.BadRequestError && /fallback/i.test(e.message)) {
        usarFallback = false;
        continuacoes--;
        continue;
      }
      throw e;
    }
    o.contador.registarAnthropic(resposta.usage);

    if (resposta.stop_reason === "refusal") {
      throw new RecusaModelo(`O modelo recusou o pedido (${resposta.stop_details?.category ?? "sem categoria"}).`);
    }
    if (resposta.stop_reason === "pause_turn") {
      mensagens.push({ role: "assistant", content: resposta.content as BetaMessageParam["content"] });
      continue;
    }
    return resposta;
  }
  throw new Error("O modelo não terminou a resposta depois de várias continuações.");
}

/** Junta todo o texto da resposta (ignora blocos de pesquisa, thinking, etc.). */
export function textoDaResposta(r: BetaMessage): string {
  return r.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
}

/** Extrai o último objeto JSON que aparece no texto (com ou sem ```json). */
export function extrairJson(texto: string): unknown {
  const blocos = [...texto.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)].map((m) => m[1]!.trim());
  for (const b of blocos.reverse()) {
    try {
      return JSON.parse(b);
    } catch {
      /* tenta o seguinte */
    }
  }
  const fim = texto.lastIndexOf("}");
  if (fim === -1) throw new Error("A resposta não contém JSON.");
  for (let i = texto.lastIndexOf("{", fim); i !== -1; i = texto.lastIndexOf("{", i - 1)) {
    try {
      return JSON.parse(texto.slice(i, fim + 1));
    } catch {
      if (i === 0) break;
    }
  }
  throw new Error("Não foi possível ler o JSON da resposta.");
}
