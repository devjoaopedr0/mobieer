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

## Vínculo do montador: autônomo ou contratado
No cadastro do montador (Montadores externos), o campo **Vínculo** muda o contrato e a forma de pagamento:
- **Autônomo**: prestação de serviços, pago por diária ou serviço. Entra no fechamento de diárias. O fechamento mostra as **horas faltantes** de cada dia (abaixo das horas combinadas da diária) e o **abatimento sugerido** pela regra do contrato: diária ÷ horas combinadas × horas faltantes. O abatimento não sai do total sozinho, porque não se abate atraso causado pela loja ou pelo cliente.
- **Contratado**: empregado com salário mensal (informado no cadastro). Os dias dele não viram diária no fechamento; o pagamento é pela folha.

## Contrato e código de conduta do montador
O montador assina os documentos na área dele, aba **Documentos** (assinatura desenhada na tela). Em Montadores externos, aba Documentos, escolha o montador e clique em **Gerar de modelo**. O sistema já sugere o contrato do vínculo dele ("Contrato do montador autônomo" ou "Contrato do montador contratado"). No contrato, escolha o início e o fim da vigência e se ele autoriza o uso de imagem e voz. O sistema preenche nome, CPF, endereço, telefone, salário e data, gera o PDF e envia para assinar. O "Código de conduta e ética" também está em Modelos de documentos.

## Termo de ferramentas do montador
Na área do montador, aba **Ferramentas**, ele clica em **Marcar ferramenta**, escolhe da lista (ou "Outra"), informa a quantidade e tira a foto. Depois clica em **Gerar e assinar o termo**: o termo sai com a lista e as fotos e vai para Documentos para ele assinar.

Para passar uma ferramenta a outra pessoa, ele usa **Retirar**, escolhe para quem vai (outro montador, devolver à empresa ou outra pessoa) e tira a foto. Se for para outro montador, a ferramenta entra na lista dele com a foto. Depois de qualquer mudança o termo precisa ser assinado de novo, e o sistema avisa. A gestão vê, na aba Documentos de cada montador, o cartão **Ferramentas com o montador**: fotos, situação do termo e retiradas com foto.

## Linha do tempo das montagens
Na tela **Montagens**, botão **Linha do tempo**: cada montagem, entrega, vistoria ou assistência aparece como uma barra nos dias que dura, ao longo de 1, 2, 3 ou 6 meses. Arraste a barra para mudar a data (a duração continua a mesma) e arraste a ponta direita para mudar quanto tempo dura. Clicar na barra abre o compromisso.

Em cima, a linha **Montagens no dia / equipes** mostra quantas montagens acontecem em cada dia. O dia fica vermelho quando passa do número de equipes (começa pelos montadores ativos e pode ser ajustado), e o aviso diz a partir de quando falta gente: é o momento de contratar ou mudar datas. Pedidos na produção com previsão de entrega e sem montagem marcada aparecem tracejados como **previstas**, contando 3 dias a partir da entrega prevista.
