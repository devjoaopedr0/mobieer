/**
 * Erro de validação que diz ONDE está o problema. Antes a resposta era só
 * "Dados inválidos" e a pessoa tinha de adivinhar o campo.
 *
 * Regras puras: recebe as falhas do zod e devolve a frase pronta e a lista de
 * campos, com o nome do campo em português e o motivo em português.
 */
import type { ZodIssue } from "zod";

/** Nome do campo como a pessoa vê na tela. */
const LABELS: Record<string, string> = {
  name: "Nome",
  title: "Título",
  description: "Descrição",
  notes: "Observações",
  email: "E-mail",
  phone: "Telefone",
  secondaryPhone: "Telefone 2",
  document: "CPF / CNPJ",
  cpf: "CPF",
  cnpj: "CNPJ",
  password: "Senha",
  newPassword: "Nova senha",
  currentPassword: "Senha atual",
  zipCode: "CEP",
  street: "Rua",
  addressNumber: "Número",
  complement: "Complemento",
  district: "Bairro",
  city: "Cidade",
  state: "UF",
  address: "Endereço",
  condominium: "Condomínio",
  deliveryAddress: "Endereço de entrega",
  leadSource: "Origem do lead",
  sellerId: "Consultor de vendas",
  attendantId: "Responsável pelo atendimento",
  clientId: "Cliente",
  projectId: "Projeto",
  supplierId: "Fornecedor",
  roleId: "Perfil",
  extraRoleIds: "Perfis adicionais",
  managerId: "Responsável",
  responsibleId: "Responsável",
  assigneeId: "Responsável",
  amount: "Valor",
  total: "Total",
  quantity: "Quantidade",
  price: "Preço",
  category: "Categoria",
  date: "Data",
  dueDate: "Vencimento",
  dueAt: "Prazo",
  startAt: "Início",
  issueDate: "Emissão",
  validUntil: "Validade",
  status: "Situação",
  type: "Tipo",
  code: "Código",
  room: "Ambiente",
  width: "Largura",
  height: "Altura",
  depth: "Profundidade",
  items: "Itens",
  columns: "Colunas",
  parts: "Trechos",
  heights: "Alturas",
  feedbackFormUrl: "Link do formulário",
  link3dUrl: "Link do 3D",
  architectEmail: "E-mail do arquiteto",
  architectPhone: "Telefone do arquiteto",
  architectName: "Arquiteto",
  markup: "Mark-up",
  discount: "Desconto",
  discountPercent: "Desconto (%)",
  targetTotal: "Valor final",
  installments: "Parcelas",
  downPayment: "Entrada",
  file: "Arquivo",
};

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** ["items", 2, "amount"] → "Itens, linha 3 › Valor" */
export function fieldLabel(path: (string | number)[]): string {
  if (!path.length) return "";
  const out: string[] = [];
  for (const p of path) {
    if (typeof p === "number") {
      if (out.length) out[out.length - 1] += `, linha ${p + 1}`;
      continue;
    }
    // sem tradução: "sideLeft" vira "Side left" — melhor que esconder o campo
    out.push(LABELS[p] ?? titleCase(p.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/Id$/, "").toLowerCase()));
  }
  return out.join(" › ");
}

/** As mensagens padrão do zod são em inglês; as escritas no sistema (em português) passam direto. */
const ENGLISH = /^(Required|Invalid|Expected|String must|Number must|Array must|Too |Unrecognized|Input )/i;

export function issueReason(issue: ZodIssue): string {
  if (issue.message && !ENGLISH.test(issue.message)) return issue.message;
  const i = issue as ZodIssue & { minimum?: number | bigint; maximum?: number | bigint; type?: string; validation?: unknown; received?: unknown; options?: unknown[] };
  switch (issue.code) {
    case "invalid_type":
      return i.received === "undefined" || i.received === "null" ? "é obrigatório" : "valor inválido";
    case "too_small":
      if (i.type === "string") return Number(i.minimum) <= 1 ? "é obrigatório" : `precisa ter pelo menos ${i.minimum} caracteres`;
      if (i.type === "array") return `precisa ter pelo menos ${i.minimum} ${Number(i.minimum) === 1 ? "item" : "itens"}`;
      return `precisa ser no mínimo ${i.minimum}`;
    case "too_big":
      if (i.type === "string") return `pode ter no máximo ${i.maximum} caracteres`;
      if (i.type === "array") return `pode ter no máximo ${i.maximum} itens`;
      return `pode ser no máximo ${i.maximum}`;
    case "invalid_string":
      if (i.validation === "email") return "e-mail inválido";
      if (i.validation === "url") return "link inválido";
      return "formato inválido";
    case "invalid_enum_value":
      return "opção inválida";
    case "invalid_date":
      return "data inválida";
    case "unrecognized_keys":
      return "campo não esperado";
    default:
      return "valor inválido";
  }
}

export type FieldError = { field: string; label: string; message: string };

/** Falhas do zod → frase para a tela + lista de campos (um motivo por campo). */
export function describeValidation(issues: ZodIssue[]): { message: string; fields: FieldError[] } {
  const seen = new Set<string>();
  const fields: FieldError[] = [];
  for (const issue of issues) {
    // união ("isto OU aquilo"): o motivo útil está dentro
    const inner = issue.code === "invalid_union" ? (issue as ZodIssue & { unionErrors?: { issues: ZodIssue[] }[] }).unionErrors?.[0]?.issues?.[0] : undefined;
    const real = inner ?? issue;
    const path = real.path.length ? real.path : issue.path;
    const field = path.join(".");
    if (seen.has(field)) continue;
    seen.add(field);
    fields.push({ field, label: fieldLabel(path), message: issueReason(real) });
  }
  const parts = fields.slice(0, 4).map((f) => (f.label ? `${f.label}: ${f.message}` : f.message));
  const more = fields.length > 4 ? ` (e mais ${fields.length - 4})` : "";
  return { message: parts.length ? `Confira ${fields.length > 1 ? "os campos" : "o campo"} — ${parts.join("; ")}${more}.` : "Dados inválidos", fields };
}
