export interface TelefoneNormalizado {
  /** 9 dígitos, ex.: "912345678" */
  nacional: string;
  /** formato E.164, ex.: "+351912345678" */
  internacional: string;
  /** ex.: "912 345 678" */
  legivel: string;
}

/**
 * Normaliza um número português. Aceita "+351 912 345 678", "00351912345678",
 * "351912345678", "912 345 678", "912-345-678"...
 * Devolve null se não for um número português de 9 dígitos.
 */
export function normalizarTelefone(bruto: string | null | undefined): TelefoneNormalizado | null {
  if (!bruto) return null;
  let digitos = bruto.replace(/[^\d+]/g, "");
  if (digitos.startsWith("+")) {
    if (!digitos.startsWith("+351")) return null;
    digitos = digitos.slice(4);
  } else if (digitos.startsWith("00351")) {
    digitos = digitos.slice(5);
  } else if (digitos.startsWith("00")) {
    return null; // outro indicativo internacional
  } else if (digitos.length === 12 && digitos.startsWith("351")) {
    digitos = digitos.slice(3);
  }
  digitos = digitos.replace(/\D/g, "");
  if (!/^[239]\d{8}$/.test(digitos)) return null;
  return {
    nacional: digitos,
    internacional: `+351${digitos}`,
    legivel: `${digitos.slice(0, 3)} ${digitos.slice(3, 6)} ${digitos.slice(6)}`,
  };
}

/** true se o número (normalizado) é um telemóvel português (91, 92, 93 ou 96 por defeito). */
export function eTelemovel(tel: TelefoneNormalizado | null, prefixos: string[] = ["91", "92", "93", "96"]): boolean {
  return !!tel && prefixos.some((p) => tel.nacional.startsWith(p));
}
