import fs from "node:fs";
import path from "node:path";
import { caminho } from "./caminhos.js";

const esc = (s: string | number | undefined) => {
  const t = String(s ?? "");
  return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

export interface Descarte {
  placeId: string;
  negocio: string;
  cidade: string;
  setor: string;
  filtro: number | string;
  motivo: string;
}

/** Ficheiro logs/descartados-AAAA-MM-DD.csv com o motivo de cada descarte (separador ";", abre direto no Excel em português). */
export class RegistoDescartes {
  readonly ficheiro: string;
  total = 0;
  readonly porFiltro = new Map<string, number>();

  constructor(data = new Date(), pasta = caminho("logs")) {
    const p = (n: number) => String(n).padStart(2, "0");
    const dia = `${data.getFullYear()}-${p(data.getMonth() + 1)}-${p(data.getDate())}`;
    fs.mkdirSync(pasta, { recursive: true });
    this.ficheiro = path.join(pasta, `descartados-${dia}.csv`);
    if (!fs.existsSync(this.ficheiro)) {
      fs.writeFileSync(this.ficheiro, "\uFEFFhora;place_id;negocio;cidade;setor;filtro;motivo\n", "utf8");
    }
  }

  registar(d: Descarte): void {
    this.total++;
    const chave = String(d.filtro);
    this.porFiltro.set(chave, (this.porFiltro.get(chave) ?? 0) + 1);
    const hora = new Date().toLocaleTimeString("pt-PT");
    fs.appendFileSync(this.ficheiro, [hora, d.placeId, d.negocio, d.cidade, d.setor, d.filtro, d.motivo].map(esc).join(";") + "\n", "utf8");
  }
}
