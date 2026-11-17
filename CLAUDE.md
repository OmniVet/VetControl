# VetControl — notas para o Claude

Sistema web estático (GitHub Pages) + Firebase (Auth e-mail/senha + Firestore). Sem build: HTML/JS puro com módulos ES, Firebase SDK 10.12.2 via gstatic CDN.
Usuária: gestora de clínica veterinária, não programadora. Responder em português, linguagem simples.

## Arquivos
- `index.html` + `app.js` (sistema da equipe, SPA com rotas por hash) + `styles.css` (tema azul)
- `firebase-config.js`: chaves do Firebase, MASTER_EMAIL, listas editáveis (categorias, salas, vacinas, exames, tabelas de preço…)
- `firestore.rules`: regras de segurança. Deve ser colada manualmente pela usuária no console do Firebase sempre que mudar: AVISAR.
- `tutor.html` + `tutor.js`: portal do tutor (login por CPF → e-mail interno `<cpf>.<versão>@DOMINIO_TUTOR`)
- `cartao.js`: cartão de vacina (visual de cartão físico, etiquetas por tipo de vacina)
- `importar-planilha.js`: leitor da planilha Controle_Estoque_e_Patrimonio.xlsx (uma aba por categoria)

## Organização do app.js
Seções marcadas com `/* ================= NOME ================= */`. Menu = `SECOES` (seção → abas) e `telas` (rota → função) em `render()`.
Painéis: 1 Estoque (produtos, salas/setores, limbo, pendências, XML NF-e, alertas, equivalentes) · 2 Exames (planilhas lab/prestadores, comparativo, laudos) · 3 Inventário · 4 Pedidos · 5 Relatórios · 6 Orçamentos · 7 Vacinas · 8 Ambulatório.
Helpers: `abrirModal(titulo, html, onSubmit, okTxt)`, `opts()`, `esc()`, `toast()`, `log()` (movimentos), `addLote/retirarFEFO`, `vencido()` (validade vale até o fim do mês), `docImpressao()` (A4/bobina).
Perfis: master > estoquista (`podeConfirmar()`) > usuario (lançamentos viram pendências).

## Ao mudar
- Rodar `node --check` copiando o arquivo para .mjs.
- Se criar coleção nova no Firestore, acrescentar a regra em `firestore.rules` e avisar a usuária para publicar de novo.
