import { Prisma, type TaxRule, type RegimeTributario } from "@prisma/client";
import { prisma } from "../../prisma";
import { BadRequestError } from "../../utils/ApiError";
import { aliquotaEfetiva, anexoDoCnae } from "./simples.rules";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export type ImpostoCalculado = {
  tipoImposto: string;
  descricao: string | null;
  base: number;
  aliquotaAplicada: number; // fração (0.06)
  valor: number;
};

/**
 * Motor fiscal inspirado no econofinance: uma estratégia por regime tributário,
 * alíquotas vindas de `TaxRule` (dados configuráveis). Cálculo em Decimal.
 */
interface Strategy {
  calcular(faturamento: Decimal, rules: TaxRule[]): { tipoImposto: string; descricao: string | null; base: Decimal; aliquota: Decimal; valor: Decimal }[];
}

const simplesNacional: Strategy = {
  calcular(faturamento, rules) {
    const regraDas = rules.find((r) => r.tipoImposto === "DAS");
    if (!regraDas) throw new BadRequestError("Nenhuma regra de DAS cadastrada para esta faixa de faturamento");
    const aliquota = new D(regraDas.aliquota);
    return [
      {
        tipoImposto: "DAS",
        descricao: regraDas.descricao,
        base: faturamento,
        aliquota,
        valor: faturamento.times(aliquota),
      },
    ];
  },
};

// Lucro Presumido: base pode ter presunção (reducaoBase); imposto = base * alíquota.
const lucroPresumido: Strategy = {
  calcular(faturamento, rules) {
    return rules.map((r) => {
      const aliquota = new D(r.aliquota);
      const base = r.reducaoBase ? faturamento.times(new D(r.reducaoBase)) : faturamento;
      return { tipoImposto: r.tipoImposto, descricao: r.descricao, base, aliquota, valor: base.times(aliquota) };
    });
  },
};

// Lucro Real (simplificado): base = faturamento do período; imposto = base * alíquota.
const lucroReal: Strategy = {
  calcular(faturamento, rules) {
    return rules.map((r) => {
      const aliquota = new D(r.aliquota);
      return { tipoImposto: r.tipoImposto, descricao: r.descricao, base: faturamento, aliquota, valor: faturamento.times(aliquota) };
    });
  },
};

const STRATEGIES: Record<RegimeTributario, Strategy> = {
  SIMPLES_NACIONAL: simplesNacional,
  LUCRO_PRESUMIDO: lucroPresumido,
  LUCRO_REAL: lucroReal,
};

export async function enterpriseForOrg(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { enterprise: true },
  });
  if (!org) throw new BadRequestError("Organização não encontrada");
  return org.enterprise;
}

/** Faturamento realizado (RECEITA PAGO) numa competência "YYYY-MM". */
export async function faturamentoRealizado(organizationId: string, competencia: string) {
  const [y, m] = competencia.split("-").map(Number);
  if (!y || !m) throw new BadRequestError("Competência inválida (use YYYY-MM)");
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const rows = await prisma.financeTransaction.findMany({
    where: { organizationId, type: "RECEITA", status: "PAGO", date: { gte: start, lt: end } },
    select: { amount: true },
  });
  return rows.reduce((acc, r) => acc.plus(new D(r.amount)), new D(0));
}

// RBT12 informado à mão (o sistema ainda não tem 12 meses de receitas lançadas)
export const rbt12Key = (organizationId: string) => `finance.simples.rbt12.${organizationId}`;

/**
 * Simples Nacional da empresa: anexo pelo CNAE e alíquota efetiva pelo RBT12
 * (o informado na aba Impostos; sem ele, as receitas pagas dos 12 meses
 * anteriores ao mês). Null quando o regime não é Simples ou o CNAE não tem anexo.
 */
export async function simplesInfo(organizationId: string, competencia?: string) {
  const ent = await enterpriseForOrg(organizationId);
  if (ent.regimeTributario !== "SIMPLES_NACIONAL") return null;
  const anexo = anexoDoCnae(ent.cnae);
  const informado = await prisma.setting.findUnique({ where: { key: rbt12Key(organizationId) } });
  const rbt12Informado = informado && Number(informado.value) > 0 ? Number(informado.value) : null;
  const now = new Date();
  const [y, m] = (competencia ?? `${now.getFullYear()}-${now.getMonth() + 1}`).split("-").map(Number);
  const agg = await prisma.financeTransaction.aggregate({
    where: { organizationId, type: "RECEITA", status: "PAGO", date: { gte: new Date(y, m - 13, 1), lt: new Date(y, m - 1, 1) } },
    _sum: { amount: true },
  });
  const rbt12Sistema = Number(agg._sum.amount ?? 0);
  const rbt12 = rbt12Informado ?? rbt12Sistema;
  return {
    rbt12,
    rbt12Fonte: rbt12Informado !== null ? ("INFORMADO" as const) : ("SISTEMA" as const),
    rbt12Informado,
    rbt12Sistema,
    ...(anexo ? aliquotaEfetiva(rbt12, anexo) : { anexo: null, faixa: null, nominal: null, deduzir: null, efetiva: null, foraDoSimples: false }),
  };
}

export async function apurar(params: { organizationId: string; faturamento: Decimal; competencia: string }) {
  const { organizationId, faturamento, competencia } = params;
  const ent = await enterpriseForOrg(organizationId);
  const regime = ent.regimeTributario;

  // Simples com anexo conhecido: tabela oficial pelo RBT12, sem depender das regras cadastradas
  const simples = regime === "SIMPLES_NACIONAL" ? await simplesInfo(organizationId, competencia) : null;
  if (simples?.anexo && simples.efetiva !== null) {
    const aliquota = new D(simples.efetiva).div(100);
    const valor = faturamento.times(aliquota);
    return {
      regime,
      competencia,
      faturamento: Number(faturamento.toDP(2)),
      impostos: [{
        tipoImposto: "DAS",
        descricao: `Simples Nacional — Anexo ${simples.anexo}, ${simples.faixa}ª faixa (nominal ${simples.nominal}%, dedução R$ ${simples.deduzir}) sobre RBT12 de R$ ${simples.rbt12.toFixed(2)}`,
        base: Number(faturamento.toDP(2)),
        aliquotaAplicada: Number(aliquota.toDP(6)),
        valor: Number(valor.toDP(2)),
      }],
      totalImpostos: Number(valor.toDP(2)),
      cargaEfetiva: simples.efetiva,
      fonteFaturamento: params.competencia,
    };
  }
  if (simples?.foraDoSimples) throw new BadRequestError("RBT12 acima de R$ 4,8 milhões: a empresa sai do Simples Nacional.");
  const [cy, cm] = competencia.split("-").map(Number);
  const inicioComp = new Date(cy, cm - 1, 1);
  const fimComp = new Date(cy, cm, 0); // último dia da competência

  const rules = await prisma.taxRule.findMany({
    where: {
      organizationId,
      regimeTributario: regime,
      ativo: true,
      OR: [{ cnae: null }, { cnae: ent.cnae ?? "__none__" }],
      AND: [
        { OR: [{ uf: null }, { uf: ent.uf ?? "__none__" }] },
        { vigenciaInicio: { lte: fimComp } },
        { OR: [{ vigenciaFim: null }, { vigenciaFim: { gte: inicioComp } }] },
      ],
    },
  });

  const applicable = rules.filter((r) => {
    const min = r.faixaFaturamentoMin ? new D(r.faixaFaturamentoMin) : null;
    const max = r.faixaFaturamentoMax ? new D(r.faixaFaturamentoMax) : null;
    if (min && faturamento.lt(min)) return false;
    if (max && faturamento.gt(max)) return false;
    return true;
  });

  if (applicable.length === 0) {
    throw new BadRequestError(
      `Nenhuma regra fiscal cadastrada para ${regime}${ent.cnae ? ` / CNAE ${ent.cnae}` : ""}${ent.uf ? ` / ${ent.uf}` : ""}.`
    );
  }

  const calc = STRATEGIES[regime].calcular(faturamento, applicable);
  const impostos: ImpostoCalculado[] = calc.map((c) => ({
    tipoImposto: c.tipoImposto,
    descricao: c.descricao,
    base: Number(c.base.toDP(2)),
    aliquotaAplicada: Number(c.aliquota),
    valor: Number(c.valor.toDP(2)),
  }));

  const total = calc.reduce((acc, c) => acc.plus(c.valor), new D(0));
  const fatNum = Number(faturamento);
  return {
    regime,
    competencia,
    faturamento: Number(faturamento.toDP(2)),
    impostos,
    totalImpostos: Number(total.toDP(2)),
    cargaEfetiva: fatNum > 0 ? Number(total.div(faturamento).times(100).toDP(2)) : 0,
    fonteFaturamento: params.competencia,
  };
}
