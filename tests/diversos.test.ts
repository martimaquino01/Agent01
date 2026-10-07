import { describe, expect, it } from "vitest";
import { BaseDados, mesAtual } from "../src/baseDados.js";
import { extrairJson } from "../src/claude.js";
import { Contador, LimiteCustoAtingido } from "../src/custo.js";
import { carregarConfig } from "../src/config.js";
import { extrairSheetId } from "../src/env.js";
import { scriptNotificacao } from "../src/notificacao.js";
import { CABECALHO, formulasTodas, linhaParaValores, nomeSeparador, PADRAO_SEPARADOR, ref } from "../src/sheets.js";
import { normalizarTelefone } from "../src/telefone.js";
import { dominiosObvios, paginaEDoNegocio } from "../src/verificacaoDns.js";
import { esquemaVerificacao } from "../src/verificacaoWeb.js";

describe("extrairJson", () => {
  it("lê JSON no fim de texto com citações", () => {
    const t = 'Pesquisei e encontrei a página de Facebook.\n\n{"tem_dominio_proprio": false, "dominio": null, "tem_varias_lojas": false, "e_franquia": false, "parece_fechado": false, "confianca": "alta"}';
    expect(esquemaVerificacao.parse(extrairJson(t)).confianca).toBe("alta");
  });
  it("lê blocos ```json", () => {
    expect(extrairJson('Aqui está:\n```json\n{"a": {"b": 1}}\n```')).toEqual({ a: { b: 1 } });
  });
  it("falha sem JSON", () => {
    expect(() => extrairJson("sem nada")).toThrow();
  });
});

describe("Contador de custos", () => {
  const { config } = carregarConfig();
  it("soma pedidos Places e Anthropic em euros", () => {
    const c = new Contador(config.custo);
    c.registarPlaces("placesTextSearch");
    c.registarAnthropic({ input_tokens: 10_000, output_tokens: 500, server_tool_use: { web_search_requests: 2 } });
    const usd = 35 / 1000 + (10_000 * 2 + 500 * 10) / 1e6 + 2 * 0.01;
    expect(c.gastoEur).toBeCloseTo(usd * config.custo.cambioUsdParaEur, 6);
    expect(c.pedidos.placesTextSearch).toBe(1);
    expect(c.anthropic.pesquisasWeb).toBe(2);
  });
  it("pedidos dentro da quota gratuita mensal da Google contam 0 €", () => {
    const db = new BaseDados(":memory:");
    const c = new Contador({ ...config.custo, quotaGratuitaMensalGoogle: { placesTextSearchCompleto: 2, placesTextSearchNome: 0, placesDetails: 0 } }, db);
    c.registarPlaces("placesTextSearch");
    c.registarPlaces("placesTextSearch");
    expect(c.gastoEur).toBe(0);
    expect(c.gratuitosGoogle).toBe(2);
    c.registarPlaces("placesTextSearch");
    expect(c.gastoEur).toBeCloseTo(0.035 * config.custo.cambioUsdParaEur, 6);
    expect(db.usoMensal("placesTextSearchCompleto")).toBe(3);
  });

  it("mês de faturação em hora do Pacífico", () => {
    expect(mesAtual(new Date("2026-11-01T05:00:00Z"))).toBe("2026-10");
    expect(mesAtual(new Date("2026-11-01T09:00:00Z"))).toBe("2026-11");
  });

  it("lança LimiteCustoAtingido antes de passar o limite", () => {
    const c = new Contador({ ...config.custo, limiteEurPorExecucao: 0.05, reservaEurParaMensagens: 0 });
    c.verificar("placesTextSearch");
    c.registarPlaces("placesTextSearch");
    expect(() => c.verificar("placesTextSearch")).toThrow(LimiteCustoAtingido);
  });
});

describe("Google Sheet", () => {
  it("nome do separador AAAA-MM-DD HHhMM", () => {
    const n = nomeSeparador(new Date(2026, 9, 7, 9, 5));
    expect(n).toBe("2026-10-07 09h05");
    expect(PADRAO_SEPARADOR.test(n)).toBe(true);
    expect(PADRAO_SEPARADOR.test(`${n} (2)`)).toBe(true);
    expect(PADRAO_SEPARADOR.test("Resumo")).toBe(false);
  });
  it("fórmulas da folha Todas juntam todos os separadores", () => {
    const f = formulasTodas(["2026-10-07 09h05", "2026-10-08 10h00"], ["Por enviar", "Enviado", "Respondeu", "Interessado", "Não interessado", "Cliente"]);
    expect(f.a2).toBe(`=IFERROR(QUERY({'2026-10-07 09h05'!A2:O;'2026-10-08 10h00'!A2:O}, "select * where Col3 is not null", 0), "")`);
    expect(f.p2).toContain('"^(Enviado|Respondeu|Interessado|Não interessado|Cliente)$"');
    expect(f.q2).toContain('"^(Respondeu|Interessado|Não interessado|Cliente)$"');
    expect(f.r2).toContain('"^(Interessado|Cliente)$"');
  });
  it("ref escapa plicas", () => {
    expect(ref("O'Neil", "A1")).toBe("'O''Neil'!A1");
  });
  it("extrairSheetId aceita URL completo", () => {
    expect(extrairSheetId("https://docs.google.com/spreadsheets/d/1AbC_d-9/edit#gid=0")).toBe("1AbC_d-9");
    expect(extrairSheetId("1AbC_d-9")).toBe("1AbC_d-9");
  });
  it("a linha da folha liga o WhatsApp à célula da mensagem", () => {
    const tel = normalizarTelefone("912345678")!;
    const v = linhaParaValores(
      { numero: 1, bloco: "Manhã", negocio: "=Mau", setor: "S", cidade: "C", telemovel: tel.legivel, nota: 4.5, avaliacoes: 40,
        preco: "€€", linkMaps: "https://maps.google.com/?cid=1", versao: "A", mensagem: "Olá", telefone: tel,
        linkWhatsApp: "https://wa.me/351912345678?text=Ol%C3%A1", estado: "Por enviar", notas: "" },
      2,
    );
    expect(v).toHaveLength(CABECALHO.length);
    expect(v[2]).toBe("'=Mau");
    expect(v[9]).toBe('=HYPERLINK("https://maps.google.com/?cid=1", "Ver no Maps")');
    expect(v[12]).toBe('=HYPERLINK("https://wa.me/351912345678?text=" & ENCODEURL(L2), "Abrir no WhatsApp")');
    expect(CABECALHO[11]).toBe("Mensagem"); // a coluna L tem de ser a da mensagem
  });
});

describe("verificação DNS", () => {
  it("gera domínios óbvios", () => {
    expect(dominiosObvios("Barbearia Zé, Lda")).toEqual(["barbeariaze.pt", "barbeariaze.com", "barbearia-ze.pt", "barbearia-ze.com"]);
  });
  it("reconhece a página do negócio pelo nome ou telefone", () => {
    expect(paginaEDoNegocio("<html><title>Barbearia Zé</title></html>", "Barbearia Zé")).toBe(true);
    expect(paginaEDoNegocio("<p>Ligue 912 345 678</p>", "Outra Coisa", "912345678")).toBe(true);
    expect(paginaEDoNegocio("<p>Domínio à venda</p>", "Barbearia Zé", "912345678")).toBe(false);
  });
});

describe("notificação", () => {
  it("escapa XML no texto", () => {
    const s = scriptNotificacao("Lista pronta", "50 leads <ok> & 'feito'", "https://x.pt/?a=1&b=2");
    expect(s).toContain("50 leads &lt;ok&gt; &amp; &apos;feito&apos;");
    expect(s).toContain('launch="https://x.pt/?a=1&amp;b=2"');
    expect(s).not.toMatch(/\n'@[^)]/);
  });
});
