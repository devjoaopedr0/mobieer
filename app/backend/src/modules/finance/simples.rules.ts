/**
 * Simples Nacional: alíquota efetiva pelas tabelas oficiais (LC 123/2006,
 * Anexos I e II na redação da LC 155/2016).
 *
 *   efetiva = (RBT12 × alíquota nominal da faixa − parcela a deduzir) ÷ RBT12
 *
 * RBT12 = receita bruta dos 12 meses anteriores ao mês apurado. A faixa vem do
 * RBT12, não do faturamento do mês. Regras puras; quem busca no banco é o
 * tax.service.
 */

export type Anexo = "I" | "II";

type Faixa = { ate: number; nominal: number; deduzir: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export const LIMITE_SIMPLES = 4_800_000;

/** Faixas de RBT12: alíquota nominal em % e parcela a deduzir em R$. */
export const TABELAS: Record<Anexo, Faixa[]> = {
  // comércio
  I: [
    { ate: 180_000, nominal: 4, deduzir: 0 },
    { ate: 360_000, nominal: 7.3, deduzir: 5_940 },
    { ate: 720_000, nominal: 9.5, deduzir: 13_860 },
    { ate: 1_800_000, nominal: 10.7, deduzir: 22_500 },
    { ate: 3_600_000, nominal: 14.3, deduzir: 87_300 },
    { ate: 4_800_000, nominal: 19, deduzir: 378_000 },
  ],
  // indústria
  II: [
    { ate: 180_000, nominal: 4.5, deduzir: 0 },
    { ate: 360_000, nominal: 7.8, deduzir: 5_940 },
    { ate: 720_000, nominal: 10, deduzir: 13_860 },
    { ate: 1_800_000, nominal: 11.2, deduzir: 22_500 },
    { ate: 3_600_000, nominal: 14.7, deduzir: 85_500 },
    { ate: 4_800_000, nominal: 30, deduzir: 720_000 },
  ],
};

/**
 * Anexo pelo CNAE principal: divisões 10 a 33 são indústria (Anexo II),
 * 45 a 47 comércio (Anexo I). Serviços têm outros anexos: devolve null.
 */
export function anexoDoCnae(cnae: string | null | undefined): Anexo | null {
  const divisao = Number((cnae ?? "").replace(/\D/g, "").slice(0, 2));
  if (divisao >= 10 && divisao <= 33) return "II";
  if (divisao >= 45 && divisao <= 47) return "I";
  return null;
}

/** Faixa e alíquota efetiva (em %) para o RBT12. Acima do limite, fora do Simples. */
export function aliquotaEfetiva(rbt12: number, anexo: Anexo) {
  const tabela = TABELAS[anexo];
  const base = Math.max(0, rbt12);
  const i = tabela.findIndex((f) => base <= f.ate);
  if (i < 0) return { anexo, faixa: null, nominal: null, deduzir: null, efetiva: null, foraDoSimples: true };
  const f = tabela[i];
  // sem receita nos 12 meses (início de atividade), vale a nominal da 1ª faixa
  const efetiva = base > 0 ? ((base * f.nominal) / 100 - f.deduzir) / base * 100 : f.nominal;
  return { anexo, faixa: i + 1, nominal: f.nominal, deduzir: f.deduzir, efetiva: r2(efetiva), foraDoSimples: false };
}
