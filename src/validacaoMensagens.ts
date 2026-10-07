import { contemPalavras, normalizarNomeNegocio } from "./texto.js";

export interface RegrasMensagem {
  maxFrases: number;
  naoContarSaudacaoInicial: boolean;
  palavrasProibidas: string[];
}

export const REGRAS_PADRAO: RegrasMensagem = {
  maxFrases: 3,
  naoContarSaudacaoInicial: true,
  palavrasProibidas: ["grátis", "gratis", "gratuito", "gratuita", "de graça"],
};

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Remove o nome do negócio do texto (para que pontos ou ".pt" no nome não contem como frases/links). */
function semNome(texto: string, nome: string): string {
  return texto.replace(new RegExp(escaparRegex(nome.trim()), "gi"), "NEGOCIO");
}

const SAUDACAO_INICIAL = /^\s*(ol[áa]|bom dia|boa tarde|boa noite)(?=[\s,.!?])[^.!?]{0,30}[.!?]\s*/i;
const ABREVIATURAS = /\b(sr|sra|dr|dra|eng|lda|n\.º|nº|av|r)\./gi;
const LINK =
  /(https?:\/\/|www\.|wa\.me|\b[a-z0-9-]+\.(pt|com|net|org|eu|io|site|app|me|info|biz|online|store|shop)\b)/i;
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u;

export function contarFrases(texto: string, naoContarSaudacao = true): number {
  let t = texto.replace(ABREVIATURAS, "$1");
  if (naoContarSaudacao) t = t.replace(SAUDACAO_INICIAL, "");
  return t
    .split(/[.!?…]+(?=\s|$)/)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s)).length;
}

export function temLink(texto: string): boolean {
  return LINK.test(texto);
}

/**
 * Valida uma mensagem. Devolve a lista de problemas (vazia = válida).
 */
export function validarMensagem(texto: string, nomeNegocio: string, regras: RegrasMensagem = REGRAS_PADRAO): string[] {
  const problemas: string[] = [];
  const t = (texto ?? "").trim();
  if (!t) return ["mensagem vazia"];

  const nomeNorm = normalizarNomeNegocio(nomeNegocio);
  if (!contemPalavras(t, nomeNorm)) problemas.push(`não contém o nome do negócio ("${nomeNegocio}")`);

  const tSemNome = semNome(t, nomeNegocio);
  if (temLink(tSemNome)) problemas.push("contém um link ou endereço web");
  if (EMOJI.test(t)) problemas.push("contém emojis");

  const frases = contarFrases(tSemNome, regras.naoContarSaudacaoInicial);
  if (frases > regras.maxFrases) problemas.push(`tem ${frases} frases (máximo ${regras.maxFrases})`);

  for (const p of regras.palavrasProibidas) {
    if (contemPalavras(tSemNome, p)) problemas.push(`contém a expressão proibida "${p}"`);
  }
  if (t.length > 700) problemas.push("demasiado longa");
  return problemas;
}
