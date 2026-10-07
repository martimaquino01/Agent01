import { google, type sheets_v4 } from "googleapis";
import type { Credenciais } from "./env.js";
import type { TelefoneNormalizado } from "./telefone.js";
import { formulaHiperligacao, formulaWhatsApp } from "./whatsapp.js";

export const CABECALHO = [
  "Nº",
  "Bloco",
  "Negócio",
  "Setor",
  "Cidade",
  "Telemóvel",
  "Nota",
  "Nº avaliações",
  "Preço Google",
  "Link Google Maps",
  "Versão (A/B)",
  "Mensagem",
  "Abrir no WhatsApp",
  "Estado",
  "Notas",
] as const;

const LARGURAS = [40, 130, 220, 150, 130, 110, 55, 100, 90, 120, 85, 440, 150, 130, 220];
const COL = { setor: 3, versao: 10, mensagem: 11, estado: 13 } as const;

export const NOME_RESUMO = "Resumo";
export const NOME_TODAS = "Todas";
/** Separadores criados pelo agente: "AAAA-MM-DD HHhMM" (com sufixo opcional " (2)"). */
export const PADRAO_SEPARADOR = /^\d{4}-\d{2}-\d{2} \d{2}h\d{2}( \(\d+\))?$/;

export interface LinhaFolha {
  numero: number;
  bloco: string;
  negocio: string;
  setor: string;
  cidade: string;
  telemovel: string;
  nota: number;
  avaliacoes: number;
  preco: string;
  linkMaps: string;
  versao: string;
  mensagem: string;
  telefone: TelefoneNormalizado;
  /** Link wa.me com o texto já codificado (usado no CSV; na folha a fórmula lê a célula da mensagem). */
  linkWhatsApp: string;
  estado: string;
  notas: string;
}

export function criarClienteSheets(conta: Credenciais["contaServico"]): sheets_v4.Sheets {
  const auth = new google.auth.JWT({
    email: conta.client_email,
    key: conta.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  return google.sheets({ version: "v4", auth });
}

/** Nome do separador a partir da data: "2026-10-07 10h30". */
export function nomeSeparador(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}h${p(d.getMinutes())}`;
}

/** Referência a um intervalo com o nome do separador entre plicas. */
export const ref = (separador: string, intervalo: string) => `'${separador.replace(/'/g, "''")}'!${intervalo}`;

/** Evita que texto vindo do Google seja interpretado como fórmula. */
const texto = (s: string) => (/^[=+\-@]/.test(s) ? `'${s}` : s);

const cor = (hex: string): sheets_v4.Schema$Color => ({
  red: parseInt(hex.slice(1, 3), 16) / 255,
  green: parseInt(hex.slice(3, 5), 16) / 255,
  blue: parseInt(hex.slice(5, 7), 16) / 255,
});

const CORES_ESTADO: Record<string, string> = {
  "Por enviar": "#F3F3F3",
  Enviado: "#CFE2F3",
  Respondeu: "#FFF2CC",
  Interessado: "#D9EAD3",
  "Não interessado": "#F4CCCC",
  Cliente: "#93C47D",
};
const PALETA_EXTRA = ["#EAD1DC", "#D0E0E3", "#FCE5CD", "#D9D2E9"];

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export async function obterTitulo(sheets: sheets_v4.Sheets, id: string): Promise<{ titulo: string; separadores: string[] }> {
  const r = await sheets.spreadsheets.get({ spreadsheetId: id, fields: "properties.title,sheets.properties.title" });
  return {
    titulo: r.data.properties?.title ?? "(sem título)",
    separadores: (r.data.sheets ?? []).map((s) => s.properties?.title ?? ""),
  };
}

function nomeUnico(base: string, existentes: string[]): string {
  if (!existentes.includes(base)) return base;
  for (let i = 2; ; i++) if (!existentes.includes(`${base} (${i})`)) return `${base} (${i})`;
}

/** Valores de uma linha; `linha` é o número da linha na folha (2 = primeira linha de dados). */
export function linhaParaValores(l: LinhaFolha, linha: number): (string | number)[] {
  return [
    l.numero,
    l.bloco,
    texto(l.negocio),
    texto(l.setor),
    texto(l.cidade),
    l.telemovel,
    l.nota,
    l.avaliacoes,
    l.preco,
    l.linkMaps ? formulaHiperligacao(l.linkMaps, "Ver no Maps") : "",
    l.versao,
    texto(l.mensagem),
    l.mensagem ? formulaWhatsApp(l.telefone, `L${linha}`) : "",
    l.estado,
    texto(l.notas),
  ];
}

/** Pedidos de formatação de um separador de execução. */
function formatacaoExecucao(sheetId: number, nLinhas: number, estados: string[]): sheets_v4.Schema$Request[] {
  const pedidos: sheets_v4.Schema$Request[] = [];
  const total = nLinhas + 1;
  pedidos.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
      fields: "gridProperties.frozenRowCount",
    },
  });
  // Cabeçalho
  pedidos.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
      cell: {
        userEnteredFormat: {
          textFormat: { bold: true, foregroundColor: cor("#FFFFFF") },
          backgroundColor: cor("#1F3B57"),
          wrapStrategy: "WRAP",
          verticalAlignment: "MIDDLE",
        },
      },
      fields: "userEnteredFormat(textFormat,backgroundColor,wrapStrategy,verticalAlignment)",
    },
  });
  // Linhas: alinhadas ao topo; mensagem com quebra de linha
  pedidos.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: total },
      cell: { userEnteredFormat: { verticalAlignment: "TOP" } },
      fields: "userEnteredFormat.verticalAlignment",
    },
  });
  pedidos.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: total, startColumnIndex: COL.mensagem, endColumnIndex: COL.mensagem + 1 },
      cell: { userEnteredFormat: { wrapStrategy: "WRAP" } },
      fields: "userEnteredFormat.wrapStrategy",
    },
  });
  pedidos.push({
    repeatCell: {
      range: { sheetId, startRowIndex: 1, endRowIndex: total, startColumnIndex: 6, endColumnIndex: 7 },
      cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0.0" } } },
      fields: "userEnteredFormat.numberFormat",
    },
  });
  // Larguras
  LARGURAS.forEach((px, i) =>
    pedidos.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: px },
        fields: "pixelSize",
      },
    }),
  );
  // Lista pendente do Estado
  pedidos.push({
    setDataValidation: {
      range: { sheetId, startRowIndex: 1, endRowIndex: total, startColumnIndex: COL.estado, endColumnIndex: COL.estado + 1 },
      rule: {
        condition: { type: "ONE_OF_LIST", values: estados.map((e) => ({ userEnteredValue: e })) },
        showCustomUi: true,
        strict: true,
      },
    },
  });
  // Cor da linha conforme o estado
  estados.forEach((estado, i) => {
    const hex = CORES_ESTADO[estado] ?? PALETA_EXTRA[i % PALETA_EXTRA.length]!;
    pedidos.push({
      addConditionalFormatRule: {
        index: i,
        rule: {
          ranges: [{ sheetId, startRowIndex: 1, endRowIndex: total, startColumnIndex: 0, endColumnIndex: CABECALHO.length }],
          booleanRule: {
            condition: { type: "CUSTOM_FORMULA", values: [{ userEnteredValue: `=$N2="${estado.replace(/"/g, '""')}"` }] },
            format: { backgroundColor: cor(hex) },
          },
        },
      },
    });
  });
  return pedidos;
}

/** Fórmulas da folha auxiliar "Todas", que junta as linhas de todas as execuções. */
export function formulasTodas(separadores: string[], estados: string[]): { a2: string; p2: string; q2: string; r2: string } {
  const blocos = separadores.map((s) => ref(s, "A2:O"));
  const a2 = blocos.length
    ? `=IFERROR(QUERY({${blocos.join(";")}}, "select * where Col3 is not null", 0), "")`
    : `=""`;
  const re = (lista: string[]) => `"^(${lista.map(escaparRegex).join("|")})$"`;
  const enviados = estados.slice(1); // tudo menos "Por enviar"
  const respostas = estados.slice(2); // tudo a partir de "Respondeu"
  const interessados = estados.filter((e) => /^(interessado|cliente)$/i.test(e));
  const flag = (lista: string[]) =>
    lista.length ? `=ARRAYFORMULA(IF(C2:C="", "", IF(REGEXMATCH(N2:N, ${re(lista)}), 1, 0)))` : `=""`;
  return { a2, p2: flag(enviados), q2: flag(respostas), r2: flag(interessados) };
}

function valoresResumo(): (string | number)[][] {
  const T = (c: string) => ref(NOME_TODAS, c);
  const linhaVersao = (r: number) => [
    `=COUNTIF(${T("K2:K")}, A${r})`,
    `=SUMIFS(${T("P2:P")}, ${T("K2:K")}, A${r})`,
    `=SUMIFS(${T("Q2:Q")}, ${T("K2:K")}, A${r})`,
    `=IF(C${r}=0, "", D${r}/C${r})`,
    `=SUMIFS(${T("R2:R")}, ${T("K2:K")}, A${r})`,
    `=COUNTIFS(${T("K2:K")}, A${r}, ${T("N2:N")}, "Cliente")`,
  ];
  const taxaVersaoSetor = (v: string) =>
    `=ARRAYFORMULA(IF(A12:A="", "", IFERROR(SUMIFS(${T("Q2:Q")}, ${T("D2:D")}, A12:A, ${T("K2:K")}, "${v}") / SUMIFS(${T("P2:P")}, ${T("D2:D")}, A12:A, ${T("K2:K")}, "${v}"), "")))`;
  return [
    ["Resumo de todas as execuções"],
    ["Atualiza sozinho quando muda o Estado nos separadores de cada execução. Enviados = tudo menos \"Por enviar\"; respostas = Respondeu, Interessado, Não interessado ou Cliente."],
    [],
    ["Versão", "Leads", "Enviados", "Respostas", "Taxa de resposta", "Interessados + clientes", "Clientes"],
    ["A", ...linhaVersao(5)],
    ["B", ...linhaVersao(6)],
    ["Total", "=SUM(B5:B6)", "=SUM(C5:C6)", "=SUM(D5:D6)", `=IF(C7=0, "", D7/C7)`, "=SUM(F5:F6)", "=SUM(G5:G6)"],
    [],
    [],
    ["Por setor"],
    ["Setor", "Leads", "Enviados", "Respostas", "Taxa de resposta", "Taxa versão A", "Taxa versão B"],
    [
      `=IFERROR(SORT(UNIQUE(FILTER(${T("D2:D")}, ${T("D2:D")}<>""))), "")`,
      `=ARRAYFORMULA(IF(A12:A="", "", COUNTIF(${T("D2:D")}, A12:A)))`,
      `=ARRAYFORMULA(IF(A12:A="", "", SUMIFS(${T("P2:P")}, ${T("D2:D")}, A12:A)))`,
      `=ARRAYFORMULA(IF(A12:A="", "", SUMIFS(${T("Q2:Q")}, ${T("D2:D")}, A12:A)))`,
      `=ARRAYFORMULA(IF(A12:A="", "", IF(C12:C=0, "", D12:D/C12:C)))`,
      taxaVersaoSetor("A"),
      taxaVersaoSetor("B"),
    ],
  ];
}

async function garantirFolhasFixas(sheets: sheets_v4.Sheets, id: string, existentes: string[]): Promise<void> {
  const pedidos: sheets_v4.Schema$Request[] = [];
  if (!existentes.includes(NOME_TODAS)) {
    pedidos.push({ addSheet: { properties: { title: NOME_TODAS, hidden: true, gridProperties: { frozenRowCount: 1 } } } });
  }
  const criarResumo = !existentes.includes(NOME_RESUMO);
  if (criarResumo) pedidos.push({ addSheet: { properties: { title: NOME_RESUMO, index: 0 } } });
  if (!pedidos.length) return;

  const r = await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: pedidos } });
  if (!existentes.includes(NOME_TODAS)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: ref(NOME_TODAS, "A1"),
      valueInputOption: "RAW",
      requestBody: { values: [[...CABECALHO, "Enviado?", "Respondeu?", "Interessado?"]] },
    });
  }
  if (criarResumo) {
    const resumoId = r.data.replies?.map((x) => x.addSheet?.properties).find((p) => p?.title === NOME_RESUMO)?.sheetId;
    await sheets.spreadsheets.values.update({
      spreadsheetId: id,
      range: ref(NOME_RESUMO, "A1"),
      valueInputOption: "USER_ENTERED",
      requestBody: { values: valoresResumo() },
    });
    if (resumoId != null) {
      const pct = (r0: number, r1: number | undefined, c0: number, c1: number): sheets_v4.Schema$Request => ({
        repeatCell: {
          range: { sheetId: resumoId, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 },
          cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: "0.0%" } } },
          fields: "userEnteredFormat.numberFormat",
        },
      });
      const negrito = (linha: number): sheets_v4.Schema$Request => ({
        repeatCell: {
          range: { sheetId: resumoId, startRowIndex: linha, endRowIndex: linha + 1 },
          cell: { userEnteredFormat: { textFormat: { bold: true } } },
          fields: "userEnteredFormat.textFormat",
        },
      });
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: id,
        requestBody: {
          requests: [
            pct(4, 7, 4, 5),
            pct(11, undefined, 4, 7),
            negrito(0),
            negrito(3),
            negrito(6),
            negrito(9),
            negrito(10),
            {
              updateDimensionProperties: {
                range: { sheetId: resumoId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
                properties: { pixelSize: 200 },
                fields: "pixelSize",
              },
            },
            {
              updateDimensionProperties: {
                range: { sheetId: resumoId, dimension: "COLUMNS", startIndex: 1, endIndex: 7 },
                properties: { pixelSize: 130 },
                fields: "pixelSize",
              },
            },
          ],
        },
      });
    }
  }
}

/** Atualiza a folha "Todas" para incluir todos os separadores de execuções existentes. */
async function atualizarTodas(sheets: sheets_v4.Sheets, id: string, estados: string[]): Promise<void> {
  const r = await sheets.spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties(sheetId,title,gridProperties.rowCount)" });
  const props = (r.data.sheets ?? []).map((s) => s.properties ?? {});
  const execucoes = props.filter((p) => PADRAO_SEPARADOR.test(p.title ?? ""));
  const todas = props.find((p) => p.title === NOME_TODAS);
  // A fórmula que junta tudo precisa de linhas suficientes para "espalhar" o resultado.
  const linhasNecessarias = execucoes.reduce((t, p) => t + (p.gridProperties?.rowCount ?? 0), 0) + 50;
  if (todas?.sheetId != null && (todas.gridProperties?.rowCount ?? 0) < linhasNecessarias) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: id,
      requestBody: {
        requests: [
          {
            updateSheetProperties: {
              properties: { sheetId: todas.sheetId, gridProperties: { rowCount: linhasNecessarias } },
              fields: "gridProperties.rowCount",
            },
          },
        ],
      },
    });
  }
  const f = formulasTodas(execucoes.map((p) => p.title!).sort(), estados);
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: "USER_ENTERED",
      data: [
        { range: ref(NOME_TODAS, "A2"), values: [[f.a2]] },
        { range: ref(NOME_TODAS, "P2:R2"), values: [[f.p2, f.q2, f.r2]] },
      ],
    },
  });
}

/**
 * Cria um separador novo com as linhas desta execução, formata-o e atualiza o Resumo.
 * Devolve o nome do separador criado.
 */
export async function escreverExecucao(
  sheets: sheets_v4.Sheets,
  id: string,
  base: string,
  linhas: LinhaFolha[],
  estados: string[],
): Promise<string> {
  const { separadores } = await obterTitulo(sheets, id);
  await garantirFolhasFixas(sheets, id, separadores);
  const nome = nomeUnico(base, separadores);

  const r = await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      requests: [
        {
          addSheet: {
            properties: {
              title: nome,
              index: 1,
              gridProperties: { rowCount: Math.max(linhas.length + 1, 2), columnCount: CABECALHO.length },
            },
          },
        },
      ],
    },
  });
  const sheetId = r.data.replies?.[0]?.addSheet?.properties?.sheetId;
  if (sheetId == null) throw new Error("A Google Sheets não devolveu o ID do separador criado.");

  await sheets.spreadsheets.values.update({
    spreadsheetId: id,
    range: ref(nome, "A1"),
    valueInputOption: "USER_ENTERED",
    requestBody: { values: [[...CABECALHO], ...linhas.map((l, i) => linhaParaValores(l, i + 2))] },
  });

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: id,
    requestBody: { requests: formatacaoExecucao(sheetId, linhas.length, estados) },
  });

  await atualizarTodas(sheets, id, estados);
  return nome;
}

export function urlFolha(id: string): string {
  return `https://docs.google.com/spreadsheets/d/${id}/edit`;
}
