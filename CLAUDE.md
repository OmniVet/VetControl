# VetControl — notas para o Claude

Sistema web estático (GitHub Pages) + Firebase (Auth e-mail/senha + Firestore). Sem build: HTML/JS puro com módulos ES, Firebase SDK 10.12.2 via gstatic CDN.
Usuária: gestora de clínica veterinária, não programadora. Responder em português, linguagem simples.

## Arquivos
- `index.html` + `app.js` (sistema da equipe, SPA com rotas por hash) + `styles.css` (tema azul)
- `firebase-config.js`: chaves do Firebase, MASTER_EMAIL, listas editáveis (categorias, salas, vacinas, exames, tabelas de preço…)
- `firestore.rules`: regras de segurança. Deve ser colada manualmente pela usuária no console do Firebase sempre que mudar: AVISAR.
- `tutor.html` + `tutor.js`: portal do tutor (login por CPF → e-mail interno `<cpf>.<versão>@DOMINIO_TUTOR`)
- `cartao.js`: cartão de vacina (visual de cartão físico, etiquetas por tipo de vacina)
- `dados-exames.js` (listagem de preços dos laboratórios) + `busca-exames.js` (menor preço e tubos)
- `importar-planilha.js`: leitor da planilha Controle_Estoque_e_Patrimonio.xlsx (uma aba por categoria + aba opcional "Salas"). Aba de 31 letras no máx.: `NOME_ABA` mapeia "Medicamentos Especiais" → categoria completa

## Organização do app.js
Seções marcadas com `/* ================= NOME ================= */`. Navegação = array `SETORES` (quadrados do Início, cada um com abas [rota, nome]) e `telas` (rota → função) em `render()`. Topo só tem o botão Início.
Setores: 1 Solicitação de exames (nova-solicitacao, exames) · 2 Laudos (laudos-pendentes, modelos, laudos-liberados) · 3 Histórico de exames (planilha, prestadores, producao, comparativo, exportar-exames) · 4 Solicitação de compras · 5 Relatórios gerais · 9 Estoque · Reposição por setor (salas) · Inventário · Configurações (master).
Exame do LAB VETPLUS ou de imagem/prestador vai para "Liberar laudos" (`precisaLaudo`). Edição de solicitação grava `edicoes[]`.
Vacinas (6), Ambulatório (7) e Orçamentos (8) vão virar um sistema próprio; continuam aqui em "Outros módulos" até lá.
Helpers: `abrirModal(titulo, html, onSubmit, okTxt)`, `opts()`, `esc()`, `toast()`, `log()` (movimentos), `addLote/retirarFEFO`, `vencido()` (validade vale até o fim do mês), `docImpressao()` (A4/bobina).
Sugestão de mínimo/ideal = `carregarSugestoes()` (movimentos dos últimos 90 dias, cache de 10 min). Ficha (`telaFicha`) e relatório semanal (`telaSemanal`) usam `darBaixa` / movimentos `reposicao`. Fotos automáticas: `buscarFotosAuto` (Google CSE, chaves no firebase-config).
Busca inteligente de exames: `telaBuscaExames` (aba 1.3), dados em `dados-exames.js`, cálculo em `busca-exames.js`; "Usar na solicitação" guarda `preSolicitacao` e abre `telaNovaSolicitacao` → `modalExame` já preenchido. Sem coleção nova no Firestore.
Perfis: master > estoquista (`podeConfirmar()`) > usuario (lançamentos viram pendências).

## Ao mudar
- Rodar `node --check` copiando o arquivo para .mjs.
- Se criar coleção nova no Firestore, acrescentar a regra em `firestore.rules` e avisar a usuária para publicar de novo.

- `equivalencias-mercado.js`: grupos prontos (fios absorvíveis por tipo, dexametasona) com `termos` que ligam produtos do estoque; botão em Equivalentes. Salas novas: instrumental, limpeza_material. Aba Salas tem coluna "Qtd. atual na sala".
- Início agora em MÓDULOS (`MODULOS` + campo `mod` em cada item de `SETORES`): Exames · Estoque e Compras · Ambulatorial e Recepção · Nosso time · Geral.
- `time.js` ("Nosso time", recebe helpers do app.js via `iniciarTime`): agenda de atividades (`timeAtividades`, `timeConclusoes`), relatórios/avaliações/assinaturas (`timeAvaliacoes` só master, `timeAssinaturas`), presença/ponto (`timePonto` só criação com hash encadeado, `timeCorrecoes`, `timeConfig`). Regras novas em `firestore.rules`: AVISAR a usuária para publicar.
- Cargos (`CARGOS` em firebase-config, campo `cargo` em users): só Auxiliar, Gerente, Recepção e Assistente operacional (`clt: true`) têm presença e avaliação; médicos vet são PJ e ficam de fora. Regra do `timePonto` checa o cargo. Logo: `logo.jpg` (login) e `logo-icone.png` (topo/favicon).
- `modelos-laudo.js`: 58 modelos básicos de laudo (do docx da clínica) por categoria (`categoria` em `modelosLaudo`); botão "Carregar modelos básicos" em Modelos de laudo. Cabeçalho do laudo: `CLINICA` (nome, cnpj, endereco, telefone, whatsapp, logoLaudo=logo-vetplus.png, que a clínica precisa enviar). Equivalência de fios segue a tabela da clínica (Atramat/Ethicon/Covidien/B.Braun).
