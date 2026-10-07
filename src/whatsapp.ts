import type { TelefoneNormalizado } from "./telefone.js";

/**
 * Link wa.me com o texto pré-escrito. Abre a conversa (no WhatsApp Desktop, se instalado);
 * o envio é sempre feito à mão por quem carrega em Enter.
 */
export function linkWhatsApp(tel: TelefoneNormalizado, mensagem: string): string {
  const numero = tel.internacional.replace(/^\+/, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`;
}

/** Escapa texto para dentro de uma string de fórmula do Google Sheets ("" duplica as aspas). */
export function textoFormula(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

/**
 * Fórmula que lê o texto da célula da mensagem: se editar a mensagem na folha, o link acompanha.
 * Ex.: =HYPERLINK("https://wa.me/351912345678?text=" & ENCODEURL(L2), "Abrir no WhatsApp")
 */
export function formulaWhatsApp(tel: TelefoneNormalizado, celulaMensagem: string, rotulo = "Abrir no WhatsApp"): string {
  const base = `https://wa.me/${tel.internacional.replace(/^\+/, "")}?text=`;
  return `=HYPERLINK(${textoFormula(base)} & ENCODEURL(${celulaMensagem}), ${textoFormula(rotulo)})`;
}

/** Fórmula HYPERLINK (sintaxe em inglês, que é a usada pela API do Sheets). */
export function formulaHiperligacao(url: string, rotulo: string): string {
  return `=HYPERLINK(${textoFormula(url)}, ${textoFormula(rotulo)})`;
}
