/**
 * Leitura de imagem: a IA olha uma foto (rascunho, print do Promob, nota,
 * fatura) e devolve um JSON. A pessoa sempre confere antes de salvar.
 *
 * Usa o provedor cadastrado em AI_API_KEY (Groq, xAI…), com o modelo que lê
 * imagem (AI_VISION_MODEL). O Gemini fica só na geração de imagens (image.ts).
 * PDF não vai para cá: quem chama extrai o texto e manda para a IA de texto.
 */
import { env } from "../../../config/env";
import { AiProviderError } from "./types";

export type VisionInput = { bytes: Buffer; mime: string; prompt: string };

export interface VisionProvider {
  readonly enabled: boolean;
  /** Devolve o texto da resposta (um JSON, pedido pela instrução). */
  readJson(input: VisionInput): Promise<string>;
}

export function visionProvider(): VisionProvider {
  const cfg = env.ai;
  const enabled = Boolean(cfg.apiKey && cfg.visionModel);
  return {
    enabled,
    async readJson(input) {
      if (!enabled) throw new AiProviderError("Leitura de imagem com IA não configurada (defina AI_API_KEY)");
      if (!input.mime.startsWith("image/")) throw new AiProviderError("a leitura por imagem só aceita foto; PDF é lido pelo texto");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(cfg.timeoutMs, 45_000));
      try {
        const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            model: cfg.visionModel,
            // temperatura zero: é leitura, não criação
            temperature: 0,
            max_tokens: 4000,
            response_format: { type: "json_object" },
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: input.prompt },
                  { type: "image_url", image_url: { url: `data:${input.mime};base64,${input.bytes.toString("base64")}` } },
                ],
              },
            ],
          }),
        });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          throw new AiProviderError(`a IA de imagem respondeu HTTP ${res.status}`, res.status === 429 || res.status >= 500, res.status, String(err.error?.message ?? "").slice(0, 300));
        }
        const json = (await res.json().catch(() => ({}))) as { choices?: { message?: { content?: string | null } }[] };
        const text = json.choices?.[0]?.message?.content ?? "";
        if (!text.trim()) throw new AiProviderError("a IA não devolveu resposta para esta imagem");
        return text;
      } catch (e) {
        if (e instanceof AiProviderError) throw e;
        if (e instanceof Error && e.name === "AbortError") throw new AiProviderError("tempo limite da leitura excedido", true);
        throw new AiProviderError("falha de comunicação com a IA de imagem", true);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
