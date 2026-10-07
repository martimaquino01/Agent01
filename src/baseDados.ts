import fs from "node:fs";
import Database from "better-sqlite3";
import { caminho } from "./caminhos.js";

/**
 * Estado local. Por respeito aos termos da Places API guarda apenas:
 * place_id, telefone (para o bloqueio) e estado. Nada de nomes, fotos ou avaliações.
 */
export class BaseDados {
  private db: Database.Database;

  constructor(ficheiro = caminho("data", "estado.sqlite")) {
    fs.mkdirSync(caminho("data"), { recursive: true });
    this.db = new Database(ficheiro);
    this.db.pragma("journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lugares (
        place_id   TEXT PRIMARY KEY,
        telefone   TEXT,
        estado     TEXT NOT NULL,
        atualizado TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_lugares_telefone ON lugares(telefone);
      CREATE TABLE IF NOT EXISTS uso_mensal (
        mes     TEXT NOT NULL,
        sku     TEXT NOT NULL,
        pedidos INTEGER NOT NULL,
        PRIMARY KEY (mes, sku)
      );
    `);
  }

  /** estado: "lead" (entrou numa folha) ou "descartado". */
  guardar(placeId: string, telefone: string | null, estado: "lead" | "descartado"): void {
    this.db
      .prepare(
        `INSERT INTO lugares (place_id, telefone, estado, atualizado) VALUES (?, ?, ?, ?)
         ON CONFLICT(place_id) DO UPDATE SET telefone = excluded.telefone, estado = excluded.estado, atualizado = excluded.atualizado`,
      )
      .run(placeId, telefone, estado, new Date().toISOString());
  }

  /** true se este place_id foi descartado há menos de `dias` dias (evita pagar outra vez a verificação). */
  descartadoRecentemente(placeId: string, dias: number): boolean {
    if (dias <= 0) return false;
    const r = this.db.prepare(`SELECT atualizado FROM lugares WHERE place_id = ? AND estado = 'descartado'`).get(placeId) as
      | { atualizado: string }
      | undefined;
    if (!r) return false;
    return Date.now() - Date.parse(r.atualizado) < dias * 86_400_000;
  }

  eLead(placeId: string): boolean {
    return !!this.db.prepare(`SELECT 1 FROM lugares WHERE place_id = ? AND estado = 'lead'`).get(placeId);
  }

  /** Pedidos feitos este mês a um SKU da Google (só contagens, para estimar a quota gratuita). */
  usoMensal(sku: string, mes = mesAtual()): number {
    const r = this.db.prepare(`SELECT pedidos FROM uso_mensal WHERE mes = ? AND sku = ?`).get(mes, sku) as { pedidos: number } | undefined;
    return r?.pedidos ?? 0;
  }

  incrementarUso(sku: string, mes = mesAtual()): void {
    this.db
      .prepare(
        `INSERT INTO uso_mensal (mes, sku, pedidos) VALUES (?, ?, 1)
         ON CONFLICT(mes, sku) DO UPDATE SET pedidos = pedidos + 1`,
      )
      .run(mes, sku);
  }

  fechar(): void {
    this.db.close();
  }
}

/** Mês de faturação da Google (UTC-8, hora do Pacífico), no formato AAAA-MM. */
export function mesAtual(d = new Date()): string {
  const pacifico = new Date(d.getTime() - 8 * 3_600_000);
  return `${pacifico.getUTCFullYear()}-${String(pacifico.getUTCMonth() + 1).padStart(2, "0")}`;
}
