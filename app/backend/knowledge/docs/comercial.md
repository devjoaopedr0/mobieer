# Comercial e orçamentos

## Onde fica
Menu **Comercial**. Reúne o funil de vendas (oportunidades por etapa), os orçamentos, as metas e os lembretes.

## Lembretes
A aba **Lembretes** mostra os clientes em aberto que precisam de contato: ação vencida, orçamento enviado sem retorno, orçamento vencendo ou parado, e lead sem contato. Um resumo diário também aparece no sino de notificações.

## Metas
Na área de metas existe a **meta sugerida**: o sistema calcula, pelas despesas fixas e pela margem dos contratos, uma meta mínima, uma recomendada e uma de desafio, com a divisão por consultor.

## Como criar um orçamento
1. Em **Comercial**, abra a oportunidade ou o cliente e crie um orçamento.
2. No editor, cada ambiente é um bloco: nome do ambiente, valor e os acabamentos — **Caixaria**, portas e frentes, puxador, complemento e modelo — além de uma observação do ambiente.
3. No cartão **Negociação e condições** escolha a forma de pagamento e, se quiser, escreva a condição de pagamento em texto livre, o prazo de entrega (texto e dias) e a data de validade da proposta.
4. Salve. O PDF do orçamento sai com os dados da venda e do cliente, a tabela de ambientes, o total, os acabamentos, as condições e as observações.

## Observações do orçamento
No PDF, a única observação fixa é a da **garantia** (5 anos para móveis e ferragens), que sai em todo orçamento. As demais são escritas por quem monta o orçamento, no campo **Observações do orçamento** do cartão **Negociação e condições**: cada linha sai como uma observação (OBS², OBS³…). Abaixo do campo há **atalhos** com frases prontas; clicar em um deles acrescenta a frase. O texto da garantia e a lista de atalhos podem ser alterados em **Configurar preços**.

## Preço, mark-up e liberação
O preço é calculado a partir do custo, do mark-up e das comissões. O sistema calcula o mark-up efetivo do orçamento:
- mark-up efetivo **igual ou maior que 2**: o orçamento pode ser fechado direto;
- **menor que 2**: o orçamento fica aguardando liberação de quem tem essa permissão.

O mínimo (2), o texto da garantia e os atalhos de observação podem ser alterados na configuração do orçamento.

## Orçamento vindo do Promob
Quando um arquivo do Promob com valores é importado no projeto, o sistema cria ou atualiza um orçamento em rascunho ligado ao projeto.

## Desconto: em R$, em % ou fechando no valor final
No cartão **Preço** do orçamento, o campo de desconto tem três modos, escolhidos na caixinha ao lado:
- **em R$**: o desconto é um valor fixo.
- **em %**: o desconto é um percentual do preço de venda e acompanha o preço se o mark-up mudar.
- **fechar em**: você informa o **valor final combinado com o cliente** e o sistema calcula o desconto sozinho.

## Como melhorar a pontuação sem mudar o valor do cliente
A comissão é acrescentada ao preço. Por isso, com o desconto em R$ ou em %, reduzir a comissão só baixa o preço e a pontuação quase não muda. Para a pontuação subir, use o modo **fechar em** com o valor combinado: aí o cliente continua pagando o mesmo, e reduzir comissão, frete ou outros custos aumenta a pontuação. Também melhora a pontuação: dar menos desconto ou evitar forma de pagamento com taxa retida.

## Formas de pagamento
À vista, PIX, Boleto parcelado, Cartão de crédito, Financeira e as combinadas com entrada no PIX: **Entrada no PIX + boleto**, **Entrada no PIX + cartão** e **Entrada no PIX + financeira**. Nas combinadas, informe o valor da entrada no campo **Entrada no PIX** e as parcelas do saldo; a taxa retida (cartão ou financeira) incide só sobre o saldo. Ao aprovar o orçamento, o financeiro recebe a entrada como PIX e as parcelas na segunda forma.

## Aceite do cliente: vencimentos e comissões
Ao clicar em **Cliente aceitou**, a janela mostra o que vai para o financeiro. Cada linha tem um campo de **vencimento**: a entrada vem com a data de hoje e o restante pode receber a data combinada com o cliente. As **comissões são pagas conforme a loja recebe**: cada comissão é repartida na mesma proporção dos recebimentos (entrada, restante ou parcelas) e vence junto com cada um; ao mudar a data de um recebimento, a comissão ligada a ele acompanha. O **valor** de cada comissão pode ser alterado nessa janela, e comissão com valor zero não é lançada. O valor dos recebimentos não muda ali, porque é o total do contrato.

## Gerar o contrato pelo orçamento
Com o orçamento **aceito pelo cliente**, o quadro **Ações** ganha o botão **Gerar contrato**. Escolha o modelo de contrato e clique em **Gerar e enviar ao cliente**: o sistema preenche o modelo com o cliente, o valor total, a entrada, as parcelas, a condição de pagamento e o prazo do orçamento, baixa o PDF e coloca o contrato nos documentos do projeto, visível no portal do cliente.

O modelo cadastrado é o **contrato da loja** ("Contrato de compra e venda (modelo da loja)"). O sistema preenche:
- **qualificação do contratante**: nome, CPF/CNPJ, endereço atual, endereço de entrega (se vazio, usa o do cliente), telefone, e-mail, vendedor e data do aceite;
- **resumo do pedido**: tabela com cada ambiente (AA, AB…), linha, prazo de fabricação e valor, o desconto e o valor total, e a tabela de acabamentos (caixaria, porta, puxador e observação);
- **pagamento**: condição, forma e as parcelas (entrada, parcela 1, 2…) com valor e vencimento. As parcelas são as lançadas no financeiro no aceite; se o aceite não lançou, saem do plano do orçamento.

As cláusulas e assinaturas são o texto da loja e podem ser editadas em **Modelos de documentos**. No texto, as linhas `{{quadro.pedido}}` e `{{quadro.pagamento}}` viram as tabelas e precisam ficar sozinhas na linha. Campo sem informação no cadastro sai com uma linha em branco para preencher à mão.

Se o modelo pede assinatura, a loja assina na aba **Documentos** do projeto (botão **Assinar**) e o cliente assina no portal. O botão só aparece para quem pode gerenciar documentos, e é preciso ter um modelo de contrato com texto cadastrado em **Modelos de documentos**.

## Quem pode cadastrar cliente e projeto
O botão **Adicionar** em **Clientes e projetos** aparece para a administração e para quem trabalha no comercial (quem gerencia o comercial, os leads ou os orçamentos).

## Caminho do cliente no comercial
No topo da tela **Comercial** há cinco passos, na ordem em que o atendimento acontece; clicar em um passo leva à tela onde ele é feito: **1. Lead e briefing** (aba Leads), **2. Cliente e projeto** (Clientes e projetos), **3. Medição inicial** (Medições, com fotos), **4. Orçamento** (aba Orçamentos) e **5. Contrato** (no orçamento aceito, botão Gerar contrato).

## Projetista e CEP no cadastro do cliente
No cadastro do cliente, o campo que se chamava "Consultor de vendas" agora é **Projetista**. Ao criar um orçamento para o cliente, a linha de comissão **Projetista** já vem com essa pessoa (dá para trocar antes de salvar), e a comissão entra no aceite junto com a do vendedor.

Ao digitar o **CEP** completo, o sistema busca o endereço (ViaCEP, com a BrasilAPI de reserva) e preenche rua, bairro, cidade e UF. Número e complemento continuam à mão. Se o CEP não for encontrado, o sistema avisa e o endereço é preenchido à mão.

## Cliente que fecha mais ambientes depois
O cadastro do cliente é o mesmo. Se os ambientes novos forem feitos **junto** com o contrato atual, abra o orçamento aceito e clique em **Adendo**: coloque só os ambientes novos; ao ser aceito, o financeiro lança só o valor do adendo, e os ambientes dele entram também nos documentos do projeto (descritiva, termo de entrega, imagens 3D, pasta técnica, cronograma de montagem e certificado de garantia). Se forem feitos **depois**, em outro momento, crie um **projeto novo** para o mesmo cliente em Clientes e projetos e faça um orçamento normal para ele: cada fase fica com seus prazos, sua produção e sua montagem.

## Comissões do orçamento: papéis da loja
Os papéis de comissão seguem a tabela da loja: **Projetista 1%**, **Consultor 3%**, **Produção 2%**, **Gerência 1%** (total 7%), e Técnico, Conferência, Supervisor, Montagem e Aux. montagem com 0% para escolher quando houver. O orçamento novo já vem com as linhas acima de 0%: o projetista do cliente, quem está fazendo o orçamento como consultor, e Produção e Gerência sem pessoa (a comissão fica para a equipe com o nome do papel). Para mudar os percentuais ou os papéis, use a configuração do orçamento.

## Contrato com vários projetos do mesmo cliente
Quando cada ambiente foi cadastrado como um projeto (por exemplo, "Guarda-roupa Kelvia" e "Guarda-roupa Keila"), o contrato pode juntar todos. Em **Modelos de documentos**, gere o contrato, escolha o cliente e marque em **Projetos deste contrato** os projetos que entram (ao escolher o cliente, todos já vêm marcados). Se os projetos têm orçamento, o contrato junta os ambientes (AA, AB…), soma os valores e junta as parcelas, com as entradas do mesmo dia somadas. Projeto sem orçamento usa o arquivo do Promob mais recente.
