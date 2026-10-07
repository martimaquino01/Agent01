import { describe, expect, it } from "vitest";
import { contarFrases, temLink, validarMensagem, REGRAS_PADRAO } from "../src/validacaoMensagens.js";

const BASE =
  "Olá, boa tarde. Sou o Martim, da Elmavere. Vi a Barbearia Zé em Braga no Google e preparei uma proposta de site para o vosso negócio, sem compromisso. Posso enviar-lhe?";

describe("validarMensagem", () => {
  it("aceita a versão A base (a saudação não conta como frase)", () => {
    expect(validarMensagem(BASE, "Barbearia Zé")).toEqual([]);
  });

  it("aceita o nome sem acentos/maiúsculas e sem 'Lda'", () => {
    const msg = BASE.replace("Barbearia Zé", "barbearia ze");
    expect(validarMensagem(msg, "Barbearia Zé, Lda.")).toEqual([]);
  });

  it("rejeita sem o nome do negócio", () => {
    const p = validarMensagem(BASE, "Talho Central");
    expect(p.some((x) => x.includes("nome do negócio"))).toBe(true);
  });

  it.each([
    "https://elmavere.pt",
    "www.elmavere.pt",
    "elmavere.pt",
    "wa.me/351912345678",
    "elmavere.com/proposta",
  ])("rejeita links: %s", (link) => {
    const p = validarMensagem(`${BASE} Veja ${link}`.replace("Posso enviar-lhe? Veja", "Veja"), "Barbearia Zé");
    expect(p).toContain("contém um link ou endereço web");
  });

  it("não confunde pontos no nome do negócio com links ou frases", () => {
    const msg = BASE.replace("Barbearia Zé", "J.M. Silva Lda.");
    expect(validarMensagem(msg, "J.M. Silva Lda.")).toEqual([]);
    const msg2 = BASE.replace("Barbearia Zé", "Pizzaria.pt");
    expect(validarMensagem(msg2, "Pizzaria.pt")).toEqual([]);
  });

  it("rejeita mais de 3 frases", () => {
    const p = validarMensagem(`${BASE} Fico a aguardar.`, "Barbearia Zé");
    expect(p).toContain("tem 4 frases (máximo 3)");
  });

  it("conta a saudação se a regra estiver desligada", () => {
    const p = validarMensagem(BASE, "Barbearia Zé", { ...REGRAS_PADRAO, naoContarSaudacaoInicial: false });
    expect(p).toContain("tem 4 frases (máximo 3)");
  });

  it("rejeita emojis", () => {
    expect(validarMensagem(`${BASE} 🙂`, "Barbearia Zé")).toContain("contém emojis");
    expect(validarMensagem(BASE.replace("Posso", "👉 Posso"), "Barbearia Zé")).toContain("contém emojis");
  });

  it("rejeita promessas de gratuito", () => {
    const p = validarMensagem(BASE.replace("sem compromisso", "totalmente grátis"), "Barbearia Zé");
    expect(p.some((x) => x.includes("grátis"))).toBe(true);
    const p2 = validarMensagem(BASE.replace("sem compromisso", "de graça"), "Barbearia Zé");
    expect(p2.some((x) => x.includes("de graça"))).toBe(true);
  });

  it("rejeita mensagem vazia", () => {
    expect(validarMensagem("   ", "X")).toEqual(["mensagem vazia"]);
  });
});

describe("contarFrases", () => {
  it("conta frases terminadas em . ! ? e reticências", () => {
    expect(contarFrases("Uma. Duas! Três? Quatro…", false)).toBe(4);
  });
  it("ignora abreviaturas comuns", () => {
    expect(contarFrases("O Sr. Silva tem a loja na Av. da Liberdade. Posso enviar?", false)).toBe(2);
  });
  it("ignora a saudação inicial", () => {
    expect(contarFrases("Olá, bom dia. Sou o Martim. Posso enviar?", true)).toBe(2);
    expect(contarFrases("Boa tarde! Sou o Martim. Posso enviar?", true)).toBe(2);
  });
});

describe("temLink", () => {
  it("não marca texto normal", () => {
    expect(temLink("Posso enviar-lhe? Fico a aguardar, obrigado.")).toBe(false);
  });
});
