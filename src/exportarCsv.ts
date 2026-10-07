import fs from "node:fs";
import { caminho } from "./caminhos.js";
import { CABECALHO, type LinhaFolha } from "./sheets.js";

const esc = (s: string | number) => {
  const t = String(s ?? "");
  return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Grava as linhas num CSV (separador ";", com BOM para abrir bem no Excel). Devolve o caminho. */
export function exportarCsv(linhas: LinhaFolha[], prefixo: string, carimbo: string): string {
  fs.mkdirSync(caminho("out"), { recursive: true });
  const ficheiro = caminho("out", `${prefixo}-${carimbo.replace(/[^\dA-Za-z-]+/g, "_")}.csv`);
  const corpo = linhas.map((l) =>
    [
      l.numero,
      l.bloco,
      l.negocio,
      l.setor,
      l.cidade,
      l.telemovel,
      String(l.nota).replace(".", ","),
      l.avaliacoes,
      l.preco,
      l.linkMaps,
      l.versao,
      l.mensagem,
      l.linkWhatsApp,
      l.estado,
      l.notas,
    ]
      .map(esc)
      .join(";"),
  );
  fs.writeFileSync(ficheiro, "\uFEFF" + [CABECALHO.join(";"), ...corpo].join("\r\n") + "\r\n", "utf8");
  return ficheiro;
}
