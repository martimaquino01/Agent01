import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { caminho, RAIZ } from "./caminhos.js";

export interface Credenciais {
  googlePlacesApiKey: string;
  anthropicApiKey: string;
  contaServico: { client_email: string; private_key: string; [k: string]: unknown };
  sheetId: string;
}

export class ErroConfiguracao extends Error {}

/** Lê o .env da raiz do projeto. `exigir` indica que variáveis são obrigatórias nesta execução. */
export function carregarCredenciais(exigir: { places?: boolean; anthropic?: boolean; sheets?: boolean } = {}): Partial<Credenciais> {
  dotenv.config({ path: caminho(".env"), quiet: true });
  const faltam: string[] = [];
  const out: Partial<Credenciais> = {};

  const places = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (places) out.googlePlacesApiKey = places;
  else if (exigir.places) faltam.push("GOOGLE_PLACES_API_KEY");

  const anthropic = process.env.ANTHROPIC_API_KEY?.trim();
  if (anthropic) out.anthropicApiKey = anthropic;
  else if (exigir.anthropic) faltam.push("ANTHROPIC_API_KEY");

  if (exigir.sheets) {
    const sheet = process.env.SHEET_ID?.trim();
    if (sheet) out.sheetId = extrairSheetId(sheet);
    else faltam.push("SHEET_ID");

    const conta = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
    if (conta) out.contaServico = lerContaServico(conta);
    else faltam.push("GOOGLE_SERVICE_ACCOUNT_JSON");
  }

  if (faltam.length) {
    throw new ErroConfiguracao(
      `Faltam variáveis no ficheiro .env: ${faltam.join(", ")}.\n` +
        `Copie .env.example para .env e preencha-as (ver README, secção 3).`,
    );
  }
  return out;
}

/** Aceita o ID ou o URL completo da folha. */
export function extrairSheetId(valor: string): string {
  const m = valor.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1]! : valor;
}

function lerContaServico(valor: string): Credenciais["contaServico"] {
  let texto = valor;
  if (!valor.startsWith("{")) {
    const p = path.isAbsolute(valor) ? valor : path.join(RAIZ, valor);
    if (!fs.existsSync(p)) {
      throw new ErroConfiguracao(`GOOGLE_SERVICE_ACCOUNT_JSON aponta para "${p}", mas esse ficheiro não existe.`);
    }
    texto = fs.readFileSync(p, "utf8");
  }
  let json: Credenciais["contaServico"];
  try {
    json = JSON.parse(texto);
  } catch {
    throw new ErroConfiguracao("GOOGLE_SERVICE_ACCOUNT_JSON não é um JSON válido.");
  }
  if (!json.client_email || !json.private_key) {
    throw new ErroConfiguracao("O JSON da conta de serviço não tem client_email/private_key. Descarregou a chave certa?");
  }
  return json;
}
