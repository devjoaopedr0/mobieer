/**
 * Contrato automático: pega o modelo de contrato (corpo de texto com
 * marcadores {{...}}), substitui pelos dados do cliente/projeto/empresa e pelos
 * valores vindos do Promob, e gera um PDF que fica anexado ao cliente.
 *
 * O modelo é texto puro com marcadores — nada de .docx: assim a substituição é
 * confiável e o resultado sai sempre igual.
 */
import { BRAND, PAGE, brandDocument, brandField, brandSection, brandTitle, ensureSpace } from "../../lib/brand-pdf";
import { prisma } from "../../prisma";
import { NotFoundError } from "../../utils/ApiError";
import { BLOCK, type ContractOrder } from "./contract-order";

// ---------------- Formatação ----------------

export const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

const brDate = (d: Date | null | undefined) => (d ? d.toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza" }) : "");

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const dateLong = (d: Date) => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;

// ---------------- Valor por extenso ----------------

const UNI = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove"];
const DEZ_A_DEZENOVE = [
  "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove",
];
const DEZENAS = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
const CENTENAS = [
  "", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos",
  "seiscentos", "setecentos", "oitocentos", "novecentos",
];

/** 1..999 por extenso. */
function upTo999(n: number): string {
  if (n === 100) return "cem";
  const c = Math.floor(n / 100);
  const d = Math.floor((n % 100) / 10);
  const u = n % 10;
  const parts: string[] = [];
  if (c) parts.push(CENTENAS[c]);
  if (d === 1) {
    parts.push(DEZ_A_DEZENOVE[u]);
  } else {
    if (d) parts.push(DEZENAS[d]);
    if (u) parts.push(UNI[u]);
  }
  return parts.join(" e ");
}

/** Número inteiro por extenso (até bilhões). */
export function numberToWords(n: number): string {
  if (n === 0) return "zero";
  const grupos: [number, string, string][] = [
    [1_000_000_000, "bilhão", "bilhões"],
    [1_000_000, "milhão", "milhões"],
    [1_000, "mil", "mil"],
  ];
  const parts: string[] = [];
  let rest = Math.floor(n);
  for (const [valor, sing, plur] of grupos) {
    const q = Math.floor(rest / valor);
    if (q > 0) {
      parts.push(valor === 1000 && q === 1 ? "mil" : `${upTo999(q)} ${q === 1 ? sing : plur}`);
      rest %= valor;
    }
  }
  const remainder = rest; // < 1000, depois de consumir bilhão/milhão/mil
  if (remainder > 0) parts.push(upTo999(remainder));
  if (parts.length <= 1) return parts.join("");
  const last = parts.pop()!;
  // "e" antes do último grupo quando ele é < 100, múltiplo redondo de 100, ou
  // quando não sobrou resto ("um milhão E quinhentos mil").
  const usaE = remainder === 0 || remainder < 100 || remainder % 100 === 0;
  return `${parts.join(", ")}${usaE ? " e " : ", "}${last}`;
}

/**
 * Valor em reais por extenso: 1234.5 -> "mil, duzentos e trinta e quatro reais
 * e cinquenta centavos". Milhão/bilhão redondo leva "de": "um milhão de reais".
 */
export function moneyToWords(value: number): string {
  const negativo = value < 0;
  const cents = Math.round(Math.abs(value) * 100);
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const parts: string[] = [];
  if (reais > 0) {
    const words = numberToWords(reais);
    // "um milhão DE reais" só quando o número termina exatamente em milhão/bilhão.
    const de = /(milhão|milhões|bilhão|bilhões)$/.test(words) ? "de " : "";
    parts.push(`${words} ${de}${reais === 1 ? "real" : "reais"}`);
  }
  if (centavos > 0) parts.push(`${numberToWords(centavos)} ${centavos === 1 ? "centavo" : "centavos"}`);
  if (!parts.length) return "zero real";
  return `${negativo ? "menos " : ""}${parts.join(" e ")}`;
}

/** 45 -> "45 (quarenta e cinco) dias úteis"; vazio sem prazo. */
export const prazoUteis = (dias: number | null | undefined) =>
  dias != null && dias > 0 ? `${String(dias).padStart(2, "0")} (${numberToWords(dias)}) ${dias === 1 ? "dia útil" : "dias úteis"}` : "";

/** Contatos do rodapé do contrato: o telefone e o e-mail que constam no contrato da loja. */
export const CONTRACT_CONTACTS = ["(85) 99969-1441", "contato@mobieer.com.br", "www.mobieer.com.br"];

// ---------------- Campos disponíveis ----------------

export const MERGE_FIELDS: { key: string; label: string; example: string }[] = [
  { key: "cliente.nome", label: "Nome do cliente", example: "Maria Silva" },
  { key: "cliente.documento", label: "CPF/CNPJ do cliente", example: "123.456.789-00" },
  { key: "cliente.email", label: "E-mail do cliente", example: "maria@email.com" },
  { key: "cliente.telefone", label: "Telefone do cliente", example: "(85) 99999-0000" },
  { key: "cliente.endereco", label: "Endereço do cliente", example: "Rua X, 100 — Fortaleza/CE" },
  { key: "cliente.enderecoEntrega", label: "Endereço de entrega (vazio = o do cliente)", example: "Av. Y, 200 — Fortaleza/CE" },
  { key: "cliente.contato", label: "Contato principal", example: "Maria" },
  { key: "projeto.codigo", label: "Código do projeto", example: "PRJ-0001" },
  { key: "projeto.nome", label: "Nome do projeto", example: "Cozinha + dormitórios" },
  { key: "projeto.descricao", label: "Descrição do projeto", example: "..." },
  { key: "projeto.inicio", label: "Início do projeto", example: "01/10/2026" },
  { key: "projeto.prazo", label: "Prazo do projeto", example: "15/12/2026" },
  { key: "empresa.razaoSocial", label: "Razão social da empresa", example: "MOBIEER LTDA" },
  { key: "empresa.nomeFantasia", label: "Nome fantasia", example: "MOBIEER" },
  { key: "empresa.cnpj", label: "CNPJ da empresa", example: "00.000.000/0001-00" },
  { key: "empresa.email", label: "E-mail da empresa", example: "contato@mobieer.com.br" },
  { key: "empresa.telefone", label: "Telefone da empresa", example: "(85) 3000-0000" },
  { key: "empresa.cidade", label: "Cidade da empresa", example: "Fortaleza" },
  { key: "empresa.uf", label: "UF da empresa", example: "CE" },
  { key: "promob.total", label: "Valor total do Promob", example: "R$ 45.000,00" },
  { key: "promob.totalExtenso", label: "Valor total por extenso", example: "quarenta e cinco mil reais" },
  { key: "promob.ambientes", label: "Ambientes do orçamento", example: "Cozinha, Dormitório 1" },
  { key: "promob.qtdItens", label: "Quantidade de itens", example: "128" },
  { key: "promob.arquivo", label: "Arquivo do orçamento", example: "orcamento.xml" },
  { key: "promob.tabelaAmbientes", label: "Tabela de ambientes com valores", example: "Cozinha .... R$ 20.000,00" },
  { key: "pagamento.entrada", label: "Valor de entrada", example: "R$ 15.000,00" },
  { key: "pagamento.parcelas", label: "Nº de parcelas", example: "10" },
  { key: "pagamento.valorParcela", label: "Valor da parcela", example: "R$ 3.000,00" },
  { key: "pagamento.condicao", label: "Condição de pagamento (texto livre)", example: "Entrada + 10x no boleto" },
  { key: "contrato.data", label: "Data do contrato", example: "13/09/2026" },
  { key: "contrato.dataExtenso", label: "Data por extenso", example: "13 de setembro de 2026" },
  { key: "contrato.cidade", label: "Cidade do contrato", example: "Fortaleza" },
  { key: "contrato.prazoEntregaDias", label: "Prazo de entrega (dias)", example: "45" },
  { key: "venda.numero", label: "Nº do orçamento aceito", example: "ORC-00012" },
  { key: "venda.vendedor", label: "Quem vendeu", example: "Ana" },
  { key: "venda.data", label: "Data da venda (aceite)", example: "13/09/2026" },
  { key: "pagamento.forma", label: "Forma de pagamento", example: "Boleto parcelado" },
  { key: "pedido.prazoFabricacao", label: "Prazo de fabricação do orçamento, por extenso", example: "45 (quarenta e cinco) dias úteis" },
  { key: "quadro.pedido", label: "Quadro do pedido: ambientes, valores e acabamentos (sozinho na linha)", example: "(tabela)" },
  { key: "montador.nome", label: "Nome do montador (documentos do montador)", example: "João Souza" },
  { key: "montador.documento", label: "CPF/CNPJ do montador", example: "987.654.321-00" },
  { key: "montador.telefone", label: "Telefone do montador", example: "(85) 98888-0000" },
  { key: "montador.endereco", label: "Endereço do montador", example: "Rua Z, 50 — Fortaleza/CE" },
  { key: "montador.funcao", label: "Função do montador", example: "Montador" },
  { key: "montador.diaria", label: "Diária do montador", example: "R$ 250,00" },
  { key: "quadro.pagamento", label: "Quadro do pagamento: condição, forma e parcelas (sozinho na linha)", example: "(tabela)" },
];

export type ContractOverrides = {
  entrada?: number | null;
  parcelas?: number | null;
  valorParcela?: number | null;
  condicaoPagamento?: string | null;
  prazoEntregaDias?: number | null;
  cidade?: string | null;
  /** Sobrescreve o total do Promob (ex.: valor negociado). */
  totalOverride?: number | null;
};

export type ContractContext = {
  values: Record<string, string>;
  meta: {
    clientId: string;
    clientName: string;
    projectId: string | null;
    projectCode: string | null;
    promobImportId: string | null;
    total: number | null;
    totalSource: "PROMOB" | "MANUAL" | "NENHUM";
  };
};

/**
 * Monta o contexto de substituição. `promobImportId` opcional: se não vier, usa
 * a importação mais recente do projeto que tenha valor.
 */
export async function buildContractContext(
  organizationId: string,
  input: { clientId: string; projectId?: string | null; promobImportId?: string | null } & ContractOverrides,
  /** orçamento aceito: valores, parcelas e quadros saem dele */
  order?: ContractOrder | null
): Promise<ContractContext> {
  const client = await prisma.client.findFirst({
    where: { id: input.clientId, organizationId },
    include: { organization: { include: { enterprise: true } } },
  });
  if (!client) throw new NotFoundError("Cliente não encontrado");

  const project = input.projectId
    ? await prisma.project.findFirst({ where: { id: input.projectId, clientId: client.id, organizationId } })
    : null;
  if (input.projectId && !project) throw new NotFoundError("Projeto não encontrado para este cliente");

  // Orçamento do Promob: explícito, ou o mais recente do projeto com valor.
  let promob = null as Awaited<ReturnType<typeof prisma.promobImport.findFirst>>;
  if (input.promobImportId) {
    promob = await prisma.promobImport.findFirst({ where: { id: input.promobImportId, organizationId } });
    if (!promob) throw new NotFoundError("Importação do Promob não encontrada");
  } else if (project) {
    promob =
      (await prisma.promobImport.findFirst({
        where: { projectId: project.id, organizationId, totalValue: { not: null } },
        orderBy: { createdAt: "desc" },
      })) ??
      (await prisma.promobImport.findFirst({ where: { projectId: project.id, organizationId }, orderBy: { createdAt: "desc" } }));
  }

  const parsed = (promob?.parsedJson ?? null) as {
    ambientes?: string[];
    totals?: { itens?: number; valor?: number | null };
    valoresPorAmbiente?: { ambiente: string; valor: number }[];
  } | null;

  const promobTotal = promob?.totalValue != null ? Number(promob.totalValue) : (parsed?.totals?.valor ?? null);
  const total = order ? order.total : input.totalOverride != null ? input.totalOverride : promobTotal;
  const totalSource: ContractContext["meta"]["totalSource"] =
    order || input.totalOverride != null ? "MANUAL" : promobTotal != null ? "PROMOB" : "NENHUM";

  const ent = client.organization.enterprise;
  const now = new Date();
  const cidade = input.cidade?.trim() || ent.municipio || "Fortaleza";

  // endereço estruturado quando houver; senão, o texto digitado
  const cityUf = [client.city, client.state].filter(Boolean).join("/");
  const structured = [[client.street, client.addressNumber].filter(Boolean).join(", "), client.complement, client.condominium ? `Cond. ${client.condominium}` : null, client.district, cityUf, client.zipCode ? `CEP ${client.zipCode}` : null]
    .filter((x) => x && String(x).trim())
    .join(" — ");
  const endereco = client.street ? structured : client.address ?? structured;

  const tabelaAmbientes = (parsed?.valoresPorAmbiente ?? [])
    .map((a) => `${a.ambiente} — ${brl(a.valor)}`)
    .join("\n");

  const values: Record<string, string> = {
    "cliente.nome": client.name,
    "cliente.documento": client.document ?? "",
    "cliente.email": client.email ?? "",
    "cliente.telefone": client.phone ?? "",
    "cliente.endereco": endereco,
    "cliente.contato": client.primaryContact ?? client.name,
    "projeto.codigo": project?.code ?? "",
    "projeto.nome": project?.name ?? "",
    "projeto.descricao": project?.description ?? "",
    "projeto.inicio": brDate(project?.startAt),
    "projeto.prazo": brDate(project?.dueAt),
    "empresa.razaoSocial": ent.legalName,
    "empresa.nomeFantasia": ent.tradeName ?? ent.legalName,
    "empresa.cnpj": ent.document ?? "",
    "empresa.email": ent.email ?? "",
    "empresa.telefone": ent.phone ?? "",
    "empresa.cidade": ent.municipio ?? "Fortaleza",
    "empresa.uf": ent.uf ?? "CE",
    "promob.total": total != null ? brl(total) : "",
    "promob.totalExtenso": total != null ? moneyToWords(total) : "",
    "promob.ambientes": (parsed?.ambientes ?? []).join(", "),
    "promob.qtdItens": String(parsed?.totals?.itens ?? promob?.itemCount ?? ""),
    "promob.arquivo": promob?.fileName ?? "",
    "promob.tabelaAmbientes": tabelaAmbientes,
    "pagamento.entrada": input.entrada != null ? brl(input.entrada) : "",
    "pagamento.parcelas": input.parcelas != null ? String(input.parcelas) : "",
    "pagamento.valorParcela": input.valorParcela != null ? brl(input.valorParcela) : "",
    "pagamento.condicao": input.condicaoPagamento ?? "",
    "contrato.data": brDate(now),
    "contrato.dataExtenso": dateLong(now),
    "contrato.cidade": cidade,
    "contrato.prazoEntregaDias": input.prazoEntregaDias != null ? String(input.prazoEntregaDias) : "",
    "cliente.enderecoEntrega": client.deliveryAddress?.trim() || endereco,
    "venda.numero": order?.number ?? "",
    "venda.vendedor": order?.seller ?? "",
    "venda.data": order ? brDate(order.soldAt) : "",
    "pagamento.forma": order?.method ?? "",
    "pedido.prazoFabricacao": prazoUteis(order?.deliveryDays ?? input.prazoEntregaDias),
    // com orçamento, a linha vira tabela no PDF; sem ele, sai o texto que houver
    "quadro.pedido": order ? BLOCK.pedido : tabelaAmbientes,
    "quadro.pagamento": order ? BLOCK.pagamento : (input.condicaoPagamento ?? ""),
  };

  return {
    values,
    meta: {
      clientId: client.id,
      clientName: client.name,
      projectId: project?.id ?? null,
      projectCode: project?.code ?? null,
      promobImportId: promob?.id ?? null,
      total,
      totalSource,
    },
  };
}

// Substituição de marcadores compartilhada com as automações de mensagem.
export { renderTemplate } from "../../utils/template";

/**
 * Gera o PDF de um documento de texto (contrato, recibo, vistoria, certificado)
 * no padrão visual da loja. O corpo é texto puro: linha curta em MAIÚSCULAS
 * vira título de seção, "Rótulo: valor" sai com o rótulo em negrito, "• " vira
 * item de lista e o resto é parágrafo justificado.
 */
export function contractPdf(opts: { title: string; body: string; footer?: string; contacts?: string[]; blocks?: Record<string, (doc: ReturnType<typeof brandDocument>["doc"]) => void> }): Promise<Buffer> {
  const { doc, done, width } = brandDocument({ contacts: opts.contacts });
  brandTitle(doc, opts.title);

  // título de seção só no começo de um bloco: "CONTRATANTE" sob a linha de assinatura é texto
  let blockStart = true;
  for (const rawLine of opts.body.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      doc.moveDown(0.35);
      blockStart = true;
      continue;
    }
    const draw = opts.blocks?.[line.trim()];
    if (draw) {
      draw(doc);
      blockStart = true;
      continue;
    }
    const first = blockStart;
    blockStart = false;
    // "Rótulo: valor" nunca é título, mesmo com o valor em maiúsculas ("CONTRATANTE: MARIA")
    const isHeading = first && line.length <= 90 && line === line.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(line) && !/:\s/.test(line);
    // campo vazio ("CPF:" sem valor) sai com a linha para preencher à mão
    const field = /^((?:(?!\. )[^:•\[]){2,70}):(?:\s+(.+))?$/.exec(line);
    if (isHeading) {
      // título não fica sozinho no pé da página
      ensureSpace(doc, 80);
      doc.moveDown(0.3);
      brandSection(doc, line);
    } else if (field && line.length <= 160) {
      brandField(doc, field[1], field[2] ?? "______________________________");
    } else if (line.startsWith("• ")) {
      const y = doc.y;
      doc.font("Helvetica").fontSize(10).fillColor(BRAND.orange).text("•", PAGE.left + 2, y, { lineBreak: false });
      doc.fillColor(BRAND.ink).text(line.slice(2), PAGE.left + 14, y, { width: width - 14, lineGap: 2 });
      doc.x = PAGE.left;
    } else {
      // parágrafo que começa com um rótulo curto ("Fabricação: …"): o rótulo sai em negrito
      const lead = /^([A-ZÁÉÍÓÚÂÊÔÃÕÇ][^:•\[]{1,58}):\s+(.+)$/.exec(line);
      if (lead && !/\. /.test(lead[1])) {
        doc.font("Helvetica-Bold").fontSize(10).fillColor(BRAND.ink).text(`${lead[1]}: `, PAGE.left, doc.y, { width, align: "justify", lineGap: 2.5, continued: true });
        doc.font("Helvetica").text(lead[2], { width, align: "justify", lineGap: 2.5 });
      } else {
        doc.font("Helvetica").fontSize(10).fillColor(BRAND.ink).text(line, PAGE.left, doc.y, { width, align: "justify", lineGap: 2.5 });
      }
    }
  }

  if (opts.footer) {
    // a nota final cabe no espaço até o rodapé: não abre uma página só para ela
    const limit = doc.page.height - 62;
    const h = doc.font("Helvetica").fontSize(7.5).heightOfString(opts.footer, { width, align: "center" });
    if (doc.y + 10 + h > limit) doc.addPage();
    else doc.y += 10;
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 60;
    doc.fillColor(BRAND.muted).text(opts.footer, PAGE.left, doc.y, { width, align: "center" });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}

/**
 * Modelo inicial de contrato: o contrato da loja (contrato_mobieer_revisado 26),
 * com os campos do cliente e os quadros do pedido preenchidos pelo sistema.
 */
export const DEFAULT_CONTRACT_BODY = `CONTRATO DE COMPRA E VENDA DE MÓVEIS PLANEJADOS E PRESTAÇÃO DE SERVIÇOS

1. QUALIFICAÇÃO DAS PARTES CONTRATANTES

CONTRATADA: MOBIEER MÓVEIS PLANEJADOS LTDA - ME (Razão Social de Faturamento: JD INDÚSTRIA DE MÓVEIS LTDA, CNPJ: 68.032.474/0001-59), com sede em Fortaleza/CE, Fone: (85) 99969-1441, e-mail: contato@mobieer.com.br.

CONTRATANTE: {{cliente.nome}}
CNPJ/CPF: {{cliente.documento}}
Endereço Atual: {{cliente.endereco}}
Endereço de Entrega: {{cliente.enderecoEntrega}}
Telefone / E-mail: {{cliente.telefone}} / {{cliente.email}}
Vendedor / Data: {{venda.vendedor}} / {{venda.data}}

2. RESUMO DO PEDIDO E ESPECIFICAÇÕES TÉCNICAS

{{quadro.pedido}}

{{quadro.pagamento}}

3. CLÁUSULAS E CONDIÇÕES GERAIS DO CONTRATO

CLÁUSULA PRIMEIRA — DO OBJETO DO CONTRATO

O presente contrato tem por objeto a compra e venda de mobiliário planejado sob medida e a prestação dos serviços correlatos de elaboração de projeto executivo, conferência técnica de medidas, pré-montagem, transporte e montagem/instalação, conforme especificações descritas no resumo do pedido e nos projetos técnicos anexos, devidamente rubricados e aprovados pelo CONTRATANTE, que passam a integrar este instrumento para todos os fins de direito.

Não integram o presente contrato o fornecimento de elementos decorativos presentes nos projetos apenas a título de ilustração, tais como eletrodomésticos, granitos, tapetes, cortinas, espelhos, vidros, etc., ou seja, produtos não fabricados pela empresa. Os montadores não são autorizados a prestar serviços além do acordado em contrato, sendo vedadas instalações de TV, manuseio de eletrodomésticos, alterações de pontos elétricos ou quaisquer outras instalações sem autorização prévia e expressa da CONTRATADA.

CLÁUSULA SEGUNDA — DAS DELIMITAÇÕES DOS SERVIÇOS E RESPONSABILIDADES

A CONTRATADA obriga-se exclusivamente ao fornecimento, fabricação e montagem do mobiliário descrito no item 2 (Resumo do Pedido e Especificações Técnicas).

Exclusões de Escopo: NÃO fazem parte das obrigações da CONTRATADA, correndo por conta, risco e responsabilidade exclusiva do CONTRATANTE:
a) Serviços de construção civil, alvenaria, gesso, pintura, raspagem, aplicação de papel de parede, vidraçaria, espelhos ou marmoraria;
b) Adequação, instalação, modificação ou ligação de pontos de elétrica, iluminação (fitas LED, perfis, drivers), hidráulica, gás, esgoto ou rede de dados;
c) Instalação, fixação, embutimento, conexão ou qualquer manuseio de eletrodomésticos, eletroportáteis, coifas, cooktops, cubas, torneiras, sifões, suportes de TV e decoração em geral;
d) Desmontagem, remoção de rodapés ou rodatetos, transporte ou readequação de móveis antigos existentes no local;
e) Reparos, retoques ou reaplicações pós-montagem decorrentes da necessidade de remoção ou manuseio efetuados pela equipe para a execução do trabalho, tais como reaplicação de papel de parede, segunda demão de tinta ou reinstalação de rodapés, rodatetos e sancas;
f) A execução de ligações elétricas para fitas de LED, perfis luminosos e luminárias dicroicas, que deverão ser efetuadas pela equipe do CONTRATANTE após a conclusão da marcenaria. O CONTRATANTE compromete-se a fornecer previamente os perfis ou luminárias dicroicas à CONTRATADA para a devida usinagem das peças em MDF durante a fase de fabricação.

CLÁUSULA TERCEIRA — DA APROVAÇÃO DO PROJETO E MEDIÇÃO TÉCNICA

A fabricação dos produtos está estritamente condicionada à assinatura do Projeto Executivo Final e ao Termo de Medição Definitiva pelo CONTRATANTE, oportunidade na qual as medidas e especificações serão validadas.

Havendo alterações no projeto executivo solicitadas pelo CONTRATANTE após a assinatura inicial que gerem acréscimo de materiais ou serviços, haverá aditivo contratual com o recálculo do valor e ajuste do prazo de entrega.

CLÁUSULA QUARTA — DOS PRAZOS DE FABRICAÇÃO, PRÉ-MONTAGEM, ENTREGA E INSTALAÇÃO

Fabricação: O prazo para conclusão da fabricação industrial dos móveis é de até {{pedido.prazoFabricacao}}, conforme o resumo do pedido, contados do primeiro dia útil seguinte à aprovação final do Projeto Executivo e Liberação da Medição Definitiva (além da confirmação do pagamento de entrada, se houver).

Início da Montagem: Os serviços de montagem serão iniciados em até 08 (oito) dias úteis após a entrega efetiva de 100% dos móveis no local da obra, mediante cronograma alinhado com o CONTRATANTE, caso não haja pré-montagem no espaço fabril.

Pré-Montagem em Fábrica: Concluída a fase de fabricação (após o prazo de {{pedido.prazoFabricacao}}), a CONTRATADA iniciará a pré-montagem do mobiliário nas dependências de sua fábrica, a qual será concluída dentro do prazo previamente estabelecido entre as partes.

Cronograma de Entrega e Instalação In Loco: Após a pré-montagem fabril, a CONTRATADA enviará ao CONTRATANTE um cronograma detalhado prevendo as datas de entrega e instalação no local (in loco). O prazo final de entrega e montagem no imóvel será alinhado com o cliente a depender da quantidade de ambientes e da complexidade técnica do projeto.

Pré-requisitos do Local (Obrigação do Contratante): O CONTRATANTE deverá disponibilizar o imóvel totalmente limpo, desocupado, com fornecimento de energia elétrica (110V/220V), iluminação adequada e sanitários funcionais para a equipe de montagem. Caso haja necessidade de proteção de piso, esta deverá ser realizada previamente pelo CONTRATANTE.

Plantas Técnicas de Tubulação: É dever do CONTRATANTE fornecer, antes do início da montagem, as plantas de furações e instalações embutidas (água, esgoto, gás e elétrica). Na ausência destas, a CONTRATADA fica eximida de qualquer responsabilidade por perfurações acidentais em tubulações ocultas.

Içamento e Acesso: É de responsabilidade e custo do CONTRATANTE garantir livre acesso por elevadores ou escadas. Caso os móveis não caibam nos acessos convencionais, custos com içamento especializado correrão por conta do CONTRATANTE.

CLÁUSULA SEXTA — DAS GARANTIAS E ASSISTÊNCIA TÉCNICA

Nos termos do Artigo 26, II, do Código de Defesa do Consumidor (Lei nº 8.078/90), o prazo de garantia legal para vícios aparentes ou de fácil constatação é de 90 (noventa) dias a contar da entrega/conclusão da montagem.

A CONTRATADA concede, complementarmente, Garantia Contratual aos produtos, observados os prazos totais a seguir:
a) 05 (cinco) anos para estruturas de madeira (MDF/MDP) e ferragens (dobradiças e corrediças), contra defeitos de fabricação;
b) 01 (um) ano para puxadores, acessórios aramados, perfis de alumínio e oxidação em estruturas de Metalon;
c) Garantia de Montagem: 5 (cinco) anos para ajustes e alinhamento mecânico de portas e gavetas.

Exclusões da Garantia: Não estão cobertos pela garantia danos decorrentes de: (i) umidade, infiltrações de água, mofo, maresia ou vazamentos; (ii) infecção por pragas, cupins ou brocas ocorridas após a entrega; (iii) mau uso, sobrecarga de peso além do especificado, uso de produtos químicos de limpeza abrasivos; (iv) modificações, desmontagens ou reparos efetuados por terceiros não autorizados. Vidros, espelhos e acabamentos em laca possuem garantia estrita de integridade no ato da entrega/montagem.

CLÁUSULA SÉTIMA — DO PREÇO, PAGAMENTO E MORA

Pelos produtos e serviços contratados, o CONTRATANTE pagará o valor total ajustado conforme discriminado no item 2 (Resumo do Pedido e Especificações Técnicas).

O atraso no pagamento de qualquer parcela sujeitará o débito à incidência de multa moratória de 2% (dois por cento) sobre o valor em atraso, acréscimo de juros de mora de 1% (um por cento) ao mês pro rata die, e atualização monetária pelo índice IGPM/FGV (ou IPCA/IBGE) até a data da efetiva liquidação, em consonância com o Artigo 52, §1º do CDC.

Em caso de atraso superior a 30 (trinta) dias, o débito poderá ser levado a protesto ou aos órgãos de proteção ao crédito (SPC/SERASA), respondendo o devedor pelas custas e honorários advocatícios decorrentes da cobrança.

CLÁUSULA OITAVA — DA RESCISÃO, CANCELAMENTO E MULTA COMPENSATÓRIA

Sendo o objeto deste contrato produto personalizado e fabricado sob medida para o ambiente do CONTRATANTE (sem possibilidade de reaproveitamento comercial em caso de desistência), regem-se as condições de cancelamento:

Cancelamento Antes do Envio à Fábrica: Caso o CONTRATANTE solicite o cancelamento formal antes do envio do projeto executivo para corte/fabricação industrial, será devida multa rescisória de 20% (vinte por cento) sobre o valor total do contrato, destinada a cobrir custos operacionais, medição técnica, elaboração de projetos e despesas administrativas.

Cancelamento Após Início da Fabricação: Efetivado o envio do pedido para corte e produção industrial, não será admitido o cancelamento unilateral imotivado, devendo o CONTRATANTE arcar com o valor integral do pedido ou ressarcir as perdas e danos integrais (comprovadamente os custos já despendidos com matéria-prima e produção).

CLÁUSULA NONA — DA RESERVA DE DOMÍNIO

Nos termos dos Artigos 521 a 528 do Código Civil Brasileiro, reserva-se à CONTRATADA a propriedade dos bens móveis objetos deste contrato até a integral liquidação do preço estipulado. A posse direta é transferida ao CONTRATANTE no ato da montagem, operando-se a transferência plena da propriedade com a quitação total do valor contratado.

CLÁUSULA DÉCIMA — DA VENDA FUTURA E PRODUTOS DE MOSTRUÁRIO

Venda Futura: Nos contratos classificados como "Venda Futura", o CONTRATANTE deverá solicitar a medição técnica final com antecedência mínima de 60 (sessenta) dias do prazo pretendido para entrega. Alterações nas medidas do imóvel que impliquem reformulação estrutural do projeto ensejarão readequação de valores.

Produtos de Mostruário (Showroom): Na aquisição de produtos de mostruário, o CONTRATANTE declara ciência de que o produto é vendido no estado de conservação em que se encontra, podendo apresentar pequenas marcas de exposição, pequenas ranhuras ou desgaste natural de montagem, insuscetíveis de troca por vícios estéticos previamente conhecidos.

CLÁUSULA DÉCIMA PRIMEIRA — DA PROTEÇÃO DE DADOS PESSOAIS (LGPD)

As partes comprometem-se a cumprir os ditames da Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018). Os dados pessoais coletados serão tratados exclusivamente para fins de execução deste contrato, emissão de notas fiscais, logística e prestação de serviços de garantia, resguardados os direitos dos titulares expressos na legislação regente.

CLÁUSULA DÉCIMA SEGUNDA — DO FORO DE ELEIÇÃO

As PARTES elegem o Foro da Comarca de Fortaleza, Estado do Ceará, para dirimir quaisquer controvérsias oriundas do presente contrato, renunciando a qualquer outro, por mais privilegiado que seja, garantida ao consumidor a faculdade de opção pelo foro de seu domicílio, nos termos do Art. 101, I, do CDC.

E, por estarem assim justas e contratadas, as partes firmam o presente instrumento em 02 (duas) vias de igual teor e forma, na presença de 02 (duas) testemunhas instrumentárias.

{{contrato.cidade}}/CE, {{contrato.dataExtenso}}.


_______________________________________
MOBIEER MÓVEIS PLANEJADOS LTDA - ME
CONTRATADA — CNPJ 68.032.474/0001-59


_______________________________________
{{cliente.nome}}
CONTRATANTE — CPF/CNPJ {{cliente.documento}}


_______________________________________
TESTEMUNHA 1 — Nome e CPF


_______________________________________
TESTEMUNHA 2 — Nome e CPF
`;
