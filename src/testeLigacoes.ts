import { chamarClaude, criarCliente, textoDaResposta } from "./claude.js";
import type { ConfigCompleta } from "./config.js";
import { consola } from "./consola.js";
import { Contador } from "./custo.js";
import { carregarCredenciais } from "./env.js";
import { explicarErro } from "./erros.js";
import { pesquisarTexto } from "./places.js";
import { criarClienteSheets, obterTitulo, urlFolha } from "./sheets.js";

/** Fase 1: testa a ligação às 3 APIs. Custo: 1 pesquisa Places + 1 pedido curto à Anthropic (< 0,05 €). */
export async function testarLigacoes(cfg: ConfigCompleta): Promise<boolean> {
  const { config } = cfg;
  const contador = new Contador(config.custo);
  let tudoOk = true;
  consola.titulo("Teste de ligação às APIs");

  let cred: ReturnType<typeof carregarCredenciais>;
  try {
    cred = carregarCredenciais({});
  } catch (e) {
    consola.erro(explicarErro(e));
    return false;
  }

  // 1. Google Places
  if (!cred.googlePlacesApiKey) {
    consola.erro("Google Places: falta GOOGLE_PLACES_API_KEY no .env");
    tudoOk = false;
  } else {
    try {
      const r = await pesquisarTexto(
        { apiKey: cred.googlePlacesApiKey, idioma: config.pesquisa.idioma, regiao: config.pesquisa.regiao, contador },
        "padaria em Braga",
        { pageSize: 1 },
      );
      consola.ok(`Google Places: OK (ex.: ${r[0]?.displayName?.text ?? "sem resultados"})`);
    } catch (e) {
      consola.erro(`Google Places: ${explicarErro(e)}`);
      tudoOk = false;
    }
  }

  // 2. Anthropic
  if (!cred.anthropicApiKey) {
    consola.erro("Anthropic: falta ANTHROPIC_API_KEY no .env");
    tudoOk = false;
  } else {
    try {
      const r = await chamarClaude(
        { cliente: criarCliente(cred.anthropicApiKey), config: config.anthropic, contador },
        {
          max_tokens: 200,
          output_config: { effort: "low" },
          messages: [{ role: "user", content: "Responde apenas: ligação OK" }],
        },
      );
      consola.ok(`Anthropic (${config.anthropic.modelo}): OK — "${textoDaResposta(r).slice(0, 60)}"`);
    } catch (e) {
      consola.erro(`Anthropic: ${explicarErro(e)}`);
      tudoOk = false;
    }
  }

  // 3. Google Sheets (lê e cria/apaga um separador temporário para confirmar permissão de edição)
  try {
    const c = carregarCredenciais({ sheets: true });
    const sheets = criarClienteSheets(c.contaServico!);
    const { titulo } = await obterTitulo(sheets, c.sheetId!);
    const r = await sheets.spreadsheets.batchUpdate({
      spreadsheetId: c.sheetId!,
      requestBody: { requests: [{ addSheet: { properties: { title: `teste-ligacao-${Date.now()}` } } }] },
    });
    const idTemp = r.data.replies?.[0]?.addSheet?.properties?.sheetId;
    if (idTemp != null) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: c.sheetId!,
        requestBody: { requests: [{ deleteSheet: { sheetId: idTemp } }] },
      });
    }
    consola.ok(`Google Sheets: OK — "${titulo}" (${urlFolha(c.sheetId!)}), com permissão de edição`);
  } catch (e) {
    consola.erro(`Google Sheets: ${explicarErro(e)}`);
    tudoOk = false;
  }

  consola.info(contador.resumo());
  if (tudoOk) consola.ok("Tudo pronto. Próximo passo: npm run ensaio");
  return tudoOk;
}
