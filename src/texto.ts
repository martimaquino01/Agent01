/** Minúsculas, sem acentos, só letras/números separados por um espaço. */
export function normalizarTexto(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const PALAVRAS_SOCIETARIAS = new Set(["lda", "limitada", "unipessoal", "sa"]);

/**
 * Normaliza o nome de um negócio para comparar duplicados:
 * ignora maiúsculas, acentos, pontuação e sufixos societários ("Lda", "Unipessoal").
 */
export function normalizarNomeNegocio(nome: string): string {
  const palavras = normalizarTexto(nome).split(" ").filter(Boolean);
  while (palavras.length > 1 && PALAVRAS_SOCIETARIAS.has(palavras[palavras.length - 1]!)) palavras.pop();
  return palavras.join(" ");
}

/** true se `agulha` aparece em `palheiro` como sequência de palavras completas (ambos normalizados). */
export function contemPalavras(palheiro: string, agulha: string): boolean {
  const p = ` ${normalizarTexto(palheiro)} `;
  const a = normalizarTexto(agulha);
  if (!a) return false;
  return p.includes(` ${a} `);
}

/** Nome sem espaços nem acentos, para adivinhar domínios: "Barbearia Zé" -> "barbeariaze". */
export function slugCompacto(nome: string): string {
  return normalizarNomeNegocio(nome).replace(/ /g, "");
}

/** Nome com hífenes: "Barbearia Zé" -> "barbearia-ze". */
export function slugHifen(nome: string): string {
  return normalizarNomeNegocio(nome).replace(/ /g, "-");
}
