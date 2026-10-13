# Produção e fábrica

## Onde fica
- **Produção**: os pedidos de produção de cada projeto e a etapa em que estão.
- **Fábrica**: quadro por setor, com os itens que estão em cada um.
- **Leitor de etiquetas**: baixa dos itens pelo código de barras.
- Dentro do projeto, a aba **Produção**.

## Etapas do pedido
Liberado para produção → Em produção → Pré-montagem → Em rota de entrega e montagem → Entregue e montado.

## Itens e setores
Cada pedido tem itens (módulos e peças) que passam pelos setores da fábrica: corte, fita de borda, furação, pré-montagem, embalagem e expedição. Os itens podem ser adicionados à mão ou gerados a partir de um arquivo do Promob já lido.

## Etiquetas com código de barras
Na aba Produção do projeto dá para imprimir as etiquetas dos itens, em folha A4 ou em impressora térmica (100 × 50 mm). Cada item tem um código único.

## Leitor de etiquetas
Menu **Leitor de etiquetas**. A baixa pode ser feita de três formas: com leitor de código de barras, com a câmera do celular ou digitando o código. A tela mostra a conferência do projeto, com o que ainda falta em vermelho. A leitura não trava a produção.

## Importação do Promob
Na aba **Promob** do projeto envie o arquivo exportado: o CSV do plano de corte, o PDF de orçamento ou o PDF do plano de corte. O sistema lê as peças, as chapas por material e as fitas de borda. O botão **Reler arquivo** refaz a leitura.

## Compras de materiais
Menu **Compras de materiais**, ou a aba **Materiais** do projeto. É a lista de chapas e fitas a comprar, por cliente e por ambiente.
1. Na aba Materiais do projeto, clique em **Puxar do Promob** para montar a lista a partir do arquivo lido. A quantidade de chapas é estimada pela área das peças mais 10% de perda de corte.
2. Também é possível adicionar um material à mão (ambiente, material e quantidade).
3. Toque no material para marcar como **comprado**; toque de novo para desmarcar.
4. No menu Compras de materiais aparecem todos os clientes juntos, com o filtro **Com pendência** ou **Todos**.

Atualizar a lista pelo Promob não apaga o que já foi marcado como comprado nem o que foi digitado.

## Planejamento da semana
Menu **Produção → Planejamento da semana**. É uma grade com os dias da semana nas colunas (segunda a sexta; o sábado aparece quando tem tarefa) e as pessoas nas linhas. Em cada quadrinho ficam as tarefas daquela pessoa naquele dia, e uma tarefa pode ter passos (por exemplo "finalizar a cozinha": corte da viga, rasgo de fundo, pré-montar).

Quem monta o planejamento (a administração e quem atualiza as etapas da produção):
- **Colar do WhatsApp**: cole o texto como já é escrito — a semana ("SEMANA 13/10 - 16/10"), os dias ("TERÇA FEIRA:"), o nome de cada pessoa entre asteriscos ("*VIVIANE*") e as tarefas embaixo. Linha começando com "-" vira um passo da tarefa de cima. O sistema mostra a prévia para conferir e só então acrescenta à semana.
- **Nova tarefa** ou o botão **+ tarefa** dentro de um quadrinho: escolha a pessoa, o dia, escreva a tarefa e, se quiser, o cliente e os passos.
- O lápis na tarefa abre a edição; dali também se remove.

Quem executa: abre a mesma tela, vê as suas tarefas e marca a caixinha da tarefa ou de cada passo quando termina. Uma tarefa com passos fica feita quando todos estão marcados. **Só as minhas** mostra apenas a linha de quem está logado (pelo primeiro nome). O nome da pessoa é o que a loja escreve; não precisa ser um usuário do sistema para aparecer na grade.

### Tarefa não cumprida e o motivo
Quando a tarefa do dia não foi feita, clique em **Não cumprida** (no dia) ou em **Não foi feita — informar o motivo** (quando o dia já passou; a tarefa fica em amarelo até alguém justificar). Escolha o motivo — faltou material, faltou pessoa, máquina ou ferramenta, retrabalho, dúvida ou erro no projeto, outra prioridade entrou, ou outro — e, se quiser, escreva um detalhe. Quem executa também pode informar o motivo. A tarefa fica em vermelho com o motivo escrito; **desfazer** tira a justificativa e marcar como feita também.

Quem monta o planejamento pode, na mesma janela, **passar para outro dia**: a tarefa é criada no novo dia só com os passos que faltaram, e a original continua registrada como não cumprida, com o motivo e o dia para onde foi.

### Visão do dia e fechamento da semana
O botão **Dia** troca a grade pelas metas de um só dia, uma caixa por pessoa, mais fácil de ler no celular ou numa TV da fábrica; os botões acima escolhem o dia. O quadro **Fechamento da semana** aparece quando há tarefa não cumprida ou sem justificativa e mostra quantas foram cumpridas, quantas não, quantas estão sem justificativa e os motivos mais frequentes.

## Kanban da produção
No menu **Produção**, o botão **Kanban** (ao lado de **Esteira**) mostra um cartão por pedido, na coluna da etapa da fábrica em que ele está: Plano de corte, Corte, Fita de borda, Peças especiais, Limpeza, Embalagem, Pré-montagem, Liberação e Saída. O pedido que já concluiu todas as etapas fica em **Pronto para entrega**. O cartão mostra o código e o nome do projeto, o cliente, a situação da etapa (pendente, em andamento ou bloqueada, com o motivo), quantas etapas já foram concluídas, o prazo da etapa (em vermelho quando atrasada), o responsável e a entrega prevista. Clicar no cartão abre o projeto.

Quem gerencia a organização ou atualiza as etapas da produção pode **arrastar o cartão para uma etapa à frente**: as etapas abertas do caminho são concluídas e a de destino é iniciada. O quadro não volta etapa (para isso, reabra a etapa dentro do pedido) e não passa por cima de etapa bloqueada. Há busca por cliente ou projeto e filtro por responsável.

## Frentes de produção
Além da marcenaria (que segue as etapas da fábrica), o mesmo pedido pode ter outras frentes andando ao mesmo tempo, cada uma no seu ritmo: **Metalon**, **Peças especiais** e **Portas de vidro**. Na aba Produção do projeto, o quadro **Frentes de produção** permite acrescentar a frente ao pedido e definir a situação (Pendente, Em andamento, Concluída), o responsável, o prazo e uma observação; a frente com prazo vencido aparece com os dias de atraso. No **Kanban** da produção, cada cartão mostra as frentes do pedido com a situação, e o filtro **Frente** mostra só os pedidos que têm aquela frente. Por enquanto as frentes não têm etapas próprias, só a situação. Acrescentar e alterar frentes é de quem gerencia a organização ou atualiza as etapas da produção.
