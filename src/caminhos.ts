import path from "node:path";
import { fileURLToPath } from "node:url";

/** Pasta raiz do projeto (onde estão config.json, .env, data/, logs/). */
export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const caminho = (...partes: string[]) => path.join(RAIZ, ...partes);
