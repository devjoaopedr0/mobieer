# Documentos, garantia e pós-venda

## Documentos do projeto
Na aba **Documentos** do projeto ficam os arquivos enviados e os gerados pelo sistema. Hoje o sistema gera: contrato, orçamento, recibo, certificado de garantia, cronograma de montagem, pasta técnica e vistoria. Os textos de contrato e recibo usam os modelos cadastrados em **Modelos de documentos**.

Cada documento tem versão: gerar de novo cria uma nova versão, sem apagar a anterior. Um documento pode ser marcado como visível para o cliente, e então aparece no portal.

## Certificado de garantia
O certificado sai dentro do manual de uso e garantia da loja: as páginas do manual ficam iguais e o sistema preenche a página do certificado e a da declaração com os dados do cliente, do projeto, os ambientes e as datas de compra, entrega e vistoria. Os dados vêm do contrato aceito, das requisições de montagem concluídas e do cadastro do cliente. O QR Code de "Fale conosco" abre o WhatsApp da loja.

O certificado é emitido na aba **Pós-venda** do projeto.

## Pós-venda e assistência
Menu **Pós-venda**, ou a aba Pós-venda do projeto. Reúne a garantia e os chamados de assistência técnica. O cliente abre um chamado pelo portal, com fotos; a equipe também pode anexar fotos ao chamado. A visita de assistência é agendada e o cliente confirma por um link.

## Termo de entrega (preparação do ambiente e autorização de produção)
Fica na aba **Documentos** do projeto, no cartão **Termo de entrega**. O documento tem duas folhas: **Preparando o ambiente** (o que o cliente precisa deixar pronto para a montagem) e **Autorização de produção** (o cliente declara que o projeto técnico está de acordo com o contrato, com a relação de ambientes e os prazos).

Como emitir:
1. Clique em **Preencher**. O nº do contrato, os ambientes e o prazo já vêm do orçamento do projeto; ajuste o que precisar e informe os prazos de entrega.
2. Clique em **Ver PDF** para conferir.
3. Clique em **Enviar ao portal do cliente**. O termo entra nos documentos do projeto, visível ao cliente, pedindo duas assinaturas: a da loja e a do cliente.
4. A loja assina na lista de documentos, no botão **Assinar**, escolhendo o papel MOBIEER.
5. O cliente abre o portal, lê o termo nos documentos do projeto e assina por lá.

Quando os dois assinam, o sistema guarda a cópia assinada. Enviar o termo de novo cria uma nova versão: a anterior sai da vista do cliente e as assinaturas recomeçam.

## Tela de Assistências
Menu **Assistências**. Reúne todos os chamados de assistência em três visões:
- **Lista**: número, situação, data de abertura, cliente, tipo, projeto, local (bairro e cidade do cliente, para juntar visitas da mesma região), visita marcada, prioridade e responsável. Há busca e filtros por tipo, situação e responsável; os chamados resolvidos e cancelados só aparecem marcando **Mostrar encerradas**.
- **Kanban**: uma coluna por situação (Aberto, Em análise, Agendado, Em execução, Aguardando cliente, Resolvido). Arrastar o cartão para outra coluna muda a situação.
- **Agenda**: as visitas marcadas, agrupadas por dia, com o horário e se o cliente já confirmou.

Clicar em um chamado abre o detalhe, com a descrição e as fotos enviadas pelo cliente. Ali a equipe define o **tipo** (Assistência, Ajuste pós-montagem, Manutenção, Erro interno ou Retrabalho), a prioridade, o responsável e usa **Agendar visita** para enviar as datas ao cliente. Alterar situação, tipo, prioridade e responsável é de quem pode atualizar todas as tarefas; os demais só consultam. O chamado continua sendo aberto pelo cliente, no portal.

## Nova assistência pela equipe
Na tela **Assistências**, o botão **Nova assistência** abre um chamado pela equipe — para o pedido que chegou por telefone ou na visita. Escolha o cliente, o projeto (opcional), o tipo, a prioridade, o assunto e o que aconteceu. O chamado aberto pelo cliente no portal continua igual.

## Erro interno e retrabalho
Os tipos **Erro interno** e **Retrabalho**, abertos pela equipe, são registros só da loja: **não aparecem no portal do cliente** e não têm visita agendada com ele. Servem para acompanhar os erros de produção, projeto ou montagem. Nos itens, lance o material e as horas gastos: o total é o **custo do retrabalho**. O topo da tela mostra quantos registros de erro e retrabalho houve no mês e quanto custaram. Um chamado aberto pelo cliente não pode ser reclassificado como erro interno ou retrabalho, para não sumir do portal dele.

## Itens da assistência, garantia e cobrança
No detalhe de cada chamado, o quadro **Itens da assistência** registra o que foi usado ou feito: peça, ferragem ou acessório, material, mão de obra, deslocamento, serviço de terceiro. **A assistência é na garantia**: todo item entra como garantia. Marque **Cobrar** só no que o cliente vai pagar (por exemplo, um acessório novo). O quadro mostra o total em garantia e o total a cobrar.

Com algo a cobrar, quem lança no financeiro escolhe o vencimento e clica em **Lançar no financeiro**: vira uma conta a receber na categoria Assistência técnica, ligada ao cliente e ao projeto. Mudando os itens depois, o botão **Atualizar a cobrança** acerta o valor; se nada mais for cobrado, **Retirar a cobrança** tira a conta. Cobrança já recebida não é alterada por aqui.

## Ordem de serviço
O botão **Ordem de serviço (PDF)** gera o documento com o padrão da Mobieer: cliente, endereço, projeto, o atendimento, a visita, os itens (garantia ou cobrado), os totais e as linhas de assinatura do técnico e do cliente. No erro interno ou retrabalho sai a **ordem interna de retrabalho**, com o custo e as assinaturas do responsável e da gestão.

## Baixa no estoque pelo chamado
Ao acrescentar um item na assistência, dá para escolher o **produto do almoxarifado** (busca pelo nome ou código); a descrição e o valor vêm do cadastro do produto. Com itens ligados a produto, o quadro mostra quantos ainda estão no estoque e o botão **Dar baixa no estoque**, para quem pode registrar saída de materiais: sai uma saída do almoxarifado com o número do chamado e o nome do cliente como destino. A quantidade precisa ser inteira. Depois da baixa o item mostra a data e não pode mais ter o produto ou a quantidade alterados, nem ser removido — para corrigir, faça a devolução no almoxarifado.

## Assistências por região
Na tela **Assistências**, a visão **Por região** junta os chamados em aberto pelo bairro do cliente, com a visita marcada de cada um, para combinar no mesmo dia as visitas próximas. Cliente sem bairro no cadastro aparece em "Sem bairro no cadastro do cliente"; o bairro se corrige em Clientes e projetos → Editar.

## Descritiva do projeto
Na aba **Documentos** do projeto, cartão **Descritiva**: a apresentação por ambiente no modelo da loja. O PDF tem a capa (cliente e projetista), um **moodboard** por ambiente com os acabamentos (chapas de MDF, metalurgia e usinagens, cada um com a cor), as **imagens 3D** do ambiente com a descrição dos móveis e a página de **processos** com os prazos (a fabricação usa o prazo do orçamento).

Os ambientes, os acabamentos e o texto vêm do orçamento do projeto; as imagens são os renders 3D feitos com a IA. **Escrever com IA** escreve a descrição de cada ambiente no estilo da loja (uma peça por linha, em maiúsculas) e sugere a cor dos acabamentos que a loja ainda não tem cadastrados, usando só o que está no orçamento. Tudo pode ser editado: texto, acabamentos, cores, imagens e quais ambientes entram. **Conferir PDF** abre o arquivo; **Publicar nos documentos** guarda nos documentos do projeto, visível ao cliente, e cada nova publicação vira uma nova versão.
