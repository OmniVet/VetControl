# EstoquePlus

> **Para colocar no ar, siga o arquivo `PASSO_A_PASSO.md`.**

Controle de estoque com login por usuário: estoque central com validade por lote, limbo de vencidos, salas (Coleta, Imagem, Internamento, Centro Cirúrgico) com quantidade ideal e alerta crítico, pedidos às distribuidoras e relatórios.

Roda 100% grátis: **GitHub Pages** (site) + **Firebase** plano Spark (login e banco). As fotos são reduzidas e salvas no banco, então não precisa do Firebase Storage (que é pago).

## 1. Criar o Firebase (≈10 min)
1. Acesse https://console.firebase.google.com → **Adicionar projeto** → nome `estoqueplus`.
2. **Authentication** → Começar → método **E-mail/senha** → Ativar.
3. **Firestore Database** → Criar banco → modo produção → região `southamerica-east1 (São Paulo)`.
4. Firestore → aba **Regras** → apague tudo, cole o conteúdo de `firestore.rules`, **troque o e-mail** e Publique.
5. Authentication → **Users** → Adicionar usuário → seu e-mail e senha (este é o master).
6. Configurações do projeto (⚙️) → **Seus apps** → ícone `</>` (Web) → registre → copie o objeto `firebaseConfig`.

## 2. Configurar o código
Abra `firebase-config.js` e cole o `firebaseConfig` e seu e-mail em `MASTER_EMAIL`.
Ali também dá para editar distribuidoras, medidas e salas.

## 3. Publicar no GitHub
1. Crie um repositório no GitHub (ex.: `estoqueplus`) e envie estes arquivos (botão **Add file → Upload files**).
2. **Settings → Pages** → Source: `Deploy from a branch` → branch `main` / `/root` → Save.
3. Em ~1 min o site fica em `https://SEU-USUARIO.github.io/estoqueplus/`.
4. No Firebase: Authentication → **Configurações → Domínios autorizados** → adicione `SEU-USUARIO.github.io`.

## 4. Primeiro uso
1. Entre com o e-mail master → o sistema cria seu perfil master.
2. **Fornecedores**: cadastre cada fornecedor e a distribuidora dele (WhatsApp/e-mail).
3. **Usuários**: crie o login de cada pessoa.
4. **Estoque**: cadastre produtos (foto, nome, distribuidora, medida, marca, tipo, ideal, mínimo).
5. **Salas**: defina para cada item a quantidade ideal e o alerta crítico.

## Como funciona
- **Tipo "Estoque"**: ao dar baixa, o produto vai para a sala e passa a ser contado lá, com validade.
- **Tipo "Setor"**: ao dar baixa, é lançado direto como **consumido** daquela sala.
- Toda entrada pede **validade**. As saídas tiram primeiro o lote que vence antes.
- **Limbo**: vencidos vão para o limbo com a validade (botão automático ou manual); de lá podem ser descartados.
- **Fazer pedido**: produtos abaixo do mínimo entram sozinhos, agrupados por distribuidora, com o envio por WhatsApp ou e-mail ao fornecedor certo.
- **Relatórios**: por período, sala e tipo (consumo, reposição, entrada, limbo, descarte), mostrando quem lançou e quem repôs. Dá para exportar em CSV (abre no Excel) ou imprimir.
- O histórico de movimentos não pode ser editado nem apagado.

### Solicitações de reposição
- Qualquer usuário pede um produto **já cadastrado** ou um **produto novo**, com quantidade, destino (sala ou estoque) e urgência (Normal, Alta ou Urgente).
- O número de pedidos pendentes aparece no menu. O estoquista clica em **Atender**: se o produto existe, a baixa para a sala é feita ali mesmo. Se é novo, ele registra o andamento (ex.: "pedido feito ao fornecedor").
- Ficam registrados quem pediu, quem atendeu, a data e a resposta.

### Exames
- Para cada solicitação: paciente (espécie, raça, idade, peso, sexo), tutor e telefone, veterinário, prioridade, exames do catálogo + outros, e suspeita clínica.
- O status acompanha o exame: Solicitado → Coletado → Enviado ao laboratório → Resultado disponível → Entregue ao tutor, com histórico de quem mudou e quando.
- **Imprimir** gera a requisição pronta com espaço para assinatura.
- O catálogo de exames é editado em `firebase-config.js`.

> Se você já publicou as regras antes, cole o `firestore.rules` novo no Firebase e publique de novo.


## Perfis de usuário
- **Master**: tudo, inclusive usuários, fornecedores, catálogo e profissionais.
- **Estoquista**: confirma entradas e retiradas, recebe notas (XML), mexe no limbo.
- **Usuário**: lança entradas e retiradas, que ficam **pendentes** até a estoquista confirmar (aba Estoque → Pendências). Registra uso nas salas, faz contagens, solicita exames e reposições.

## Três contagens separadas
- **Estoque central** (aba Estoque central)
- **Salas e setores**: cada setor tem a própria lista de itens, ideal e crítico, e um botão **📋 Fazer contagem** que ajusta e registra as divergências. Inclui Geladeira de Vacina e Geladeira de Medicamentos Especiais.
- **Limbo** (aba Limbo)

## Fotos dos produtos
Em cada produto: tire/envie a foto, ou clique em **🔎 Buscar foto no Google**, abra a imagem, copie o endereço da imagem e cole no campo de link.
Para cadastrar muitos produtos de uma vez: Estoque → **Importar lista** (cole do Excel).

## IA para ler a nota (Gemini, gratuito)
1. Acesse https://aistudio.google.com/apikey e crie uma chave.
2. Cole em `GEMINI_API_KEY` no `firebase-config.js`.
3. **Importante**: no Google Cloud Console → APIs e serviços → Credenciais → sua chave → *Restrições de aplicativo: Referenciadores HTTP* → adicione `https://SEU-USUARIO.github.io/*`. Assim ninguém usa sua chave fora do seu site.
4. Em "Receber XML", clique **✨ Interpretar quantidades com IA**. O sistema memoriza o fator de cada produto do fornecedor para as próximas notas.

## Catálogo de exames
Exames → Catálogo → **Importar lista**: cole `Exame; Laboratório; Pontos` (um por linha), direto do Excel.


## Exames — planilhas, comparativo e laudos
- **Planilha laboratoriais** e **Planilha imagem e prestadores** têm as mesmas colunas das planilhas que vocês usavam. Clique em qualquer célula, edite e ela **salva sozinha**: fica amarela enquanto salva e verde quando termina. "+ Nova linha" cria a solicitação automaticamente. Também dá para criar pela aba Solicitações; as duas formas alimentam as mesmas planilhas.
- **Pago, laudo liberado, data de pagamento do volante, repasse, valor, observação** (ex.: "desconto R$5") e **link do comprovante** (com 🔗 para abrir).
- **Comparativo**: escolha o laboratório e o mês, envie a planilha que o laboratório mandou (.xlsx/.csv) e confira as colunas. O sistema mostra o que confere, o que o laboratório cobrou e não está aqui, e o que está aqui e não veio na planilha do laboratório. A conferência funciona por nome do pet, exame parecido e data (até 4 dias de diferença).
- **Modelos de laudo**: um por exame, com campos automáticos ({{paciente}}, {{tutor}}…). Na planilha, o botão **📝 Laudo** preenche o modelo, o profissional edita e libera, e o laudo é impresso com a **assinatura digital** dele.
- **Profissionais**: envie a foto da assinatura feita em papel branco (o fundo vira transparente), marque "Pode liberar laudos" e ligue ao e-mail de login do profissional.
- **Impressão** da solicitação e do laudo em **A4** ou **bobina 80/58 mm**. O cabeçalho (nome, endereço e telefone) é configurado em `CLINICA` no `firebase-config.js`.

## 6 · Orçamentos
- **Tabela de serviços**: cada serviço tem preço único ou **faixas de peso**, e um preço para cada tabela (PARTICULAR, SOCIAL, PETLOVE…, editáveis em `TABELAS_PRECO`). **Preço em branco numa tabela de plano = o plano não cobre**: no orçamento, esse item é cobrado como **particular** e aparece marcado como "por fora".
- **Importar planilha**: colunas `Serviço; Categoria; Espécie; Peso de; Peso até; PARTICULAR; SOCIAL; PETLOVE; …`, com uma linha por faixa de peso.
- **Pacotes**: ex.: "Castração" = consulta pré + exames + anestesia + cirurgia + roupa. Serviços de outra espécie são ignorados automaticamente (ex.: orquiectomia felina num cão).
- **Novo orçamento**: pet, tutor, espécie, raça, idade e **peso** → escolha o pacote e a tabela. Marque **várias tabelas** para um **orçamento comparativo**, que destaca a opção mais em conta. Gera um **PDF** numerado com **validade de 7 dias**.
- **Orçamentos emitidos**: baixe o PDF de novo, ou use **Refazer** para recalcular com os preços atuais e uma nova validade.

## 7 · Vacinas e portal do tutor
- **Pets e cartões**: cadastre o pet com o tutor (nome, **CPF** e WhatsApp). O botão **+ Vacina** registra a dose (lote, fabricante, veterinário) e calcula a próxima dose. Opcionalmente, dá baixa de 1 dose na Geladeira de Vacina.
- **Situação das vacinas**: **Em dia**, **A vencer** (até 15 dias), **Atrasado** e **Não veio** (agendou e faltou), com filtro por vacina.
  - **WhatsApp** em cada linha já abre a conversa 1 a 1 com a mensagem pronta.
  - **📋 Texto para o grupo** monta a lista por vacina para colar no grupo.
  - **Exportar contatos** gera uma planilha com os links do WhatsApp.
- **Portal do tutor** (`tutor.html`, gratuito):
  1. Em "Pets e cartões", clique em **Acesso do tutor**: o sistema cria a senha e monta a mensagem para enviar pelo WhatsApp.
  2. O tutor entra com **CPF + senha** e vê só os pets dele: vacinas, próximas doses, histórico, impressão/PDF e o botão para agendar pelo WhatsApp. Ele pode trocar a senha.
  3. Esqueceu a senha? Clique em "Acesso do tutor" de novo: uma nova senha é criada e a antiga deixa de valer.
  - Segurança: as regras do Firestore só deixam o tutor ler os documentos ligados ao login dele. O CPF não fica exposto (o portal guarda só um código embaralhado do CPF).
  - Custo: o login por e-mail/senha do Firebase é gratuito, sem limite prático de tutores no plano Spark.
- Preencha `CLINICA.whatsapp` no `firebase-config.js`, que é usado no botão "Agendar" do portal.

## 8 · Ambulatório
Roteiro de **check-ups, exames, consultas, medicações, curativos e retornos programados**, com as visões **Hoje**, **Próximos 7 dias**, **Atrasados**, **Todos** e **Histórico**.
- Cada item pode **repetir** (todo dia, semana, 15 dias, mês, 3/6 meses, ano), com data final opcional. Ao marcar **✔ Feito**, o próximo é criado sozinho.
- Botões **Remarcar**, **Faltou** e **Lembrete** (WhatsApp com a mensagem pronta).

### Vencimentos e cartão físico
- **7 · Vacinas → Vencimentos**: faixas **até 3 dias, até 1 semana, até 15 dias, até 30 dias e até 3 meses**. Cada faixa tem WhatsApp 1 a 1 (o aviso fica marcado como enviado), texto para o grupo e exportação.
- **Cartão de vacina com visual de cartão físico** (`cartao.js`): uma capa que abre, a página de identificação e um quadro por dose com um **rótulo ilustrativo** desenhado com o nome comercial da vacina (ex.: "Nobivac / RESPIRA Bb"), com uma cor fixa para cada vacina e sem lote nem validade, a data, a dose, a **próxima dose** com cor (em dia / vence em breve / atrasada) e o veterinário. O tutor vê o mesmo cartão no portal.


## Regras de contagem, controlados, pedido acumulado e inventário por sala
- **Setores com foto**: cada item aparece com a foto do produto na lista e na contagem.
- **📌 Regras para quem conta** aparecem em cada setor e na contagem:
  - controlados contados 1 a 1 e anotados no livro;
  - validade 01/março vale até o fim de março, depois limbo;
  - vacinas de validade mais curta em cima.
- **Validade até o fim do mês**: o sistema considera o produto vencido só depois do último dia do mês da validade.
- **🔒 Controlado** (marcar no cadastro do produto): toda retirada ou uso só é lançado depois de marcar "Já anotei no livro de registro" e informar o paciente/receita. Isso fica gravado no histórico.
- **Geladeira de Vacina**: cada item mostra a ordem de guarda (⬆ em cima o lote que vence antes, ⬇ embaixo o que vence depois).
- **🛒 Incluir no pedido** (Estoque): vai somando num pedido único e compartilhado pela equipe. Em Pedidos → Pedido de compra, tudo aparece separado por categoria/distribuidora (veterinária, hospitalar, humana, limpeza, escritório), com a **🖨 Folha do pedido** para impressão.
- **Inventário por sala**: um cartão para cada sala (Consultórios 1/2/3, Imagem, Almoxarifado, Gerência, Banheiro, Sala de Estoque — só móveis e utensílios, Internamento, Centro Cirúrgico, Esterilização, Instrumentais, Copa, Lavanderia, Recepção, Área Externa), com a quantidade de itens, o valor e a data da última conferência. **📋 Conferir sala** abre o checklist com foto, quantidade encontrada e estado.

### Etiquetas das vacinas
O `firebase-config.js` traz a lista de nomes comerciais (`VACINAS_COMERCIAIS`): V10, V3, V4, V5, FeLV, antirrábica, tosse dos canis e giárdia, com o fabricante de cada uma. Ao lançar a dose, escolha o nome comercial: o fabricante é preenchido sozinho e a etiqueta aparece no cartão com a **cor do tipo de vacina** (V10 azul, V3/V4/V5 verde-azulado, FeLV roxo, antirrábica vermelho, tosse dos canis laranja, giárdia verde). Para incluir uma marca nova, acrescente uma linha na lista.


## Medicamentos equivalentes (Estoque → Medicamentos equivalentes)
- Cada grupo reúne os nomes comerciais de um **mesmo princípio ativo**, com foto, fabricante e concentração.
  - **=** idêntico (mesmo princípio e concentração: troca direta).
  - **⚠** substituto com ressalva (concentração ou formulação diferente: confirmar com o veterinário e recalcular a dose).
  - **⭐** é o principal da clínica.
  - **🚫 Sem equivalente** (ex.: Convenia).
- Ligue cada nome ao produto do estoque para ver a **quantidade disponível** e usar a **foto** do produto.
- No **Estoque central**, embaixo do nome aparece "🔁 Igual a: Marovet (12)". Se o produto zerar, a linha fica vermelha: **"⚠️ Sem estoque → usar: …"**. Clique para ver o grupo com as fotos.
- O botão "Carregar exemplos da clínica" cria os grupos de Cerenia/Marovet, Agemoxi CL, Terramicina LA, Elo-xicam/Maxicam e Convenia.


## Importar a planilha da clínica
Estoque → **📥 Importar planilha da clínica** lê o `Controle_Estoque_e_Patrimonio.xlsx` no formato atual (uma aba por categoria: Hospitalar Humano, Veterinário, **Distribuidora Odontológica**, Especiais e Oncológicos, Limpeza e Escritório, Outros Custos, Instrumentais, Inventário e Compras Shopee).
- Produtos que já existem (mesmo código ou nome) são ignorados: pode importar de novo quando a planilha crescer.
- Itens repetidos entre abas (ex.: álcool em Hospitalar e em Limpeza) viram um produto só, somando o saldo.
- Controlados são marcados pelo princípio ativo (conferir). Produtos com o mesmo princípio ativo formam grupos de equivalentes.
- A planilha não tem validade: o saldo entra como "sem validade informada" até a primeira conferência.
