/**
 * Contratos do montador, por vínculo:
 * - AUTONOMO: prestação de serviços, por diária ou serviço (Contrato_Montador_ externo .docx);
 * - CONTRATADO: empregado com salário mensal (minuta, revisar com o contador).
 */

/** Vínculo do montador: muda o contrato e a forma de pagamento. */
export const ENGAGEMENT_LABEL: Record<string, string> = {
  AUTONOMO: "Autônomo (prestação de serviços, por diária ou serviço)",
  CONTRATADO: "Contratado (empregado, salário mensal)",
};

/** Nome do modelo de contrato de cada vínculo, como fica em Modelos de documentos. */
export const CONTRACT_TEMPLATE_NAME: Record<string, string> = {
  AUTONOMO: "Contrato do montador autônomo (prestação de serviços)",
  CONTRATADO: "Contrato do montador contratado (CLT)",
};

/** Marcação do uso de imagem e voz, escolhida ao gerar o contrato. */
export function imageConsentText(choice: "SIM" | "NAO" | null | undefined): string {
  if (choice === "SIM") return "[ X ] AUTORIZO o uso de imagem e voz.     [   ] NÃO AUTORIZO.";
  if (choice === "NAO") return "[   ] AUTORIZO o uso de imagem e voz.     [ X ] NÃO AUTORIZO.";
  return "[   ] AUTORIZO o uso de imagem e voz.     [   ] NÃO AUTORIZO. Sem marcação e assinatura específica, não há autorização para publicidade.";
}

export const CONTRACT_AUTONOMO_BODY = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE MONTAGEM

MOBIEER MÓVEIS PLANEJADOS E MONTADOR DE MÓVEIS

CONTRATANTE: MOBIEER MÓVEIS PLANEJADOS, razão social: JD INDÚSTRIA DE MÓVEIS LTDA, CNPJ: 68.032.474/0001-59, com sede em Fortaleza/CE, representada por seu representante legal.

CONTRATADO — MONTADOR: {{montador.nome}}, CPF/CNPJ: {{montador.documento}}, endereço: {{montador.endereco}}.

Contato da Mobieer: (85) 99969-1441. Contato do montador: {{montador.telefone}}.

CLÁUSULA 1 — SERVIÇOS CONTRATADOS

O montador prestará serviços de montagem, pré-montagem, desmontagem, ajustes e assistência de móveis. Os serviços poderão ser internos, na fábrica ou nas instalações indicadas pela Mobieer, e externos, em obras, imóveis de clientes e empresas parceiras. Cada serviço será combinado por escrito, inclusive por mensagem, informando local, projeto, preço, prazo e despesas autorizadas.

CLÁUSULA 2 — FORMA DE TRABALHO

O montador trabalhará de forma autônoma, organizando a execução dos serviços aceitos e respeitando os projetos, os prazos e as regras de segurança e acesso. Não haverá exclusividade nem obrigação de aceitar novos serviços. Auxiliares ou substitutos deverão ter qualificação e cumprir as regras de segurança, sob responsabilidade do montador. Este contrato é para prestação autônoma e não substitui contrato de emprego quando a forma real de trabalho caracterizar vínculo trabalhista.

CLÁUSULA 3 — QUALIDADE E ATENDIMENTO

O montador deverá seguir o projeto, manter organização e limpeza, tratar todos com respeito e proteger móveis, pisos, paredes, bancadas e demais bens. Deverá avisar sobre peças faltantes, avarias, erros e dificuldades antes de continuar o serviço. Alterações no projeto e serviços adicionais precisam de autorização da Mobieer. Falhas de execução de sua responsabilidade deverão ser corrigidas sem cobrança adicional, em prazo combinado. A Mobieer fornecerá os projetos, informações e materiais sob sua responsabilidade e viabilizará o acesso ao local.

CLÁUSULA 4 — PAGAMENTO

O valor dos serviços, as datas de pagamento e a quantidade de horas correspondente a cada diária serão acordados entre a Mobieer e o montador, previamente, por WhatsApp. As mensagens deverão permitir identificar a concordância das duas partes. Despesas extras dependerão de aprovação prévia. O montador fornecerá nota fiscal ou recibo adequado, com as retenções exigidas por lei.

Quando o serviço for contratado por diária, seu valor corresponderá ao total de horas previamente combinado. Se o montador chegar mais tarde ou sair antes do horário ajustado, as horas não prestadas por esse motivo serão calculadas proporcionalmente: valor da diária dividido pelas horas combinadas, multiplicado pelas horas faltantes. Esse valor será abatido da diária, com demonstração do cálculo ao montador. Não serão abatidas horas por impedimento causado pela Mobieer ou pelo cliente, nem períodos cuja remuneração tenha sido expressamente mantida entre as partes. Esta regra aplica-se às diárias; serviços por preço fechado seguirão o valor e as entregas acordadas.

CLÁUSULA 5 — AGENDAMENTO DOS SERVIÇOS

As datas e os prazos serão combinados entre as partes. O horário usual de acesso é das 8h às 12h e das 13h às 17h, de segunda a sexta-feira, podendo variar conforme o local. Esse horário é uma condição de acesso, sem controle de jornada próprio de empregado. Impedimentos, atrasos e reagendamentos deverão ser comunicados assim que conhecidos. Não haverá banco de horas.

CLÁUSULA 6 — FERRAMENTAS E SEGURANÇA

O montador deverá usar os EPIs necessários, cumprir as normas de segurança e operar apenas equipamentos para os quais esteja habilitado. As partes combinarão quem fornecerá ferramentas e EPIs, respeitando suas obrigações legais. Ferramentas, equipamentos, uniformes e materiais recebidos deverão ser conservados e devolvidos, considerando o desgaste normal. Situações de risco deverão ser comunicadas e a atividade interrompida até sua correção.

CLÁUSULA 7 — CONDUTA E CELULAR

São proibidos ofensas, assédio, discriminação, ameaças e uso de álcool ou drogas durante os serviços. Durante a execução, não usar celular para vídeos, redes sociais ou conversas pessoais que prejudiquem a segurança ou o trabalho, ressalvados emergências e uso profissional. Devem ser respeitadas as regras de acesso, segurança e atendimento dos clientes e parceiros. O descumprimento poderá caracterizar falha contratual e levar às medidas previstas neste contrato, conforme a gravidade e a lei.

CLÁUSULA 8 — SIGILO E CLIENTES

O montador não poderá divulgar nem usar em benefício próprio projetos, orçamentos, contatos, dados de clientes ou informações internas da Mobieer. O sigilo continuará após o término do contrato enquanto a informação for confidencial. Dados e documentos serão usados apenas para os serviços, protegidos e devolvidos ou excluídos ao final, salvo guarda permitida por lei. Incidentes deverão ser avisados imediatamente. É proibido usar informações ou oportunidades da Mobieer para desviar clientes, oferecer serviços paralelos, indicar terceiros para desviar a contratação ou receber valores de clientes sem autorização escrita. Pedidos extras serão encaminhados à Mobieer. Esta regra não impede o trabalho para outros clientes sem uso indevido de informações da empresa.

CLÁUSULA 9 — DANOS E CORREÇÕES

O montador responderá pelos prejuízos comprovadamente causados por erro, negligência, imprudência ou dano intencional de sua responsabilidade. A Mobieer também responderá pelos danos que causar. Antes de qualquer cobrança, o fato será registrado e a outra parte poderá se manifestar. Não haverá descontos automáticos: a compensação dependerá de acordo escrito ou dos requisitos legais. Alterações de projeto e problemas de materiais não atribuíveis ao montador serão tratados separadamente.

CLÁUSULA 10 — USO DE IMAGEM E VOZ

Se marcar a opção AUTORIZO e assinar o campo específico abaixo, o montador autoriza gratuitamente a Mobieer a usar fotos e vídeos com sua imagem e voz, feitos durante os serviços internos ou externos, para apresentar a equipe, divulgar trabalhos, portfólio e publicidade em site, redes sociais, anúncios e materiais impressos da empresa. A autorização vale durante o contrato e por 24 meses após seu término. Não permite uso ofensivo, enganoso ou fora dessas finalidades, nem afasta o direito de reclamar por uso indevido. A autorização é pessoal e não abrange clientes, auxiliares ou outras pessoas. O montador não poderá publicar imagens de clientes, projetos ou ambientes sem as autorizações necessárias.

O montador poderá recusar ou retirar a autorização, sem penalidade, por mensagem ao contato da Mobieer indicado neste contrato. A empresa interromperá novos usos e retirará o conteúdo dos canais sob seu controle em até 15 dias, respeitado prazo legal menor. Usos lícitos anteriores serão preservados nos limites da lei, sem exigir recolhimento impossível de impressos já distribuídos. Poderá solicitar informações, acesso e exclusão de seus dados, ressalvada a guarda legalmente permitida.

{{montador.usoImagem}}

Assinatura específica do montador para a opção acima: eletrônica, na página de assinaturas deste documento.

CLÁUSULA 11 — PRAZO E ENCERRAMENTO

Vigência: de {{contrato.inicio}} a {{contrato.fim}}, respeitados os limites legais. Qualquer parte poderá encerrar o contrato por escrito, com antecedência de 8 dias, salvo prazo legal ou acordo específico aplicável ao serviço em andamento. Fraude, desvio de clientes, quebra de sigilo ou descumprimento grave poderão justificar encerramento imediato. Falhas corrigíveis terão prazo razoável para solução. No término, serão apurados os serviços prestados, pagamentos, devolução de bens e pendências, preservadas as consequências legais do cancelamento de serviços já contratados.

CLÁUSULA 12 — ACORDOS E ASSINATURAS

Mudanças deverão ser combinadas por escrito. Para questões civis, fica eleito o foro de Fortaleza/CE, desde que presente a vinculação exigida por lei, respeitadas as competências obrigatórias. As partes assinam este contrato com duas testemunhas, podendo utilizar assinatura eletrônica com comprovação de autoria e integridade.

{{contrato.cidade}}/CE, {{contrato.dataExtenso}}.

MONTADOR: {{montador.nome}} — assinatura eletrônica na página de assinaturas
Representante da Mobieer:
Testemunha 1 — Nome e CPF:
Testemunha 2 — Nome e CPF:
`;

export const CONTRACT_CONTRATADO_BODY = `CONTRATO INDIVIDUAL DE TRABALHO — MONTADOR DE MÓVEIS

MOBIEER MÓVEIS PLANEJADOS E MONTADOR DE MÓVEIS

EMPREGADORA: MOBIEER MÓVEIS PLANEJADOS, razão social: JD INDÚSTRIA DE MÓVEIS LTDA, CNPJ: 68.032.474/0001-59, com sede em Fortaleza/CE, representada por seu representante legal.

EMPREGADO — MONTADOR: {{montador.nome}}, CPF: {{montador.documento}}, endereço: {{montador.endereco}}.

Contato da Mobieer: (85) 99969-1441. Contato do montador: {{montador.telefone}}.

CLÁUSULA 1 — FUNÇÃO E ATIVIDADES

O empregado é contratado para a função de {{montador.funcao}}, para realizar montagem, pré-montagem, desmontagem, ajustes e assistência de móveis, na fábrica, nas instalações indicadas pela Mobieer, em obras, imóveis de clientes e empresas parceiras.

CLÁUSULA 2 — VÍNCULO

Este contrato é de emprego, regido pela Consolidação das Leis do Trabalho (CLT), com registro em Carteira de Trabalho e no eSocial a partir de {{contrato.inicio}}. O empregado segue as orientações da Mobieer, os projetos, os prazos e as regras de segurança, acesso e conduta da empresa.

CLÁUSULA 3 — QUALIDADE E ATENDIMENTO

O empregado deverá seguir o projeto, manter organização e limpeza, tratar todos com respeito e proteger móveis, pisos, paredes, bancadas e demais bens. Deverá avisar sobre peças faltantes, avarias, erros e dificuldades antes de continuar o serviço. Alterações no projeto e serviços adicionais precisam de autorização da Mobieer. A Mobieer fornecerá os projetos, informações e materiais e viabilizará o acesso ao local.

CLÁUSULA 4 — SALÁRIO

O empregado receberá salário mensal de {{montador.salario}}, pago até o 5º (quinto) dia útil do mês seguinte ao trabalhado, com os descontos previstos em lei. Férias, 13º salário, FGTS, horas extras e demais direitos seguem a legislação e a convenção coletiva aplicável.

CLÁUSULA 5 — JORNADA E PONTO

A jornada é de 44 (quarenta e quatro) horas semanais, das 8h às 12h e das 13h às 17h, de segunda a sexta-feira, com os ajustes de horário combinados conforme a lei. O ponto é registrado no relógio ou no sistema da empresa. Horas extras dependem de autorização prévia e são pagas ou compensadas conforme a lei e os acordos aplicáveis. Faltas, atrasos e saídas antecipadas devem ser comunicados à liderança.

CLÁUSULA 6 — FERRAMENTAS, UNIFORME E SEGURANÇA

A Mobieer fornecerá os EPIs, o uniforme e as ferramentas necessários. O empregado deverá usá-los, cumprir as normas de segurança, operar apenas equipamentos para os quais esteja habilitado e registrar no sistema as ferramentas sob sua guarda. Ferramentas, equipamentos e uniformes deverão ser conservados e devolvidos, considerando o desgaste normal. Situações de risco deverão ser comunicadas e a atividade interrompida até sua correção.

CLÁUSULA 7 — CONDUTA, SIGILO E CLIENTES

O empregado cumprirá o Código de Conduta e Ética da Mobieer, que integra este contrato. É proibido divulgar ou usar em benefício próprio projetos, orçamentos, contatos, dados de clientes ou informações internas, inclusive após o fim do contrato, bem como desviar clientes, oferecer serviços paralelos ou receber valores de clientes sem autorização escrita.

CLÁUSULA 8 — DANOS

Descontos por danos causados pelo empregado só ocorrerão nos casos permitidos pelo artigo 462 da CLT, após apuração do fato e com direito de manifestação.

CLÁUSULA 9 — USO DE IMAGEM E VOZ

O uso de fotos e vídeos com a imagem e a voz do empregado para divulgação da empresa depende da marcação abaixo e pode ser retirado a qualquer momento, sem penalidade, por mensagem ao contato da Mobieer.

{{montador.usoImagem}}

CLÁUSULA 10 — PRAZO E ENCERRAMENTO

Início em {{contrato.inicio}}, por prazo indeterminado, com período de experiência conforme a lei e o registro em Carteira de Trabalho. O encerramento segue as regras da CLT.

CLÁUSULA 11 — FORO E ASSINATURAS

Fica eleito o foro da Justiça do Trabalho de Fortaleza/CE. As partes assinam este contrato, podendo utilizar assinatura eletrônica com comprovação de autoria e integridade.

{{contrato.cidade}}/CE, {{contrato.dataExtenso}}.

EMPREGADO: {{montador.nome}} — assinatura eletrônica na página de assinaturas
Representante da Mobieer:
Testemunha 1 — Nome e CPF:
Testemunha 2 — Nome e CPF:
`;
