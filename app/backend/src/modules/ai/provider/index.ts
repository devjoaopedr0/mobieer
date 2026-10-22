/**
 * Ponto único de escolha do provedor do assistente.
 *
 * O chat usa o provedor cadastrado em AI_API_KEY (Groq/xAI/OpenRouter, o mesmo
 * do cronograma da produção). O Gemini fica só na geração de imagens (image.ts).
 */
import { openAiCompatibleProvider } from "./openai-compatible";
import type { AiProvider } from "./types";

let current: AiProvider | null = null;

export function aiProvider(): AiProvider {
  if (!current) {
    current = openAiCompatibleProvider();
  }
  return current;
}

export { AiProviderError } from "./types";
export type { AiProvider, ToolCall, ToolDeclaration } from "./types";
