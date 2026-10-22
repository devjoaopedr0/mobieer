/**
 * Guias "Como usar esta tela": textos curtos, por tela, com o passo a passo
 * das tarefas principais e o que tem em cada aba. Aparecem no topo da tela
 * (components/page-guide.tsx). Para mudar um texto, é só editar aqui.
 */
export type Guide = {
  /** o que a tela faz, em uma frase */
  intro: string;
  /** passo a passo das tarefas mais comuns */
  steps: string[];
  /** uma linha por aba ou seção da tela */
  sections?: [string, string][];
  /** dica curta no fim */
  tip?: string;
};

/** Caminho da tela (com :parâmetro) -> guia. */
export const GUIDES: Record<string, Guide> = {
  "/": {
    intro: "Resumo da loja: escolha o tipo de dashboard (Comercial, Financeiro ou Estoque).",
    steps: [
      "Em Tipo de dashboard, escolha Comercial, Financeiro ou Estoque. O sistema lembra a escolha.",
      "Comercial: novos projetos do mês, projetos quentes (para fechar em 30 dias), futuros (venda futura) e em atraso; o progresso de vendas e a meta.",
      "Financeiro: fluxo de caixa dos próximos 7 dias, contas a pagar e a receber que vencem hoje e vencidas, e orçamentos esperando liberação.",
      "Clique em Ver carteira ou no número de títulos para ir à tela do assunto.",
    ],
    tip: "O menu à esquerda segue a ordem do atendimento: Comercial → Projeto → Produção → Montagem → Pós-venda → Financeiro.",
  },
  "/comercial": {
    intro: "Onde o cliente entra e vira venda: leads, funil, orçamentos e metas.",
    steps: [
      "Lead novo: aba Leads → Novo lead. Preencha o contato e a origem.",
      "Quando o lead avançar, clique em Converter: ele vira cliente e a negociação segue no funil.",
      "Orçamento: aba Orçamentos → Novo orçamento. Escolha o cliente; ambientes, acabamentos e comissões ficam no orçamento.",
      "Cliente aceitou: abra o orçamento e clique em Cliente aceitou. As parcelas e as comissões vão para o Financeiro.",
      "Com o orçamento aceito, clique em Gerar contrato.",
    ],
    sections: [
      ["Funil", "negociações por etapa; arraste o cartão para mudar a etapa."],
      ["Lembretes", "o que está atrasado: retorno de cliente, orçamento sem resposta."],
      ["Orçamentos", "todos os orçamentos, com versão, adendo e status."],
      ["Leads", "contatos que ainda não viraram cliente."],
      ["Metas", "meta da loja e de cada projetista."],
    ],
    tip: "Cliente que quer mais ambientes junto com o contrato: use Adendo no orçamento aceito. Se for depois, crie um projeto novo.",
  },
  "/comercial/orcamentos/:id": {
    intro: "Monte o orçamento: ambientes, custo, acabamentos, pagamento e comissões.",
    steps: [
      "Escolha o cliente (e o projeto, se já existir). O projetista do cliente já entra na comissão.",
      "Adicione um ambiente por linha, com o custo e os acabamentos (caixaria, porta, puxador).",
      "Defina desconto, forma de pagamento, entrada e parcelas.",
      "Salve e baixe o PDF para enviar ao cliente.",
      "Quando o cliente aceitar, clique em Cliente aceitou e confira as datas das parcelas.",
    ],
    tip: "Custo, mark-up e comissões não aparecem no PDF do cliente.",
  },
  "/clientes-projetos": {
    intro: "O cadastro central: clientes e os projetos de cada um.",
    steps: [
      "Cliente novo: aba Clientes → Novo cliente. Digite o CEP e o endereço se preenche sozinho; complete o número.",
      "Escolha o projetista do cliente: a comissão dele já entra nos orçamentos.",
      "Projeto novo: aba Projetos → Novo projeto. Se o projeto já estava em andamento, escolha a etapa em que ele está.",
      "Clique no projeto para abrir tudo dele: documentos, medição, produção, montagem e portal.",
    ],
    sections: [
      ["Clientes", "cadastro, contato, endereço e projetista; o lápis edita."],
      ["Projetos", "todos os projetos; clique para abrir."],
      ["Assistência", "chamados dos clientes."],
    ],
  },
  "/clientes-projetos/:projectId": {
    intro: "Tudo deste projeto em um lugar, do documento à montagem.",
    steps: [
      "Documentos: gere a descritiva, o termo de entrega e o contrato; envie arquivos para o cliente.",
      "Medição e Elaboração do projeto: registre a medição e monte o projeto técnico.",
      "Aprovação do cliente: o cliente aprova pelo portal; aí o pedido vai para a produção.",
      "Produção, Cronograma e Pós-venda: acompanhe a fábrica, marque a montagem e faça a vistoria.",
    ],
    sections: [
      ["Documentos", "descritiva (com IA), termo de entrega e arquivos do projeto."],
      ["Render", "imagens 3D com IA, que entram na descritiva."],
      ["Produção", "etapa da fábrica, planos de corte e etiquetas."],
      ["Portal do cliente", "o que o cliente vê e o acesso dele."],
    ],
  },
  "/medicoes": {
    intro: "Pedidos de medição: do cliente (pelo portal) ou criados pela equipe.",
    steps: ["Nova medição: escolha o cliente e a data.", "Na visita, anexe as fotos e as medidas.", "Conclua a medição para o projeto seguir.", "Desenhos: todos os desenhos de medição num lugar só, como os quadros do iPad. Busque pelo cliente e clique para continuar o desenho."],
  },
  "/producao": {
    intro: "Onde está cada pedido na fábrica, do liberado à entrega.",
    steps: [
      "Esteira: os pedidos por fase. Clique em um pedido para ver as etapas e avançar.",
      "Kanban: um cartão por pedido; arraste o cartão para mudar de etapa (também dá para voltar).",
      "Projeto antigo que já está na fábrica: Incluir projeto em andamento.",
      "No pedido, anexe os planos de corte e as etiquetas e defina a previsão de entrega.",
    ],
    tip: "Metalon, peças especiais e portas de vidro andam em paralelo com a marcenaria, cada frente com seu andamento.",
  },
  "/producao/planejamento": {
    intro: "Quem faz o quê em cada dia da produção, e o que foi cumprido.",
    steps: [
      "Para criar uma tarefa, clique em + item no dia e escreva \"NOME: tarefa\" (sem nome vai para a EQUIPE).",
      "Arraste a tarefa para outro dia para reagendar.",
      "Quem executa marca a caixinha quando terminar.",
      "Não cumpriu: diga o motivo e escolha para quando passar.",
      "No fim da semana, veja o fechamento: o que foi feito e os motivos mais comuns.",
    ],
    tip: "Quem executa abre direto em Só as minhas.",
  },
  "/producao/fabrica": {
    intro: "Peças e itens de cada pedido na fábrica.",
    steps: ["Adicione os itens à mão ou gere a partir do arquivo do Promob.", "Imprima as etiquetas com código de barras.", "Dê baixa nos itens pelo Leitor de etiquetas."],
  },
  "/producao/leitor": {
    intro: "Dê baixa nas peças lendo a etiqueta.",
    steps: ["Aponte o leitor (ou a câmera do celular) para o código de barras.", "Cada leitura dá baixa em um item.", "O que faltar fica em vermelho na conferência do projeto."],
  },
  "/montagens": {
    intro: "Entregas, montagens e vistorias marcadas.",
    steps: [
      "Novo agendamento: escolha o tipo (montagem, entrega, vistoria), a data e o responsável.",
      "No Calendário, arraste o compromisso para outro dia.",
      "Na Linha do tempo, veja quantos dias cada montagem dura: arraste a barra para mudar a data e a ponta para mudar a duração.",
      "Dia em vermelho = mais montagens que equipes. É hora de contratar ou mudar datas.",
    ],
    tip: "Barra tracejada é montagem prevista: o pedido está na fábrica, mas a montagem ainda não foi marcada.",
  },
  "/agenda": {
    intro: "Compromissos de todos: reuniões, visitas, medições, entregas e montagens.",
    steps: ["Novo agendamento: título, tipo, data e responsável.", "Arraste para outro dia para reagendar.", "Use o filtro de tipo e Minha agenda para ver só uma parte."],
  },
  "/montadores": {
    intro: "Montadores externos: cadastro, presença, documentos e pagamento.",
    steps: [
      "Cadastre o montador e escolha o vínculo: Autônomo (diária) ou Contratado (salário).",
      "Documentos: Gerar de modelo envia o contrato e o código de conduta para ele assinar no celular.",
      "Na mesma aba, veja as ferramentas que estão com ele, com foto.",
      "Fechamento: horas, diárias, bônus e o abatimento sugerido pelas horas que faltaram.",
    ],
    sections: [
      ["Equipe", "cadastro e vínculo."],
      ["Presença e Turnos", "entrada e saída na obra."],
      ["Documentos", "contratos, código de conduta e termo de ferramentas."],
      ["Fechamento", "quanto pagar no período."],
    ],
  },
  "/montador": {
    intro: "Sua área: entrada na obra, cômodos montados, ferramentas e documentos.",
    steps: [
      "Ao chegar, toque em Registrar entrada; ao sair, em Registrar saída.",
      "Em Ferramentas, marque o que está com você e tire a foto. Depois, assine o termo.",
      "Para passar uma ferramenta a outra pessoa, toque em Retirar e tire a foto.",
      "Em Documentos, abra e assine o contrato e o código de conduta.",
    ],
  },
  "/assistencias": {
    intro: "Chamados de assistência: do pedido do cliente até resolver.",
    steps: [
      "Nova assistência: escolha o cliente e o tipo. Erro interno e retrabalho ficam só para a equipe.",
      "Agende a visita; o cliente confirma pelo link.",
      "Lance os itens usados (na garantia). Cobrar só o que não for garantia.",
      "Use Dar baixa no estoque para as peças tiradas do almoxarifado e gere a ordem de serviço em PDF.",
    ],
    sections: [
      ["Lista e Kanban", "os chamados por situação; arraste no Kanban."],
      ["Agenda", "visitas marcadas."],
      ["Por região", "chamados agrupados por bairro, para juntar visitas próximas."],
    ],
  },
  "/pos-venda": {
    intro: "Vistorias, garantias e manutenção preventiva.",
    steps: ["Veja as obras que precisam de vistoria ou manutenção.", "A vistoria e o certificado de garantia de cada obra ficam na aba Pós-venda do projeto."],
  },
  "/financeiro/planner": {
    intro: "As contas da semana por dia, como no planner da produção, com soma automática.",
    steps: [
      "No dia, escreva em + conta: NOME: do que é valor (ex.: KELSON: 1ª quinzena outubro 854,00) e aperte Enter.",
      "Arraste a conta para outro dia para mudar o vencimento.",
      "Marque a caixinha quando pagar: abre o registro do pagamento, com comprovante.",
      "Por pessoa: o que a loja deve a cada um, o que a pessoa deve (acordos, descontos) e o saldo.",
      "Lista e soma: filtre por período, tipo e situação e marque as contas para ver a soma.",
    ],
    tip: "As contas atrasadas de antes da semana aparecem em vermelho no topo.",
  },
  "/financeiro/ponto-de-equilibrio": {
    intro: "Quanto a loja precisa vender no mês para pagar os custos fixos e para chegar à meta de lucro.",
    steps: [
      "Escolha o mês e o ano.",
      "Informe os custos fixos, a meta de lucro e a previsão de impostos. Saia do campo para salvar.",
      "Veja a venda necessária para o ponto de equilíbrio e para a meta, o quanto falta e o resultado do mês.",
      "Para testar números sem salvar, ligue o Modo simulação.",
    ],
    sections: [
      ["Contratos assinados", "o que foi vendido no mês (orçamentos aceitos), já sem a taxa da financeira."],
      ["Margem de contribuição", "o que sobra da venda depois de compra, comissões, frete e impostos."],
      ["Evolução no mês", "a venda acumulada dia a dia contra as linhas do equilíbrio e da meta."],
    ],
    tip: "Os custos fixos começam pela soma das despesas cadastradas em Financeiro → Fixos.",
  },
  "/financeiro": {
    intro: "Contas a pagar e a receber, caixa e resultado.",
    steps: [
      "Lançamento novo: aba Lançamentos → Novo. Escolha receita ou despesa, a categoria e o vencimento.",
      "Pagou ou recebeu: Marcar pago e anexe o comprovante.",
      "Comissões e dívidas: veja quem ainda tem comissão a receber, as dívidas antigas e as contas atrasadas.",
      "Fluxo de caixa e DRE mostram o resultado do mês.",
    ],
    sections: [
      ["Lançamentos", "todas as receitas e despesas."],
      ["Comissões e dívidas", "comissões em aberto, dívidas anteriores e contas vencidas."],
      ["Fixos", "contas que se repetem todo mês."],
      ["Solicitações", "pedidos de pagamento da equipe para aprovar."],
      ["Cartões", "faturas e gastos dos cartões."],
    ],
    tip: "As parcelas e as comissões de cada venda entram sozinhas quando o orçamento é aceito.",
  },
  "/rh": {
    intro: "Colaboradores, férias, ponto e documentos.",
    steps: [
      "Ponto: importe o arquivo do relógio (AGL). Quem não estiver ligado a um colaborador pode ser cadastrado na hora.",
      "Confira as horas da equipe no mês e o banco de horas.",
      "Desfaça uma importação errada pelo histórico de importações.",
    ],
    sections: [
      ["Colaboradores", "cadastro e número no relógio de ponto."],
      ["Ponto", "importação e horas de cada um."],
      ["Feriados", "dias que não contam como falta."],
    ],
  },
  "/meu-espaco": {
    intro: "Seu planner da semana e suas notas. Só você vê.",
    steps: ["Clique em um dia para adicionar um item.", "Arraste o item para outro dia.", "Clique no item para editar, pôr observação ou prazo."],
  },
  "/minhas-tarefas": {
    intro: "Tarefas dos quadros da equipe que são suas.",
    steps: ["Abra a tarefa para ver o checklist e os comentários.", "Marque os itens do checklist e conclua a tarefa."],
  },
  "/organizacao": {
    intro: "Quadros de tarefas da equipe.",
    steps: ["Crie um cartão na coluna certa.", "Arraste o cartão entre as colunas conforme anda.", "Abra o cartão para editar responsável, prazo e checklist."],
  },
  "/organizacao/:id": {
    intro: "Quadro de tarefas.",
    steps: ["Crie um cartão na coluna certa.", "Arraste o cartão entre as colunas conforme anda.", "Abra o cartão para editar responsável, prazo e checklist."],
  },
  "/modelos": {
    intro: "Modelos de documentos: contratos, código de conduta e outros textos.",
    steps: [
      "Edite o texto do modelo. Os campos entre {{ }} são preenchidos pelo sistema (nome, CPF, valores).",
      "O contrato da loja sai do orçamento aceito; os do montador saem em Montadores → Documentos.",
    ],
    tip: "Linha sozinha em MAIÚSCULAS vira título; \"Rótulo: texto\" sai com o rótulo em negrito.",
  },
  "/produtos": {
    intro: "Materiais do almoxarifado.",
    steps: ["Cadastre o produto com código, unidade e estoque mínimo.", "As entradas e saídas atualizam o estoque sozinhas."],
  },
  "/entrada": { intro: "Entrada de material no almoxarifado.", steps: ["Escolha o produto (ou leia o código).", "Informe a quantidade e o fornecedor.", "Confirme: o estoque sobe na hora."] },
  "/saida": { intro: "Saída de material do almoxarifado.", steps: ["Escolha o produto e a quantidade.", "Diga para onde vai (projeto, setor ou cliente).", "Confirme: o estoque desce na hora."] },
  "/movimentacoes": { intro: "Histórico de entradas, saídas e ajustes.", steps: ["Filtre por produto, tipo ou período.", "Exporte quando precisar conferir."] },
  "/compras": {
    intro: "Compras: da solicitação ao recebimento.",
    steps: ["Solicite a compra.", "Aprove e cote com os fornecedores.", "Faça o pedido e, ao receber, dê entrada no estoque."],
  },
  "/requisicoes": { intro: "Requisições de peças para a produção. Enviada, a requisição fica aqui na lista (status Solicitada) e vai para o Painel de corte depois de liberada.", steps: ["Crie a requisição com as peças do projeto e clique em Enviar.", "Para imprimir, abra a requisição e clique em Imprimir, ou use Imprimir em aberto: saem duas por folha.", "Confira a disponibilidade dos materiais e libere para o corte.", "Acompanhe o corte até concluir."] },
  "/inventario": { intro: "Conferência do estoque físico com o do sistema.", steps: ["Abra um inventário.", "Conte e lance as quantidades.", "Feche para ajustar as diferenças."] },
  "/solicitacao-pecas": { intro: "Peças que os montadores pedem da obra.", steps: ["Veja o pedido, com fotos.", "Acompanhe da produção até a instalação."] },
  "/notas-fiscais": { intro: "Notas fiscais emitidas e recebidas.", steps: ["Emita a NF-e pelo provedor ou registre a nota enviada pela contabilidade."] },
  "/usuarios": { intro: "Quem acessa o sistema e o que cada um pode ver.", steps: ["Crie o usuário com o perfil certo.", "O perfil define as telas que a pessoa vê."] },
  "/configuracoes": { intro: "Sua conta e as preferências da loja.", steps: ["Troque sua senha e ative a verificação em duas etapas.", "Ajuste os dados da loja e a assinatura que sai no orçamento."] },
  "/semana": { intro: "Resumo da semana da Mobieer.", steps: ["Veja o que aconteceu e o que vem na semana, por área."] },
  "/chat": { intro: "Conversas da equipe.", steps: ["Escolha a conversa ou comece uma nova.", "Mande texto, fotos e arquivos."] },
};

/** Guia da tela atual: o caminho exato ou o que tem :parâmetro no lugar. */
export function guideFor(pathname: string): { key: string; guide: Guide } | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (GUIDES[path]) return { key: path, guide: GUIDES[path] };
  const parts = path.split("/");
  for (const key of Object.keys(GUIDES)) {
    const k = key.split("/");
    if (k.length !== parts.length) continue;
    if (k.every((seg, i) => seg.startsWith(":") || seg === parts[i])) return { key, guide: GUIDES[key] };
  }
  return null;
}
