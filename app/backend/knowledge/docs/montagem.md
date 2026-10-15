# Montagem e cronograma

## Requisição de montagem
Na aba **Campo** do projeto são criadas as requisições de montagem para os montadores. A folha impressa leva um QR Code: o montador escaneia com a câmera do celular, toca em Iniciar no cômodo que vai montar e em Concluir quando termina. No fim, o cliente informa o nome, assina na própria tela e dá uma **nota de 1 a 5** para a montagem.

Uma requisição cancelada, ou com novo QR gerado, invalida a folha anterior.

## Montadores externos
Menu **Montadores externos** (grupo Montagens): cadastro dos montadores e seus documentos. O montador com acesso próprio vê a tela **Minha montagem**.

## Cronograma de montagem
Aba **Cronograma** do projeto. O cronograma segue o modelo da loja:
1. Informe a data de início e de fim. O sistema divide em semanas e conta os dias úteis, sem feriados.
2. Escreva o que é instalado em cada semana, uma linha por item.
3. A vistoria final é sugerida para o primeiro dia útil depois do fim.
4. Gere o PDF, ou publique para o cronograma ficar nos documentos do projeto e aparecer no portal do cliente.

## Solicitação de peças
Menu **Solicitação de peças**: pedidos de peças que faltaram ou precisam ser refeitas, com foto.

## Presença dos montadores externos
Menu **Montadores externos**, aba **Presença**. O escritório marca, dia a dia, quem veio (✓) e quem não veio (✗). Funciona para o montador que ainda não tem login e também para quem tem.
- O dia marcado como "veio" entra no fechamento com a diária do montador.
- Se o montador já bateu o ponto pelo celular naquele dia, o dia aparece em verde claro e já conta.
- Tocar de novo no botão marcado limpa o lançamento.
- As setas mudam a semana; não dá para lançar dia que ainda não chegou.

## Solicitação de peças na produção
Quando uma solicitação de peças passa para **Em produção**, cada peça pedida entra na fábrica como um item do pedido de produção do projeto, com etiqueta, e aparece no quadro **Fábrica** identificada como "Reposição" e o número da solicitação. Quando todas as peças têm baixa, a solicitação passa sozinha para **Pronta**. A solicitação precisa estar ligada a um projeto.

## Documentos do montador: contrato, código de conduta e termo de ferramentas
O montador assina três documentos dentro do sistema, na área dele, aba **Documentos** (assinatura desenhada na tela).
- **Contrato e código de conduta**: em Montadores externos, aba Documentos, escolha o montador e clique em **Gerar de modelo**. Escolha o modelo cadastrado em Modelos de documentos ("Código de conduta e ética" já está lá; o contrato do montador precisa ser cadastrado). O sistema preenche nome, CPF, função e data, gera o PDF e envia para o montador assinar. Nos modelos, use os campos `{{montador.nome}}`, `{{montador.documento}}`, `{{montador.telefone}}`, `{{montador.endereco}}`, `{{montador.funcao}}` e `{{montador.diaria}}`.
- **Termo de ferramentas**: na área do montador, aba **Ferramentas**, ele clica em **Marcar ferramenta**, escolhe da lista (ou "Outra"), informa a quantidade e tira a foto. Depois clica em **Gerar e assinar o termo**: o termo sai com a lista e as fotos e vai para Documentos para ele assinar.
- **Passar ferramenta para outra pessoa**: na aba Ferramentas, botão **Retirar**, escolha para quem vai (outro montador, devolver à empresa ou outra pessoa) e tire a foto. Se for para outro montador, a ferramenta entra na lista dele com a foto. Depois de qualquer mudança o termo precisa ser assinado de novo, e o sistema avisa.
- A gestão vê, na aba Documentos de cada montador, o cartão **Ferramentas com o montador**: as fotos, se o termo está assinado e atualizado, e as retiradas com foto.
