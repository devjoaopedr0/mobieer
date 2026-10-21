# Financeiro

## Onde fica
Menu **Financeiro**: contas a receber, contas a pagar, fluxo de caixa e o DRE. **Notas fiscais** fica em menu próprio. Quem não é do financeiro usa **Solicitar ao financeiro** para pedir um pagamento ou reembolso.

## Marcar como pago e anexar comprovante
1. No lançamento, clique em **Marcar pago**.
2. Abre o registro de pagamento: informe a data e o valor pago. O pagamento pode ser **parcial**.
3. Anexe o **comprovante** (foto ou PDF), se tiver.
4. Confirme.

## Ler boleto
O botão **Ler boleto** cadastra uma conta a pagar a partir do boleto. Dá para digitar ou colar a linha digitável, usar a câmera, enviar uma foto do código de barras ou o PDF do boleto. O sistema confere os dígitos verificadores, puxa o valor e o vencimento e cria a conta a pagar com o PDF anexado.

## Solicitar ao financeiro
Menu **Solicitar ao financeiro**: quem tem essa permissão registra um pedido (por exemplo, uma compra ou um reembolso) e acompanha a resposta.

## Categorias do lançamento
No formulário de lançamento, o campo Categoria traz as categorias do sistema e as criadas pela loja. Para criar uma, escolha **＋ Nova categoria…** no fim da lista e digite o nome; ela passa a aparecer para todos, separada por receita ou despesa.

## Metas de investimento
Aba **Investimentos** do Financeiro. É a lista do que a loja quer implantar e quanto custa.
1. Em **Nova meta de investimento**, informe o que quer implantar, quanto custa, quanto já está reservado e, se quiser, para quando.
2. Cada meta mostra a barra do quanto já foi reservado e quanto falta.
3. Toque no círculo da meta para marcar como implantada.

No topo ficam os totais: planejado em aberto, já reservado e quanto falta. As metas não geram lançamentos: são um quadro de planejamento.

## Comissões e dívidas
Aba **Comissões e dívidas** do Financeiro. Mostra três totais e três listas, cada uma agrupada e com o valor vencido em destaque. Clique no nome para ver os lançamentos; o botão **Pagar** é o mesmo "Marcar pago" dos lançamentos (aceita pagamento parcial e comprovante).
- **Comissões em aberto**: comissões de venda e reservas técnicas ainda não pagas, por pessoa. As dos orçamentos aceitos entram sozinhas e vencem junto com a parcela do cliente. Para comissões de vendas antigas, use **Lançar comissão** (quem recebe, venda, valor, parcelas e vencimento).
- **Dívidas anteriores**: dívidas de antes do sistema (empréstimo, fornecedor antigo, acordo), por credor. Em **Cadastrar dívida**, informe o credor, do que é, o valor que ainda falta pagar, quantas parcelas faltam e o vencimento da próxima; o sistema cria uma parcela por mês na categoria **Dívida anterior**. A data em que a dívida foi feita é o mês em que ela conta na DRE; sem ela, conta no mês do cadastro.
- **Contas vencidas de meses anteriores**: contas a pagar com vencimento antes do mês atual que continuam em aberto, por fornecedor ou categoria.

Corrigir ou apagar uma parcela é na aba Lançamentos.

## Ponto de equilíbrio
Menu **Ponto de equilíbrio**, no grupo Financeiro. Mostra quanto a loja precisa vender no mês para pagar os custos fixos e para chegar à meta de lucro, pelos **contratos assinados** (orçamentos aceitos) no mês.
- **Contratos assinados**: total líquido vendido (sem a taxa da financeira), a pontuação média e quantos contratos.
- **Margem de contribuição**: o líquido menos a compra (custo dos ambientes), as comissões, o frete e outros custos e a previsão de impostos.
- **Ponto de equilíbrio**: venda necessária = custos fixos ÷ margem (%). **Meta de lucro**: (custos fixos + lucro) ÷ margem (%). Cada um com o progresso e quanto falta.
- **Resultado atual**: margem − custos fixos (lucro ou prejuízo) e a cobertura dos fixos.
- Gráfico da **evolução no mês**, a **composição da margem** e a **composição financeira**.

Mês sem contrato usa a margem média dos 3 meses anteriores e avisa. Os custos fixos começam pela soma das despesas de Financeiro → Fixos.

## Fatura do cartão: leitura automática
Aba **Cartões** do Financeiro. Depois de enviar o PDF da fatura, abra a fatura e clique em **Ler fatura**: o sistema lê cada compra (data, loja, valor e parcela) e já sugere a categoria — Uber e 99 em **Transporte (Uber/99)**, iFood, restaurante e padaria em **Alimentação**, posto em **Combustível**, e assim por diante. Pagamentos, estornos e totais ficam de fora.

Confira a lista, troque a categoria do que precisar e desmarque o que não deve entrar; compra que já estava na fatura vem desmarcada. Clique em **Lançar**. Em **Gasto por categoria** aparece o total e a quantidade de compras de cada tipo (quantas corridas de Uber, quantas refeições).

A leitura usa a IA (Gemini lê o PDF direto, até fatura escaneada); sem IA, o sistema lê as linhas no formato "data, descrição, valor".

## Planner do financeiro
Menu **Planner do financeiro** (grupo Financeiro): as contas da semana por dia, no jeito do planner da produção. Cada dia mostra quanto falta pagar, o que já foi pago e o que há a receber.
- **+ item**: escreva como na lista do WhatsApp, com o nome antes de dois-pontos e o valor no fim — "KELSON: 1ª quinzena outubro 854,00" ou "David Bruno: diárias 720,00 + 40,00". O sistema cria a conta naquele dia, com a pessoa e a categoria (diária, quinzena, salário e ajuda de custo vão para Folha de pagamento; acordo para Acordos).
- **Caixinha**: marca como pago o valor todo. Para pagamento parcial ou comprovante, clique no texto da conta.
- **Arrastar** a conta para outro dia muda o vencimento. As atrasadas de antes da semana aparecem no topo.
- **Por pessoa**: as pendências de cada pessoa — o que a loja deve (salário, ajuda de custo, comissão) menos o que a pessoa deve (descontos e acordos lançados como a receber com o nome dela).
- **Lista**: filtre por período, tipo, situação e busca, marque as contas e veja a soma na hora.

O campo **Quem recebe / quem paga** do Novo lançamento é o mesmo nome que aparece no planner.

## Entrada de nota fiscal, recibo e cupom
Em **Financeiro**, aba **Documentos**, botão **Ler NF, recibo ou cupom**. Tire a foto ou envie o PDF: a IA lê o fornecedor, o CNPJ, o número, a data, o total, a forma de pagamento e os itens, e sugere a categoria (MDF e fita em Matéria-prima, dobradiça e corrediça em Ferragens, cola e tinta em Acabamento…). Confira, ajuste e clique em **Salvar compra**: a despesa entra com os itens e o arquivo anexado; cupom e recibo entram pagos, nota com prazo fica a pagar no vencimento.

A aba **O que compramos** mostra, no período, o total comprado por categoria, por fornecedor e os itens que mais pesam, juntando as notas, recibos e cupons com as compras dos cartões.
