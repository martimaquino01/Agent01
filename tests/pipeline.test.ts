import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { BaseDados } from "../src/baseDados.js";
import { ListaBloqueio } from "../src/bloqueio.js";
import { carregarConfig } from "../src/config.js";
import { Contador } from "../src/custo.js";
import { gerarMensagens } from "../src/mensagens.js";
import { construirLinhas, ordenarEDistribuir, pedidosMensagens, procurarLeads, type Lead, type Servicos } from "../src/pipeline.js";
import type { Lugar } from "../src/places.js";
import { RegistoDescartes } from "../src/registoDescartes.js";
import { normalizarTelefone } from "../src/telefone.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "elmavere-"));
const cfgBase = carregarConfig();

function lugar(id: string, nome: string, extra: Partial<Lugar> = {}): Lugar {
  return {
    id,
    displayName: { text: nome },
    businessStatus: "OPERATIONAL",
    rating: 4.6,
    userRatingCount: 80,
    internationalPhoneNumber: `+351 91${id.replace(/\D/g, "").padStart(7, "0").slice(-7)}`,
    formattedAddress: "Rua A, Braga, Portugal",
    googleMapsUri: `https://maps.google.com/?cid=${id}`,
    ...extra,
  };
}

function contexto(resultados: Lugar[], webRejeita: string[] = [], dnsEncontra: string[] = []) {
  const ficheiroBloqueio = path.join(tmp, `bloq-${Math.random()}.csv`);
  fs.writeFileSync(ficheiroBloqueio, "tipo,valor,nota\ntelefone,+351962697356,Moto Kit\n");
  const contador = new Contador(cfgBase.config.custo);
  const chamadas = { texto: 0, nome: 0, detalhes: 0, web: 0, dns: 0 };
  const porId = new Map(resultados.map((l) => [l.id, l]));
  const servicos: Servicos = {
    async pesquisarTexto() {
      chamadas.texto++;
      contador.registarPlaces("placesTextSearch");
      return chamadas.texto === 1 ? resultados : [];
    },
    async pesquisarNome() {
      chamadas.nome++;
      return [];
    },
    async detalhes(id) {
      chamadas.detalhes++;
      return porId.get(id)!;
    },
    async verificarDns(nome) {
      chamadas.dns++;
      return dnsEncontra.includes(nome) ? { encontrado: true, dominio: "x.pt", detalhe: "domínio x.pt" } : { encontrado: false };
    },
    async verificarWeb(n) {
      chamadas.web++;
      const rejeita = webRejeita.includes(n.nome);
      return {
        aprovado: !rejeita,
        motivo: rejeita ? "tem domínio próprio" : undefined,
        tentativas: 1,
        verificacao: { tem_dominio_proprio: rejeita, dominio: null, tem_varias_lojas: false, e_franquia: false, parece_fechado: false, confianca: "alta" },
      };
    },
    estimativaVerificacaoUsd: () => 0.05,
  };
  const cfg = { ...cfgBase, categorias: cfgBase.categorias.slice(0, 2), cidades: cfgBase.cidades.slice(0, 2) };
  return {
    ctx: {
      cfg,
      servicos,
      contador,
      bloqueio: new ListaBloqueio(ficheiroBloqueio),
      db: new BaseDados(":memory:"),
      descartes: new RegistoDescartes(new Date(), tmp),
      aleatorio: () => 0.42,
    },
    chamadas,
  };
}

describe("procurarLeads", () => {
  const resultados = [
    lugar("a1", "Barbearia Boa"),
    lugar("a2", "Oficina Fixa", { internationalPhoneNumber: "+351 253 000 000" }),
    lugar("a3", "Talho Com Site", { websiteUri: "https://talhocomsite.pt" }),
    lugar("a4", "Talho Facebook", { websiteUri: "https://facebook.com/talho" }),
    lugar("a5", "Midas Braga"),
    lugar("a6", "Moto Kit", { internationalPhoneNumber: "+351 962 697 356" }),
    lugar("a7", "Florista Repetida"),
    lugar("a8", "FLORISTA REPETIDA"),
    lugar("a9", "Ginásio Web", {}),
    lugar("b1", "Padaria DNS"),
    lugar("b2", "Pastelaria Fechada", { businessStatus: "CLOSED_PERMANENTLY" }),
    lugar("b3", "Café Poucas", { userRatingCount: 12 }),
    lugar("a1", "Barbearia Boa"), // duplicado na mesma execução
  ];

  it("aplica os filtros e não repete leads", async () => {
    const { ctx, chamadas } = contexto(resultados, ["Ginásio Web"], ["Padaria DNS"]);
    const r = await procurarLeads(ctx, 50);
    const nomes = r.leads.map((l) => l.nome).sort();
    expect(nomes).toEqual(["Barbearia Boa", "Talho Facebook"]);
    expect(r.paragem).toMatch(/esgotaram-se/);
    expect(ctx.descartes.total).toBe(10);
    // Os filtros grátis vêm antes dos pagos: só 4 candidatos chegam à verificação web.
    expect(chamadas.detalhes).toBe(4);
    expect(chamadas.web).toBe(3);
    const log = fs.readFileSync(ctx.descartes.ficheiro, "utf8");
    expect(log).toContain("está na lista de bloqueio");
    expect(log).toContain("Midas");
    expect(log).toContain("mesmo nome");
  });

  it("para aos N leads pedidos", async () => {
    const { ctx } = contexto(resultados);
    const r = await procurarLeads(ctx, 1);
    expect(r.leads).toHaveLength(1);
    expect(r.paragem).toBeUndefined();
  });

  it("não volta a propor leads que já entraram numa folha", async () => {
    const { ctx } = contexto(resultados);
    ctx.db.guardar("a1", "+351910000001", "lead");
    const r = await procurarLeads(ctx, 50);
    expect(r.leads.map((l) => l.lugar.id)).not.toContain("a1");
  });

  it("para e avisa quando o limite de custo é atingido", async () => {
    const { ctx } = contexto(resultados);
    ctx.contador = new Contador({ ...cfgBase.config.custo, limiteEurPorExecucao: 0.02, reservaEurParaMensagens: 0 });
    ctx.servicos.pesquisarTexto = async () => {
      ctx.contador.verificar("placesTextSearch");
      ctx.contador.registarPlaces("placesTextSearch");
      return [];
    };
    const r = await procurarLeads(ctx, 50);
    expect(r.paragem).toMatch(/Limite de custo/);
  });
});

function leadsFalsos(n: number): Lead[] {
  return Array.from({ length: n }, (_, i) => ({
    lugar: lugar(`x${i}`, `Negócio ${i}`, { rating: 4.3 + (i % 7) / 10, userRatingCount: 30 + i * 13 }),
    nome: `Negócio ${i}`,
    telefone: normalizarTelefone(`91${String(1000000 + i)}`)!,
    categoria: cfgBase.categorias[0]!,
    cidade: cfgBase.cidades[0]!,
    pontuacao: (i * 37) % 100,
  }));
}

describe("ordenarEDistribuir", () => {
  it("25 A / 25 B, equilibrado em cada bloco, por ordem de pontuação", () => {
    const d = ordenarEDistribuir(leadsFalsos(50), "Manhã", "Tarde");
    const conta = (bloco: string, v: string) => d.filter((l) => l.bloco === bloco && l.versao === v).length;
    expect(d.filter((l) => l.versao === "A")).toHaveLength(25);
    expect(d.filter((l) => l.bloco === "Manhã")).toHaveLength(25);
    expect(Math.abs(conta("Manhã", "A") - conta("Manhã", "B"))).toBeLessThanOrEqual(1);
    expect(Math.abs(conta("Tarde", "A") - conta("Tarde", "B"))).toBeLessThanOrEqual(1);
    for (let i = 1; i < d.length; i++) expect(d[i - 1]!.pontuacao).toBeGreaterThanOrEqual(d[i]!.pontuacao);
    expect(d[0]!.saudacao).toBe("bom dia");
    expect(d[49]!.saudacao).toBe("boa tarde");
  });
});

describe("gerarMensagens", () => {
  it("valida e regenera as mensagens que falham", async () => {
    const d = ordenarEDistribuir(leadsFalsos(2), "Manhã", "Tarde");
    const pedidos = pedidosMensagens(d);
    const respostas = [
      // 1.ª resposta: a mensagem 2 tem link e emoji
      { mensagens: [
        { id: 1, texto: `Olá, bom dia. Sou o Martim, da Elmavere. Vi a ${pedidos[0]!.nome} em Lisboa no Google. Posso enviar-lhe?` },
        { id: 2, texto: `Olá, boa tarde. Veja ${pedidos[1]!.nome} em elmavere.pt 🙂` },
      ] },
      { mensagens: [{ id: 2, texto: `Olá, boa tarde. Sou o Martim, da Elmavere, e reparei que a ${pedidos[1]!.nome} não tem site. Posso enviar-lhe uma proposta?` }] },
    ];
    const pedidosFeitos: string[] = [];
    const cliente = {
      beta: {
        messages: {
          create: async (p: { messages: { content: string }[] }) => {
            pedidosFeitos.push(p.messages[0]!.content);
            return {
              stop_reason: "end_turn",
              content: [{ type: "text", text: JSON.stringify(respostas.shift()) }],
              usage: { input_tokens: 1000, output_tokens: 200 },
            };
          },
        },
      },
    } as unknown as Anthropic;
    const contador = new Contador(cfgBase.config.custo);
    const r = await gerarMensagens({ cliente, config: cfgBase.config.anthropic, contador }, "instruções", pedidos, cfgBase.config.mensagens);
    expect(r.get(1)!.problemas).toEqual([]);
    expect(r.get(2)!.problemas).toEqual([]);
    expect(pedidosFeitos).toHaveLength(2);
    expect(pedidosFeitos[1]).toContain("contém um link");
    expect(contador.pedidos.anthropic).toBe(2);

    const linhas = construirLinhas(d, r, "Por enviar");
    expect(linhas[0]!.linkWhatsApp).toMatch(/^https:\/\/wa\.me\/3519\d{8}\?text=Ol%C3%A1/);
    expect(linhas[0]!.estado).toBe("Por enviar");
    expect(linhas[0]!.notas).toBe("");
  });
});
