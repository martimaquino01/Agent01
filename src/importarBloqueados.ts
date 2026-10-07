/**
 * Acrescenta à lista de bloqueio todos os números de telefone portugueses encontrados
 * num ou mais ficheiros (CSV, TXT, exportações de folhas antigas...).
 *
 *   npm run importar-bloqueados -- "C:\caminho\lista-antiga.csv" [outro.csv ...]
 */
import fs from "node:fs";
import { ListaBloqueio } from "./bloqueio.js";
import { normalizarTelefone } from "./telefone.js";

const ficheiros = process.argv.slice(2);
if (!ficheiros.length) {
  console.log('Uso: npm run importar-bloqueados -- "caminho\\para\\ficheiro.csv" [mais ficheiros...]');
  process.exit(1);
}

const lista = new ListaBloqueio();
let encontrados = 0;
let novos = 0;
for (const f of ficheiros) {
  if (!fs.existsSync(f)) {
    console.error(`Não encontrei: ${f}`);
    continue;
  }
  const texto = fs.readFileSync(f, "utf8");
  // Sequências que parecem telefones: +351 912 345 678, 00351..., 912345678, 912-345-678
  const candidatos = texto.match(/(?:\+|00)?(?:351[\s.-]?)?\d{3}[\s.-]?\d{3}[\s.-]?\d{3}/g) ?? [];
  const tels = [...new Set(candidatos.map((c) => normalizarTelefone(c)?.internacional).filter((t): t is string => !!t))];
  encontrados += tels.length;
  novos += lista.acrescentar(tels.map((telefone) => ({ telefone, nota: `importado de ${f.split(/[\\/]/).pop()}` })));
  console.log(`${f}: ${tels.length} números encontrados`);
}
console.log(`Total: ${encontrados} números, ${novos} novos acrescentados a data/bloqueados.csv`);
