import { apiGet } from "@/services/api";

export type CepAddress = { cep: string; street: string; district: string; city: string; state: string };

/** Só os números do CEP. */
export const cepDigits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

/** 60115170 -> 60115-170 enquanto digita. */
export const maskCep = (v: string) => {
  const d = cepDigits(v);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
};

/** Endereço do CEP (ViaCEP, com a BrasilAPI de reserva, pelo servidor). Nulo se não achar. */
export async function lookupCep(v: string): Promise<CepAddress | null> {
  const d = cepDigits(v);
  if (d.length !== 8) return null;
  try {
    return (await apiGet<{ data: CepAddress }>(`/cep/${d}`)).data;
  } catch {
    return null;
  }
}
