import type { BaseDados } from "./baseDados.js";
import type { ListaBloqueio } from "./bloqueio.js";
import type { Categoria, Cidade, ConfigCompleta } from "./config.js";
import { consola } from "./consola.js";
import { LimiteCustoAtingido, type Contador } from "./custo.js";
import { eCadeiaConhecida, filtrosBasicos, nomeRepetidoNoutroLocal, telefoneDoLugar } from "./filtros.js";
import type { MensagemGerada, PedidoMensagem, Versao } from "./mensagens.js";
import { ErroPlaces, type Lugar } from "./places.js";
import { pontuar, rotuloPreco } from "./pontuacao.js";
import type { RegistoDescartes } from "./registoDescartes.js";
import type { LinhaFolha } from "./sheets.js";
import type { TelefoneNormalizado } from "./telefone.js";
import { normalizarNomeNegocio } from "./texto.js";
import type { ResultadoDns } from "./verificacaoDns.js";
import type { DecisaoVerificacao, NegocioAVerificar } from "./verificacaoWeb.js";
import { linkWhatsApp } from "./whatsapp.js";

/** Serviços externos (injetados para se poder testar o pipeline sem gastar dinheiro). */
export interface Servicos {
  pesquisarTexto(consulta: string, tipo?: string): Promise<Lugar[]>;
  pesquisarNome(nome: string): Promise<Lugar[]>;
  detalhes(placeId: string): Promise<Lugar>;
  verificarDns(nome: string, telefoneNacional: string): Promise<ResultadoDns>;
  verificarWeb(n: NegocioAVerificar): Promise<DecisaoVerificacao>;
  /** Estimativa (USD) do próximo pedido de verificação web, para respeitar o limite de custo. */
  estimativaVerificacaoUsd(): number;
}

export interface Lead {
  lugar: Lugar;
  nome: string;
  telefone: TelefoneNormalizado;
  categoria: Categoria;
  cidade: Cidade;
  pontuacao: number;
}

export interface ResultadoPesquisa {
  leads: Lead[];
  /** Preenchido se a pesquisa parou antes de chegar ao alvo. */
  paragem?: string;
  pesquisas: number;
}

export interface Contexto {
  cfg: ConfigCompleta;
  servicos: Servicos;
  contador: Contador;
  bloqueio: ListaBloqueio;
  db: BaseDados;
  descartes: RegistoDescartes;
  /** Para testes: gerador aleatório determinístico. */
  aleatorio?: () => number;
}

function baralhar<T>(lista: T[], aleatorio: () => number): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(aleatorio() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Erros que não vale a pena contornar (chave inválida, API desativada, sem permissões). */
function eErroFatal(e: unknown): boolean {
  if (e instanceof ErroPlaces) return [401, 403].includes(e.estado) || (e.estado === 400 && /api key/i.test(e.message));
  const status = (e as { status?: number })?.status;
  return status === 401 || status === 403;
}

/**
 * Etapas 1–3: sorteia combinações categoria × cidade, aplica os filtros e repõe até ter `alvo` leads.
 * Com `soFiltrosBasicos`, para depois do filtro 5 (útil para testar a pesquisa sem gastar na verificação web).
 */
export async function procurarLeads(ctx: Contexto, alvo: number, opcoes: { soFiltrosBasicos?: boolean } = {}): Promise<ResultadoPesquisa> {
  const { cfg, servicos, contador, bloqueio, db, descartes } = ctx;
  const { config, categorias, cidades, cadeias } = cfg;
  const f = config.filtros;
  const aleatorio = ctx.aleatorio ?? Math.random;

  const combinacoes = baralhar(
    categorias.flatMap((categoria) => cidades.map((cidade) => ({ categoria, cidade }))),
    aleatorio,
  );
  const leads: Lead[] = [];
  const vistos = new Set<string>();
  const nomesVistos = new Map<string, Set<string>>(); // nome normalizado -> place_ids
  const tiposInvalidos = new Set<string>();
  let pesquisas = 0;
  let errosSeguidos = 0;

  const descartar = (l: Lugar, cat: Categoria, cid: Cidade, filtro: number | string, motivo: string, guardar = true) => {
    const nome = l.displayName?.text ?? "(sem nome)";
    descartes.registar({ placeId: l.id, negocio: nome, cidade: cid.nome, setor: cat.setor, filtro, motivo });
    if (guardar) db.guardar(l.id, telefoneDoLugar(l)?.internacional ?? null, "descartado");
    consola.descarte(`${nome} (${cid.nome}): ${motivo}`);
  };

  for (const { categoria, cidade } of combinacoes) {
    if (leads.length >= alvo) break;
    if (pesquisas >= config.pesquisa.maxPesquisasPorExecucao) {
      return { leads, pesquisas, paragem: `atingido o máximo de ${config.pesquisa.maxPesquisasPorExecucao} pesquisas por execução` };
    }

    const local = cidade.consulta ?? cidade.nome;
    const consulta = `${categoria.termo} em ${local}`;
    consola.progresso(leads.length, alvo, `a pesquisar "${consulta}"…`);

    let resultados: Lugar[];
    try {
      const tipo = categoria.tipo && !tiposInvalidos.has(categoria.tipo) ? categoria.tipo : undefined;
      pesquisas++;
      try {
        resultados = await servicos.pesquisarTexto(consulta, tipo);
      } catch (e) {
        // Tipo não suportado pela API: repete sem filtro de tipo e não volta a usá-lo.
        if (tipo && e instanceof ErroPlaces && e.estado === 400 && !/api key/i.test(e.message)) {
          tiposInvalidos.add(tipo);
          pesquisas++;
          resultados = await servicos.pesquisarTexto(consulta);
        } else throw e;
      }
      errosSeguidos = 0;
    } catch (e) {
      if (e instanceof LimiteCustoAtingido) return { leads, pesquisas, paragem: e.message };
      if (eErroFatal(e) || ++errosSeguidos >= 5) throw e;
      consola.aviso(`Falhou a pesquisa "${consulta}": ${(e as Error).message}`);
      continue;
    }

    for (const r of resultados) {
      const nomeNorm = normalizarNomeNegocio(r.displayName?.text ?? "");
      if (!nomeNorm) continue;
      if (!nomesVistos.has(nomeNorm)) nomesVistos.set(nomeNorm, new Set());
      nomesVistos.get(nomeNorm)!.add(r.id);
    }

    for (const bruto of resultados) {
      if (leads.length >= alvo) break;
      if (vistos.has(bruto.id)) continue;
      vistos.add(bruto.id);
      if (db.eLead(bruto.id)) continue; // já entrou numa folha anterior
      if (db.descartadoRecentemente(bruto.id, f.diasParaVoltarAVerificarDescartados)) continue;

      const nome = bruto.displayName?.text ?? "";
      const basico = filtrosBasicos(bruto, f);
      if (!basico.ok) {
        descartar(bruto, categoria, cidade, basico.filtro, basico.motivo);
        continue;
      }
      const telBruto = telefoneDoLugar(bruto)!;
      if (bloqueio.bloqueado(bruto.id, telBruto.internacional)) {
        descartar(bruto, categoria, cidade, 8, "está na lista de bloqueio", false);
        continue;
      }
      const cadeia = eCadeiaConhecida(nome, cadeias);
      if (cadeia) {
        descartar(bruto, categoria, cidade, 5, `cadeia/franquia conhecida (${cadeia})`);
        continue;
      }
      const nomeNorm = normalizarNomeNegocio(nome);
      const ids = nomesVistos.get(nomeNorm);
      if (ids && [...ids].some((id) => id !== bruto.id)) {
        descartar(bruto, categoria, cidade, 5, "o mesmo nome aparece noutro local");
        continue;
      }

      consola.progresso(leads.length, alvo, `a verificar ${nome}, ${cidade.nome}…`);
      try {
        // Place Details: dados frescos com o field mask completo; volta a aplicar os filtros 1–4.
        const lugar = await servicos.detalhes(bruto.id);
        const confirmacao = filtrosBasicos(lugar, f);
        if (!confirmacao.ok) {
          descartar(lugar, categoria, cidade, confirmacao.filtro, confirmacao.motivo);
          continue;
        }
        const tel = telefoneDoLugar(lugar)!;
        if (bloqueio.bloqueado(lugar.id, tel.internacional)) {
          descartar(lugar, categoria, cidade, 8, "está na lista de bloqueio", false);
          continue;
        }
        const nomeFinal = lugar.displayName?.text ?? nome;

        if (f.verificarNomeDuplicadoEmPortugal) {
          const homonimo = nomeRepetidoNoutroLocal(lugar, await servicos.pesquisarNome(nomeFinal));
          if (homonimo) {
            descartar(lugar, categoria, cidade, 5, `o mesmo nome existe noutro local (${homonimo.formattedAddress ?? homonimo.id})`);
            continue;
          }
        }

        if (!opcoes.soFiltrosBasicos) {
          if (f.verificacaoDnsHttp) {
            const dnsRes = await servicos.verificarDns(nomeFinal, tel.nacional);
            if (dnsRes.encontrado) {
              descartar(lugar, categoria, cidade, 7, dnsRes.detalhe ?? `tem domínio ${dnsRes.dominio}`);
              continue;
            }
          }
          if (f.verificacaoWeb) {
            contador.verificar("anthropicEstimado", contador.limitePesquisaEur, servicos.estimativaVerificacaoUsd());
            const web = await servicos.verificarWeb({
              nome: nomeFinal,
              cidade: cidade.nome,
              morada: lugar.formattedAddress,
              telefone: tel.legivel,
              setor: categoria.setor,
            });
            if (!web.aprovado) {
              descartar(lugar, categoria, cidade, 6, `verificação web: ${web.motivo} (confiança ${web.verificacao.confianca})`);
              continue;
            }
          }
        }

        leads.push({
          lugar,
          nome: nomeFinal,
          telefone: tel,
          categoria,
          cidade,
          pontuacao: pontuar({ rating: lugar.rating ?? 0, userRatingCount: lugar.userRatingCount ?? 0, priceLevel: lugar.priceLevel }, f.minNota),
        });
        consola.ok(`Aprovado: ${nomeFinal}, ${cidade.nome} (${categoria.setor}) — ${leads.length}/${alvo}`);
        errosSeguidos = 0;
      } catch (e) {
        if (e instanceof LimiteCustoAtingido) return { leads, pesquisas, paragem: e.message };
        if (eErroFatal(e) || ++errosSeguidos >= 5) throw e;
        descartar(bruto, categoria, cidade, "erro", `erro na verificação: ${(e as Error).message}`, false);
      }
    }
  }
  return leads.length >= alvo
    ? { leads, pesquisas }
    : { leads, pesquisas, paragem: "esgotaram-se as combinações categoria × cidade" };
}

export interface LeadDistribuido extends Lead {
  numero: number;
  versao: Versao;
  bloco: string;
  saudacao: string;
}

/**
 * Etapa 4 + distribuição: ordena por pontuação; alterna A/B pela ordem; a primeira metade fica no
 * bloco da manhã e a segunda no da tarde (cada bloco fica com A/B equilibrado).
 */
export function ordenarEDistribuir(leads: Lead[], blocoManha: string, blocoTarde: string): LeadDistribuido[] {
  const ordenados = [...leads].sort((a, b) => b.pontuacao - a.pontuacao || (b.lugar.userRatingCount ?? 0) - (a.lugar.userRatingCount ?? 0));
  const metade = Math.ceil(ordenados.length / 2);
  return ordenados.map((l, i) => {
    const manha = i < metade;
    return {
      ...l,
      numero: i + 1,
      versao: i % 2 === 0 ? "A" : "B",
      bloco: manha ? blocoManha : blocoTarde,
      saudacao: manha ? "bom dia" : "boa tarde",
    };
  });
}

export function pedidosMensagens(leads: LeadDistribuido[]): PedidoMensagem[] {
  return leads.map((l) => ({
    id: l.numero,
    nome: l.nome,
    cidade: l.cidade.nome,
    setor: l.categoria.setor,
    versao: l.versao,
    saudacao: l.saudacao,
  }));
}

export function construirLinhas(leads: LeadDistribuido[], mensagens: Map<number, MensagemGerada>, estadoInicial: string): LinhaFolha[] {
  return leads.map((l) => {
    const m = mensagens.get(l.numero);
    const texto = m?.texto ?? "";
    const notas = !m
      ? "ATENÇÃO: não foi possível gerar a mensagem — escreva-a à mão."
      : m.problemas.length
        ? `ATENÇÃO: rever a mensagem (${m.problemas.join("; ")}).`
        : "";
    return {
      numero: l.numero,
      bloco: l.bloco,
      negocio: l.nome,
      setor: l.categoria.setor,
      cidade: l.cidade.nome,
      telemovel: l.telefone.legivel,
      nota: l.lugar.rating ?? 0,
      avaliacoes: l.lugar.userRatingCount ?? 0,
      preco: rotuloPreco(l.lugar.priceLevel),
      linkMaps: l.lugar.googleMapsUri ?? "",
      versao: l.versao,
      mensagem: texto,
      telefone: l.telefone,
      linkWhatsApp: texto ? linkWhatsApp(l.telefone, texto) : "",
      estado: estadoInicial,
      notas,
    };
  });
}
