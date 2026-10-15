/**
 * Ferramentas do montador e documentos padrão (contrato, código de conduta):
 * regras puras, sem banco.
 */

/** Lista inicial do que o montador marca; a gestão edita em Montadores externos. */
export const DEFAULT_TOOL_CATALOG = [
  "Parafusadeira / furadeira",
  "Furadeira de impacto",
  "Serra tico-tico",
  "Serra circular",
  "Esmerilhadeira",
  "Tupia",
  "Nível a laser",
  "Trena",
  "Esquadro",
  "Grampeador pneumático",
  "Compressor",
  "Escada",
  "Kit de brocas",
  "Kit de pontas (bits)",
  "Aspirador",
  "Extensão elétrica",
];

/** Catálogo salvo: só textos, sem repetir (ignorando maiúsculas), na ordem em que vieram. */
export function normalizeCatalog(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [...DEFAULT_TOOL_CATALOG];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const name = v.trim().slice(0, 80);
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out.slice(0, 200);
}

/**
 * O termo assinado ainda vale? Vale quando foi assinado depois da última
 * ferramenta recebida ou retirada. Sem ferramenta, não há o que assinar.
 */
export function termIsCurrent(changes: (Date | null)[], lastSignedAt: Date | null, holding: number): boolean {
  if (holding === 0) return true;
  if (!lastSignedAt) return false;
  const last = Math.max(0, ...changes.filter((d): d is Date => Boolean(d)).map((d) => d.getTime()));
  return lastSignedAt.getTime() >= last;
}

/** Valores dos marcadores {{montador.*}} usados nos modelos de documento do montador. */
export function contractorValues(c: { name: string; document: string | null; phone: string | null; address: string | null; city: string | null; state: string | null; crewRole: string; specialty: string | null; dailyRate: number }) {
  return {
    "montador.nome": c.name,
    "montador.documento": c.document ?? "",
    "montador.telefone": c.phone ?? "",
    "montador.endereco": [c.address, [c.city, c.state].filter(Boolean).join("/")].filter(Boolean).join(" — "),
    "montador.funcao": c.crewRole === "AJUDANTE" ? "Ajudante de montagem" : c.specialty?.trim() || "Montador",
    "montador.diaria": c.dailyRate > 0 ? c.dailyRate.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "",
  };
}

/** Código de conduta e ética da loja (Codigo_de_Conduta_Mobieer.docx), para assinar no sistema. */
export const CONDUCT_BODY = `MOBIEER MÓVEIS PLANEJADOS

Objetivo: Orientar a conduta da equipe nas relações internas, no atendimento aos clientes e na atuação com fornecedores e empresas parceiras.

1. RESPEITO E COMPORTAMENTO PROFISSIONAL

Tratar colegas, gestores, sócios, clientes e fornecedores com respeito. São proibidos discriminação, assédio, ameaças, ofensas, gritos, brincadeiras constrangedoras e invasão de privacidade.

Cumprir as orientações de trabalho e esclarecer dúvidas com a liderança.

2. JORNADA E PONTUALIDADE

Cumprir a jornada de 44 horas semanais, os horários definidos e o intervalo de uma hora para almoço. Comunicar faltas, atrasos e saídas antecipadas à liderança.

Registros, compensações e descontos devem observar as regras aplicáveis ao vínculo de trabalho.

3. CELULAR E RECURSOS DIGITAIS

Usar o celular pessoal somente no almoço e nos intervalos autorizados de 15 minutos por turno. Durante as atividades, o uso depende de solicitação ou autorização do superior.

Internet, e-mail e sistemas da empresa devem ser utilizados para fins profissionais.

4. SEGURANÇA E APRESENTAÇÃO PESSOAL

Usar os EPIs exigidos e seguir as orientações de segurança. Nos setores operacionais, utilizar uniforme, calça e vestimenta adequada à atividade.

Manter higiene pessoal e organização do ambiente. São proibidos álcool, drogas, cigarro e armas no ambiente de trabalho.

5. QUALIDADE E CUIDADO COM O PATRIMÔNIO

Executar os serviços conforme o projeto, os padrões técnicos e as orientações da empresa. Zelar por ferramentas, equipamentos, materiais e bens dos clientes, protegendo pisos, paredes, bancadas e demais superfícies durante a montagem.

Comunicar erros, avarias, faltas de peças e situações que possam comprometer a qualidade ou o prazo. Realizar as correções solicitadas.

6. ATENDIMENTO E ATUAÇÃO EM PARCEIROS

Atender com educação, clareza e profissionalismo. Respeitar as regras dos clientes e das empresas parceiras, evitando conversas em voz alta, brincadeiras e comportamentos que prejudiquem o trabalho ou a imagem da Mobieer.

Alinhamentos comerciais e compromissos devem ocorrer pelos canais oficiais.

7. SIGILO E PROTEÇÃO DAS INFORMAÇÕES

Não divulgar, copiar, utilizar em benefício próprio ou repassar a terceiros projetos, orçamentos, fotos, contatos, dados de clientes e informações técnicas, comerciais ou de produção sem autorização.

O dever de sigilo permanece após o encerramento do vínculo com a empresa.

8. CONFLITOS DE INTERESSE E SERVIÇOS PARTICULARES

Não usar o cargo, os recursos ou os contatos da empresa para favorecer interesses pessoais, amigos ou familiares.

É proibido oferecer, aceitar ou executar serviços particulares para clientes atendidos, prospectados ou em negociação com a Mobieer, inclusive gratuitamente, bem como indicar terceiros para serviços paralelos relacionados à atuação da empresa.

São proibidos desvio de clientes, uso indevido de projetos e concorrência desleal. Atividades externas não podem prejudicar o trabalho nem gerar conflito de interesses.

9. IMAGEM DA EMPRESA E REDES SOCIAIS

Somente pessoas autorizadas podem publicar conteúdos oficiais ou falar em nome da Mobieer. Não divulgar informações internas nem conteúdos que comprometam sua reputação.

O uso do uniforme em eventos pessoais depende de autorização. A participação política deve ocorrer em caráter pessoal, sem representar a empresa ou utilizar seus recursos e uniforme para propaganda.

10. RESPONSABILIDADES DA LIDERANÇA

Orientar a equipe com respeito, sem abuso de autoridade, acompanhar atividades e metas e garantir qualidade e cumprimento dos prazos.

O responsável pela montagem deve alinhar os serviços com o cliente, coordenar a equipe, acompanhar pontualidade e qualidade e garantir a execução fiel do projeto.

O responsável pela produção deve conferir os materiais antes da saída da fábrica e comunicar previamente faltas ou avarias.

11. COMUNICAÇÃO DE IRREGULARIDADES E MEDIDAS DISCIPLINARES

Comunicar à liderança situações de risco, fraude, furto, assédio ou descumprimento das regras. Os relatos devem ser feitos com responsabilidade e tratados com sigilo, sem retaliação a quem agir de boa-fé.

As ocorrências serão apuradas e poderão resultar em orientação, advertência, suspensão ou desligamento, inclusive por justa causa quando cabível, conforme a gravidade e a legislação aplicável.

Eventual responsabilização por danos ou descontos dependerá de apuração e dos requisitos legais, sem aplicação automática.

12. CIÊNCIA E COMPROMISSO

Todos devem conhecer e cumprir este código. Dúvidas devem ser esclarecidas com a liderança. Atualizações serão comunicadas à equipe.

Declaro que li, compreendi e recebi este código de conduta e me comprometo a cumprir suas regras.

{{contrato.cidade}}/CE, {{contrato.dataExtenso}}.

COLABORADOR(A)
Nome: {{montador.nome}}
CPF: {{montador.documento}}
Assinatura: eletrônica, na página de assinaturas deste documento

EMPRESA — MOBIEER MÓVEIS PLANEJADOS
Representante:
Cargo:
Assinatura:
`;

/** Texto do termo de ferramentas (antes da lista com as fotos). */
export function toolTermIntro(name: string, document: string | null): string[] {
  return [
    `Eu, ${name}${document ? `, CPF/CNPJ ${document}` : ""}, declaro que estão sob a minha guarda as ferramentas e os equipamentos da MOBIEER MÓVEIS PLANEJADOS relacionados abaixo, conforme as fotos que registrei no sistema.`,
    "Comprometo-me a zelar por eles, usá-los somente nos serviços da empresa e comunicar qualquer perda, defeito ou avaria. Para passar uma ferramenta a outra pessoa ou devolvê-la, registro a retirada no sistema, com foto.",
    "Eventual responsabilização por perdas ou danos dependerá de apuração e dos requisitos legais, conforme o código de conduta da empresa.",
  ];
}
