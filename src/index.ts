import { parseArgs } from "node:util";
import { BaseDados } from "./baseDados.js";
import { ListaBloqueio } from "./bloqueio.js";
import { criarCliente } from "./claude.js";
import { carregarConfig } from "./config.js";
import { consola, negrito } from "./consola.js";
import { Contador } from "./custo.js";
import { carregarCredenciais } from "./env.js";
import { explicarErro } from "./erros.js";
import { exportarCsv } from "./exportarCsv.js";
import { gerarMensagens, lerInstrucoes } from "./mensagens.js";
import { notificar } from "./notificacao.js";
import { construirLinhas, ordenarEDistribuir, pedidosMensagens, procurarLeads, type Servicos } from "./pipeline.js";
import { detalhesLugar, pesquisarNome, pesquisarTexto, type OpcoesPlaces } from "./places.js";
import { RegistoDescartes } from "./registoDescartes.js";
import { criarClienteSheets, escreverExecucao, nomeSeparador, obterTitulo, urlFolha } from "./sheets.js";
import { testarLigacoes } from "./testeLigacoes.js";
import { verificarDominiosObvios } from "./verificacaoDns.js";
import { verificarNaWeb } from "./verificacaoWeb.js";

const AJUDA = `
Elmavere Lead Agent

  npm run gerar                 Gera 50 leads e escreve-os num separador novo da Google Sheet
  npm run ensaio                Modo de ensaio: 5 leads, NÃO escreve na folha (gera um CSV em out/)
  npm run testar-ligacoes       Testa as chaves das 3 APIs
  npm run so-pesquisa           Só pesquisa + filtros 1–5 (sem verificação web nem mensagens)

Opções (depois de "npm run gerar --"):
  --dry-run       não escreve na folha nem na lista de bloqueio
  --n <número>    quantos leads procurar
  --so-pesquisa   para depois do filtro 5
  --testar-ligacoes
`;

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      "dry-run": { type: "boolean", default: false },
      n: { type: "string" },
      "so-pesquisa": { type: "boolean", default: false },
      "testar-ligacoes": { type: "boolean", default: false },
      ajuda: { type: "boolean", short: "h", default: false },
    },
    allowPositionals: false,
  });
  if (values.ajuda) {
    console.log(AJUDA);
    return 0;
  }

  const cfg = carregarConfig();
  const { config } = cfg;
  if (values["testar-ligacoes"]) return (await testarLigacoes(cfg)) ? 0 : 1;

  const soPesquisa = values["so-pesquisa"];
  const ensaio = values["dry-run"] || soPesquisa;
  const alvo = values.n ? Number.parseInt(values.n, 10) : config.leadsPorExecucao;
  if (!Number.isInteger(alvo) || alvo < 1) throw new Error(`--n inválido: ${values.n}`);

  const cred = carregarCredenciais({ places: true, anthropic: !soPesquisa, sheets: !ensaio });
  const inicio = new Date();

  consola.titulo(
    soPesquisa
      ? `Elmavere Lead Agent — só pesquisa e filtros 1–5 (${alvo} leads)`
      : ensaio
        ? `Elmavere Lead Agent — ENSAIO (${alvo} leads, sem escrever na folha)`
        : `Elmavere Lead Agent — a gerar ${alvo} leads`,
  );
  consola.info("Este programa nunca envia mensagens: só prepara a lista e os links.");

  // Antes de gastar dinheiro, confirma que a folha está acessível.
  const sheets = ensaio ? null : criarClienteSheets(cred.contaServico!);
  if (sheets) {
    const { titulo } = await obterTitulo(sheets, cred.sheetId!);
    consola.ok(`Google Sheet acessível: "${titulo}"`);
  }

  const db = new BaseDados();
  const contador = new Contador(config.custo, db);
  consola.info(`Limite de custo desta execução: ${config.custo.limiteEurPorExecucao.toFixed(2).replace(".", ",")} € (config.json)`);
  const bloqueio = new ListaBloqueio();
  const descartes = new RegistoDescartes(inicio);
  const places: OpcoesPlaces = {
    apiKey: cred.googlePlacesApiKey!,
    idioma: config.pesquisa.idioma,
    regiao: config.pesquisa.regiao,
    contador,
  };
  const claude = cred.anthropicApiKey ? { cliente: criarCliente(cred.anthropicApiKey), config: config.anthropic, contador } : null;

  const servicos: Servicos = {
    pesquisarTexto: (q, tipo) => pesquisarTexto(places, q, { includedType: tipo, pageSize: config.pesquisa.resultadosPorPesquisa }),
    pesquisarNome: (nome) => pesquisarNome(places, nome),
    detalhes: (id) => detalhesLugar(places, id),
    verificarDns: (nome, tel) => verificarDominiosObvios(nome, tel),
    verificarWeb: (n) => verificarNaWeb(claude!, n),
    estimativaVerificacaoUsd: () => contador.mediaAnthropicUsd() * 2,
  };

  try {
    const res = await procurarLeads({ cfg, servicos, contador, bloqueio, db, descartes }, alvo, { soFiltrosBasicos: soPesquisa });
    if (res.paragem) consola.aviso(`A pesquisa parou antes do fim: ${res.paragem}.`);
    consola.info(`${res.leads.length} leads aprovados em ${res.pesquisas} pesquisas; ${descartes.total} descartados (ver ${descartes.ficheiro}).`);

    if (!res.leads.length) {
      consola.aviso("Nenhum lead aprovado nesta execução.");
      consola.info(contador.resumo());
      await notificar("Elmavere Lead Agent", `Nenhum lead encontrado. ${res.paragem ?? ""}`.trim());
      return 1;
    }

    const distribuidos = ordenarEDistribuir(res.leads, config.sheet.blocoManha, config.sheet.blocoTarde);

    if (soPesquisa) {
      consola.titulo("Candidatos que passaram os filtros 1–5");
      for (const l of distribuidos) {
        console.log(
          `${String(l.numero).padStart(2)}. ${negrito(l.nome)} — ${l.cidade.nome} — ${l.categoria.setor} — ${l.telefone.legivel} — ` +
            `${(l.lugar.rating ?? 0).toFixed(1)} (${l.lugar.userRatingCount}) — pontuação ${l.pontuacao}`,
        );
      }
      consola.info(contador.resumo(distribuidos.length));
      return 0;
    }

    // Etapa 5: mensagens
    const instrucoes = lerInstrucoes(config.mensagens.ficheiroInstrucoes);
    const mensagens = await gerarMensagens(claude!, instrucoes, pedidosMensagens(distribuidos), config.mensagens, (m) => consola.info(m));
    const linhas = construirLinhas(distribuidos, mensagens, config.sheet.estados[0]!);
    const comAviso = linhas.filter((l) => l.notas).length;
    if (comAviso) consola.aviso(`${comAviso} mensagem(ns) não passaram na validação — estão assinaladas na coluna Notas.`);

    if (ensaio) {
      consola.titulo("Resultado do ensaio");
      for (const l of linhas) {
        console.log(`\n${negrito(`${l.numero}. ${l.negocio}`)} — ${l.cidade} — ${l.setor} — ${l.telemovel} — ${l.nota.toFixed(1)} (${l.avaliacoes}) ${l.preco}`);
        console.log(`   Bloco: ${l.bloco} | Versão ${l.versao}`);
        console.log(`   ${l.mensagem}`);
        if (l.notas) consola.aviso(`   ${l.notas}`);
      }
      const ficheiro = exportarCsv(linhas, "ensaio", nomeSeparador(inicio));
      consola.ok(`Ensaio gravado em ${ficheiro} (a folha e a lista de bloqueio não foram alteradas).`);
      consola.titulo("Custos");
      consola.info(contador.resumo(linhas.length));
      await notificar("Ensaio pronto", `${linhas.length} leads de teste em out\\ (folha não alterada)`);
      return 0;
    }

    // Etapa 6: Google Sheet
    let separador: string;
    try {
      separador = await escreverExecucao(sheets!, cred.sheetId!, nomeSeparador(inicio), linhas, config.sheet.estados);
    } catch (e) {
      const ficheiro = exportarCsv(linhas, "leads-nao-escritos", nomeSeparador(inicio));
      consola.erro(`Não foi possível escrever na Google Sheet. Os leads foram guardados em ${ficheiro}.`);
      throw e;
    }

    // Tudo o que entra na folha passa a estar bloqueado para sempre.
    const novos = bloqueio.acrescentar(distribuidos.map((l) => ({ placeId: l.lugar.id, telefone: l.telefone.internacional, nota: `lead ${separador}` })));
    for (const l of distribuidos) db.guardar(l.lugar.id, l.telefone.internacional, "lead");

    const url = urlFolha(cred.sheetId!);
    consola.ok(`Separador "${separador}" criado com ${linhas.length} leads: ${url}`);
    consola.info(`${novos} entradas acrescentadas a data/bloqueados.csv.`);
    consola.titulo("Custos");
    consola.info(contador.resumo(linhas.length));

    const parcial = linhas.length < alvo ? ` (parcial: ${res.paragem})` : "";
    await notificar(
      linhas.length < alvo ? "Lista parcial pronta" : "Lista pronta",
      `Lista pronta: ${linhas.length} leads na Google Sheet${parcial}. Custo estimado: ${contador.gastoEur.toFixed(2).replace(".", ",")} €`,
      url,
    );
    return 0;
  } finally {
    db.fechar();
  }
}

main()
  .then((codigo) => {
    process.exitCode = codigo;
  })
  .catch(async (e) => {
    consola.erro(explicarErro(e));
    if (process.env.DEBUG) console.error(e);
    await notificar("Elmavere Lead Agent — erro", explicarErro(e).split("\n")[0]!.slice(0, 200));
    process.exitCode = 1;
  });
