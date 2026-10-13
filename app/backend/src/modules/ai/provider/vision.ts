/**
 * Leitura de imagem: o Gemini olha uma foto (rascunho, print do Promob) e
 * devolve um JSON. Usado para preencher o formulário de medidas do projeto
 * técnico — a pessoa sempre confere antes de salvar.
 *
 * Mesmo padrão do `image.ts`: chave só no servidor (GEMINI_API_KEY) e falha
 * virando `AiProviderError`, sem detalhe interno para a tela.
 */
import { ApiError, GoogleGenAI } from "@google/genai";
import { env } from "../../../config/env";
import { AiProviderError } from "./types";

export type VisionInput = { bytes: Buffer; mime: string; prompt: string };

export interface VisionProvider {
  readonly enabled: boolean;
  /** Devolve o texto da resposta (um JSON, pedido pela instrução). */
  readJson(input: VisionInput): Promise<string>;
}

let client: GoogleGenAI | null = null;

export function visionProvider(): VisionProvider {
  const cfg = env.assistant;
  const enabled = Boolean(cfg.apiKey);
  return {
    enabled,
    async readJson(input) {
      if (!enabled) throw new AiProviderError("Leitura de imagem com IA não configurada (defina GEMINI_API_KEY)");
      client ??= new GoogleGenAI({ apiKey: cfg.apiKey, httpOptions: { timeout: cfg.imageTimeoutMs } });
      try {
        const res = await client.models.generateContent({
          model: cfg.model,
          contents: [{ role: "user", parts: [{ inlineData: { mimeType: input.mime, data: input.bytes.toString("base64") } }, { text: input.prompt }] }],
          // temperatura zero: é leitura de medida, não criação
          config: { temperature: 0, maxOutputTokens: 4000, responseMimeType: "application/json" },
        });
        const text = res.text ?? "";
        if (!text.trim()) throw new AiProviderError("a IA não devolveu resposta (a imagem pode ter sido recusada pelo filtro do modelo)");
        return text;
      } catch (e) {
        if (e instanceof AiProviderError) throw e;
        if (e instanceof ApiError) throw new AiProviderError(`Gemini respondeu HTTP ${e.status}`, e.status === 429 || e.status >= 500, e.status, String(e.message).slice(0, 300));
        if (e instanceof Error && (e.name === "AbortError" || /timeout|timed out/i.test(e.message))) throw new AiProviderError("tempo limite da leitura excedido", true);
        throw new AiProviderError("falha de comunicação com o Gemini", true);
      }
    },
  };
}
