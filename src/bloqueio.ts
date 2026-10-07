import fs from "node:fs";
import { caminho } from "./caminhos.js";
import { normalizarTelefone } from "./telefone.js";

export const FICHEIRO_BLOQUEADOS = caminho("data", "bloqueados.csv");
const CABECALHO = "tipo,valor,nota";

const escaparCsv = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * Lista de bloqueio permanente (data/bloqueados.csv). Formato:
 *   tipo,valor,nota
 *   telefone,+351962697356,Moto Kit
 *   place_id,ChIJ...,Cliente antigo
 * Também aceita linhas só com um número de telefone.
 */
export class ListaBloqueio {
  readonly telefones = new Set<string>();
  readonly placeIds = new Set<string>();

  constructor(private readonly ficheiro = FICHEIRO_BLOQUEADOS) {
    if (!fs.existsSync(ficheiro)) fs.writeFileSync(ficheiro, `${CABECALHO}\n`, "utf8");
    const linhas = fs.readFileSync(ficheiro, "utf8").split(/\r?\n/);
    for (const linha of linhas) {
      const [a, b] = linha.split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
      if (!a || a === "tipo") continue;
      if (a === "place_id" && b) this.placeIds.add(b);
      else if (a === "telefone" && b) this.adicionarTelefoneEmMemoria(b);
      else this.adicionarTelefoneEmMemoria(a);
    }
  }

  private adicionarTelefoneEmMemoria(bruto: string): boolean {
    const t = normalizarTelefone(bruto);
    if (!t) return false;
    this.telefones.add(t.internacional);
    return true;
  }

  bloqueado(placeId: string, telefoneInternacional: string | null): boolean {
    return this.placeIds.has(placeId) || (!!telefoneInternacional && this.telefones.has(telefoneInternacional));
  }

  /** Acrescenta entradas ao CSV (ignorando as que já lá estão). Devolve quantas foram acrescentadas. */
  acrescentar(entradas: { placeId?: string; telefone?: string; nota?: string }[]): number {
    const novas: string[] = [];
    for (const e of entradas) {
      if (e.placeId && !this.placeIds.has(e.placeId)) {
        this.placeIds.add(e.placeId);
        novas.push(["place_id", e.placeId, escaparCsv(e.nota ?? "")].join(","));
      }
      const t = e.telefone ? normalizarTelefone(e.telefone) : null;
      if (t && !this.telefones.has(t.internacional)) {
        this.telefones.add(t.internacional);
        novas.push(["telefone", t.internacional, escaparCsv(e.nota ?? "")].join(","));
      }
    }
    if (novas.length) {
      const atual = fs.readFileSync(this.ficheiro, "utf8");
      const sep = atual.length && !atual.endsWith("\n") ? "\n" : "";
      fs.appendFileSync(this.ficheiro, sep + novas.join("\n") + "\n", "utf8");
    }
    return novas.length;
  }
}
