/**
 * GET /api/cep/:cep — endereço pelo CEP, para preencher o cadastro.
 * Consulta o ViaCEP; se ele não responder ou não achar, a BrasilAPI.
 * Só o CEP vai para fora; o endereço encontrado fica guardado em memória por 1 dia.
 */
import { Router } from "express";
import { authenticate } from "../../middlewares/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { BadRequestError, NotFoundError } from "../../utils/ApiError";
import { ok } from "../../utils/response";
import { type CepAddress, fromBrasilApi, fromViaCep, normalizeCep } from "./cep.rules";

const router = Router();
router.use(authenticate);

const DAY = 24 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: CepAddress }>();

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function lookup(cep: string): Promise<CepAddress | null> {
  try {
    const found = fromViaCep(cep, await getJson(`https://viacep.com.br/ws/${cep}/json/`));
    if (found) return found;
  } catch {
    // ViaCEP fora do ar: tenta a BrasilAPI
  }
  try {
    return fromBrasilApi(cep, await getJson(`https://brasilapi.com.br/api/cep/v1/${cep}`));
  } catch {
    return null;
  }
}

router.get(
  "/:cep",
  asyncHandler(async (req, res) => {
    const cep = normalizeCep(req.params.cep);
    if (!cep) throw new BadRequestError("CEP precisa ter 8 números");
    const hit = cache.get(cep);
    const value = hit && Date.now() - hit.at < DAY ? hit.value : await lookup(cep);
    // só guarda o que achou: falha de rede não pode virar "não encontrado" por um dia
    if (value && value !== hit?.value) {
      cache.set(cep, { at: Date.now(), value });
      if (cache.size > 5000) cache.delete(cache.keys().next().value as string);
    }
    if (!value) throw new NotFoundError("CEP não encontrado. Preencha o endereço à mão.");
    return ok(res, value);
  })
);

export default router;
