import { describe, expect, it } from "vitest";
import { normalizarTelefone } from "../src/telefone.js";
import { formulaHiperligacao, formulaWhatsApp, linkWhatsApp } from "../src/whatsapp.js";

describe("linkWhatsApp", () => {
  const tel = normalizarTelefone("+351 912 345 678")!;

  it("usa o número internacional sem + nem espaços", () => {
    expect(linkWhatsApp(tel, "Olá")).toBe("https://wa.me/351912345678?text=Ol%C3%A1");
  });

  it("codifica espaços, acentos, pontuação e quebras de linha", () => {
    const msg = 'Olá, boa tarde. Vi a "Barbearia Zé & Filhos" em São João da Madeira?\nPosso enviar-lhe?';
    const url = linkWhatsApp(tel, msg);
    const texto = url.split("?text=")[1]!;
    expect(texto).not.toMatch(/[ "\n&#?]/);
    expect(decodeURIComponent(texto)).toBe(msg);
  });

  it("o link é aceite como URL válido", () => {
    const url = new URL(linkWhatsApp(tel, "Olá, boa tarde. Posso enviar-lhe?"));
    expect(url.hostname).toBe("wa.me");
    expect(url.pathname).toBe("/351912345678");
    expect(url.searchParams.get("text")).toBe("Olá, boa tarde. Posso enviar-lhe?");
  });
});

describe("formulaHiperligacao", () => {
  it("gera a fórmula HYPERLINK com aspas escapadas", () => {
    expect(formulaHiperligacao("https://wa.me/351912345678?text=Ol%C3%A1", 'Abrir "já"')).toBe(
      '=HYPERLINK("https://wa.me/351912345678?text=Ol%C3%A1", "Abrir ""já""")',
    );
  });

  it("um link wa.me nunca tem aspas por escapar dentro da fórmula", () => {
    const tel = normalizarTelefone("961111111")!;
    const f = formulaHiperligacao(linkWhatsApp(tel, 'Texto com "aspas"'), "Abrir no WhatsApp");
    expect(f).toMatch(/^=HYPERLINK\("https:\/\/wa\.me\/351961111111\?text=[^"]+", "Abrir no WhatsApp"\)$/);
  });
});

describe("formulaWhatsApp", () => {
  it("lê a mensagem da célula indicada com ENCODEURL", () => {
    const tel = normalizarTelefone("+351 931 234 567")!;
    expect(formulaWhatsApp(tel, "L7")).toBe('=HYPERLINK("https://wa.me/351931234567?text=" & ENCODEURL(L7), "Abrir no WhatsApp")');
  });
});
