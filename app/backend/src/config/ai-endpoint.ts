/**
 * Descobre o endereço e o modelo do provedor de IA a partir da chave.
 *
 * O formato da chave diz de quem ela é (Groq começa com "gsk_", OpenRouter com
 * "sk-or-", xAI com "xai-"). Assim basta configurar AI_API_KEY: se AI_BASE_URL
 * estiver vazio ou apontar para outro provedor (o erro mais comum ao copiar
 * variáveis para o servidor), o endereço certo é usado no lugar.
 */

type Known = { name: string; prefix: string; host: string; baseUrl: string; model: string; /** modelo que lê imagem */ visionModel: string };

const PROVIDERS: Known[] = [
  { name: "Groq", prefix: "gsk_", host: "api.groq.com", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", visionModel: "qwen/qwen3.8-27b" },
  { name: "OpenRouter", prefix: "sk-or-", host: "openrouter.ai", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini", visionModel: "openai/gpt-4o-mini" },
  { name: "xAI", prefix: "xai-", host: "api.x.ai", baseUrl: "https://api.x.ai/v1", model: "grok-2-latest", visionModel: "grok-2-vision-latest" },
  // por último: "sk-" sozinho é o formato da OpenAI (e de vários compatíveis)
  { name: "OpenAI", prefix: "sk-", host: "api.openai.com", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini", visionModel: "gpt-4o-mini" },
];

export type AiEndpoint = { baseUrl: string; model: string; visionModel: string; provider: string; /** true quando o endereço informado foi trocado pelo do provedor da chave */ adjusted: boolean };

const hostOf = (url: string) => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
};

export function resolveAiEndpoint(apiKey: string, baseUrl?: string | null, model?: string | null, visionModel?: string | null): AiEndpoint {
  const base = resolveText(apiKey, baseUrl, model);
  const known = PROVIDERS.find((p) => apiKey.trim().startsWith(p.prefix) && p.baseUrl === base.baseUrl);
  return { ...base, visionModel: (visionModel ?? "").trim() || known?.visionModel || base.model };
}

function resolveText(apiKey: string, baseUrl?: string | null, model?: string | null): Omit<AiEndpoint, "visionModel"> {
  const key = apiKey.trim();
  const url = (baseUrl ?? "").trim().replace(/\/$/, "");
  const mdl = (model ?? "").trim();
  const known = PROVIDERS.find((p) => key.startsWith(p.prefix));

  // chave de formato desconhecido: vale o que foi configurado
  if (!known) return { baseUrl: url || "https://api.openai.com/v1", model: mdl || "gpt-4o-mini", provider: hostOf(url) || "OpenAI", adjusted: false };

  const host = hostOf(url);
  // "sk-" serve para vários provedores compatíveis: com endereço informado, ele manda
  const generic = known.name === "OpenAI";
  if (url && (host === known.host || generic)) return { baseUrl: url, model: mdl || known.model, provider: host === known.host ? known.name : host, adjusted: false };

  // sem endereço, ou endereço de outro provedor: usa o da chave. O modelo informado
  // era do outro provedor, então só vale quando não havia endereço nenhum.
  return { baseUrl: known.baseUrl, model: !url && mdl ? mdl : known.model, provider: known.name, adjusted: Boolean(url) };
}
