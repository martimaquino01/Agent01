import Anthropic from "@anthropic-ai/sdk";
import { ErroConfiguracao } from "./env.js";
import { ErroPlaces } from "./places.js";

/** Converte erros técnicos numa explicação em português com o próximo passo. */
export function explicarErro(e: unknown): string {
  if (e instanceof ErroConfiguracao) return e.message;
  if (e instanceof ErroPlaces) {
    if (e.estado === 403 || /not been used|disabled|PERMISSION_DENIED/i.test(e.message)) {
      return `Google Places recusou o pedido (${e.estado}). Confirme que a "Places API (New)" está ativada no projeto, que a faturação está ligada e que as restrições da chave permitem a Places API (New).\nDetalhe: ${e.message}`;
    }
    if (/api key/i.test(e.message)) return `A chave GOOGLE_PLACES_API_KEY não é válida.\nDetalhe: ${e.message}`;
    if (e.estado === 429) return `Quota da Google Places esgotada (429). Verifique as quotas/limites no Google Cloud.\nDetalhe: ${e.message}`;
    return e.message;
  }
  if (e instanceof Anthropic.AuthenticationError) return "A chave ANTHROPIC_API_KEY não é válida (401). Gere uma nova na Claude Console.";
  if (e instanceof Anthropic.PermissionDeniedError) return `A Anthropic recusou o pedido (403): ${e.message}`;
  if (e instanceof Anthropic.RateLimitError) return "Limite de pedidos da Anthropic atingido (429). Espere uns minutos e tente de novo.";
  if (e instanceof Anthropic.BadRequestError && /credit balance/i.test(e.message)) {
    return "A conta da Anthropic não tem créditos. Carregue créditos em Claude Console → Billing.";
  }
  if (e instanceof Anthropic.APIError) return `Erro da API da Anthropic (${e.status ?? "?"}): ${e.message}`;

  const g = e as { code?: number; message?: string; response?: { status?: number } };
  const status = g?.response?.status ?? g?.code;
  if (status === 403 && /permission/i.test(g.message ?? "")) {
    return "A conta de serviço não tem acesso à folha. Partilhe a Google Sheet com o e-mail da conta de serviço (client_email) como Editor — ver README, secção 3.3.";
  }
  if (status === 404) return "Não encontrei a Google Sheet. Confirme o SHEET_ID no .env.";
  if (status === 403 && /has not been used|disabled/i.test(g.message ?? "")) {
    return `A Google Sheets API não está ativada no projeto da conta de serviço.\nDetalhe: ${g.message}`;
  }
  return (e as Error)?.message ?? String(e);
}
