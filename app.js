import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, runTransaction, writeBatch, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { cartaoHtml, CARTAO_CSS, rotulo } from "./cartao.js";
import { MODELOS_LAUDO, CATEGORIAS_LAUDO } from "./modelos-laudo.js";
import { iniciarTime } from "./time.js";
import { slugId, lerCatalogo, prazoDe, tubosPorLab, COR_TUBO } from "./solic-util.js";
import { iniciarEntrevista } from "./entrevista.js";
import { CARGOS, CRITERIOS_AVALIACAO } from "./firebase-config.js";
import { GRUPOS_MERCADO } from "./equivalencias-mercado.js";
import { lerPlanilhaClinica, COLUNAS_MODELO, COLUNAS_SALAS, NOME_ABA } from "./importar-planilha.js";
import { resolverCombinacoes } from "./busca-exames.js";
import { montarBusca } from "./busca-catalogo.js";
import { IMAGEM_TABELA, LAB_VETPLUS } from "./servicos-tabela.js";
import { chave } from "./busca-catalogo.js";
import { EXECUTORES_IMAGEM, EXAMES_IMAGEM, EMAIL_ATENDIMENTO, LABS_PLANO } from "./firebase-config.js";
import { firebaseConfig, MASTER_EMAIL, DISTRIBUIDORAS, MEDIDAS, SALAS, DIAS_ALERTA_VALIDADE, EXAMES, STATUS_EXAME, STATUS_REPOSICAO, INV_CATEGORIAS, INV_LOCAIS, INV_ESTADO, LABORATORIOS, CONVENIOS, ORIGENS, CLINICA, DIAS_SEM_USO, VACINAS, VACINAS_COMERCIAIS, DIAS_A_VENCER, DOMINIO_TUTOR, TIPOS_AMBULATORIO, TABELAS_PRECO, CATEGORIAS_SERVICO, VALIDADE_ORCAMENTO_DIAS, CATALOGO_INICIAL, GEMINI_API_KEY, GEMINI_MODEL, DIAS_ANALISE, DIAS_COBERTURA_MINIMO, DIAS_COBERTURA_IDEAL, GOOGLE_CSE_KEY, GOOGLE_CSE_CX } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (s) => document.querySelector(s);

let usuario = null;      // {uid, nome, email, role}
let produtos = [];       // cache
let pedidoAtual = {};    // produtoId -> qtd (tela de pedido)
let pedidoAberto = {};   // pedido acumulado e compartilhado pela equipe (config/pedidoAberto)

/* ================= UTILITÁRIOS ================= */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const addDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
// Regra da clínica: validade 01/03 vale até o último dia de março. Depois disso -> limbo.
const fimMes = (iso) => { if (!iso) return ""; const [y, m] = iso.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const vencido = (iso) => !!iso && fimMes(iso) < hoje();
const fmtData = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const total = (lotes = []) => lotes.reduce((s, l) => s + Number(l.qtd || 0), 0);
const proxValidade = (lotes = []) => lotes.filter((l) => l.qtd > 0).map((l) => l.validade).sort()[0];
const nomeSala = (id) => SALAS.find((s) => s.id === id)?.nome || id;
const isMaster = () => usuario?.role === "master";
const podeConfirmar = () => ["master", "estoquista"].includes(usuario?.role);
const fotoSrc = (p) => p.foto || p.fotoUrl || "";
const fotoTag = (p) => fotoSrc(p) ? `<img class="foto" src="${esc(fotoSrc(p))}" loading="lazy" onerror="this.replaceWith(document.createElement('div'));">` : `<div class="foto"></div>`;
const googleImg = (q) => `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(q)}`;

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden"); setTimeout(() => t.classList.add("hidden"), 3000); }

function addLote(lotes = [], qtd, validade) {
  const l = lotes.map((x) => ({ ...x }));
  const e = l.find((x) => x.validade === validade);
  if (e) e.qtd = Number(e.qtd) + Number(qtd); else l.push({ qtd: Number(qtd), validade });
  return l.sort((a, b) => a.validade.localeCompare(b.validade));
}
// Retira pela regra "primeiro que vence, primeiro que sai" (FEFO)
function retirarFEFO(lotes = [], qtd) {
  let resta = Number(qtd); const retirados = [];
  const l = lotes.map((x) => ({ ...x })).sort((a, b) => a.validade.localeCompare(b.validade));
  for (const x of l) { if (resta <= 0) break; const t = Math.min(x.qtd, resta); if (t > 0) { x.qtd -= t; resta -= t; retirados.push({ qtd: t, validade: x.validade }); } }
  if (resta > 0) throw new Error(`Quantidade insuficiente (faltam ${resta}).`);
  return { lotes: l.filter((x) => x.qtd > 0), retirados };
}
function lotesHtml(lotes = []) {
  if (!lotes.length) return "";
  return `<div class="lotes">${lotes.map((l) => `<span class="${vencido(l.validade) ? "vencido" : ""}">${l.qtd} × ${fmtData(l.validade)}</span>`).join(" · ")}</div>`;
}
function statusEstoque(p) {
  const t = total(p.lotesEstoque), v = proxValidade(p.lotesEstoque);
  if (v && vencido(v)) return `<span class="tag critico">Vencido no estoque</span>`;
  if (t <= Number(p.minimo || 0)) return `<span class="tag critico">Abaixo do mínimo</span>`;
  if (v && v <= addDias(DIAS_ALERTA_VALIDADE)) return `<span class="tag alerta">Vence em breve</span>`;
  if (t < Number(p.ideal || 0)) return `<span class="tag alerta">Abaixo do ideal</span>`;
  return `<span class="tag ok">OK</span>`;
}
function statusSala(it) {
  const t = total(it.lotes), v = proxValidade(it.lotes);
  if (v && vencido(v)) return `<span class="tag critico">Trocar (vencido)</span>`;
  if (t <= Number(it.critico || 0)) return `<span class="tag critico">Repor (crítico)</span>`;
  if (v && v <= addDias(DIAS_ALERTA_VALIDADE)) return `<span class="tag alerta">Vence em breve</span>`;
  if (t < Number(it.ideal || 0)) return `<span class="tag alerta">Abaixo do ideal</span>`;
  return `<span class="tag ok">OK</span>`;
}
async function log(mov) {
  await addDoc(collection(db, "movimentos"), { ...mov, usuarioUid: usuario.uid, usuarioNome: usuario.nome, data: serverTimestamp() });
}
async function carregarProdutos() {
  const s = await getDocs(query(collection(db, "produtos"), orderBy("nome")));
  produtos = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  return produtos;
}
// Reduz a foto para ~400px e guarda como texto (não precisa do Firebase Storage pago)
function comprimirFoto(file) {
  return new Promise((res, rej) => {
    const img = new Image(); const r = new FileReader();
    r.onload = () => { img.src = r.result; }; r.onerror = rej;
    img.onload = () => { const m = 400, k = Math.min(1, m / Math.max(img.width, img.height)); const c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.75)); };
    r.readAsDataURL(file);
  });
}

/* ================= MODAL ================= */
function abrirModal(titulo, corpo, onSubmit, okTxt = "Salvar") {
  $("#modalTitulo").textContent = titulo; $("#modalCorpo").innerHTML = corpo; $("#modalErro").textContent = ""; $("#modalOk").textContent = okTxt;
  $("#modal").classList.remove("hidden");
  $("#modalForm").onsubmit = async (e) => {
    e.preventDefault(); $("#modalOk").disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(e.target)), e.target); fecharModal(); render(); }
    catch (err) { $("#modalErro").textContent = err.message; }
    finally { $("#modalOk").disabled = false; }
  };
}
function fecharModal() { $("#modal").classList.add("hidden"); }
$("#modalCancelar").onclick = fecharModal;
const opts = (arr, sel) => arr.map((o) => { const v = typeof o === "string" ? o : o.id, t = typeof o === "string" ? o : o.nome; return `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(t)}</option>`; }).join("");

const TIME = iniciarTime({ db, fb: { collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp }, $, esc, toast: (t) => toast(t), abrirModal, opts, hoje, eu: () => usuario, isMaster: () => isMaster(), docImpressao: (...a) => docImpressao(...a), sha256: (t) => sha256(t), entrarComSenha: (e, s) => signInWithEmailAndPassword(auth, e, s), CRITERIOS: CRITERIOS_AVALIACAO, cltDe: (u) => !!CARGOS.find((x) => x.id === u.cargo)?.clt, CLINICA_NOME: CLINICA.nome });

const podeEntrevista = () => isMaster() || usuario?.cargo === "gerente";
const ENTREVISTA = iniciarEntrevista({ db, fb: { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp }, $, esc, toast: (t) => toast(t), abrirModal, opts, eu: () => usuario, podeAcessar: () => podeEntrevista(), docImpressao: (...x) => docImpressao(...x), comprimirImagem: (...x) => comprimirImagem(...x), CLINICA_NOME: CLINICA.nome });

/* ================= AUTENTICAÇÃO ================= */
$("#loginForm").onsubmit = async (e) => {
  e.preventDefault(); const f = new FormData(e.target);
  $("#loginErro").textContent = "Entrando…";
  try { await signInWithEmailAndPassword(auth, f.get("email").trim(), f.get("senha")); }
  catch (err) { $("#loginErro").textContent = erroLogin(err.code); console.error(err); }
};
$("#esqueci").onclick = async (e) => {
  e.preventDefault(); const em = $("#loginForm").email.value;
  if (!em) return ($("#loginErro").textContent = "Digite seu e-mail acima.");
  await sendPasswordResetEmail(auth, em).catch(() => {}); $("#loginErro").textContent = "Se o e-mail existir, enviamos um link.";
};
$("#sair").onclick = () => signOut(auth);
// Traduz os erros do Firebase para algo que a equipe entende
function erroLogin(code = "") {
  return ({
    "auth/invalid-credential": "E-mail ou senha incorretos (ou este usuário não existe no projeto vetcontrol-2026).",
    "auth/wrong-password": "Senha incorreta.", "auth/user-not-found": "Este e-mail não está cadastrado no Firebase (Authentication → Usuários).",
    "auth/invalid-email": "E-mail em formato inválido.", "auth/too-many-requests": "Muitas tentativas. Espere alguns minutos ou redefina a senha.",
    "auth/user-disabled": "Este usuário está desativado no Firebase.",
    "auth/unauthorized-domain": "Este endereço não está autorizado. No Firebase: Authentication → Configurações → Domínios autorizados → adicionar omnivet.github.io.",
    "auth/operation-not-allowed": "O login por e-mail/senha não está ativado. No Firebase: Authentication → Método de login → E-mail/senha.",
    "auth/network-request-failed": "Sem conexão com o Firebase. Verifique a internet.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "A chave do Firebase no arquivo firebase-config.js está errada.",
    "permission-denied": "O Firebase bloqueou o acesso: as REGRAS de segurança não foram publicadas (Firestore Database → Regras → colar o firestore.rules → Publicar) ou o e-mail nelas está diferente.",
  })[code] || `Não foi possível entrar (código: ${code || "desconhecido"}).`;
}

onAuthStateChanged(auth, async (u) => {
  window.__vcPronto = true; $("#semConexao")?.classList.add("hidden");
  if (!u) { usuario = null; $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); return; }
  let snap;
  try {
    const ref = doc(db, "users", u.uid); snap = await getDoc(ref);
    if (!snap.exists() && u.email.toLowerCase() === MASTER_EMAIL.toLowerCase()) {
      await setDoc(ref, { nome: "Master", email: u.email, role: "master", ativo: true, criadoEm: serverTimestamp() });
      snap = await getDoc(ref);
    }
  } catch (err) {
    console.error(err); await signOut(auth);
    $("#loginErro").textContent = err.code === "failed-precondition" || /database.*not.*exist|NOT_FOUND/i.test(err.message)
      ? "O banco de dados ainda não foi criado. No Firebase: Firestore Database → Criar banco de dados." : erroLogin(err.code);
    return;
  }
  if (!snap.exists() || snap.data().ativo === false) {
    await signOut(auth);
    $("#loginErro").textContent = u.email.toLowerCase() === MASTER_EMAIL.toLowerCase() ? "Não foi possível criar o perfil master." : "Usuário sem acesso ao VetControl. Peça ao master para cadastrar você em ⚙️ Usuários.";
    return;
  }
  usuario = { uid: u.uid, ...snap.data() };
  $("#userNome").textContent = `${usuario.nome} (${usuario.role})`;
  document.querySelectorAll(".so-master").forEach((el) => el.classList.toggle("hidden", !isMaster()));
  $("#login").classList.add("hidden"); $("#app").classList.remove("hidden");
  if (!location.hash) location.hash = "#painel"; else render();
});

/* ================= ROTEADOR ================= */
window.addEventListener("hashchange", render);
// Setores do Início (quadrados grandes). abas: [rota, nome]
const SETORES = [
  { id: "solic", mod: "exames", n: "1", titulo: "Requisição de exames", icone: "🧪", abas: [["nova-solicitacao", "1.1 Nova requisição de exames"], ["exames", "1.2 Consultar requisições realizadas"], ["busca-exames", "1.3 Busca inteligente (menor preço)"]] },
  { id: "laudos", mod: "exames", n: "2", titulo: "Laudos", icone: "📝", abas: [["laudos-pendentes", "2.1 Liberar laudos"], ["modelos", "2.2 Modelos de laudos"], ["laudos-liberados", "2.3 Consultar laudos liberados"]] },
  { id: "historico", mod: "exames", n: "3", titulo: "Histórico de exames", icone: "📊", abas: [["planilha", "Exames laboratoriais"], ["prestadores", "Imagem e prestadores"], ["producao", "Produção por médico (semana)"], ["comparativo", "Comparativo com laboratório"], ["exportar-exames", "Exportar relatórios de exames"]] },
  { id: "compras", mod: "estoque", n: "4", titulo: "Solicitação de compras", icone: "🛒", abas: [["solicitacoes", "Pedir algo ao estoquista"]] },
  { id: "repasse", mod: "estoque", n: "", titulo: "Repasse ou venda", icone: "🤝", abas: [["repasses", "Empréstimos e vendas (pessoa ou empresa)"]] },
  { id: "relatorios", mod: "geral", n: "5", titulo: "Relatórios gerais", icone: "📈", gestao: true, abas: [["relatorios", "Gerador de relatórios"]] },
  { id: "estoque", mod: "estoque", n: "9", titulo: "Estoque", icone: "📦", abas: [["produtos", "9.1 Estoque geral"], ["limbo", "9.2 Limbo"], ["pedido", "9.3 Detalhes de pedido"], ["pendencias", "Pendências"], ["nfe", "Receber nota (XML)"], ["alertas", "Alertas"], ["equivalentes", "Medicamentos equivalentes"], ["cotacao", "Cotação"]] },
  { id: "reposicao", mod: "estoque", n: "", titulo: "Reposição por setor", icone: "🏥", abas: [["salas", "Salas, geladeiras e setores"], ["ficha", "Ficha de reposição"], ["semanal", "Relatório semanal de reposição"]] },
  { id: "inventario", mod: "estoque", n: "", titulo: "Inventário (patrimônio)", icone: "🪑", abas: [["inventario", "Equipamentos e móveis"]] },
  { id: "config", mod: "geral", n: "", titulo: "Configurações", icone: "⚙️", master: true, abas: [["usuarios", "Usuários"], ["fornecedores", "Fornecedores"], ["profissionais", "Profissionais"], ["catalogo", "Catálogo de exames"]] },
  // Módulos que vão virar um sistema próprio (continuam funcionando aqui enquanto isso)
  { id: "vacinas", mod: "ambul", n: "6", titulo: "Vacinas", icone: "💉", abas: [["vacinas", "Situação das vacinas"], ["vencimentos", "Vencimentos"], ["pets", "Pets e cartões"]] },
  { id: "ambulatorio", mod: "ambul", n: "7", titulo: "Ambulatório", icone: "🩺", abas: [["ambulatorio", "Roteiro"]] },
  { id: "orcamentos", mod: "ambul", n: "8", titulo: "Orçamentos", icone: "💰", abas: [["orcamentos", "8.1 Histórico de orçamentos"], ["orcamento", "8.2 Novo orçamento"], ["servicos", "8.3 Banco de serviços"], ["pacotes", "Pacotes"]] },
  { id: "time-agenda", mod: "time", n: "", titulo: "Agenda de atividades do time", icone: "📋", abas: [["time-agenda", "Agenda de atividades"]] },
  { id: "time-relatorios", mod: "time", n: "", titulo: "Relatórios e histórico do time", icone: "📑", abas: [["time-relatorios", "Relatórios, avaliações e assinaturas"]] },
  { id: "time-docs", mod: "time", n: "", titulo: "Documentação", icone: "🗂️", entrevista: true, abas: [["time-docs", "Documentos assinados por colaborador"], ["time-check", "Checklist do funcionário"]] },
  { id: "time-treino", mod: "time", n: "", titulo: "Treinamentos", icone: "🎓", entrevista: true, abas: [["time-treino", "Check-in de treinamentos"]] },
  { id: "time-presenca", mod: "time", n: "", titulo: "Presença do time", icone: "⏱", abas: [["time-presenca", "Registro e espelho de presença"]] },
  { id: "entrevista", mod: "time", n: "", titulo: "Entrevista e descrição de cargo", icone: "🗣️", entrevista: true, abas: [["entrevista", "Entrevistas por tipo de vaga (ficha com o nome do candidato)"], ["time-cargos", "Descrição de cargo (imprimir com o nome)"]] },
];
const MODULOS = [
  { id: "exames", titulo: "Módulo Exames", sub: "Exames, Laudos e Histórico de Exames", icone: "🧪" },
  { id: "estoque", titulo: "Módulo Estoque e Compras", sub: "Estoque, Inventário, Compras e Reposição por setor", icone: "📦" },
  { id: "ambul", titulo: "Módulo Ambulatorial e Recepção", sub: "Vacinação, Ambulatorial e Orçamentos", icone: "🩺" },
  { id: "time", titulo: "Módulo Nosso time", sub: "Agenda de atividades, relatórios/avaliações e presença", icone: "👥" },
  { id: "geral", titulo: "Geral", sub: "Relatórios gerais e configurações", icone: "⚙️" }
];
async function render() {
  if (!usuario) return;
  const rota = location.hash.slice(1).split("?")[0] || "painel";
  const sec = SETORES.find((x) => x.abas.some(([r]) => r === rota));
  $("#subnav").innerHTML = sec ? `<div class="setor-titulo"><span>${sec.icone}</span> ${sec.n ? sec.n + " · " : ""}${esc(sec.titulo)}</div>
    <div class="setor-abas">${sec.abas.map(([r, n]) => `<a href="#${r}" class="${r === rota ? "ativo" : ""}">${n}</a>`).join("")}</div>` : "";
  atualizarBadge();
  const v = $("#view"); v.innerHTML = `<p class="muted">Carregando…</p>`;
  const telas = { "nova-solicitacao": telaNovaSolicitacao, "busca-exames": telaBuscaExames, repasses: telaRepasses, "laudos-pendentes": telaLaudosPendentes, "laudos-liberados": telaLaudosLiberados, producao: telaProducao, "exportar-exames": (v) => telaRelatorios(v, "exames"),
    ...TIME, ...ENTREVISTA, equivalentes: telaEquivalentes, vencimentos: telaVencimentos, vacinas: telaVacinas, pets: telaPets, ambulatorio: telaAmbulatorio, orcamento: telaOrcamento, orcamentos: telaOrcamentos, servicos: telaServicos, pacotes: telaPacotes, prestadores: (v) => telaPlanilha(v, "prest"), comparativo: telaComparativo, modelos: telaModelos, limbo: telaLimbo, pendencias: telaPendencias, planilha: telaPlanilha, catalogo: telaCatalogo, painel: telaPainel, alertas: telaAlertas, profissionais: telaProfissionais, cotacao: telaCotacao, inventario: telaInventario, nfe: telaNfe, solicitacoes: telaSolicitacoes, exames: telaExames, produtos: telaProdutos, salas: telaSalas, ficha: telaFicha, semanal: telaSemanal, pedido: telaPedido, relatorios: telaRelatorios, fornecedores: telaFornecedores, usuarios: telaUsuarios };
  try { if (rota === "relatorios" && !podeGerente()) { v.innerHTML = `<p>Relatórios: somente Master e Gerente.</p>`; return; } await (telas[rota] || telaPainel)(v); } catch (e) { v.innerHTML = `<p class="erro">Erro: ${esc(e.message)}</p>`; console.error(e); }
  window.scrollTo(0, 0);
}

/* ================= ESTOQUE / PRODUTOS ================= */
async function telaProdutos(v) {
  await Promise.all([carregarProdutos(), carregarPedidoAberto(), carregarEquivalencias()]); await carregarSugestoes().catch((e) => console.warn("Sugestões indisponíveis:", e));
  v.innerHTML = `
  <div class="barra"><h2>Estoque central</h2>
    <input id="busca" placeholder="Buscar nome, princípio ativo, código…" />
    <select id="fCat"><option value="">Todas as distribuidoras</option>${opts(DISTRIBUIDORAS)}</select>
    ${podeConfirmar() ? `<button class="btn" id="btnVencidos">Mover vencidos ao limbo</button>` : ""}
    ${podeConfirmar() ? `<button class="btn" id="btnPlan">📥 Importar planilha</button>` : ""}${isMaster() ? `<button class="btn" id="btnImport">Colar lista</button>` : ""}
    ${podeConfirmar() ? `<button class="btn" id="btnFotos">🖼 Buscar fotos</button><button class="btn" id="btnSug" title="Aplica o mínimo e o ideal sugeridos nos produtos com histórico suficiente">📊 Aplicar sugestões</button>` : ""}
    <button class="btn primary" id="btnNovo">+ Novo produto</button></div>
  <p class="muted small">Contagem do <b>estoque central</b> apenas. As salas/setores e o limbo têm contagens próprias nas outras abas.</p>
  <div class="tabela-wrap"><table><thead><tr><th></th><th>Produto</th><th>Distribuidora</th><th>Medida</th><th>Tipo</th><th>No estoque / validade</th><th>Ideal</th><th>Mín.</th><th>Sugestão (últimos ${DIAS_ANALISE} dias)</th><th>Status</th><th>Ações</th></tr></thead><tbody id="tb"></tbody></table></div>`;
  const desenhar = () => {
    const b = $("#busca").value.toLowerCase(), c = $("#fCat").value;
    $("#tb").innerHTML = produtos.filter((p) => (!b || `${p.nome} ${p.marca || ""} ${p.principio || ""} ${p.codigo || ""} ${p.subcategoria || ""} ${textoEquiv(p)}`.toLowerCase().includes(b)) && (!c || p.categoria === c)).map((p) => `
      <tr><td>${fotoTag(p)}</td>
      <td><b>${esc(p.nome)}</b>${p.controlado ? ` <span class="tag critico">🔒 Controlado</span>` : ""}${p.naoComprar ? ` <span class="tag critico" title="${esc(p.naoComprarMotivo || "")}">🚫 Não comprar</span>` : ""}<div class="muted small">${esc([p.codigo, p.principio, p.marca, p.subcategoria].filter(Boolean).join(" · "))}</div>${p.naoComprar && p.naoComprarMotivo ? `<div class="small" style="color:var(--vermelho)">${esc(p.naoComprarMotivo)}</div>` : ""}${equivResumo(p)}</td>
      <td>${esc(p.categoria)}</td><td>${esc(p.medida)}</td>
      <td>${p.tipo === "consumo" ? `<span class="tag neutro">Setor (consumo)</span>` : `<span class="tag neutro">Estoque</span>`}</td>
      <td><b>${total(p.lotesEstoque)}</b>${lotesHtml(p.lotesEstoque)}</td>
      <td>${p.ideal ?? ""}</td><td>${p.minimo ?? ""}</td><td class="sug">${sugestaoHtml(p)}</td><td>${p.naoComprar ? `<span class="tag neutro">Não repor</span>` : statusEstoque(p)}</td>
      <td class="acoes-linha">
        <button class="btn small" data-a="entrada" data-id="${p.id}">+ Entrada</button>
        <button class="btn small" data-a="baixa" data-id="${p.id}">Retirar p/ setor</button>
        ${podeConfirmar() ? `<button class="btn small" data-a="limbo" data-id="${p.id}">Limbo</button>` : ""}
        ${p.naoComprar ? "" : `<button class="btn small" data-a="pedir" data-id="${p.id}">🛒 Incluir no pedido${pedidoAberto[p.id] ? ` <b>(${pedidoAberto[p.id]})</b>` : ""}</button>`}
        ${podeConfirmar() ? `<button class="btn small" data-a="editar" data-id="${p.id}">Editar</button>` : ""}
        ${isMaster() ? `<button class="btn small danger" data-a="excluir" data-id="${p.id}">Excluir</button>` : ""}
      </td></tr>`).join("") || `<tr><td colspan="11" class="muted">Nenhum produto.</td></tr>`;
  };
  desenhar(); $("#busca").oninput = desenhar; $("#fCat").onchange = desenhar;
  $("#btnNovo").onclick = () => modalProduto();
  $("#btnVencidos") && ($("#btnVencidos").onclick = moverVencidosLimbo);
  $("#btnImport") && ($("#btnImport").onclick = modalImportarProdutos);
  $("#btnPlan") && ($("#btnPlan").onclick = modalImportarPlanilhaClinica);
  $("#btnFotos") && ($("#btnFotos").onclick = modalBuscarFotos);
  $("#btnSug") && ($("#btnSug").onclick = aplicarSugestoesEmLote);
  $("#tb").onclick = (e) => {
    const eq = e.target.closest("[data-eq]"); if (eq) return verGrupoEquiv(eq.dataset.eq);
    const b = e.target.closest("button"); if (!b) return; const p = produtos.find((x) => x.id === b.dataset.id);
    ({ entrada: modalEntrada, baixa: modalBaixa, limbo: modalLimbo, editar: modalProduto, excluir: excluirProduto,
       pedir: modalIncluirPedido, aplicarSug: aplicarSugestao })[b.dataset.a](p);
  };
}

function modalProduto(p = {}) {
  abrirModal(p.id ? "Editar produto" : "Novo produto", `
    <div class="duas"><label>Foto (arquivo ou câmera)<input type="file" name="foto" accept="image/*" capture="environment"></label>
    <label>…ou link da imagem <a href="#" id="buscaFoto" class="small">🔎 Buscar foto no Google</a><input name="fotoUrl" id="fotoUrl" value="${esc(p.fotoUrl)}" placeholder="Cole aqui o endereço da imagem"></label></div>
    <img id="fotoPrev" class="foto ${fotoSrc(p) ? "" : "hidden"}" src="${esc(fotoSrc(p))}" style="width:80px;height:80px">
    ${p.fotoAuto ? `<p class="small muted">📷 Foto sugerida automaticamente: confira se é o produto certo (marca e apresentação).</p>` : ""}
    <label>Nome do produto<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Cateter Nº 22 (Azul)"></label>
    <div class="duas">
      <label>Categoria (distribuidora)<select name="categoria">${opts(DISTRIBUIDORAS, p.categoria)}</select></label>
      <label>Medida<select name="medida">${opts(MEDIDAS, p.medida)}</select></label>
    </div>
    <label>Marca / apresentação (opcional)<input name="marca" value="${esc(p.marca)}"></label>
    <label>Tipo<select name="tipo">
      <option value="estoque" ${p.tipo !== "consumo" ? "selected" : ""}>Estoque — fica contado na sala após a baixa</option>
      <option value="consumo" ${p.tipo === "consumo" ? "selected" : ""}>Setor — considerado consumido ao dar baixa</option></select></label>
    <div class="duas">
      <label>Quantidade ideal no estoque<input type="number" min="0" name="ideal" required value="${p.ideal ?? ""}"></label>
      <label>Quantidade mínima<input type="number" min="0" name="minimo" required value="${p.minimo ?? ""}"></label>
    </div>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="controlado" ${p.controlado ? "checked" : ""}> 🔒 Medicamento controlado (opioide / anestésico — Portaria 344): registrar no livro a cada retirada</label>
    <label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="naoComprar" ${p.naoComprar ? "checked" : ""}> 🚫 Não comprar mais este produto</label>
    <label>Motivo (opcional)<input name="naoComprarMotivo" value="${esc(p.naoComprarMotivo)}" placeholder="Ex.: substituído pelo cateter da marca X"></label>
    ${p.id ? "" : `<div class="duas"><label>Qtd. inicial no estoque<input type="number" min="0" name="qtdInicial" value="0"></label>
      <label>Validade (obrigatória se qtd &gt; 0)<input type="date" name="valInicial"></label></div>`}`,
  async (f, form) => {
    const dados = { nome: f.nome.trim(), categoria: f.categoria, medida: f.medida, marca: f.marca.trim(), tipo: f.tipo, ideal: Number(f.ideal), minimo: Number(f.minimo),
      fotoUrl: f.fotoUrl.trim(), controlado: !!f.controlado, naoComprar: !!f.naoComprar, naoComprarMotivo: f.naoComprar ? f.naoComprarMotivo.trim() : "", atualizadoEm: serverTimestamp() };
    const arq = form.foto.files[0]; if (arq) dados.foto = await comprimirFoto(arq); else if (dados.fotoUrl) dados.foto = "";
    if (arq || dados.fotoUrl !== (p.fotoUrl || "")) dados.fotoAuto = false;
    if (p.id) { await updateDoc(doc(db, "produtos", p.id), dados); toast("Produto atualizado."); return; }
    const q = Number(f.qtdInicial || 0);
    if (q > 0 && !f.valInicial) throw new Error("Informe a validade da quantidade inicial.");
    const direto = q > 0;
    dados.lotesEstoque = direto ? [{ qtd: q, validade: f.valInicial }] : []; dados.lotesLimbo = []; dados.criadoEm = serverTimestamp();
    const ref = await addDoc(collection(db, "produtos"), dados);
    if (direto) await log({ tipo: "entrada", produtoId: ref.id, produtoNome: dados.nome, qtd: q, validade: f.valInicial, local: "estoque" });
    if (q > 0 && !direto) await criarPendencia({ tipo: "entrada", produtoId: ref.id, produtoNome: dados.nome, qtd: q, validade: f.valInicial, obs: "Cadastro de produto novo" });
    toast(q > 0 && !direto ? "Produto cadastrado. Entrada pendente de confirmação da estoquista." : "Produto cadastrado.");
  });
  $("#buscaFoto").onclick = (e) => { e.preventDefault(); window.open(googleImg($("#modalCorpo [name=nome]").value + " " + $("#modalCorpo [name=marca]").value), "_blank"); };
  $("#fotoUrl").oninput = (e) => { const i = $("#fotoPrev"); i.src = e.target.value; i.classList.toggle("hidden", !e.target.value); };
}

async function criarPendencia(d) {
  await addDoc(collection(db, "pendencias"), { ...d, status: "Pendente", solicitanteUid: usuario.uid, solicitanteNome: usuario.nome, criadoEm: serverTimestamp() });
}

function modalEntrada(p) {
  abrirModal(`Entrada — ${p.nome}`, `
    <div class="duas"><label>Quantidade (${esc(p.medida)})<input type="number" min="1" name="qtd" required></label>
    <label>Validade<input type="date" name="validade" required></label></div>
    <label>Nota fiscal / observação<input name="obs"></label>`,
  async (f) => {
    if (false) { await criarPendencia({ tipo: "entrada", produtoId: p.id, produtoNome: p.nome, qtd: Number(f.qtd), validade: f.validade, obs: f.obs }); return toast("Entrada enviada. Fica pendente até a estoquista confirmar."); }
    await darEntrada(p, f.qtd, f.validade, f.obs);
    toast("Entrada registrada.");
  }, "Lançar");
}

async function darEntrada(p, qtd, validade, obs = "") {
  await runTransaction(db, async (t) => {
    const ref = doc(db, "produtos", p.id); const d = (await t.get(ref)).data();
    t.update(ref, { lotesEstoque: addLote(d.lotesEstoque, qtd, validade) });
  });
  await log({ tipo: "entrada", produtoId: p.id, produtoNome: p.nome, qtd: Number(qtd), validade, local: "estoque", obs });
}

function modalBaixa(p) {
  abrirModal(`Retirar do estoque para setor — ${p.nome}`, `
    <p class="muted small">Disponível: <b>${total(p.lotesEstoque)}</b> ${lotesHtml(p.lotesEstoque)}<br>Sai primeiro o lote que vence antes.
    ${p.tipo === "consumo" ? "<br><b>Produto de setor:</b> será lançado como CONSUMIDO na sala." : ""}</p>
    <div class="duas"><label>Sala / armário<select name="sala">${opts(SALAS)}</select></label>
    <label>Quantidade<input type="number" min="1" name="qtd" required></label></div>
    <label>Quem fez a reposição<input name="responsavel" required value="${esc(usuario.nome)}"></label>
    ${p.controlado ? `<div class="aviso-ctrl">🔒 <b>Medicamento controlado.</b> Registre obrigatoriamente no <b>livro de controle</b>.
      <label style="flex-direction:row;gap:6px;align-items:center;margin:6px 0 0"><input type="checkbox" name="livro" required> Já anotei no livro de registro</label>
      <label>Paciente / nº da receita<input name="receita" required></label></div>` : ""}
    <label>Observação<input name="obs"></label>`,
  async (f) => {
    if (p.controlado) f.obs = `[CONTROLADO · livro ✓ · ${f.receita}] ${f.obs || ""}`;
    if (false) { await criarPendencia({ tipo: "saida", produtoId: p.id, produtoNome: p.nome, qtd: Number(f.qtd), sala: f.sala, responsavel: f.responsavel, obs: f.obs }); return toast("Retirada enviada. Fica pendente até a estoquista dar baixa."); }
    await darBaixa(p, f.sala, f.qtd, f.responsavel, f.obs);
    toast(p.tipo === "consumo" ? "Baixa lançada como consumo." : `Reposto em ${nomeSala(f.sala)}.`);
  }, "Dar baixa");
}

async function darBaixa(p, sala, qtdTxt, responsavel, obs = "") {
    const f = { sala, responsavel, obs };
    const qtd = Number(qtdTxt); let retirados;
    await runTransaction(db, async (t) => {
      const pref = doc(db, "produtos", p.id), sref = doc(db, "salas", f.sala, "itens", p.id);
      const pd = (await t.get(pref)).data(); const sd = (await t.get(sref)).data();
      const r = retirarFEFO(pd.lotesEstoque, qtd); retirados = r.retirados;
      t.update(pref, { lotesEstoque: r.lotes });
      if (pd.tipo !== "consumo") {
        let lotes = sd?.lotes || []; retirados.forEach((x) => (lotes = addLote(lotes, x.qtd, x.validade)));
        t.set(sref, { nome: pd.nome, medida: pd.medida, controlado: !!pd.controlado, lotes, ideal: sd?.ideal ?? 0, critico: sd?.critico ?? 0, ultimaReposicao: { por: f.responsavel, em: hoje() } }, { merge: true });
      }
    });
    for (const x of retirados) {
      await log({ tipo: p.tipo === "consumo" ? "consumo" : "reposicao", produtoId: p.id, produtoNome: p.nome, qtd: x.qtd, validade: x.validade, local: f.sala, responsavel: f.responsavel, obs: f.obs });
    }
}

function modalLimbo(p) {
  abrirModal(`Limbo — ${p.nome}`, `
    <p class="muted small">Estoque: ${total(p.lotesEstoque)} ${lotesHtml(p.lotesEstoque)}<br>Limbo: ${total(p.lotesLimbo)} ${lotesHtml(p.lotesLimbo)}</p>
    <label>Ação<select name="acao">
      <option value="enviar">Enviar do estoque para o limbo</option>
      <option value="adicionar">Adicionar direto no limbo (item vencido avulso)</option>
      <option value="descartar">Descartar do limbo (sai do sistema)</option></select></label>
    <div class="duas"><label>Quantidade<input type="number" min="1" name="qtd" required></label>
    <label>Validade do lote<input type="date" name="validade" required></label></div>
    <label>Observação<input name="obs"></label>`,
  async (f) => {
    const qtd = Number(f.qtd);
    await runTransaction(db, async (t) => {
      const ref = doc(db, "produtos", p.id); const d = (await t.get(ref)).data();
      const tirar = (lotes) => { const l = (lotes || []).map((x) => ({ ...x })); const e = l.find((x) => x.validade === f.validade);
        if (!e || e.qtd < qtd) throw new Error("Não há essa quantidade com essa validade."); e.qtd -= qtd; return l.filter((x) => x.qtd > 0); };
      if (f.acao === "enviar") t.update(ref, { lotesEstoque: tirar(d.lotesEstoque), lotesLimbo: addLote(d.lotesLimbo, qtd, f.validade) });
      if (f.acao === "adicionar") t.update(ref, { lotesLimbo: addLote(d.lotesLimbo, qtd, f.validade) });
      if (f.acao === "descartar") t.update(ref, { lotesLimbo: tirar(d.lotesLimbo) });
    });
    await log({ tipo: f.acao === "descartar" ? "descarte" : "limbo", produtoId: p.id, produtoNome: p.nome, qtd, validade: f.validade, local: "limbo", obs: f.obs });
    toast("Limbo atualizado.");
  });
}

async function moverVencidosLimbo() {
  if (!confirm("Mover todos os lotes vencidos do estoque central para o limbo?")) return;
  let n = 0;
  for (const p of produtos) {
    const venc = (p.lotesEstoque || []).filter((l) => vencido(l.validade)); if (!venc.length) continue;
    let limbo = p.lotesLimbo || []; venc.forEach((l) => (limbo = addLote(limbo, l.qtd, l.validade)));
    await updateDoc(doc(db, "produtos", p.id), { lotesEstoque: p.lotesEstoque.filter((l) => !vencido(l.validade)), lotesLimbo: limbo });
    for (const l of venc) await log({ tipo: "limbo", produtoId: p.id, produtoNome: p.nome, qtd: l.qtd, validade: l.validade, local: "limbo", obs: "Vencido (automático)" });
    n++;
  }
  toast(n ? `${n} produto(s) com vencidos movidos ao limbo.` : "Nenhum lote vencido."); render();
}

async function excluirProduto(p) {
  if (!confirm(`Excluir "${p.nome}"? O histórico de movimentos é mantido.`)) return;
  await deleteDoc(doc(db, "produtos", p.id)); toast("Produto excluído."); render();
}

/* ================= SALAS ================= */
let salaAtual = SALAS[0].id;
async function telaSalas(v) {
  const s = await getDocs(collection(db, "salas", salaAtual, "itens"));
  const itens = s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.nome.localeCompare(b.nome));
  const cs = await getDocs(query(collection(db, "contagens"), where("sala", "==", salaAtual)));
  const ultCont = cs.docs.map((d) => d.data()).sort((a, b) => (b.em?.seconds || 0) - (a.em?.seconds || 0))[0];
  await carregarProdutos();
  itens.forEach((it) => { const p = produtos.find((x) => x.id === it.id); it.prod = p || {}; it.controlado = !!(p?.controlado ?? it.controlado); });
  v.innerHTML = `
  <div class="barra"><h2>Salas e setores</h2>${ultCont ? `<span class="muted small">Última contagem: ${fmtTs(ultCont.em)} por ${esc(ultCont.por)}</span>` : `<span class="muted small">Nenhuma contagem ainda</span>`}
    <button class="btn primary" id="btnContar">📋 Fazer contagem</button>${podeConfirmar() ? `<button class="btn" id="btnAddItem">+ Item que este setor deve ter</button>` : ""}</div>
  <p class="muted small">Contagem própria deste setor. Cada setor tem sua lista de itens com quantidade ideal e alerta crítico.</p>
  ${regrasContagemHtml(salaAtual)}
  <div class="tabs">${SALAS.map((x) => `<button class="btn ${x.id === salaAtual ? "ativo" : ""}" data-s="${x.id}">${x.nome}</button>`).join("")}</div>
  <div class="tabela-wrap"><table><thead><tr><th></th><th>Produto</th><th>Quantidade / validade</th><th>Ideal</th><th>Crítico</th><th>Última reposição</th><th>Status</th><th>Ações</th></tr></thead><tbody>
  ${itens.map((it) => `<tr><td>${fotoTag(it.prod).replace('class="foto"', 'class="foto foto-g"')}</td><td><b>${esc(it.nome)}</b>${it.controlado ? ` <span class="tag critico">🔒 Controlado</span>` : ""}<div class="muted small">${esc(it.medida || "")}</div></td>
    <td><b>${total(it.lotes)}</b>${lotesHtml(it.lotes)}${salaAtual === "geladeira_vacina" ? ordemGeladeira(it.lotes) : ""}</td><td>${it.ideal ?? 0}</td><td>${it.critico ?? 0}</td>
    <td class="small">${it.ultimaReposicao ? `${esc(it.ultimaReposicao.por)}<br>${fmtData(it.ultimaReposicao.em)}` : "—"}</td>
    <td>${statusSala(it)}</td>
    <td class="acoes-linha"><button class="btn small" data-a="consumo" data-id="${it.id}">Registrar uso</button>
      ${podeConfirmar() ? `<button class="btn small" data-a="vencidos" data-id="${it.id}">Vencidos → limbo</button>` : ""}
      <button class="btn small" data-a="config" data-id="${it.id}">Ideal/crítico</button></td></tr>`).join("") || `<tr><td colspan="8" class="muted">Nenhum item nesta sala. Dê baixa pelo Estoque ou configure um item.</td></tr>`}
  </tbody></table></div>`;
  v.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { salaAtual = b.dataset.s; render(); }));
  $("#btnAddItem") && ($("#btnAddItem").onclick = async () => { await carregarProdutos(); modalConfigSala(null); });
  $("#btnContar").onclick = () => { modalContagem(itens); $("#modal .modal-card").style.width = "min(760px,100%)"; };
  v.querySelector("tbody").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return; const it = itens.find((x) => x.id === b.dataset.id);
    ({ consumo: modalConsumoSala, vencidos: vencidosSalaLimbo, config: modalConfigSala })[b.dataset.a](it);
  };
}

function modalConfigSala(it) {
  abrirModal(`${nomeSala(salaAtual)} — quantidades desejadas`, `
    ${it ? `<p><b>${esc(it.nome)}</b></p>` : `<label>Produto<select name="pid">${produtos.filter((p) => p.tipo !== "consumo").map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></label>`}
    <div class="duas"><label>Quantidade ideal na sala<input type="number" min="0" name="ideal" required value="${it?.ideal ?? ""}"></label>
    <label>Alerta crítico (repor quando ≤)<input type="number" min="0" name="critico" required value="${it?.critico ?? ""}"></label></div>`,
  async (f) => {
    const id = it?.id || f.pid; if (!id) throw new Error("Cadastre um produto do tipo Estoque primeiro.");
    const p = produtos.find((x) => x.id === id);
    await setDoc(doc(db, "salas", salaAtual, "itens", id), { ideal: Number(f.ideal), critico: Number(f.critico), ...(it ? {} : { nome: p.nome, medida: p.medida, lotes: [] }) }, { merge: true });
    toast("Configuração salva.");
  });
}

function modalConsumoSala(it) {
  abrirModal(`Registrar uso — ${it.nome}`, `
    <p class="muted small">${nomeSala(salaAtual)} · disponível: <b>${total(it.lotes)}</b> ${lotesHtml(it.lotes)}</p>
    <label>Quantidade usada<input type="number" min="1" name="qtd" required></label>
    <label>Observação (paciente, procedimento…)<input name="obs"></label>
    ${it.controlado ? `<div class="aviso-ctrl">🔒 <b>Medicamento controlado.</b> Registre obrigatoriamente no <b>livro de controle</b>.
      <label style="flex-direction:row;gap:6px;align-items:center;margin:6px 0 0"><input type="checkbox" name="livro" required> Já anotei no livro de registro</label>
      <label>Paciente / nº da receita<input name="receita" required></label></div>` : ""}`,
  async (f) => {
    if (it.controlado) f.obs = `[CONTROLADO · livro ✓ · ${f.receita}] ${f.obs || ""}`;
    let retirados;
    await runTransaction(db, async (t) => {
      const ref = doc(db, "salas", salaAtual, "itens", it.id); const d = (await t.get(ref)).data();
      const r = retirarFEFO(d.lotes, f.qtd); retirados = r.retirados; t.update(ref, { lotes: r.lotes });
    });
    for (const x of retirados) await log({ tipo: "consumo", produtoId: it.id, produtoNome: it.nome, qtd: x.qtd, validade: x.validade, local: salaAtual, obs: f.obs });
    toast("Uso registrado.");
  }, "Lançar");
}

async function vencidosSalaLimbo(it) {
  const venc = (it.lotes || []).filter((l) => vencido(l.validade));
  if (!venc.length) return toast("Nenhum lote vencido neste item.");
  if (!confirm(`Retirar ${total(venc)} vencido(s) da sala e enviar ao limbo?`)) return;
  await runTransaction(db, async (t) => {
    const sref = doc(db, "salas", salaAtual, "itens", it.id), pref = doc(db, "produtos", it.id);
    const sd = (await t.get(sref)).data(); const ps = await t.get(pref);
    t.update(sref, { lotes: sd.lotes.filter((l) => !vencido(l.validade)) });
    if (ps.exists()) { let limbo = ps.data().lotesLimbo || []; venc.forEach((l) => (limbo = addLote(limbo, l.qtd, l.validade))); t.update(pref, { lotesLimbo: limbo }); }
  });
  for (const l of venc) await log({ tipo: "limbo", produtoId: it.id, produtoNome: it.nome, qtd: l.qtd, validade: l.validade, local: salaAtual, obs: "Vencido retirado da sala" });
  toast("Vencidos enviados ao limbo."); render();
}

function regrasContagemHtml(sala) {
  return `<details class="regras" ${sala === "geladeira_vacina" || sala === "geladeira_especiais" ? "open" : ""}><summary>📌 Regras para quem conta (leia antes)</summary><ul>
    <li>🔒 <b>Controlados (opioides e anestésicos)</b> devem ser contados um a um e <b>toda retirada é anotada no livro de registro</b>, obrigatoriamente. O sistema só deixa retirar depois de confirmar o livro.</li>
    <li>📅 <b>Validade 01/março = pode usar até o último dia de março.</b> No mês seguinte, o produto <b>vai para o limbo</b>.</li>
    <li>💉 <b>Vacinas:</b> as de <b>validade mais curta em cima</b> e as de <b>validade mais longa embaixo</b>. Na Geladeira de Vacina, cada item mostra a ordem certa.</li>
    <li>🔎 Conte pela foto: confira se o produto na prateleira é o mesmo da imagem (marca e apresentação).</li></ul></details>`;
}
function ordemGeladeira(lotes = []) {
  const l = [...lotes].filter((x) => x.qtd > 0).sort((a, b) => a.validade.localeCompare(b.validade)); if (l.length < 2) return "";
  return `<div class="ordem-gel">${l.map((x, i) => `<div>${i === 0 ? "⬆ em cima" : i === l.length - 1 ? "⬇ embaixo" : "↕ meio"}: <b>${x.qtd}</b> · val. ${fmtData(x.validade)}</div>`).join("")}</div>`;
}

/* ================= SUGESTÃO DE ESTOQUE MÍNIMO / IDEAL (últimos 90 dias) ================= */
// Conta simples e conferível, sem IA: consumo médio por dia × dias de cobertura (ajuste em firebase-config.js).
// "Saída" do estoque central = reposição para uma sala (produto de estoque) ou consumo (produto de setor).
let sugestoes = {}, sugestoesEm = 0;
async function carregarSugestoes(forcar = false) {
  if (!forcar && Date.now() - sugestoesEm < 10 * 60 * 1000) return sugestoes;
  const ini = Timestamp.fromDate(new Date(Date.now() - DIAS_ANALISE * 864e5));
  const movs = (await getDocs(query(collection(db, "movimentos"), where("data", ">=", ini)))).docs.map((d) => d.data());
  const porProd = {}; movs.forEach((m) => { if (m.produtoId) (porProd[m.produtoId] ??= []).push(m); });
  sugestoes = {};
  for (const p of produtos) {
    const saidas = (porProd[p.id] || []).filter((m) => m.tipo === "reposicao" || (m.tipo === "consumo" && p.tipo === "consumo"));
    const qtd = saidas.reduce((t, m) => t + Number(m.qtd || 0), 0); if (!qtd) continue;
    const vida = p.criadoEm?.toDate ? Math.ceil((Date.now() - p.criadoEm.toDate()) / 864e5) : DIAS_ANALISE;
    const janela = Math.min(DIAS_ANALISE, Math.max(30, vida)), diario = qtd / janela, min = Math.max(1, Math.ceil(diario * DIAS_COBERTURA_MINIMO));
    sugestoes[p.id] = { qtd, janela, diario, min, ideal: Math.max(min + 1, Math.ceil(diario * DIAS_COBERTURA_IDEAL)), confiavel: janela >= 60 && saidas.length >= 4 };
  }
  sugestoesEm = Date.now(); return sugestoes;
}
function sugestaoHtml(p) {
  const g = sugestoes[p.id]; if (!g) return `<span class="muted small">sem saídas registradas</span>`;
  const dif = !p.minimo || Math.abs(g.min - p.minimo) / p.minimo > 0.3;
  const seta = p.minimo && g.min > p.minimo * 1.3 ? ` <span class="tag alerta">↑ subir</span>` : p.minimo && g.min < p.minimo * 0.7 ? ` <span class="tag neutro">↓ reduzir</span>` : "";
  return `<div>mín. <b>${g.min}</b> · ideal <b>${g.ideal}</b>${seta}</div><div class="muted small">saíram ${g.qtd} em ${g.janela} dias (${g.diario.toFixed(1).replace(".", ",")}/dia)${g.confiavel ? "" : " · poucos dados"}</div>${podeConfirmar() && dif ? `<button class="btn small" data-a="aplicarSug" data-id="${p.id}">Aplicar</button>` : ""}`;
}
async function aplicarSugestao(p) {
  const g = sugestoes[p.id]; if (!g) return;
  await updateDoc(doc(db, "produtos", p.id), { minimo: g.min, ideal: g.ideal, sugestaoAplicadaEm: serverTimestamp() });
  sugestoesEm = 0; toast(`${p.nome}: mínimo ${g.min}, ideal ${g.ideal}.`); render();
}
async function aplicarSugestoesEmLote() {
  const alvo = produtos.filter((p) => sugestoes[p.id]?.confiavel && !p.naoComprar && sugestoes[p.id].min !== Number(p.minimo || 0));
  if (!alvo.length) return toast("Nenhum produto com histórico suficiente (60+ dias e 4+ saídas) para ajustar.");
  if (!confirm(`Ajustar mínimo e ideal de ${alvo.length} produto(s) que têm histórico suficiente?`)) return;
  for (const p of alvo) await updateDoc(doc(db, "produtos", p.id), { minimo: sugestoes[p.id].min, ideal: sugestoes[p.id].ideal, sugestaoAplicadaEm: serverTimestamp() });
  sugestoesEm = 0; toast(`${alvo.length} produto(s) ajustados.`); render();
}

/* ================= FOTOS AUTOMÁTICAS DOS PRODUTOS (Google Programmable Search, imagens) ================= */
function modalBuscarFotos() {
  const sem = produtos.filter((p) => !fotoSrc(p) && !p.fotoTentada);
  if (!GOOGLE_CSE_KEY || !GOOGLE_CSE_CX) return abrirModal("🖼 Buscar fotos automaticamente", `<p><b>${sem.length}</b> produto(s) sem foto. Para o sistema buscar sozinho falta ligar a busca de imagens do Google (grátis, 100 buscas por dia): preencha <code>GOOGLE_CSE_KEY</code> e <code>GOOGLE_CSE_CX</code> no <b>firebase-config.js</b> (passo a passo no README).</p>
    <p class="small muted">Enquanto isso, dentro de cada produto existe o botão <b>🔎 Buscar foto no Google</b>.</p>`, async () => {}, "Entendi");
  abrirModal("🖼 Buscar fotos automaticamente", `<p><b>${sem.length}</b> produto(s) ainda sem foto. O Google libera cerca de 100 buscas grátis por dia: se tiver mais, repita amanhã.</p>
    <label>Quantos buscar agora<input type="number" name="n" min="1" max="100" value="${Math.min(90, sem.length) || 1}"></label>
    <p id="fotoProg" class="small"></p><p class="small muted">A busca pode errar marca ou apresentação: as fotos automáticas ficam marcadas em "Editar produto" para você conferir.</p>`,
  async (f) => { if (!sem.length) throw new Error("Todos os produtos já têm foto."); await buscarFotosAuto(sem.slice(0, Math.max(1, Number(f.n)))); }, "Buscar");
}
async function buscarFotosAuto(lista) {
  let ok = 0, vazio = 0;
  for (const [i, p] of lista.entries()) {
    $("#fotoProg") && ($("#fotoProg").textContent = `Buscando ${i + 1} de ${lista.length}: ${p.nome}`);
    const q = [p.nome, p.marca].filter(Boolean).join(" ");
    const r = await fetch(`https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(GOOGLE_CSE_KEY)}&cx=${encodeURIComponent(GOOGLE_CSE_CX)}&searchType=image&num=1&safe=active&imgSize=medium&q=${encodeURIComponent(q)}`);
    const j = await r.json();
    if (r.status === 429) throw new Error(`Limite diário do Google atingido. ${ok} foto(s) já salvas; continue amanhã.`);
    if (!r.ok) throw new Error(j.error?.message || `Erro ${r.status}`);
    const it = j.items?.[0], url = it?.image?.thumbnailLink || it?.link || "";
    await updateDoc(doc(db, "produtos", p.id), { fotoUrl: url, fotoAuto: !!url, fotoTentada: true });
    url ? ok++ : vazio++;
  }
  toast(`${ok} foto(s) encontrada(s)${vazio ? `, ${vazio} sem resultado` : ""}. Confira: a busca automática pode errar a marca.`);
}

/* ================= MODELO DE PLANILHA DO VETCONTROL ================= */
async function baixarModeloPlanilha() {
  await carregarXLSX();
  const wb = XLSX.utils.book_new();
  const leia = [["MODELO DE ESTOQUE DO VETCONTROL"], [""],
    ["• Uma aba por categoria. NÃO mude o nome das abas: o nome da aba define a categoria (distribuidora) do produto."],
    ["• Só \"Nome comercial\" é obrigatório. O código é opcional, mas evita duplicar o produto numa nova importação."],
    ["• A linha de exemplo (Observações = EXEMPLO) é ignorada: pode apagar."],
    ["• Validade no formato DD/MM/AAAA. Mesmo produto com validade diferente = uma linha para cada."],
    ["• Estoque mínimo: quando a quantidade chega nele, aparece REPOR. Estoque ideal é opcional (vazio = o dobro do mínimo)."],
    [`• Depois de alguns dias de uso, o VetControl sugere o mínimo e o ideal certos pelas saídas dos últimos ${DIAS_ANALISE} dias.`],
    ["• Aba \"Salas\": o que cada setor deve ter. Se o produto ainda não existe no cadastro, ele é criado (saldo zero) com a Categoria e a Unidade da linha. \"Evitar comprar\" nas Observações marca o produto como não comprar."],
    ["• Na aba \"Salas\", a coluna Sala deve ser igual a uma destas:"], ...SALAS.map((x) => ["      - " + x.nome])];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(leia), "LEIA-ME");
  const exemplo = ["EX001", "Insumo", "Cateter", "Cateter intravenoso 22G azul", "", "", "BD", "Unidade", "22G", "", "un", 10, 5, 10, "", "", "Armário 1", "EXEMPLO – apague esta linha"];
  for (const cat of DISTRIBUIDORAS) {
    const ws = XLSX.utils.aoa_to_sheet([COLUNAS_MODELO, exemplo]); ws["!cols"] = COLUNAS_MODELO.map((c) => ({ wch: Math.max(14, c.length + 2) })); ws["!cols"][3] = { wch: 40 };
    XLSX.utils.book_append_sheet(wb, ws, NOME_ABA[cat] || cat);
  }
  const wsS = XLSX.utils.aoa_to_sheet([COLUNAS_SALAS, [SALAS[0].nome, "EX001", "Cateter intravenoso 22G azul", 10, 3, "Hospitalar Humano", "Unidade", "", "EXEMPLO – apague esta linha", 6]]); wsS["!cols"] = [{ wch: 34 }, { wch: 12 }, { wch: 44 }, { wch: 14 }, { wch: 24 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 40 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(wb, wsS, "Salas");
  XLSX.writeFile(wb, "Modelo_Estoque_VetControl.xlsx");
}

/* ================= FICHA DE REPOSIÇÃO DA SALA ================= */
// Lista o que a sala deve ter (ideal) e, ao lado, a coluna para lançar quanto foi reposto. Cada lançamento vira uma
// reposição (sai do estoque central e entra na sala), e é isso que alimenta o relatório semanal.
async function telaFicha(v) {
  await carregarProdutos();
  const s = await getDocs(collection(db, "salas", salaAtual, "itens"));
  const itens = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((it) => Number(it.ideal) > 0).sort((a, b) => a.nome.localeCompare(b.nome));
  itens.forEach((it) => { it.prod = produtos.find((x) => x.id === it.id); it.controlado = !!(it.prod?.controlado ?? it.controlado);
    it.agora = total(it.lotes); it.falta = Math.max(0, Number(it.ideal) - it.agora); it.central = it.prod ? total(it.prod.lotesEstoque) : 0; });
  v.innerHTML = `
  <div class="barra no-print"><h2>Ficha de reposição</h2><button class="btn" onclick="print()">🖨 Imprimir ficha</button></div>
  <div class="tabs no-print">${SALAS.map((x) => `<button class="btn ${x.id === salaAtual ? "ativo" : ""}" data-s="${x.id}">${x.nome}</button>`).join("")}</div>
  <div class="ficha-cab"><h2>${esc(CLINICA.nome)} · Ficha de reposição — ${esc(nomeSala(salaAtual))}</h2><p>Data: ____/____/________ &nbsp;&nbsp; Responsável: ______________________________</p></div>
  <p class="muted small no-print">Quantidade <b>ideal</b> de cada item nesta sala. Digite na última coluna quanto você repôs e clique em <b>Registrar reposição</b>: sai do estoque central, entra na sala e aparece no relatório semanal. 🔒 Controlados não são lançados aqui (exigem o livro): use Estoque → Retirar p/ setor.${podeConfirmar() ? "" : " Seus lançamentos ficam <b>pendentes</b> até a estoquista confirmar."}</p>
  <div class="tabela-wrap"><table class="ficha"><thead><tr><th></th><th>Item</th><th>Ideal</th><th>Na sala agora</th><th>Falta</th><th>No estoque central</th><th>Qtd. reposta</th></tr></thead><tbody>
  ${itens.map((it) => `<tr><td>${fotoTag(it.prod || {}).replace('class="foto"', 'class="foto foto-g"')}</td><td><b>${esc(it.nome)}</b>${it.controlado ? ` <span class="tag critico">🔒 Controlado</span>` : ""}<div class="muted small">${esc(it.medida || "")}</div></td>
    <td>${it.ideal}</td><td>${it.agora}</td><td>${it.falta ? `<b>${it.falta}</b>` : "—"}</td><td>${it.prod ? it.central : "—"}</td>
    <td><input type="number" min="0" data-id="${it.id}" data-falta="${it.falta}" data-central="${it.central}" ${it.controlado || !it.prod ? "disabled" : ""}></td></tr>`).join("") || `<tr><td colspan="7" class="muted">Nenhum item com quantidade ideal neste setor. Configure em "Salas, geladeiras e setores" (botão Ideal/crítico) ou importe a aba Salas da planilha.</td></tr>`}
  </tbody></table></div>
  ${itens.length ? `<div class="barra no-print" style="margin-top:12px"><label>Quem fez a reposição<input id="fResp" value="${esc(usuario.nome)}"></label>
    <button class="btn" id="fPreencher">Preencher com o que falta</button><button class="btn primary" id="fSalvar">✅ Registrar reposição</button></div><p id="fRes" class="small"></p>` : ""}`;
  v.querySelectorAll("[data-s]").forEach((b) => (b.onclick = () => { salaAtual = b.dataset.s; render(); }));
  if (!itens.length) return;
  $("#fPreencher").onclick = () => v.querySelectorAll("input[data-id]:not(:disabled)").forEach((i) => { const n = Math.min(Number(i.dataset.falta), Number(i.dataset.central)); i.value = n > 0 ? n : ""; });
  $("#fSalvar").onclick = async () => {
    const resp = $("#fResp").value.trim(); if (!resp) return toast("Informe quem fez a reposição.");
    const linhas = [...v.querySelectorAll("input[data-id]:not(:disabled)")].filter((i) => Number(i.value) > 0);
    if (!linhas.length) return toast("Digite a quantidade reposta em pelo menos um item.");
    $("#fSalvar").disabled = true; let ok = 0, pend = 0; const falhas = [];
    for (const i of linhas) {
      const it = itens.find((x) => x.id === i.dataset.id), qtd = Number(i.value);
      try {
        if (false) { await criarPendencia({ tipo: "saida", produtoId: it.prod.id, produtoNome: it.prod.nome, qtd, sala: salaAtual, responsavel: resp, obs: "Ficha de reposição" }); pend++; }
        else { await darBaixa(it.prod, salaAtual, qtd, resp, "Ficha de reposição"); ok++; }
      } catch (e) { falhas.push(`${it.nome}: ${e.message}`); }
    }
    toast(`${ok ? ok + " item(ns) repostos. " : ""}${pend ? pend + " enviado(s) para confirmação. " : ""}${falhas.length ? falhas.length + " com problema." : ""}`.trim());
    if (falhas.length) alert("Não foi possível lançar:\n\n" + falhas.join("\n"));
    render();
  };
}

/* ================= RELATÓRIO SEMANAL DE REPOSIÇÃO (o que mais sai por semana) ================= */
let semRef = null, semSala = "";
async function telaSemanal(v) {
  semRef ||= hoje();
  v.innerHTML = `<div class="card no-print" style="margin-bottom:14px"><h2 style="margin-top:0">Relatório semanal de reposição</h2>
    <p class="muted small">Soma tudo que foi reposto nos setores (pela Ficha de reposição ou pela retirada do estoque) na semana de segunda a domingo, comparada às 3 semanas anteriores.</p>
    <div class="duas"><label>Semana que contém o dia<input type="date" id="sRef" value="${semRef}"></label>
    <label>Setor<select id="sSala"><option value="">Todos os setores</option>${opts(SALAS, semSala)}</select></label></div>
    <div class="barra"><button class="btn primary" id="sGerar">Gerar</button><button class="btn" id="sCsv">Exportar CSV (Excel)</button><button class="btn" onclick="print()">Imprimir / PDF</button></div></div><div id="sRes"></div>`;
  let linhas = [], rotulos = [];
  const dm = (d) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const gerar = async () => {
    semRef = $("#sRef").value || hoje(); semSala = $("#sSala").value;
    const ref = new Date(semRef + "T12:00:00"), seg = new Date(ref); seg.setDate(ref.getDate() - ((ref.getDay() + 6) % 7)); seg.setHours(0, 0, 0, 0);
    const base = new Date(seg); base.setDate(seg.getDate() - 21); const fim = new Date(seg); fim.setDate(seg.getDate() + 7);
    const snap = await getDocs(query(collection(db, "movimentos"), where("data", ">=", Timestamp.fromDate(base)), where("data", "<", Timestamp.fromDate(fim))));
    const movs = snap.docs.map((d) => d.data()).filter((m) => m.tipo === "reposicao" && m.data?.toDate && (!semSala || m.local === semSala));
    const ini = [0, 1, 2, 3].map((i) => { const a = new Date(base); a.setDate(base.getDate() + 7 * i); return a; });
    const domingo = new Date(seg); domingo.setDate(seg.getDate() + 6);
    rotulos = [`${dm(ini[0])}`, `${dm(ini[1])}`, `${dm(ini[2])}`, `${dm(seg)}–${dm(domingo)}`];
    const mp = {}, pessoas = {}, setores = {};
    movs.forEach((m) => { const i = Math.floor((m.data.toDate() - base) / (7 * 864e5)); if (i < 0 || i > 3) return; const q = Number(m.qtd || 0);
      const x = (mp[m.produtoId || m.produtoNome] ??= { nome: m.produtoNome, sem: [0, 0, 0, 0], salas: new Set() }); x.sem[i] += q; x.salas.add(nomeSala(m.local));
      if (i === 3) { const pe = m.responsavel || m.usuarioNome || "—"; pessoas[pe] = (pessoas[pe] || 0) + q; setores[nomeSala(m.local)] = (setores[nomeSala(m.local)] || 0) + q; } });
    linhas = Object.values(mp).map((x) => ({ ...x, media: (x.sem[0] + x.sem[1] + x.sem[2]) / 3 })).sort((a, b) => b.sem[3] - a.sem[3] || b.media - a.media);
    const totalSem = linhas.reduce((t, x) => t + x.sem[3], 0), top = linhas[0]?.sem[3] ? linhas[0] : null;
    const tend = (x) => (!x.media && x.sem[3] ? "novo" : x.media && x.sem[3] > x.media * 1.3 ? "↑ subiu" : x.media && x.sem[3] < x.media * 0.7 ? "↓ caiu" : "=");
    const mini = (obj, tit) => `<div class="card"><b>${tit}</b><table><tbody>${Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<tr><td>${esc(k)}</td><td><b>${n}</b></td></tr>`).join("") || `<tr><td class="muted">—</td></tr>`}</tbody></table></div>`;
    $("#sRes").innerHTML = `<h2>Reposição da semana ${esc(rotulos[3])}${semSala ? " · " + esc(nomeSala(semSala)) : ""}</h2>
      <p class="muted small">Gerado em ${new Date().toLocaleString("pt-BR")} por ${esc(usuario.nome)}</p>
      <div class="grid"><div class="card kpi"><span class="muted">Unidades repostas</span><b>${totalSem}</b></div><div class="card kpi"><span class="muted">Itens diferentes</span><b>${linhas.filter((x) => x.sem[3]).length}</b></div>
      <div class="card kpi"><span class="muted">Mais saiu</span><b style="font-size:1rem">${top ? esc(top.nome) : "—"}</b>${top ? `<span class="small">${top.sem[3]} un.</span>` : ""}</div></div>
      <div class="grid" style="margin:12px 0">${mini(setores, "Por setor (semana)")}${mini(pessoas, "Por pessoa (semana)")}</div>
      <div class="tabela-wrap"><table><thead><tr><th>Item</th><th>Setor(es)</th><th>Sem. ${esc(rotulos[0])}</th><th>Sem. ${esc(rotulos[1])}</th><th>Sem. ${esc(rotulos[2])}</th><th>Semana ${esc(rotulos[3])}</th><th>Média 3 sem.</th><th></th></tr></thead><tbody>
      ${linhas.map((x) => `<tr><td><b>${esc(x.nome)}</b></td><td class="small">${esc([...x.salas].join(", "))}</td><td>${x.sem[0]}</td><td>${x.sem[1]}</td><td>${x.sem[2]}</td><td><b>${x.sem[3]}</b></td><td>${x.media.toFixed(1).replace(".", ",")}</td><td>${tend(x)}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Nenhuma reposição registrada neste período.</td></tr>`}</tbody></table></div>`;
  };
  $("#sGerar").onclick = () => gerar().catch((e) => ($("#sRes").innerHTML = `<p class="erro">${esc(e.message)}</p>`));
  $("#sCsv").onclick = () => {
    if (!linhas.length) return toast("Gere o relatório primeiro.");
    const csv = [["Item", "Setores", ...rotulos.map((r, i) => (i < 3 ? "Sem. " : "Semana ") + r), "Média 3 sem."].join(";"), ...linhas.map((x) => [x.nome, [...x.salas].join(", "), ...x.sem, x.media.toFixed(1).replace(".", ",")].map((c) => String(c).replace(/;/g, ",")).join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `reposicao_semanal_${semRef}.csv`; a.click();
  };
  $("#sGerar").onclick();
}

/* ================= PEDIDO ACUMULADO ================= */
const refPedido = () => doc(db, "config", "pedidoAberto");
async function carregarPedidoAberto() { const d = await getDoc(refPedido()); pedidoAberto = d.exists() ? d.data().itens || {} : {}; return pedidoAberto; }
async function salvarPedidoAberto(mudar) {
  await runTransaction(db, async (t) => { const d = await t.get(refPedido()); const it = { ...(d.exists() ? d.data().itens || {} : {}) }; mudar(it);
    Object.keys(it).forEach((k) => !(it[k] > 0) && delete it[k]); t.set(refPedido(), { itens: it, atualizadoPor: usuario.nome, atualizadoEm: serverTimestamp() }); pedidoAberto = it; });
}
function modalIncluirPedido(p) {
  const sug = Math.max(1, Number(p.ideal || 0) - total(p.lotesEstoque));
  abrirModal(`🛒 Incluir no pedido — ${p.nome}`, `<p class="muted small">${esc(p.categoria)} · em estoque: <b>${total(p.lotesEstoque)}</b> · ideal: ${p.ideal ?? "—"}${pedidoAberto[p.id] ? ` · <b>já no pedido: ${pedidoAberto[p.id]}</b>` : ""}</p>
    <label>Quantidade a somar ao pedido (${esc(p.medida)})<input type="number" min="1" name="qtd" required value="${sug}"></label>`,
  async (f) => { await salvarPedidoAberto((it) => (it[p.id] = (Number(it[p.id]) || 0) + Number(f.qtd))); toast(`Somado ao pedido: ${pedidoAberto[p.id]} ${p.medida}.`); }, "Incluir");
}

/* ================= PEDIDO ================= */
async function telaPedido(v) {
  await Promise.all([carregarProdutos(), carregarPedidoAberto()]);
  pedidoAtual = { ...pedidoAberto };
  const sugeridos = new Set();
  produtos.filter((p) => !p.naoComprar && total(p.lotesEstoque) <= Number(p.minimo || 0) && !(p.id in pedidoAtual))
    .forEach((p) => { pedidoAtual[p.id] = Math.max(1, Number(p.ideal || 0) - total(p.lotesEstoque)); sugeridos.add(p.id); });
  const forn = (await getDocs(collection(db, "fornecedores"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const compras = (await getDocs(collection(db, "listaCompras"))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => !["Entregue", "Cancelado"].includes(c.status));
  const grupos = {};
  Object.entries(pedidoAtual).forEach(([id, q]) => { const p = produtos.find((x) => x.id === id); if (p) (grupos[p.categoria] ??= []).push({ p, q }); });
  v.innerHTML = `
  <div class="barra"><h2>Fazer pedido</h2>
    <select id="addProd"><option value="">+ Adicionar produto ao pedido…</option>${produtos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select>
    <button class="btn" id="folha">🖨 Folha do pedido</button><button class="btn" id="limpar">Limpar pedido</button></div>
  <p class="muted small">Aqui somam os itens que a equipe incluiu com <b>🛒 Incluir no pedido</b> no Estoque, separados por categoria. Itens marcados como <span class="tag alerta">sugestão</span> estão abaixo do mínimo e entram automaticamente. Ajuste e envie para cada distribuidora.</p>
  ${Object.keys(grupos).length ? Object.entries(grupos).map(([cat, itens]) => {
    const fs = forn.filter((f) => f.distribuidora === cat);
    return `<div class="card" style="margin-bottom:14px"><h3>${esc(cat)}</h3>
      <table><thead><tr><th>Produto</th><th>Marca</th><th>Em estoque</th><th>Ideal</th><th>Pedir</th><th></th></tr></thead><tbody>
      ${itens.map(({ p, q }) => `<tr><td>${esc(p.nome)}${sugeridos.has(p.id) ? ` <span class="tag alerta">sugestão</span>` : ""}</td><td>${esc(p.marca || "")}</td><td>${total(p.lotesEstoque)}</td><td>${p.ideal}</td>
        <td><input type="number" min="1" value="${q}" data-q="${p.id}" style="width:80px"> ${esc(p.medida)}</td>
        <td><button class="btn small danger" data-rm="${p.id}">Remover</button></td></tr>`).join("")}
      </tbody></table>
      <div class="barra" style="margin-top:10px">${fs.length ? fs.map((f) => `
        <span><b>${esc(f.nome)}</b></span>
        ${f.whatsapp ? `<button class="btn small primary" data-env="wa" data-cat="${esc(cat)}" data-f="${f.id}">WhatsApp</button>` : ""}
        ${f.email ? `<button class="btn small" data-env="mail" data-cat="${esc(cat)}" data-f="${f.id}">E-mail</button>` : ""}`).join("")
        : `<span class="muted small">Nenhum fornecedor cadastrado para esta distribuidora. ${isMaster() ? `<a href="#fornecedores">Cadastrar</a>` : ""}</span>`}
        <button class="btn small" data-env="copiar" data-cat="${esc(cat)}">Copiar texto</button></div></div>`;
  }).join("") : `<p class="muted">Nenhum item no pedido. 👍</p>`}
  ${compras.length ? `<div class="card"><h3>🛍️ Compras em marketplace (Shopee e similares)</h3><table><thead><tr><th>Item</th><th>Plataforma</th><th>Status</th><th>Obs.</th><th></th></tr></thead><tbody>
    ${compras.map((c) => `<tr><td>${esc(c.item)}${c.link ? ` <a href="${esc(c.link)}" target="_blank">🔗</a>` : ""}</td><td>${esc(c.plataforma)}</td><td><select data-cs="${c.id}">${opts(["A comprar", "Comprado", "Entregue", "Cancelado"], c.status)}</select></td><td class="small">${esc(c.obs)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  v.querySelectorAll("[data-cs]").forEach((s) => (s.onchange = async () => { await updateDoc(doc(db, "listaCompras", s.dataset.cs), { status: s.value }); toast("Status salvo."); }));
  v.querySelectorAll("[data-q]").forEach((i) => (i.onchange = async () => { pedidoAtual[i.dataset.q] = Number(i.value); await salvarPedidoAberto((it) => (it[i.dataset.q] = Number(i.value))); toast("Quantidade salva."); }));
  v.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = async () => { await salvarPedidoAberto((it) => delete it[b.dataset.rm]); render(); }));
  $("#addProd").onchange = async (e) => { const p = produtos.find((x) => x.id === e.target.value); if (p) { await salvarPedidoAberto((it) => (it[p.id] = (Number(it[p.id]) || 0) + Math.max(1, Number(p.ideal || 0) - total(p.lotesEstoque)))); render(); } };
  $("#limpar").onclick = async () => { if (!confirm("Esvaziar o pedido acumulado?")) return; await salvarPedidoAberto((it) => Object.keys(it).forEach((k) => delete it[k])); render(); };
  $("#folha").onclick = () => docImpressao(`<div class="cab"><b>${esc(CLINICA.nome)}</b></div><h1>Folha de pedido — ${fmtData(hoje())}</h1>
    ${Object.entries(grupos).sort().map(([cat, its]) => `<h3 style="color:#0d3c78;border-bottom:2px solid #1565c0;margin-top:18px">${esc(cat)}</h3>
      <table><tr><th align="left">Produto</th><th align="left">Marca</th><th>Qtd</th><th>Medida</th><th>✓</th></tr>
      ${its.map(({ p }) => `<tr><td>${esc(p.nome)}</td><td>${esc(p.marca || "")}</td><td align="center"><b>${pedidoAtual[p.id]}</b></td><td align="center">${esc(p.medida)}</td><td align="center">☐</td></tr>`).join("")}</table>`).join("")}
    <p style="margin-top:30px"><small>Gerado por ${esc(usuario.nome)} em ${new Date().toLocaleString("pt-BR")}</small></p>`, "a4", "Folha de pedido");
  v.querySelectorAll("[data-env]").forEach((b) => (b.onclick = async () => {
    const cat = b.dataset.cat, itens = grupos[cat]; const f = forn.find((x) => x.id === b.dataset.f);
    const linhas = itens.map(({ p }) => `• ${p.nome}${p.marca ? " (" + p.marca + ")" : ""} — ${pedidoAtual[p.id]} ${p.medida}`);
    const texto = `Olá${f ? " " + f.nome : ""}! Segue pedido (${fmtData(hoje())}):\n\n${linhas.join("\n")}\n\nFavor confirmar disponibilidade, valores e prazo. Obrigado!`;
    if (b.dataset.env === "copiar") { await navigator.clipboard.writeText(texto); return toast("Texto copiado."); }
    if (b.dataset.env === "wa") window.open(`https://wa.me/${f.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`, "_blank");
    if (b.dataset.env === "mail") location.href = `mailto:${f.email}?subject=${encodeURIComponent("Pedido de compra - " + fmtData(hoje()))}&body=${encodeURIComponent(texto)}`;
    await addDoc(collection(db, "pedidos"), { distribuidora: cat, fornecedor: f?.nome || "", itens: itens.map(({ p }) => ({ produtoId: p.id, nome: p.nome, qtd: pedidoAtual[p.id] })), por: usuario.nome, data: serverTimestamp() });
    if (confirm(`Pedido de "${cat}" enviado. Tirar esses itens do pedido acumulado?`)) { await salvarPedidoAberto((it) => itens.forEach(({ p }) => delete it[p.id])); render(); }
    toast("Pedido registrado no histórico.");
  }));
}

/* ================= FORNECEDORES (master) ================= */
async function telaFornecedores(v) {
  if (!isMaster()) return (v.innerHTML = "<p>Acesso restrito ao master.</p>");
  const fs = (await getDocs(collection(db, "fornecedores"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  v.innerHTML = `<div class="barra"><h2>Fornecedores</h2><button class="btn primary" id="novoF">+ Novo fornecedor</button></div>
  <table><thead><tr><th>Nome</th><th>Distribuidora</th><th>WhatsApp</th><th>E-mail</th><th></th></tr></thead><tbody>
  ${fs.map((f) => `<tr><td>${esc(f.nome)}</td><td>${esc(f.distribuidora)}</td><td>${esc(f.whatsapp || "")}</td><td>${esc(f.email || "")}</td>
    <td class="acoes-linha"><button class="btn small" data-e="${f.id}">Editar</button><button class="btn small danger" data-x="${f.id}">Excluir</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nenhum fornecedor.</td></tr>`}
  </tbody></table>`;
  const modal = (f = {}) => abrirModal(f.id ? "Editar fornecedor" : "Novo fornecedor", `
    <label>Nome<input name="nome" required value="${esc(f.nome)}"></label>
    <label>Distribuidora<select name="distribuidora">${opts(DISTRIBUIDORAS, f.distribuidora)}</select></label>
    <label>WhatsApp (com DDD, ex.: 5511999998888)<input name="whatsapp" value="${esc(f.whatsapp)}"></label>
    <label>E-mail<input type="email" name="email" value="${esc(f.email)}"></label>`,
    async (d) => { f.id ? await updateDoc(doc(db, "fornecedores", f.id), d) : await addDoc(collection(db, "fornecedores"), d); toast("Fornecedor salvo."); });
  $("#novoF").onclick = () => modal();
  v.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => modal(fs.find((x) => x.id === b.dataset.e))));
  v.querySelectorAll("[data-x]").forEach((b) => (b.onclick = async () => { if (confirm("Excluir fornecedor?")) { await deleteDoc(doc(db, "fornecedores", b.dataset.x)); render(); } }));
}

/* ================= USUÁRIOS (master) ================= */
async function telaUsuarios(v) {
  if (!isMaster()) return (v.innerHTML = "<p>Acesso restrito ao master.</p>");
  const us = (await getDocs(collection(db, "users"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  v.innerHTML = `<div class="barra"><h2>Usuários</h2><button class="btn primary" id="novoU">+ Novo usuário</button></div>
  <table><thead><tr><th>Nome</th><th>E-mail</th><th>Cargo</th><th>Perfil</th><th>Situação</th><th></th></tr></thead><tbody>
  ${us.map((u) => `<tr><td>${esc(u.nome)}</td><td>${esc(u.email)}</td><td><select data-cg="${u.id}" class="small"><option value="">— definir —</option>${opts(CARGOS, u.cargo)}</select></td><td>${u.role}</td><td>${u.ativo ? `<span class="tag ok">Ativo</span>` : `<span class="tag critico">Bloqueado</span>`}</td>
    <td class="acoes-linha">${u.id !== usuario.uid ? `<button class="btn small" data-t="${u.id}">${u.ativo ? "Bloquear" : "Ativar"}</button>
    <select data-r="${u.id}" class="small">${opts(["usuario", "estoquista", "master"], u.role)}</select>` : "<span class='muted small'>você</span>"}
    <button class="btn small" data-s="${esc(u.email)}">Enviar redefinição de senha</button></td></tr>`).join("")}
  </tbody></table>`;
  $("#novoU").onclick = () => abrirModal("Novo usuário", `
    <label>Nome<input name="nome" required></label>
    <label>E-mail<input type="email" name="email" required></label>
    <label>Senha inicial (mín. 6 caracteres)<input name="senha" required minlength="6"></label>
    <label>Cargo<select name="cargo"><option value="">— definir depois —</option>${opts(CARGOS)}</select></label>
    <label>Perfil<select name="role"><option value="usuario">Usuário (lançamentos ficam pendentes)</option><option value="estoquista">Estoquista (confirma entradas e retiradas)</option><option value="master">Master</option></select></label>`,
    async (f) => {
      // App secundário: cria o login sem deslogar o master
      const sec = initializeApp(firebaseConfig, "sec" + Date.now());
      try {
        let cred;
        try { cred = await createUserWithEmailAndPassword(getAuth(sec), f.email, f.senha); }
        catch (e1) { // e-mail já tem login (cadastro anterior que ficou pela metade): reaproveita se a senha for a mesma
          if (e1.code !== "auth/email-already-in-use") throw e1;
          try { cred = await signInWithEmailAndPassword(getAuth(sec), f.email, f.senha); }
          catch { throw new Error("Este e-mail já tem um login criado antes (mas sem ficha na equipe). Digite a MESMA senha usada naquela tentativa, ou apague esse e-mail em Firebase → Authentication → Users e cadastre de novo."); } }
        if ((await getDoc(doc(db, "users", cred.user.uid))).exists()) throw new Error("Este e-mail já está cadastrado na equipe.");
        await setDoc(doc(db, "users", cred.user.uid), { nome: f.nome, email: f.email, role: f.role, cargo: f.cargo, ativo: true, criadoEm: serverTimestamp() });
        await signOut(getAuth(sec));
      } catch (e) { throw new Error(e.code === "auth/email-already-in-use" ? "Este e-mail já está cadastrado." : e.message); }
      finally { await deleteApp(sec); }
      toast("Usuário criado.");
    });
  const u = (id) => us.find((x) => x.id === id);
  v.querySelectorAll("[data-t]").forEach((b) => (b.onclick = async () => { await updateDoc(doc(db, "users", b.dataset.t), { ativo: !u(b.dataset.t).ativo }); render(); }));
  v.querySelectorAll("select[data-r]").forEach((sel) => (sel.onchange = async () => { await updateDoc(doc(db, "users", sel.dataset.r), { role: sel.value }); toast("Perfil alterado."); render(); }));
  v.querySelectorAll("select[data-cg]").forEach((sel) => (sel.onchange = async () => { await updateDoc(doc(db, "users", sel.dataset.cg), { cargo: sel.value }); toast("Cargo alterado."); }));
  v.querySelectorAll("[data-s]").forEach((b) => (b.onclick = async () => { await sendPasswordResetEmail(auth, b.dataset.s); toast("E-mail de redefinição enviado."); }));
}

/* ================= SOLICITAÇÕES DE REPOSIÇÃO ================= */
const corStatus = (s) => ({ Pendente: "critico", "Em andamento": "alerta", Atendida: "ok", Recusada: "neutro", Solicitado: "critico", Coletado: "alerta", "Enviado ao laboratório": "alerta", "Resultado disponível": "ok", "Entregue ao tutor": "neutro", Cancelado: "neutro" }[s] || "neutro");
const fmtTs = (ts) => (ts?.toDate ? ts.toDate().toLocaleString("pt-BR") : "");

async function atualizarBadge() {
  try {
    const s = await getDocs(query(collection(db, "solicitacoes"), where("status", "==", "Pendente")));
    const b = $("#badgeSol"); b.textContent = s.size; b.classList.toggle("hidden", !s.size);
    if (podeConfirmar()) { const pd = await getDocs(query(collection(db, "pendencias"), where("status", "==", "Pendente"))); const a = $("#badgeAlerta"); if (pd.size) { a.textContent = pd.size + " pend."; a.classList.remove("hidden"); } }
  } catch {}
}

let filtroSol = "abertas";
async function telaSolicitacoes(v) {
  await carregarProdutos();
  const s = await getDocs(query(collection(db, "solicitacoes"), orderBy("criadoEm", "desc")));
  let lista = s.docs.map((d) => ({ id: d.id, ...d.data() }));
  if (filtroSol === "abertas") lista = lista.filter((x) => x.status === "Pendente" || x.status === "Em andamento");
  const ordemUrg = { Urgente: 0, Alta: 1, Normal: 2 };
  if (filtroSol === "abertas") lista.sort((a, b) => ordemUrg[a.urgencia] - ordemUrg[b.urgencia]);
  v.innerHTML = `
  <div class="barra"><h2>Solicitações de reposição</h2>
    <select id="fSol"><option value="abertas" ${filtroSol === "abertas" ? "selected" : ""}>Em aberto</option><option value="todas" ${filtroSol === "todas" ? "selected" : ""}>Todas</option></select>
    <button class="btn primary" id="novaSol">+ Nova solicitação</button></div>
  <p class="muted small">Peça a reposição de um produto já cadastrado ou de um produto novo. O estoquista atende depois e o sistema registra quem pediu e quem atendeu.</p>
  <div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Produto</th><th>Qtd</th><th>Para</th><th>Urgência</th><th>Solicitante</th><th>Status</th><th>Atendimento</th><th></th></tr></thead><tbody>
  ${lista.map((x) => `<tr>
    <td class="small">${fmtTs(x.criadoEm)}</td>
    <td><b>${esc(x.produtoNome)}</b>${x.novo ? ` <span class="tag alerta">Produto novo</span>` : ""}${x.obs ? `<div class="muted small">${esc(x.obs)}</div>` : ""}</td>
    <td>${x.qtd} ${esc(x.medida || "")}</td><td>${esc(nomeSala(x.sala))}</td>
    <td><span class="tag ${x.urgencia === "Urgente" ? "critico" : x.urgencia === "Alta" ? "alerta" : "neutro"}">${x.urgencia}</span></td>
    <td>${esc(x.solicitanteNome)}</td><td><span class="tag ${corStatus(x.status)}">${x.status}</span></td>
    <td class="small">${x.atendidoPor ? `${esc(x.atendidoPor)}<br>${fmtTs(x.atendidoEm)}${x.resposta ? `<br><i>${esc(x.resposta)}</i>` : ""}` : "—"}</td>
    <td class="acoes-linha">${x.status === "Pendente" || x.status === "Em andamento" ? `<button class="btn small primary" data-at="${x.id}">Atender</button>` : ""}
      ${isMaster() || (x.solicitanteUid === usuario.uid && x.status === "Pendente") ? `<button class="btn small danger" data-del="${x.id}">Excluir</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">Nenhuma solicitação.</td></tr>`}
  </tbody></table></div>`;
  $("#fSol").onchange = (e) => { filtroSol = e.target.value; render(); };
  $("#novaSol").onclick = modalNovaSolicitacao;
  v.querySelectorAll("[data-at]").forEach((b) => (b.onclick = () => modalAtender(lista.find((x) => x.id === b.dataset.at))));
  v.querySelectorAll("[data-del]").forEach((b) => (b.onclick = async () => { if (confirm("Excluir solicitação?")) { await deleteDoc(doc(db, "solicitacoes", b.dataset.del)); render(); } }));
}

function modalNovaSolicitacao() {
  abrirModal("Nova solicitação de reposição", `
    <label>Produto<select name="pid" id="selPid"><option value="__novo">➕ Produto novo (não cadastrado)</option>${produtos.map((p) => `<option value="${p.id}">${esc(p.nome)}${p.marca ? " — " + esc(p.marca) : ""}</option>`).join("")}</select></label>
    <div id="boxNovo"><label>Nome do produto novo<input name="nomeNovo" placeholder="Ex.: Sonda uretral nº 8"></label>
      <label>Marca / apresentação / link de referência<input name="refNovo"></label></div>
    <div class="duas"><label>Quantidade<input type="number" min="1" name="qtd" required></label>
    <label>Medida<select name="medida">${opts(MEDIDAS)}</select></label></div>
    <div class="duas"><label>Para onde<select name="sala">${opts(SALAS)}<option value="estoque">Estoque central</option></select></label>
    <label>Urgência<select name="urgencia"><option>Normal</option><option>Alta</option><option>Urgente</option></select></label></div>
    <label>Observação<textarea name="obs" rows="2"></textarea></label>`,
  async (f) => {
    const novo = f.pid === "__novo"; const p = produtos.find((x) => x.id === f.pid);
    if (novo && !f.nomeNovo.trim()) throw new Error("Informe o nome do produto novo.");
    await addDoc(collection(db, "solicitacoes"), {
      novo, produtoId: novo ? null : p.id, produtoNome: novo ? f.nomeNovo.trim() : p.nome, referencia: f.refNovo || "",
      qtd: Number(f.qtd), medida: novo ? f.medida : p.medida, sala: f.sala, urgencia: f.urgencia,
      obs: [f.obs, f.refNovo].filter(Boolean).join(" · "), status: "Pendente",
      solicitanteUid: usuario.uid, solicitanteNome: usuario.nome, criadoEm: serverTimestamp() });
    toast("Solicitação enviada ao estoquista.");
  }, "Enviar");
  const sel = $("#selPid"), box = $("#boxNovo"), med = $("#modalCorpo [name=medida]").closest("label");
  const tg = () => { const n = sel.value === "__novo"; box.classList.toggle("hidden", !n); med.classList.toggle("hidden", !n); };
  sel.onchange = tg; tg();
}

function modalAtender(x) {
  const p = produtos.find((y) => y.id === x.produtoId);
  const podeBaixa = p && x.sala !== "estoque";
  abrirModal(`Atender — ${x.produtoNome}`, `
    <p class="muted small">Pedido por <b>${esc(x.solicitanteNome)}</b>: ${x.qtd} ${esc(x.medida || "")} para ${esc(nomeSala(x.sala))}.
    ${p ? `<br>Em estoque: <b>${total(p.lotesEstoque)}</b> ${lotesHtml(p.lotesEstoque)}` : x.novo ? "<br>Produto novo: providencie a compra e cadastre o produto no Estoque." : ""}</p>
    <label>Novo status<select name="status">${opts(STATUS_REPOSICAO.filter((s) => s !== "Pendente"), "Atendida")}</select></label>
    ${podeBaixa ? `<label style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" name="baixar" checked> Dar baixa do estoque para ${esc(nomeSala(x.sala))} agora</label>
      <label>Quantidade enviada<input type="number" min="1" name="qtdEnv" value="${Math.min(x.qtd, total(p.lotesEstoque)) || x.qtd}"></label>` : ""}
    <label>Resposta / observação<input name="resposta" placeholder="Ex.: pedido feito ao fornecedor, chega sexta"></label>`,
  async (f) => {
    if (podeBaixa && f.baixar && f.status === "Atendida") await darBaixa(p, x.sala, f.qtdEnv, usuario.nome, `Solicitação de ${x.solicitanteNome}`);
    await updateDoc(doc(db, "solicitacoes", x.id), { status: f.status, resposta: f.resposta || "", atendidoPor: usuario.nome, atendidoUid: usuario.uid, atendidoEm: serverTimestamp() });
    toast("Solicitação atualizada.");
  });
}

/* ================= INVENTÁRIO (PATRIMÔNIO) ================= */
const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
let filtroInv = { busca: "", local: "", cat: "", baixados: false };
async function telaInventario(v) {
  const todos = (await getDocs(query(collection(db, "inventario"), orderBy("nome")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const ultConf = {}; (await getDocs(collection(db, "conferenciasInventario"))).docs.map((d) => d.data()).forEach((c) => { if (!ultConf[c.local] || c.data > ultConf[c.local].data) ultConf[c.local] = c; });
  v.innerHTML = `
  <div class="barra"><h2>Inventário / patrimônio</h2>
    <input id="iB" placeholder="Buscar item, nº patrimônio, NF…" value="${esc(filtroInv.busca)}">
    <select id="iL"><option value="">Todos os locais</option>${opts(INV_LOCAIS, filtroInv.local)}</select>
    <select id="iC"><option value="">Todas as categorias</option>${opts(INV_CATEGORIAS, filtroInv.cat)}</select>
    <label style="flex-direction:row;align-items:center;margin:0;gap:4px"><input type="checkbox" id="iX" ${filtroInv.baixados ? "checked" : ""}> Mostrar baixados</label>
    <button class="btn" id="iCsv">Exportar CSV</button>
    ${filtroInv.local ? `<button class="btn" id="iConf">📋 Conferir ${esc(filtroInv.local)}</button>` : ""}
    <button class="btn primary" id="iNovo">+ Novo item</button></div>
  <div class="salas-inv">${INV_LOCAIS.map((l) => { const it = todos.filter((x) => x.local === l && x.status !== "Baixado");
    const conf = ultConf[l];
    return `<div class="card sala-inv ${filtroInv.local === l ? "sel" : ""}" data-loc="${esc(l)}"><b>${esc(l)}</b><span>${it.length} itens · ${brl(it.reduce((s, x) => s + x.qtd * x.valorUnit, 0))}</span>
      <small class="${conf ? "" : "muted"}">${conf ? "conferida " + fmtData(conf.data) : "nunca conferida"}</small></div>`; }).join("")}
    <div class="card sala-inv ${!filtroInv.local ? "sel" : ""}" data-loc=""><b>Todas as salas</b><span>${todos.filter((x) => x.status !== "Baixado").length} itens</span></div></div>
  <div class="grid" id="iKpi"></div>
  <div class="tabela-wrap"><table><thead><tr><th></th><th>Item</th><th>Categoria</th><th>Local</th><th>Qtd</th><th>Valor unit.</th><th>Valor total</th><th>Aquisição</th><th>Estado</th><th></th></tr></thead><tbody id="iTb"></tbody></table></div>`;
  let lista = [];
  const desenhar = () => {
    const b = filtroInv.busca.toLowerCase();
    lista = todos.filter((x) => (filtroInv.baixados || x.status !== "Baixado") && (!filtroInv.local || x.local === filtroInv.local) && (!filtroInv.cat || x.categoria === filtroInv.cat) &&
      (!b || `${x.nome} ${x.descricao} ${x.patrimonio} ${x.nf} ${x.fornecedor}`.toLowerCase().includes(b)));
    const ativos = lista.filter((x) => x.status !== "Baixado");
    $("#iKpi").innerHTML = `<div class="card kpi"><span class="muted">Itens (linhas)</span><b>${ativos.length}</b></div>
      <div class="card kpi"><span class="muted">Unidades</span><b>${ativos.reduce((s, x) => s + Number(x.qtd), 0)}</b></div>
      <div class="card kpi"><span class="muted">Valor do patrimônio</span><b style="color:var(--azul)">${brl(ativos.reduce((s, x) => s + x.qtd * x.valorUnit, 0))}</b></div>
      <div class="card kpi"><span class="muted">Precisam de manutenção</span><b>${ativos.filter((x) => /manuten/i.test(x.estado)).length}</b></div>`;
    $("#iTb").innerHTML = lista.map((x) => `<tr style="${x.status === "Baixado" ? "opacity:.5" : ""}">
      <td>${x.foto ? `<img class="foto" src="${x.foto}">` : `<div class="foto"></div>`}</td>
      <td><b>${esc(x.nome)}</b>${x.patrimonio ? ` <span class="tag neutro">#${esc(x.patrimonio)}</span>` : ""}<div class="muted small">${esc(x.descricao || "")}</div></td>
      <td>${esc(x.categoria)}</td><td>${esc(x.local)}</td><td>${x.qtd}</td><td>${brl(x.valorUnit)}</td><td><b>${brl(x.qtd * x.valorUnit)}</b></td>
      <td class="small">${fmtData(x.dataAquisicao)}${x.fornecedor ? `<br>${esc(x.fornecedor)}` : ""}${x.nf ? `<br>NF ${esc(x.nf)}` : ""}</td>
      <td>${x.status === "Baixado" ? `<span class="tag neutro">Baixado</span>` : `<span class="tag ${/manuten/i.test(x.estado) ? "alerta" : "ok"}">${esc(x.estado)}</span>`}</td>
      <td class="acoes-linha"><button class="btn small" data-ie="${x.id}">Editar</button>${x.status !== "Baixado" ? `<button class="btn small" data-ib="${x.id}">Dar baixa</button>` : ""}${isMaster() ? `<button class="btn small danger" data-ix="${x.id}">Excluir</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="10" class="muted">Nenhum item.</td></tr>`;
  };
  desenhar();
  $("#iB").oninput = (e) => { filtroInv.busca = e.target.value; desenhar(); };
  $("#iL").onchange = (e) => { filtroInv.local = e.target.value; desenhar(); };
  $("#iC").onchange = (e) => { filtroInv.cat = e.target.value; desenhar(); };
  $("#iX").onchange = (e) => { filtroInv.baixados = e.target.checked; desenhar(); };
  $("#iNovo").onclick = () => modalInventario({ local: filtroInv.local });
  v.querySelectorAll("[data-loc]").forEach((c) => (c.onclick = () => { filtroInv.local = c.dataset.loc; render(); }));
  $("#iConf") && ($("#iConf").onclick = () => modalConferirSala(filtroInv.local, todos.filter((x) => x.local === filtroInv.local && x.status !== "Baixado")));
  $("#iCsv").onclick = () => {
    const csv = ["patrimonio;item;descricao;categoria;local;qtd;valor_unit;valor_total;aquisicao;fornecedor;nf;estado;status",
      ...lista.map((x) => [x.patrimonio, x.nome, x.descricao, x.categoria, x.local, x.qtd, String(x.valorUnit).replace(".", ","), String(x.qtd * x.valorUnit).replace(".", ","), fmtData(x.dataAquisicao), x.fornecedor, x.nf, x.estado, x.status || "Ativo"].map((c) => String(c ?? "").replace(/;/g, ",")).join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `inventario_${hoje()}.csv`; a.click();
  };
  $("#iTb").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return; const id = Object.values(b.dataset)[0]; const x = todos.find((y) => y.id === id);
    if (b.dataset.ie) modalInventario(x);
    if (b.dataset.ib) abrirModal(`Dar baixa — ${x.nome}`, `<label>Motivo<select name="motivo">${opts(["Quebrado / sem conserto", "Vendido", "Doado", "Furtado / extraviado", "Descartado", "Outro"])}</select></label><label>Observação<input name="obs"></label>`,
      async (f) => { await updateDoc(doc(db, "inventario", id), { status: "Baixado", baixa: { motivo: f.motivo, obs: f.obs, por: usuario.nome, em: hoje() } }); toast("Item baixado do patrimônio."); }, "Dar baixa");
    if (b.dataset.ix && confirm("Excluir definitivamente?")) { await deleteDoc(doc(db, "inventario", id)); render(); }
  };
}

function modalInventario(x = {}) {
  abrirModal(x.id ? "Editar item do inventário" : "Novo item do inventário", `
    <label>Foto<input type="file" name="foto" accept="image/*" capture="environment"></label>
    <div class="duas"><label>O que é (nome)<input name="nome" required value="${esc(x.nome)}" placeholder="Ex.: Mesa de inox para procedimentos"></label>
    <label>Nº patrimônio (opcional)<input name="patrimonio" value="${esc(x.patrimonio)}"></label></div>
    <label>Descrição / marca / modelo / nº de série<input name="descricao" value="${esc(x.descricao)}"></label>
    <div class="duas"><label>Categoria<select name="categoria">${opts(INV_CATEGORIAS, x.categoria)}</select></label>
    <label>Local<select name="local">${opts(INV_LOCAIS, x.local)}</select></label></div>
    <div class="duas"><label>Quantidade<input type="number" min="1" name="qtd" required value="${x.qtd ?? 1}"></label>
    <label>Valor unitário (R$)<input type="number" step="0.01" min="0" name="valorUnit" required value="${x.valorUnit ?? ""}"></label></div>
    <div class="duas"><label>Data de aquisição<input type="date" name="dataAquisicao" value="${esc(x.dataAquisicao)}"></label>
    <label>Estado<select name="estado">${opts(INV_ESTADO, x.estado)}</select></label></div>
    <div class="duas"><label>Fornecedor<input name="fornecedor" value="${esc(x.fornecedor)}"></label>
    <label>Nº da nota fiscal<input name="nf" value="${esc(x.nf)}"></label></div>`,
  async (f, form) => {
    const d = { nome: f.nome.trim(), patrimonio: f.patrimonio, descricao: f.descricao, categoria: f.categoria, local: f.local, qtd: Number(f.qtd), valorUnit: Number(f.valorUnit), dataAquisicao: f.dataAquisicao, estado: f.estado, fornecedor: f.fornecedor, nf: f.nf };
    const arq = form.foto.files[0]; if (arq) d.foto = await comprimirFoto(arq);
    if (x.id) await updateDoc(doc(db, "inventario", x.id), d);
    else await addDoc(collection(db, "inventario"), { ...d, status: "Ativo", criadoPor: usuario.nome, criadoEm: serverTimestamp() });
    toast("Item salvo no inventário.");
  });
}

// Conferência física de uma sala: cada item foi encontrado? quantos? em que estado?
function modalConferirSala(local, itens) {
  if (!itens.length) return toast("Nenhum item cadastrado nesta sala.");
  abrirModal(`📋 Conferência do inventário — ${local}`, `<p class="muted small">Vá até a sala e confira item por item. Diferenças ficam registradas e o estado é atualizado.</p>
    <table class="tab-contagem"><thead><tr><th></th><th>Item</th><th>Cadastrado</th><th>Encontrado</th><th>Estado</th></tr></thead><tbody>
    ${itens.map((x) => `<tr><td>${x.foto ? `<img class="foto foto-g" src="${x.foto}">` : `<div class="foto foto-g"></div>`}</td><td><b>${esc(x.nome)}</b>${x.patrimonio ? ` <span class="tag neutro">#${esc(x.patrimonio)}</span>` : ""}<div class="muted small">${esc(x.descricao || "")}</div></td>
      <td>${x.qtd}</td><td><input type="number" min="0" name="q_${x.id}" value="${x.qtd}" style="width:70px"></td><td><select name="e_${x.id}">${opts(INV_ESTADO, x.estado)}</select></td></tr>`).join("")}</tbody></table>
    <label>Observação<input name="obs" placeholder="Ex.: cadeira levada para a recepção"></label>`,
  async (f) => {
    const res = itens.map((x) => ({ id: x.id, nome: x.nome, cadastrado: x.qtd, encontrado: Number(f["q_" + x.id]), estadoAntes: x.estado, estado: f["e_" + x.id] }));
    for (const r of res) if (r.estado !== r.estadoAntes) await updateDoc(doc(db, "inventario", r.id), { estado: r.estado });
    const div = res.filter((r) => r.encontrado !== r.cadastrado);
    await addDoc(collection(db, "conferenciasInventario"), { local, data: hoje(), itens: res, divergencias: div.length, obs: f.obs, por: usuario.nome, em: serverTimestamp() });
    toast(div.length ? `Conferência salva: ${div.length} item(ns) com quantidade diferente. Verifique e ajuste no cadastro.` : "Conferência salva. Tudo certo! ✅");
  }, "Salvar conferência");
  $("#modal .modal-card").style.width = "min(760px,100%)";
}

/* ================= IMPORTAR NF-e (XML) ================= */
const UNID = { UN: "Unidade", UND: "Unidade", UNID: "Unidade", CX: "Caixa", PC: "Pacote", PCT: "Pacote", SC: "Saco", FR: "Frasco", FRS: "Frasco", AMP: "Ampola", RL: "Rolo", GL: "Galão", LT: "Litro", L: "Litro", KIT: "Kit" };
function lerNfe(xmlTxt) {
  const x = new DOMParser().parseFromString(xmlTxt, "text/xml");
  const g = (el, tag) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() || "";
  const inf = x.getElementsByTagName("infNFe")[0];
  if (!inf) throw new Error("Este arquivo não parece ser o XML de uma NF-e.");
  const emit = x.getElementsByTagName("emit")[0], ide = x.getElementsByTagName("ide")[0];
  const itens = [...x.getElementsByTagName("det")].map((det, i) => {
    const pr = det.getElementsByTagName("prod")[0];
    const rastro = det.getElementsByTagName("rastro")[0]; // lote e validade (medicamentos)
    return { i, codigo: g(pr, "cProd"), ean: g(pr, "cEAN"), nome: g(pr, "xProd"), unid: g(pr, "uCom").toUpperCase(),
      qtd: Number(g(pr, "qCom")), valorUnit: Number(g(pr, "vUnCom")), valorTotal: Number(g(pr, "vProd")),
      lote: g(rastro, "nLote"), validade: g(rastro, "dVal").slice(0, 10) };
  });
  return { chave: (inf.getAttribute("Id") || "").replace("NFe", ""), numero: g(ide, "nNF"), serie: g(ide, "serie"),
    emissao: (g(ide, "dhEmi") || g(ide, "dEmi")).slice(0, 10), fornecedor: g(emit, "xFant") || g(emit, "xNome"), cnpj: g(emit, "CNPJ"),
    total: Number(g(x.getElementsByTagName("ICMSTot")[0], "vNF")), itens };
}

async function telaNfe(v) {
  if (!podeConfirmar()) return (v.innerHTML = `<p>Somente a estoquista ou o master recebem notas fiscais.</p>`);
  await carregarProdutos();
  v.innerHTML = `<div class="barra"><h2>Importar nota fiscal (XML da NF-e)</h2></div>
  <div class="card" style="margin-bottom:14px">
    <p>Envie o arquivo <b>.xml</b> da NF-e que o fornecedor manda por e-mail. O sistema lê fornecedor, número, itens, quantidades, valores e, quando a nota tem, o <b>lote e a validade</b>.</p>
    <input type="file" id="xmlFile" accept=".xml,text/xml"></div>
  <div id="nfeRes"></div>`;
  $("#xmlFile").onchange = async (e) => {
    const arq = e.target.files[0]; if (!arq) return;
    let nf; try { nf = lerNfe(await arq.text()); } catch (err) { return ($("#nfeRes").innerHTML = `<p class="erro">${esc(err.message)}</p>`); }
    const ja = nf.chave && (await getDoc(doc(db, "notas", nf.chave))).exists();
    const sugerir = (it) => produtos.find((p) => p.codigoFornecedor === it.codigo || (it.ean && p.ean === it.ean) || p.nome.toLowerCase() === it.nome.toLowerCase());
    $("#nfeRes").innerHTML = `
    ${ja ? `<p class="erro">⚠️ Esta nota já foi importada antes. Importar de novo duplica as quantidades.</p>` : ""}
    <div class="card" style="margin-bottom:14px"><b>${esc(nf.fornecedor)}</b> · CNPJ ${esc(nf.cnpj)} · NF ${esc(nf.numero)}/${esc(nf.serie)} · emissão ${fmtData(nf.emissao)} · total <b>${brl(nf.total)}</b></div>
    <div class="barra"><button class="btn primary" id="btnIA">✨ Interpretar quantidades com IA</button><span class="muted small" id="iaMsg">A IA lê descrições como "CX C/100 SERINGA 1ML" e converte para 100 unidades. Confira antes de importar.</span></div>
    <p class="muted small">Escolha o destino de cada item. <b>Estoque</b> = material que é consumido (pede a validade). <b>Inventário</b> = móveis e objetos da clínica.</p>
    <div class="tabela-wrap"><table><thead><tr><th>Item da nota</th><th>Na nota</th><th>× Unid. por embalagem</th><th>Entra no estoque</th><th>Valor</th><th>Destino</th><th>Detalhes</th></tr></thead><tbody>
    ${nf.itens.map((it) => { const s = sugerir(it); return `<tr data-i="${it.i}">
      <td><b>${esc(it.nome)}</b><div class="muted small">Cód. ${esc(it.codigo)} ${it.lote ? "· Lote " + esc(it.lote) : ""}</div></td>
      <td>${it.qtd} ${esc(it.unid)}</td>
      <td><input type="number" min="0" step="any" class="nf" value="${s?.fatorNF?.[it.codigo] || 1}" style="width:70px"></td>
      <td><input type="number" min="0" step="any" class="nq" value="${it.qtd * (s?.fatorNF?.[it.codigo] || 1)}" style="width:80px"> <span class="small nun">${s?.fatorNF?.[it.codigo] > 1 ? "unidades" : esc(it.unid)}</span><div class="small muted nia"></div></td>
      <td class="small">${brl(it.valorUnit)} un.<br><b>${brl(it.valorTotal)}</b></td>
      <td><select class="nd">
        <option value="estoque" ${s ? "selected" : ""}>Estoque – produto existente</option>
        <option value="novo" ${!s ? "selected" : ""}>Estoque – cadastrar novo</option>
        <option value="inventario">Inventário</option><option value="ignorar">Ignorar</option></select></td>
      <td class="det">
        <div class="d-estoque d-novo"><label class="small">Validade<input type="date" class="nv" value="${esc(it.validade)}"></label></div>
        <div class="d-estoque"><select class="np">${produtos.map((p) => `<option value="${p.id}" ${s?.id === p.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select></div>
        <div class="d-novo"><select class="nc">${opts(DISTRIBUIDORAS)}</select></div>
        <div class="d-inventario"><select class="nic">${opts(INV_CATEGORIAS)}</select> <select class="nil">${opts(INV_LOCAIS)}</select></div>
      </td></tr>`; }).join("")}
    </tbody></table></div>
    <div class="acoes"><button class="btn primary" id="nfeOk">Importar nota</button></div>`;
    const atualiza = (tr) => { const d = tr.querySelector(".nd").value; tr.querySelectorAll(".det > div").forEach((el) => el.classList.toggle("hidden", !el.classList.contains("d-" + d))); };
    $("#nfeRes").querySelectorAll("tr[data-i]").forEach((tr) => { atualiza(tr); tr.querySelector(".nd").onchange = () => atualiza(tr);
      tr.querySelector(".nf").oninput = () => { tr.querySelector(".nq").value = nf.itens[tr.dataset.i].qtd * Number(tr.querySelector(".nf").value || 1); }; });
    $("#btnIA").onclick = async () => {
      if (!GEMINI_API_KEY) return toast("Configure a GEMINI_API_KEY no firebase-config.js.");
      $("#btnIA").disabled = true; $("#iaMsg").textContent = "Lendo a nota com IA…";
      try {
        const res = await interpretarComIA(nf.itens);
        res.forEach((r) => { const tr = $("#nfeRes").querySelector(`tr[data-i="${r.i}"]`); if (!tr || !(r.fator > 0)) return;
          tr.querySelector(".nf").value = r.fator; tr.querySelector(".nq").value = nf.itens[r.i].qtd * r.fator;
          tr.querySelector(".nun").textContent = r.unidade || "unidades"; tr.querySelector(".nia").textContent = "✨ " + (r.explicacao || "");
          if (r.nome) tr.dataset.nomeIa = r.nome; });
        $("#iaMsg").textContent = "Pronto! Confira as quantidades em amarelo antes de importar.";
        $("#nfeRes").querySelectorAll(".nq").forEach((i) => (i.style.background = "#fdf3dc"));
      } catch (e) { $("#iaMsg").textContent = "Erro na IA: " + e.message; }
      $("#btnIA").disabled = false;
    };
    $("#nfeOk").onclick = async () => {
      const linhas = [...$("#nfeRes").querySelectorAll("tr[data-i]")].map((tr) => ({ tr, it: nf.itens[tr.dataset.i], dest: tr.querySelector(".nd").value, qtd: Number(tr.querySelector(".nq").value), fator: Number(tr.querySelector(".nf").value || 1), nomeIa: tr.dataset.nomeIa, val: tr.querySelector(".nv").value }));
      const semVal = linhas.find((l) => (l.dest === "estoque" || l.dest === "novo") && l.qtd > 0 && !l.val);
      if (semVal) return toast(`Informe a validade de: ${semVal.it.nome}`);
      if (ja && !confirm("Esta nota já foi importada. Importar de novo mesmo assim?")) return;
      $("#nfeOk").disabled = true; let n = 0;
      try {
        for (const l of linhas) {
          if (l.dest === "ignorar" || l.qtd <= 0) continue;
          const obs = `NF ${nf.numero} - ${nf.fornecedor}${l.it.lote ? " - lote " + l.it.lote : ""}`;
          if (l.dest === "inventario") {
            await addDoc(collection(db, "inventario"), { nome: l.it.nome, descricao: `Cód. ${l.it.codigo}`, categoria: l.tr.querySelector(".nic").value, local: l.tr.querySelector(".nil").value,
              qtd: l.qtd, valorUnit: l.it.valorUnit, dataAquisicao: nf.emissao, estado: "Novo", fornecedor: nf.fornecedor, nf: nf.numero, patrimonio: "", status: "Ativo", criadoPor: usuario.nome, criadoEm: serverTimestamp() });
          } else {
            let pid, pnome;
            if (l.dest === "novo") {
              const ref = await addDoc(collection(db, "produtos"), { nome: l.nomeIa || l.it.nome, fatorNF: { [l.it.codigo]: l.fator }, categoria: l.tr.querySelector(".nc").value, medida: l.fator > 1 ? "Unidade" : UNID[l.it.unid] || "Unidade", marca: "", tipo: "estoque",
                ideal: 0, minimo: 0, lotesEstoque: [], lotesLimbo: [], codigoFornecedor: l.it.codigo, ean: l.it.ean === "SEM GTIN" ? "" : l.it.ean, criadoEm: serverTimestamp() });
              pid = ref.id; pnome = l.nomeIa || l.it.nome;
            } else { pid = l.tr.querySelector(".np").value; pnome = produtos.find((p) => p.id === pid).nome; await updateDoc(doc(db, "produtos", pid), { codigoFornecedor: l.it.codigo, [`fatorNF.${l.it.codigo}`]: l.fator }); }
            await runTransaction(db, async (t) => { const ref = doc(db, "produtos", pid); const d = (await t.get(ref)).data(); t.update(ref, { lotesEstoque: addLote(d.lotesEstoque, l.qtd, l.val) }); });
            await log({ tipo: "entrada", produtoId: pid, produtoNome: pnome, qtd: l.qtd, validade: l.val, local: "estoque", obs, valorUnit: l.it.valorUnit });
          }
          n++;
        }
        if (nf.chave) await setDoc(doc(db, "notas", nf.chave), { numero: nf.numero, fornecedor: nf.fornecedor, cnpj: nf.cnpj, emissao: nf.emissao, total: nf.total, itens: n, importadoPor: usuario.nome, importadoEm: serverTimestamp() });
        toast(`Nota importada: ${n} item(ns).`); $("#nfeRes").innerHTML = `<p>✅ Nota ${esc(nf.numero)} importada (${n} itens). Produtos novos entram com ideal e mínimo zerados: ajuste no Estoque.</p>`;
      } catch (err) { toast("Erro: " + err.message); $("#nfeOk").disabled = false; }
    };
  };
}

/* ================= ALERTAS (quantidade, validade, sem uso) ================= */
async function calcAlertas() {
  await carregarProdutos();
  const lim = addDias(DIAS_ALERTA_VALIDADE), corte = Timestamp.fromDate(new Date(Date.now() - DIAS_SEM_USO * 864e5));
  const movs = (await getDocs(query(collection(db, "movimentos"), where("data", ">=", corte)))).docs.map((d) => d.data());
  const usadoEstoque = new Set(movs.filter((m) => m.tipo === "reposicao" || m.tipo === "consumo").map((m) => m.produtoId));
  const usadoSala = new Set(movs.filter((m) => m.tipo === "consumo").map((m) => m.local + "|" + m.produtoId));
  const antigo = (ts) => !ts?.toDate || ts.toDate() < corte.toDate();
  const A = [];
  const add = (local, nome, tipo, nivel, detalhe) => A.push({ local, nome, tipo, nivel, detalhe });
  for (const p of produtos) {
    const t = total(p.lotesEstoque), v = proxValidade(p.lotesEstoque);
    if (v && vencido(v)) add("Estoque central", p.nome, "Validade", "critico", `Lote vencido (validade ${fmtData(v)}, usar até ${fmtData(fimMes(v))}) — mover ao limbo`);
    else if (v && v <= lim) add("Estoque central", p.nome, "Validade", "alerta", `Vence em ${fmtData(v)}`);
    if (!p.naoComprar && t <= Number(p.minimo || 0)) add("Estoque central", p.nome, "Quantidade", "critico", `${t} em estoque (mínimo ${p.minimo})`);
    if (t > 0 && !usadoEstoque.has(p.id) && antigo(p.criadoEm)) add("Estoque central", p.nome, "Sem uso", "alerta", `Nenhuma saída há mais de ${DIAS_SEM_USO} dias (${t} parados)`);
  }
  for (const s of SALAS) {
    (await getDocs(collection(db, "salas", s.id, "itens"))).forEach((d) => {
      const it = d.data(), t = total(it.lotes), v = proxValidade(it.lotes);
      if (v && vencido(v)) add(s.nome, it.nome, "Validade", "critico", `Vencido (${fmtData(v)}) — trocar`);
      else if (v && v <= lim) add(s.nome, it.nome, "Validade", "alerta", `Vence em ${fmtData(v)}`);
      if (t <= Number(it.critico || 0) && (it.ideal || it.critico)) add(s.nome, it.nome, "Quantidade", "critico", `${t} na sala (crítico ${it.critico}) — repor`);
      const ult = it.ultimaReposicao?.em;
      if (t > 0 && !usadoSala.has(s.id + "|" + d.id) && (!ult || ult < addDias(-DIAS_SEM_USO))) add(s.nome, it.nome, "Sem uso", "alerta", `Sem consumo há mais de ${DIAS_SEM_USO} dias`);
    });
  }
  return A;
}

let filtroAl = { local: "", tipo: "" };
async function telaAlertas(v) {
  const A = await calcAlertas();
  const locais = ["Estoque central", ...SALAS.map((s) => s.nome)];
  v.innerHTML = `<div class="barra"><h2>Alertas</h2>
    <select id="aL"><option value="">Estoque + todas as salas</option>${opts(locais, filtroAl.local)}</select>
    <select id="aT"><option value="">Todos os tipos</option>${opts(["Quantidade", "Validade", "Sem uso"], filtroAl.tipo)}</select></div>
  <div class="grid">${["Quantidade", "Validade", "Sem uso"].map((t) => `<div class="card kpi"><span class="muted">${t === "Sem uso" ? `Sem uso há +${DIAS_SEM_USO} dias` : "Por " + t.toLowerCase()}</span><b>${A.filter((a) => a.tipo === t).length}</b></div>`).join("")}</div>
  <div class="tabela-wrap"><table><thead><tr><th>Local</th><th>Produto</th><th>Tipo</th><th>Detalhe</th></tr></thead><tbody id="aTb"></tbody></table></div>`;
  const d = () => { $("#aTb").innerHTML = A.filter((a) => (!filtroAl.local || a.local === filtroAl.local) && (!filtroAl.tipo || a.tipo === filtroAl.tipo))
    .sort((a, b) => (a.nivel === "critico" ? 0 : 1) - (b.nivel === "critico" ? 0 : 1))
    .map((a) => `<tr><td>${esc(a.local)}</td><td><b>${esc(a.nome)}</b></td><td><span class="tag ${a.nivel}">${a.tipo}</span></td><td>${esc(a.detalhe)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nenhum alerta. 👍</td></tr>`; };
  d(); $("#aL").onchange = (e) => { filtroAl.local = e.target.value; d(); }; $("#aT").onchange = (e) => { filtroAl.tipo = e.target.value; d(); };
}

/* ================= INÍCIO (5 PAINÉIS) ================= */
async function telaPainel(v) {
  const vis = SETORES.filter((x) => (!x.master || isMaster()) && (!x.entrevista || podeEntrevista()) && (!x.gestao || podeGerente()));
  const tile = (x) => `<a class="tile" href="#${x.abas[0][0]}"><span class="tile-ico">${x.icone}</span><b>${x.n ? x.n + " · " : ""}${esc(x.titulo)}</b><span class="tile-info" id="info-${x.id}"></span></a>`;
  v.innerHTML = `<h2 class="ola">Olá, ${esc(usuario.nome)} 👋</h2>
    ${MODULOS.map((m) => { const itens = vis.filter((x) => x.mod === m.id); return itens.length ? `<section class="modulo"><h3 class="modulo-tit"><span>${m.icone}</span> ${esc(m.titulo)} <small>${esc(m.sub)}</small></h3><div class="tiles">${itens.map(tile).join("")}</div></section>` : ""; }).join("")}`;
  // números de apoio nos quadrados (carregam depois, sem travar a tela)
  try {
    const [exs, sols, pend] = await Promise.all([getDocs(collection(db, "exames")), getDocs(query(collection(db, "solicitacoes"), where("status", "==", "Pendente"))), podeConfirmar() ? getDocs(query(collection(db, "pendencias"), where("status", "==", "Pendente"))) : null]);
    const itens = exs.docs.flatMap((d) => (d.data().exames || []).map(normEx));
    const set = (id, t) => { const el = document.getElementById("info-" + id); if (el) el.innerHTML = t; };
    set("laudos", `${itens.filter(precisaLaudo).length} laudo(s) pendente(s)`);
    set("solic", `${exs.size} requisição(ões)`);
    set("compras", sols.size ? `<span class="tag critico">${sols.size} pendente(s)</span>` : "");
    if (pend?.size) set("estoque", `<span class="tag critico">${pend.size} para confirmar</span>`);
  } catch (e) { console.warn(e); }
}

/* ================= EXAMES ================= */
const GRUPO_IMAGEM = "Imagem";
const agoraLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
// Precisa de laudo feito na clínica: imagem/prestador ou exame do LAB VETPLUS, ainda não liberado
const precisaLaudo = (e) => e.laudo !== "SIM" && (e.laudoPendente || isPrest(e) || /vetplus/i.test(e.laboratorio || ""));
const isPrest = (o) => ["Imagem", "Prestador"].includes(o?.grupo);
const origemDe = (e, x = {}) => e.origem || ((e.pagamento || x.pagamento) === "Convênio" ? String(e.convenio || x.convenio || "").toUpperCase() : "PARTICULAR");
const grupoDe = (nome) => Object.entries(EXAMES).find(([, l]) => l.includes(nome))?.[0] || "Outros";
const normEx = (e) => (typeof e === "string" ? { nome: e, grupo: grupoDe(e) } : e);
const descEx = (e) => { e = normEx(e); const pg = e.pagamento ? ` [${e.pagamento === "Convênio" ? e.convenio : "Particular"}]` : ""; return (isPrest(e) ? `${e.nome}${e.regiao ? " (" + e.regiao + ")" : ""}${e.realizadoPor ? " — realizou: " + e.realizadoPor : ""}${e.laudoPor ? " · laudo: " + e.laudoPor : ""}` : `${e.nome}${e.laboratorio ? " — " + e.laboratorio : ""}`) + pg; };
async function carregarProfissionais() { return (await getDocs(query(collection(db, "profissionais"), orderBy("nome")))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.ativo !== false); }

let filtroEx = { status: "abertos", busca: "", pag: "", dest: "" };
const destinoEx = (e) => (isPrest(e) ? "Imagem · " + (e.realizadoPor || "sem profissional") : "Lab · " + (e.laboratorio || "sem laboratório"));
async function telaExames(v) {
  const todos = (await getDocs(query(collection(db, "exames"), orderBy("criadoEm", "desc")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  v.innerHTML = `<div class="barra"><h2>Requisições realizadas</h2><a class="btn" href="#nova-solicitacao">+ Nova requisição</a>
    <input id="bEx" placeholder="Buscar paciente, tutor, profissional, laboratório…" value="${esc(filtroEx.busca)}">
    <select id="fEx"><option value="abertos">Em aberto</option><option value="todos">Todos</option>${opts(STATUS_EXAME)}</select>
    <select id="pEx"><option value="">Particular + convênios</option><option>Particular</option>${opts(CONVENIOS)}</select>
    <select id="dEx"><option value="">Todos os laboratórios e profissionais</option>${[...new Set(todos.flatMap((x) => (x.exames || []).map(normEx).map(destinoEx)))].sort().map((d) => `<option>${esc(d)}</option>`).join("")}</select>
    <button class="btn primary" id="novoEx">+ Nova requisição</button></div>
  <div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Paciente</th><th>Tutor</th><th>Exames · executor / laboratório</th><th>Pagamento</th><th>Solicitante</th><th>Status</th><th></th></tr></thead><tbody id="tbEx"></tbody></table></div>`;
  $("#fEx").value = filtroEx.status; $("#pEx").value = filtroEx.pag; $("#dEx").value = filtroEx.dest;
  const desenhar = () => {
    const b = filtroEx.busca.toLowerCase(), st = filtroEx.status;
    const lista = todos.filter((x) => (!b || `${x.paciente} ${x.tutor} ${x.exames.map(descEx).join(" ")}`.toLowerCase().includes(b)) &&
      (st === "todos" || (st === "abertos" ? !["Entregue ao tutor", "Cancelado"].includes(x.status) : x.status === st)) &&
      (!filtroEx.dest || (x.exames || []).map(normEx).some((e) => destinoEx(e) === filtroEx.dest)) &&
      (!filtroEx.pag || (filtroEx.pag === "Particular" ? x.pagamento !== "Convênio" : x.convenio === filtroEx.pag)));
    $("#tbEx").innerHTML = lista.map((x) => `<tr>
      <td class="small">${fmtTs(x.criadoEm)}</td>
      <td><b>${esc(x.paciente)}</b><div class="muted small">${esc([x.especie, x.raca, x.idade, x.peso && x.peso + " kg"].filter(Boolean).join(" · "))}</div></td>
      <td>${esc(x.tutor)}<div class="muted small">${esc(x.telefone || "")}</div></td>
      <td class="small">${x.exames.map((e) => `<div>${esc(descEx(e))}</div>`).join("")}<div class="muted">${[...new Set(x.exames.map(normEx).map(destinoEx))].map(esc).join(" | ")}</div></td>
      <td>${x.pagamento === "Convênio" ? `<span class="tag alerta">${esc(x.convenio)}</span>` : `<span class="tag neutro">Particular</span>`}${x.prioridade === "Urgente" ? ` <span class="tag critico">Urgente</span>` : ""}</td>
      <td>${esc(x.veterinario)}</td>
      <td><span class="tag ${corStatus(x.status)}">${x.status}</span>${x.edicoes?.length ? `<div class="small" style="color:#8a5a00" title="${esc(x.edicoes.map((ed) => ed.por + " em " + new Date(ed.em).toLocaleString("pt-BR")).join("\n"))}">✏️ editado por ${esc(x.edicoes.at(-1).por)}<br>${new Date(x.edicoes.at(-1).em).toLocaleString("pt-BR").slice(0, 17)}</div>` : ""}</td>
      <td class="acoes-linha"><button class="btn small" data-st="${x.id}">Status</button><button class="btn small" data-pr="${x.id}">Imprimir / PDF</button>
        <button class="btn small" data-ed="${x.id}">Editar</button>${isMaster() ? `<button class="btn small danger" data-dx="${x.id}">Excluir</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Nenhuma solicitação.</td></tr>`;
  };
  desenhar();
  $("#bEx").oninput = (e) => { filtroEx.busca = e.target.value; desenhar(); };
  $("#fEx").onchange = (e) => { filtroEx.status = e.target.value; desenhar(); };
  $("#pEx").onchange = (e) => { filtroEx.pag = e.target.value; desenhar(); };
  $("#dEx").onchange = (e) => { filtroEx.dest = e.target.value; desenhar(); };
  const profs = await carregarProfissionais();
  $("#novoEx").onclick = () => modalExame({}, profs);
  $("#tbEx").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return; const id = Object.values(b.dataset)[0]; const x = todos.find((y) => y.id === id);
    if (b.dataset.st) modalStatusExame(x);
    if (b.dataset.pr) imprimirExame(x);
    if (b.dataset.ed) modalExame(x, profs);
    if (b.dataset.dx && confirm("Excluir requisição de exames?")) { await deleteDoc(doc(db, "exames", id)); render(); }
  };
}

let catalogoCache = null;
async function carregarCatalogo(forcar) { if (!catalogoCache || forcar) catalogoCache = (await getDocs(query(collection(db, "catalogoExames"), orderBy("nome")))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.ativo !== false); return catalogoCache; }
const ehPA = (e) => /press[aã]o arterial/i.test(e.nome || "");
const paPelaClinica = (e, profs) => ehPA(e) && (/vet ?plus/i.test(e.realizadoPor || "") || profs.some((p) => p.nome === e.realizadoPor && p.tipo !== "Volante / prestador"));
const valorLinha = (e) => (e.pagamento === "Convênio" || !e.valor ? null : Number(e.valor)); // plano de saúde: nunca mostra preço

async function modalExame(x = {}, profs = [], cfg = {}) {
  const cat = await carregarCatalogo();
  if (!cat.length) { toast("Cadastre o catálogo de exames primeiro (aba Catálogo de exames)."); location.hash = "#catalogo"; return; }
  let itens = (x.exames || []).map(normEx).map((e) => ({ ...e }));
  const imgBase = new Map(); [...EXAMES_IMAGEM, ...cat.filter(isPrest).map((c) => c.nome)].forEach((n) => { if (!imgBase.has(norm(n))) imgBase.set(norm(n), n); });
  const porExame = new Map(); IMAGEM_TABELA.forEach((t) => { const k = norm(t.exame); if (!porExame.has(k)) porExame.set(k, { nome: t.exame, profs: [] }); porExame.get(k).profs.push({ p: t.profissional, valor: t.valor }); });
  const listaImg = [...porExame.values()].sort((p, q) => p.nome.localeCompare(q.nome, "pt")).map((g) => ({ id: "img|" + g.nome, catId: slugId(g.nome, "imagem"), nome: g.nome, grupo: "Imagem", realizadoPor: "", tipo: "", profs: g.profs }))
    .concat([...imgBase.values()].filter((n) => !porExame.has(norm(n))).map((n) => { const c0 = cat.find((c) => isPrest(c) && norm(c.nome) === norm(n)) || {}; return { ...c0, id: "img|" + n, catId: c0.id || slugId(n, "imagem"), nome: n, grupo: "Imagem", realizadoPor: "", tipo: "", profs: [] }; }));
  const listaVP = LAB_VETPLUS.map((t) => ({ id: "vp|" + t.codigo, catId: slugId(t.nome, "vetplus"), nome: t.nome, laboratorio: "VETPLUS", categoria: t.categoria, tipo: "individual", grupo: "Laboratorial", valor: t.valor, tubos: null, analitos: 0, prazo: "feito na clínica", composicao: [] }));
  const lista = [...cat.filter((c) => !isPrest(c)), ...listaVP, ...listaImg];
  let modoAdd = null, pend = null, tipoReq = "Laboratorial";
  const pag0 = itens[0] ? { pagamento: itens[0].pagamento, convenio: itens[0].convenio } : { pagamento: "Particular", convenio: "" };
  const nomesProf = [...new Set([...EXECUTORES_IMAGEM, ...IMAGEM_TABELA.map((t) => t.profissional), ...profs.map((p) => p.nome)])], vetIni = x.veterinario || meuProfissional(profs)?.nome || "";
  abrirModal(x.id ? "Editar requisição de exames" : "Nova requisição de exames", `
    <h3 style="margin:4px 0">1. Dados do paciente</h3>
    <label>Prioridade<select name="prioridade">${opts(["Rotina", "Urgente"], x.prioridade)}</select></label>
    <div class="duas"><label>Nome e sobrenome do pet<input name="paciente" required value="${esc(x.paciente)}"></label>
    <label>Nome e sobrenome do tutor<input name="tutor" required value="${esc(x.tutor)}"></label></div>
    <div class="duas"><label>Espécie<input name="especie" list="dlEsp" value="${esc(x.especie)}" placeholder="Canina, Felina…"></label><label>Raça<input name="raca" value="${esc(x.raca)}"></label></div>
    <datalist id="dlEsp"><option>Canina</option><option>Felina</option><option>Silvestre</option></datalist>
    <div class="duas"><label>Sexo<input name="sexo" list="dlSexo" value="${esc(x.sexo)}"></label><label>Peso (kg)<input name="peso" value="${esc(x.peso)}"></label></div>
    <datalist id="dlSexo"><option>Macho</option><option>Fêmea</option><option>Macho castrado</option><option>Fêmea castrada</option></datalist>
    <div class="duas"><label>Idade do pet<input name="idade" value="${esc(x.idade)}"></label><label>Telefone do tutor<input name="telefone" value="${esc(x.telefone)}"></label></div>
    <div class="duas"><label>Médico(a) veterinário(a) solicitante<input name="veterinario" value="${esc(x.veterinario)}" placeholder="digite o nome"></label><label>CRMV<input name="crmv" value="${esc(x.crmv)}" placeholder="digite o CRMV"></label></div>
    <label>📅 Data e hora da coleta<input type="datetime-local" name="dataColeta" id="dtColeta" required value="${esc(x.dataColeta || agoraLocal())}"></label>
    <h3 style="margin:12px 0 4px">2. Exames da requisição</h3>
    <div class="barra"><b>O que você vai pedir?</b><button type="button" class="btn primary" id="mLab">🧪 Exame laboratorial</button><button type="button" class="btn primary" id="mImg">🩻 Exame de imagem</button></div>
    <div id="boxAdd" class="hidden">
    <label id="lblBusca">Buscar na lista (ex.: <i>albumina</i>, <i>colesterol veter</i>)<input id="addCat" autocomplete="off" placeholder="Digite para filtrar — a lista completa fica logo abaixo"></label>
    <div id="resCat" class="res-cat" style="max-height:300px"></div></div>
    <div id="pendBox" class="card hidden" style="padding:10px;border:2px solid #2f6fd0"></div>
    <div id="itensEx"></div><div id="rodapeEx"></div>
    <label>Suspeita clínica / observações<textarea name="obs" rows="2">${esc(x.obs)}</textarea></label>`,
  async (f) => {
    lerItens();
    if (!itens.length) throw new Error("Adicione pelo menos um exame.");
    if (itens.some((e) => !e.realizadoEm)) throw new Error("Informe a data e hora de realização de cada exame.");
    if (itens.some((e) => isPrest(e) && !e.realizadoPor)) throw new Error("Escolha o profissional que vai realizar cada exame de imagem.");
    itens.forEach((e) => { e.origem = e.pagamento === "Convênio" ? String(e.convenio).toUpperCase() : "PARTICULAR";
      if (/vetplus/i.test(e.laboratorio || "") && e.laudo !== "SIM") e.laudoPendente = true; }); // VETPLUS = laudo feito aqui: vai para "Liberar laudos"
    const tipoDe = (g) => (g.every(isPrest) ? "Imagem" : g.some(isPrest) ? "Mista" : "Laboratorial"), grupos = [itens]; // uma REQUISIÇÃO DE EXAMES leva vários exames, de vários laboratórios/profissionais, cada um com seu pagamento
    const base = { paciente: f.paciente.trim(), especie: f.especie, raca: f.raca, idade: f.idade, peso: f.peso, sexo: f.sexo, tutor: f.tutor.trim(), telefone: f.telefone,
      veterinario: f.veterinario.trim(), crmv: (f.crmv || "").trim(), prioridade: f.prioridade, obs: f.obs, dataColeta: f.dataColeta };
    const origTipo = null;
    let iOrig = grupos.findIndex((g) => tipoDe(g) === origTipo); if (iOrig < 0) iOrig = 0;
    for (const [i, g] of grupos.entries()) {
      const d = JSON.parse(JSON.stringify({ ...base, tipoReq: tipoDe(g), exames: g, pagamento: g.some((e) => e.pagamento === "Convênio") ? "Convênio" : "Particular", convenio: [...new Set(g.map((e) => e.convenio).filter(Boolean))].join(", ") })); // JSON: tira campos "undefined", que o Firestore recusa
      if (x.id && i === iOrig) await updateDoc(doc(db, "exames", x.id), { ...d, editado: true, edicoes: [...(x.edicoes || []), { por: usuario.nome, em: new Date().toISOString() }] });
      else await addDoc(collection(db, "exames"), { ...d, status: "Solicitado", historico: [{ status: "Solicitado", por: usuario.nome, em: new Date().toISOString() }], criadoPor: usuario.nome, criadoUid: usuario.uid, criadoEm: serverTimestamp() });
    }
    toast("Requisição de exames salva. " + (itens.some((e) => e.laudoPendente || isPrest(e)) ? "Exames de imagem e do LAB VETPLUS foram para Laudos → Liberar laudos. " : "") + "Ela já está no histórico.");
    cfg.aposSalvar?.();
  });
  $("#dtColeta").onchange = (ev) => { lerItens(); itens.forEach((e) => (e.realizadoEm = ev.target.value)); desenhar(); };
  const setModo = (m) => { modoAdd = m; pend = null; $("#pendBox").classList.add("hidden"); $("#boxAdd").classList.remove("hidden"); $("#mLab").classList.toggle("primary", m === "Laboratorial"); $("#mImg").classList.toggle("primary", m === "Imagem"); $("#addCat").value = ""; buscar(); $("#addCat").focus(); };
  $("#mLab").onclick = () => setModo("Laboratorial"); $("#mImg").onclick = () => setModo("Imagem");
  function lerItens() {
    $("#itensEx").querySelectorAll("[data-k]").forEach((r) => { const e = itens[r.dataset.k]; if (!e) return;
      e.realizadoEm = r.querySelector(".ih").value; e.pagamento = r.querySelector(".ip").value; e.convenio = e.pagamento === "Convênio" ? r.querySelector(".ic").value : "";
      if (isPrest(e)) { e.realizadoPor = r.querySelector(".ir").value; e.laudoPor = r.querySelector(".il").value; e.regiao = r.querySelector(".id").value; } else { const sl = r.querySelector(".ilab"); if (sl) e.laboratorio = sl.value; } });
    $("#itensEx").querySelectorAll("[data-pa]").forEach((r) => { const e = itens[r.dataset.pa]; if (e) e.pa = [...r.querySelectorAll("input")].map((i) => i.value); });
  }
  function desenhar() {
    const labsSel = [...new Set([...LABORATORIOS, ...cat.map((c) => c.laboratorio).filter(Boolean)])].sort();
    const dest = (e) => isPrest(e) ? `Descrição <input class="id" value="${esc(e.regiao || "")}" placeholder="ex.: crânio e tórax (como o médico pediu)"><br>Realizado por <select class="ir"><option value="">— escolha —</option>${[...new Set([...nomesProf, e.realizadoPor].filter(Boolean))].map((n) => `<option ${n === e.realizadoPor ? "selected" : ""}>${esc(n)}</option>`).join("")}</select><br>Laudo <select class="il">${`<option value="">—</option>` + profs.map((p) => `<option ${p.nome === e.laudoPor ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select>` : `<select class="ilab">${labsSel.map((l) => `<option ${l === e.laboratorio ? "selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
    $("#itensEx").innerHTML = itens.length ? `<datalist id="dlProf">${nomesProf.map((n) => `<option value="${esc(n)}">`).join("")}</datalist><table><thead><tr><th>Exame</th><th>Laboratório / realizado por</th><th>Pagamento</th><th>Valor</th><th>Realização</th><th></th></tr></thead><tbody>${itens.map((e, k) => `<tr data-k="${k}">
      <td><b>${esc(e.nome)}</b>${e.composicao?.length ? `<div class="muted small">Inclui: ${e.composicao.map(esc).join(", ")}</div>` : ""}<div class="small muted">⏱ Liberação: ${esc(prazoDe(e, isPrest(e)))}</div></td>
      <td class="small">${dest(e)}</td>
      <td><select class="ip">${opts(["Particular", "Convênio"], e.pagamento || "Particular")}</select> <select class="ic ${e.pagamento === "Convênio" ? "" : "hidden"}">${opts(CONVENIOS, e.convenio)}</select></td>
      <td>${valorLinha(e) != null ? brl(valorLinha(e)) : e.pagamento === "Convênio" ? `<span class="muted small">plano</span>` : "—"}</td>
      <td><input type="datetime-local" class="ih" value="${esc(e.realizadoEm || "")}" required></td>
      <td><button type="button" class="btn small danger" data-rmk="${k}">✕</button></td></tr>
      ${ehPA(e) ? `<tr data-pa="${k}"><td colspan="6"><b>Aferições de pressão arterial sistólica (mmHg)</b> <span class="muted small">até 5 valores — vão para o laudo</span><div class="duas5">${[0, 1, 2, 3, 4].map((j) => `<input type="number" min="0" placeholder="${j + 1}ª" value="${esc((e.pa || [])[j] ?? "")}">`).join("")}</div></td></tr>` : ""}`).join("")}</tbody></table>` : `<p class="muted small">Nenhum exame adicionado.</p>`;
    $("#itensEx").querySelectorAll(".ip").forEach((s) => (s.onchange = () => { lerItens(); desenhar(); }));
    $("#itensEx").querySelectorAll(".ilab").forEach((s) => (s.onchange = () => { lerItens(); desenhar(); }));
    $("#itensEx").querySelectorAll("[data-rmk]").forEach((b) => (b.onclick = () => { lerItens(); itens.splice(b.dataset.rmk, 1); desenhar(); }));
    rodape();
  }
  function rodape() {
    const part = itens.filter((e) => valorLinha(e) != null), soma = part.reduce((s, e) => s + valorLinha(e), 0), tb = tubosPorLab(itens);
    $("#rodapeEx").innerHTML = (part.length ? `<p style="text-align:right"><b>Total particular: ${brl(soma)}</b> <span class="muted small">(exames por plano não entram)</span></p>` : "") +
      (tb.labs.length ? `<div class="card tubos"><b>🧪 Tubos por laboratório</b> <span class="muted small">(laboratórios diferentes não dividem tubo)</span>${tb.labs.map((l) => `<div><span class="tag neutro">${esc(l.lab)}</span> ${esc(l.comentario || "sem tubo definido")}</div>`).join("")}
        <div style="margin-top:6px"><b>Total:</b> ${Object.entries(tb.total).filter(([, n]) => n).map(([c, n]) => `<span class="tubo-bol" style="background:${COR_TUBO[c][1]}"></span> ${n} ${COR_TUBO[c][0]}`).join(" &nbsp; ") || "—"}</div></div>` : "");
  }
  function buscar() {
    const q = norm($("#addCat").value).split(/\s+/).filter(Boolean), nl = (c) => norm(`${c.nome} ${c.laboratorio || ""} ${c.categoria || ""} ${(c.profs || []).map((p) => p.p).join(" ")}`);
    const r = lista.filter((c) => modoAdd && isPrest(c) === (modoAdd === "Imagem") && (() => { const t = nl(c); return q.every((w) => t.includes(w)); })());
    $("#resCat").innerHTML = r.map((c) => `<button type="button" class="res-item" data-id="${esc(c.id)}"><b>${esc(c.nome)}</b> <span class="tag neutro">${esc(isPrest(c) ? "Imagem" : c.laboratorio)}</span> <span class="muted small">${c.profs?.length ? esc(c.profs.map((p) => p.p).join(", ")) + " · " : ""}${esc(c.tipo && c.tipo !== "individual" ? c.tipo + " · " : "")}${c.profs?.length ? "" : "⏱ " + esc(prazoDe(c, isPrest(c)))}</span>${c.valor ? `<span style="float:right">${brl(c.valor)}</span>` : ""}</button>`).join("") || `<p class="muted small">Nada encontrado na lista.</p>`;
  }
  $("#addCat").oninput = buscar;
  $("#resCat").onclick = (e) => {
    const b = e.target.closest("[data-id]"); if (!b) return; const c = lista.find((c) => c.id === b.dataset.id); if (!c) return;
    pend = c; const bx = $("#pendBox"); bx.classList.remove("hidden");
    const ehPerfil = !isPrest(c) && ["perfil", "painel"].includes(c.tipo) && (c.composicao || []).length;
    bx.innerHTML = `<b>${esc(c.nome)}</b> <span class="tag neutro">${esc(isPrest(c) ? "Imagem" : c.laboratorio)}</span>
      ${isPrest(c) ? `<label>Profissional que realiza<select id="pgProf"></select></label>` : ""}
      <div class="duas"><label>Este exame é<select id="pgTipo"><option>Particular</option><option value="Plano">Plano de saúde</option></select></label>
      <label id="pgPlanoBox" class="hidden">Qual plano<select id="pgPlano">${opts(CONVENIOS, "")}</select></label></div>
      <p id="pgAviso" class="small hidden" style="color:#b25e00">Plano de saúde geralmente não aceita perfil: este perfil será lançado <b>exame por exame</b> (${(c.composicao || []).length} exames).</p>
      <div class="barra"><button type="button" class="btn primary" id="pgOk">Adicionar à requisição</button><button type="button" class="btn" id="pgNao">Cancelar</button></div>`;
    const profSel = () => { if (!isPrest(c)) return; const pl = $("#pgTipo").value === "Plano", cur = $("#pgProf").value;
      $("#pgProf").innerHTML = `<option value="">— escolha —</option>` + (c.profs?.length ? c.profs : nomesProf.map((p) => ({ p }))).map((x) => `<option value="${esc(x.p)}" ${x.p === cur ? "selected" : ""}>${esc(x.p)}${x.valor && !pl ? " — " + brl(x.valor) : ""}</option>`).join(""); };
    const mudou = () => { const pl = $("#pgTipo").value === "Plano"; $("#pgPlanoBox").classList.toggle("hidden", !pl); $("#pgAviso").classList.toggle("hidden", !(pl && ehPerfil)); profSel(); };
    $("#pgTipo").onchange = mudou; mudou();
    $("#pgNao").onclick = () => { pend = null; bx.classList.add("hidden"); };
    $("#pgOk").onclick = () => { const pl = $("#pgTipo").value === "Plano", pg = { pagamento: pl ? "Convênio" : "Particular", convenio: pl ? $("#pgPlano").value : "" }, quando = $("#dtColeta").value || agoraLocal();
      const prof = isPrest(c) ? $("#pgProf").value : ""; if (isPrest(c) && !prof) return toast("Escolha o profissional que realiza o exame.");
      const base = (k, extra = {}) => ({ realizadoEm: quando, catId: k.catId || k.id, nome: k.nome, grupo: k.grupo, realizadoPor: prof, laboratorio: isPrest(k) ? "" : k.laboratorio, pontos: Number(k.pontos || 1), ...pg, valor: k.valor || 0, tubos: k.tubos || null, analitos: k.analitos || 0, prazo: k.prazo || "", composicao: k.composicao || [], coleta: isPrest(k) ? null : { status: "Aguardando" }, ...extra });
      lerItens(); let faltou = [];
      if (pl && ehPerfil) { // plano: um por um (individuais, do mesmo laboratório quando existir)
        const indiv = cat.filter((k) => !isPrest(k) && k.tipo === "individual");
        c.composicao.forEach((nm) => { const ch = chave(nm), ok = indiv.filter((k) => chave(k.nome) === ch); const k = ok.find((z) => z.laboratorio === c.laboratorio) || [...ok].sort((p, q) => p.valor - q.valor)[0];
          if (k) itens.push(base(k, { obsPerfil: c.nome })); else faltou.push(nm); });
      } else { const v = c.profs?.find((x) => x.p === prof)?.valor; itens.push(base(c, v ? { valor: v } : {})); }
      if (pl && LABS_PLANO?.length) itens.forEach((e) => { if (e.pagamento === "Convênio" && !isPrest(e) && !LABS_PLANO.includes(e.laboratorio)) e.laboratorio = LABS_PLANO[0]; });
      pend = null; bx.classList.add("hidden"); $("#addCat").value = ""; buscar(); desenhar();
      toast(faltou.length ? `Incluído. Sem exame avulso para: ${faltou.join(", ")} — inclua à mão.` : "Exame incluído. Pode escolher o próximo."); };
  };
  desenhar();
}

function modalStatusExame(x) {
  abrirModal(`Status — ${x.paciente}`, `
    <label>Novo status<select name="status">${opts(STATUS_EXAME, x.status)}</select></label>
    <label>Link do resultado / observação<input name="nota"></label>
    <div class="lotes">${(x.historico || []).map((h) => `${new Date(h.em).toLocaleString("pt-BR")} — <b>${esc(h.status)}</b> por ${esc(h.por)}${h.nota ? ": " + esc(h.nota) : ""}`).join("<br>")}</div>`,
  async (f) => { await updateDoc(doc(db, "exames", x.id), { status: f.status, historico: [...(x.historico || []), { status: f.status, nota: f.nota, por: usuario.nome, em: new Date().toISOString() }] }); toast("Status atualizado."); });
}

function imprimirExame(x) {
  abrirModal("Imprimir requisição", `<label>Formato<select name="fmt"><option value="a4">Folha A4</option><option value="80">Bobina 80 mm</option><option value="58">Bobina 58 mm</option></select></label>
    <label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="ass" checked> Incluir assinatura digital do solicitante (se cadastrada)</label>`,
  async (f) => { const profs = await carregarProfissionais(); docImpressao(htmlSolicitacao(x, f.fmt !== "a4", f.ass ? profs.find((p) => p.nome === x.veterinario) : null), f.fmt, "Requisição - " + x.paciente); }, "Imprimir");
}
function htmlSolicitacao(x, bob, prof) {
  const ex = x.exames.map(normEx);
  return `<div class="cab"><b>${esc(CLINICA.nome)}</b>${bob ? "" : `<br><small>${esc(CLINICA.endereco)} · ${esc(CLINICA.telefone)}</small>`}</div>
  <h1>Requisição de exames${x.prioridade === "Urgente" ? " — URGENTE" : ""}</h1>
  <p><b>Paciente:</b> ${esc(x.paciente)} (${esc([x.especie, x.raca, x.sexo, x.idade, x.peso && x.peso + " kg"].filter(Boolean).join(", "))})<br><b>Tutor:</b> ${esc(x.tutor)} ${esc(x.telefone || "")}<br><b>Solicitado em:</b> ${fmtTs(x.criadoEm)}</p>
  <table>${ex.map((e) => { const v = valorLinha(e); return `<tr><td><b>${esc(e.nome)}</b><br><small>${isPrest(e) ? esc(e.realizadoPor || "") : esc(e.laboratorio || "")} · ${esc(origemDe(e, x))}${e.realizadoEm ? " · " + new Date(e.realizadoEm).toLocaleString("pt-BR").slice(0, 17) : ""} · liberação: ${esc(prazoDe(e, isPrest(e)))}</small>${e.pa?.some(Boolean) ? `<br><small>Pressão arterial (mmHg): ${e.pa.filter(Boolean).join(" · ")}</small>` : ""}</td>${v != null ? `<td style="text-align:right;white-space:nowrap">${brl(v)}</td>` : ""}</tr>`; }).join("")}</table>
  ${ex.some((e) => valorLinha(e) != null) ? `<p style="text-align:right"><b>Total particular: ${brl(ex.reduce((s, e) => s + (valorLinha(e) || 0), 0))}</b></p>` : ""}
  ${x.obs ? `<p><b>Obs.:</b> ${esc(x.obs)}</p>` : ""}${assinaturaHtml(prof, x.veterinario, x.crmv)}`;
}
function assinaturaHtml(prof, nome, crmv) {
  return `<div class="ass ${prof?.assinatura ? "" : "sem"}">${prof?.assinatura ? `<img src="${prof.assinatura}">` : ""}<div class="linha">${esc(prof?.nome || nome || "")}<br><small>Médico(a) Veterinário(a)${(prof?.crmv || crmv) ? " · CRMV " + esc(prof?.crmv || crmv) : ""}</small></div></div>`;
}
function docImpressao(corpo, fmt, titulo, extraCss = "") {
  const bob = fmt !== "a4", larg = fmt === "58" ? "54mm" : "74mm";
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>${esc(titulo)}</title><style>
    @page{size:${bob ? (fmt === "58" ? "58mm" : "80mm") + " auto" : "A4"};margin:${bob ? "2mm" : "15mm"}}
    body{font-family:${bob ? "monospace" : "Arial,sans-serif"};font-size:${bob ? "11px" : "13px"};${bob ? "width:" + larg : "max-width:180mm"};margin:auto;color:#111}
    .cab{text-align:center;border-bottom:2px solid #1565c0;padding-bottom:6px;margin-bottom:8px;font-size:${bob ? "12px" : "16px"}}
    h1{font-size:${bob ? "13px" : "18px"};text-align:center;margin:8px 0;color:#0d3c78}
    table{width:100%;border-collapse:collapse}td{padding:4px;border-bottom:1px dashed #bbb;vertical-align:top}
    .texto{white-space:pre-wrap;line-height:1.5}
    .ass{margin-top:${bob ? "20px" : "50px"};text-align:center}.ass img{max-height:70px;max-width:220px;display:block;margin:0 auto -8px}
    .ass.sem{margin-top:${bob ? "8px" : "22px"}}.linha{border-top:1px solid #000;display:inline-block;padding-top:4px;min-width:${bob ? "90%" : "260px"}}
    ${extraCss}
  </style></head><body>${corpo}<script>window.onload=()=>print()<\/script></body></html>`);
  w.document.close();
}

/* ================= PROFISSIONAIS (com assinatura digital) ================= */
function comprimirImagem(file, max = 1000) {
  return new Promise((res, rej) => { const img = new Image(), r = new FileReader(); r.onload = () => (img.src = r.result); r.onerror = rej; img.onerror = rej;
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k; c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", 0.7)); };
    r.readAsDataURL(file); });
}
function comprimirAssinatura(file) {
  return new Promise((res, rej) => { const img = new Image(), r = new FileReader(); r.onload = () => (img.src = r.result); r.onerror = rej;
    img.onload = () => { const k = Math.min(1, 500 / img.width), c = document.createElement("canvas"); c.width = img.width * k; c.height = img.height * k;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0, c.width, c.height);
      const d = g.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) if (d.data[i] > 200 && d.data[i + 1] > 200 && d.data[i + 2] > 200) d.data[i + 3] = 0; // fundo branco -> transparente
      g.putImageData(d, 0, 0); res(c.toDataURL("image/png")); };
    r.readAsDataURL(file); });
}
const meuProfissional = (profs) => profs.find((p) => p.emailUsuario && p.emailUsuario.toLowerCase() === (usuario.email || "").toLowerCase());
async function telaProfissionais(v) {
  const ps = (await getDocs(query(collection(db, "profissionais"), orderBy("nome")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  v.innerHTML = `<div class="barra"><h2>Profissionais</h2>${isMaster() ? `<button class="btn primary" id="novoP">+ Novo profissional</button>` : ""}</div>
  <p class="muted small">Médicos da casa e volantes que realizam exames e liberam laudos. A assinatura digital entra nos laudos e documentos impressos. Ligue o profissional ao e-mail de login dele para que só ele libere laudos com a própria assinatura.</p>
  <table><thead><tr><th>Assinatura</th><th>Nome</th><th>CRMV</th><th>Especialidade</th><th>Tipo</th><th>Libera laudo</th><th>Login</th><th></th></tr></thead><tbody>
  ${ps.map((p) => `<tr><td>${p.assinatura ? `<img src="${p.assinatura}" style="height:36px">` : `<span class="muted small">—</span>`}</td><td><b>${esc(p.nome)}</b>${p.ativo === false ? ` <span class="tag neutro">Inativo</span>` : ""}</td><td>${esc(p.crmv || "")}</td><td>${esc(p.especialidade || "")}</td>
    <td>${esc(p.tipo || "Da casa")}</td><td>${p.podeLaudar ? `<span class="tag ok">Sim</span>` : "—"}</td><td class="small">${esc(p.emailUsuario || "")}</td>
    <td>${isMaster() ? `<button class="btn small" data-e="${p.id}">Editar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Nenhum profissional cadastrado.</td></tr>`}</tbody></table>`;
  const modal = (p = {}) => abrirModal(p.id ? "Editar profissional" : "Novo profissional", `
    <label>Nome (como aparece na planilha)<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: DR RODRIGO"></label>
    <div class="duas"><label>CRMV<input name="crmv" value="${esc(p.crmv)}"></label><label>Especialidade<input name="especialidade" value="${esc(p.especialidade)}"></label></div>
    <div class="duas"><label>Tipo<select name="tipo">${opts(["Da casa", "Volante / prestador"], p.tipo)}</select></label>
    <label>E-mail de login dele (opcional)<input type="email" name="emailUsuario" value="${esc(p.emailUsuario)}"></label></div>
    <label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="podeLaudar" ${p.podeLaudar ? "checked" : ""}> Pode liberar laudos</label>
    <label>Assinatura (foto da assinatura em papel branco; o fundo fica transparente)<input type="file" name="ass" accept="image/*"></label>
    ${p.assinatura ? `<img src="${p.assinatura}" style="height:50px">` : ""}
    <label>Situação<select name="ativo"><option value="1">Ativo</option><option value="0" ${p.ativo === false ? "selected" : ""}>Inativo</option></select></label>`,
    async (f, form) => { const d = { nome: f.nome.trim(), crmv: f.crmv, especialidade: f.especialidade, tipo: f.tipo, emailUsuario: f.emailUsuario.trim(), podeLaudar: !!f.podeLaudar, ativo: f.ativo === "1" };
      if (form.ass.files[0]) d.assinatura = await comprimirAssinatura(form.ass.files[0]);
      p.id ? await updateDoc(doc(db, "profissionais", p.id), d) : await addDoc(collection(db, "profissionais"), d); toast("Profissional salvo."); });
  $("#novoP") && ($("#novoP").onclick = () => modal());
  v.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => modal(ps.find((p) => p.id === b.dataset.e))));
}

/* ================= PLANILHAS DE EXAMES (laboratoriais e prestadores) ================= */
let planMes = hoje().slice(0, 7), planF = { lab: "", med: "", origem: "", busca: "" };
const dataDe = (e) => (e.realizadoEm || "").slice(0, 10), horaDe = (e) => (e.realizadoEm || "").slice(11, 16);
async function linhasDoMes(mes) {
  const [y, m] = mes.split("-").map(Number);
  const ini = Timestamp.fromDate(new Date(y, m - 2, 20)), fim = Timestamp.fromDate(new Date(y, m, 10)); // folga p/ datas de realização
  const docs = (await getDocs(query(collection(db, "exames"), where("criadoEm", ">=", ini), where("criadoEm", "<", fim)))).docs.map((d) => ({ id: d.id, ...d.data() }));
  return docs.flatMap((x) => x.exames.map(normEx).map((e, k) => ({ x, e, k })))
    .filter(({ x, e }) => (e.realizadoEm ? e.realizadoEm.slice(0, 7) : x.criadoEm?.toDate?.().toISOString().slice(0, 7)) === mes)
    .sort((a, b) => (a.e.realizadoEm || "").localeCompare(b.e.realizadoEm || ""));
}
async function salvarCampo(id, k, campo, valor) {
  await runTransaction(db, async (t) => {
    const ref = doc(db, "exames", id); const d = (await t.get(ref)).data();
    if (["paciente", "tutor"].includes(campo)) return t.update(ref, { [campo]: valor });
    const ex = d.exames.map(normEx); ex[k] = { ...ex[k], [campo]: valor };
    if (campo === "laboratorio" && ex[k].coleta === undefined) ex[k].coleta = { status: "Aguardando" };
    t.update(ref, { exames: ex });
  });
}

async function telaPlanilha(v, modo = "lab") {
  const lab = modo === "lab";
  const [linhasTodas, profs, cat] = await Promise.all([linhasDoMes(planMes), carregarProfissionais(), carregarCatalogo()]);
  const todas = linhasTodas.filter(({ e }) => (lab ? !isPrest(e) : isPrest(e)));
  const [y, m] = planMes.split("-").map(Number);
  const nomeMes = new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase();
  const dl = (id, arr) => `<datalist id="${id}">${[...new Set(arr)].map((o) => `<option value="${esc(o)}">`).join("")}</datalist>`;
  v.innerHTML = `
  <div class="planilha-titulo">${lab ? "CONTROLE DE EXAMES LABORATORIAIS" : "CONTROLE DE PAGAMENTO DE MED VOLANTE (US, RX, ECO, CONSULTA ESPECIALISTA EXTERNO)"}<div>${nomeMes}</div></div>
  <div class="barra no-print">
    <input type="month" id="pMes" value="${planMes}">
    <input id="pB" placeholder="Buscar pet, responsável, exame…" value="${esc(planF.busca)}">
    ${lab ? `<select id="pLab"><option value="">Todos os laboratórios</option>${opts(LABORATORIOS, planF.lab)}</select>` : `<select id="pMed"><option value="">Todos os médicos</option>${opts(profs.map((p) => p.nome), planF.med)}</select>`}
    <select id="pOri"><option value="">Todas as origens</option>${opts(ORIGENS, planF.origem)}</select>
    <button class="btn" id="pCsv">Exportar Excel</button><button class="btn" onclick="print()">Imprimir</button>
    <button class="btn primary" id="pNova">+ Nova linha</button></div>
  ${dl("dlEx", cat.filter((c) => (lab ? !isPrest(c) : isPrest(c))).map((c) => c.nome))}${dl("dlOri", ORIGENS)}${dl("dlMed", profs.map((p) => p.nome))}
  <div class="grid" id="pKpi"></div>
  <div class="tabela-wrap"><table class="planilha"><thead><tr>
    <th>DATA</th><th>HORA</th>${lab ? "<th>LAB. ENVIADO</th><th>EXAME</th>" : "<th>MÉDICO VETERINÁRIO</th><th>SERVIÇO REALIZADO</th>"}<th>NOME DO PET</th><th>RESPONSÁVEL</th><th>ORIGEM</th>
    ${lab ? "<th>COLETA</th><th>LAUDO</th><th>PAGO?</th><th>VALOR (R$)</th>" : "<th>DATA PAGTO VOLANTE</th><th>LAUDO LIBERADO?</th><th>REPASSE (R$)</th>"}
    <th>LINK DO COMPROVANTE</th><th>OBS</th><th class="no-print"></th></tr></thead><tbody id="pTb"></tbody></table></div>`;
  const sel = (f, val, lista, cls = "") => `<select data-f="${f}" class="${cls}">${["", ...lista].map((o) => `<option ${o === (val || "") ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
  const inp = (f, val, extra = "") => `<input data-f="${f}" value="${esc(val ?? "")}" ${extra}>`;
  let vis = [];
  const desenhar = () => {
    const b = planF.busca.toLowerCase();
    vis = todas.filter(({ x, e }) => (!planF.lab || e.laboratorio === planF.lab) && (!planF.med || e.realizadoPor === planF.med) && (!planF.origem || origemDe(e, x) === planF.origem) &&
      (!b || `${x.paciente} ${x.tutor} ${e.nome} ${e.obs || ""}`.toLowerCase().includes(b)));
    const soma = (f) => vis.reduce((s, r) => s + (Number(String(r.e[f] || "").replace(",", ".")) || 0), 0);
    const cont = (fn) => { const o = {}; vis.forEach((r) => { const k = fn(r) || "—"; o[k] = (o[k] || 0) + 1; }); return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(k)}: <b>${n}</b>`).join(" · "); };
    $("#pKpi").innerHTML = lab
      ? `<div class="card kpi"><span class="muted">Exames</span><b>${vis.length}</b><span class="small">${cont((r) => r.e.laboratorio)}</span></div>
         <div class="card kpi"><span class="muted">Laudo pendente</span><b style="color:var(--vermelho)">${vis.filter((r) => r.e.laudo !== "SIM").length}</b></div>
         <div class="card kpi"><span class="muted">Coletas aguardando</span><b style="color:var(--amarelo)">${vis.filter((r) => r.e.coleta?.status === "Aguardando").length}</b></div>
         <div class="card kpi"><span class="muted">Por origem</span><span class="small">${cont((r) => origemDe(r.e, r.x))}</span></div>`
      : `<div class="card kpi"><span class="muted">Atendimentos</span><b>${vis.length}</b><span class="small">${cont((r) => r.e.realizadoPor)}</span></div>
         <div class="card kpi"><span class="muted">Total de repasses</span><b>${brl(soma("repasse"))}</b></div>
         <div class="card kpi"><span class="muted">Repasse sem pagamento</span><b style="color:var(--vermelho)">${vis.filter((r) => Number(r.e.repasse) > 0 && !r.e.dataPagamento).length}</b></div>
         <div class="card kpi"><span class="muted">Laudo não liberado</span><b style="color:var(--amarelo)">${vis.filter((r) => r.e.laudo === "NÃO").length}</b></div>`;
    $("#pTb").innerHTML = vis.map(({ x, e, k }) => { const c = e.coleta; return `<tr data-id="${x.id}" data-k="${k}" class="${e.laudo === "NÃO" ? "linha-alerta" : ""}">
      <td>${inp("data", dataDe(e), 'type="date"')}</td><td>${inp("hora", horaDe(e), 'type="time" style="width:80px"')}</td>
      ${lab ? `<td>${sel("laboratorio", e.laboratorio, LABORATORIOS)}</td><td>${inp("nome", e.nome, 'list="dlEx"')}</td>`
            : `<td>${inp("realizadoPor", e.realizadoPor, 'list="dlMed"')}</td><td>${inp("nome", e.nome, 'list="dlEx"')}</td>`}
      <td>${inp("paciente", x.paciente)}</td><td>${inp("tutor", x.tutor)}</td><td>${inp("origem", origemDe(e, x), 'list="dlOri"')}</td>
      ${lab ? `<td class="small">${!c ? "—" : c.status === "Aguardando" ? `<button class="btn small" data-ac="aceitar">Aceitar</button>` : c.status === "Aceita" ? `${esc(c.por)} <button class="btn small primary" data-ac="coletar">✔</button>` : `<span class="tag ok">${esc(c.por)}</span>`}</td>
              <td>${sel("laudo", e.laudo, ["SIM", "NÃO"])}${e.laudoId ? ` <a href="#" data-laudo="${e.laudoId}" title="Ver laudo">📄</a>` : ""}</td><td>${sel("pago", e.pago, ["SIM", "NÃO"])}</td><td>${inp("valor", e.valor, 'style="width:80px"')}</td>`
            : `<td>${inp("dataPagamento", e.dataPagamento, 'type="date"')}</td><td>${sel("laudo", e.laudo, ["SIM", "NÃO"])}${e.laudoId ? ` <a href="#" data-laudo="${e.laudoId}">📄</a>` : ""}</td><td>${inp("repasse", e.repasse, 'style="width:80px"')}</td>`}
      <td>${inp("comprovante", e.comprovante, 'placeholder="cole o link"')}${e.comprovante ? ` <a href="${esc(e.comprovante)}" target="_blank" title="Abrir comprovante">🔗</a>` : ""}</td>
      <td>${inp("obs", e.obs, 'placeholder="ex.: desconto R$5"')}</td>
      <td class="acoes-linha no-print"><button class="btn small" data-ac="laudo" title="Emitir laudo">📝 Laudo</button>${isMaster() ? `<button class="btn small danger" data-ac="rm" title="Remover linha">✕</button>` : ""}</td></tr>`; }).join("")
      || `<tr><td colspan="15" class="muted">Nenhum registro em ${nomeMes}. Clique em "+ Nova linha".</td></tr>`;
  };
  desenhar();
  $("#pMes").onchange = (e) => { planMes = e.target.value; render(); };
  $("#pB").oninput = (e) => { planF.busca = e.target.value; desenhar(); };
  $("#pLab") && ($("#pLab").onchange = (e) => { planF.lab = e.target.value; desenhar(); });
  $("#pMed") && ($("#pMed").onchange = (e) => { planF.med = e.target.value; desenhar(); });
  $("#pOri").onchange = (e) => { planF.origem = e.target.value; desenhar(); };
  // edição célula a célula (salva sozinho)
  $("#pTb").onchange = async (ev) => {
    const el = ev.target.closest("[data-f]"); if (!el) return; const tr = el.closest("tr"); const r = vis.find((v) => v.x.id === tr.dataset.id && v.k == tr.dataset.k);
    let campo = el.dataset.f, val = el.value;
    if (campo === "data" || campo === "hora") { campo = "realizadoEm"; val = `${tr.querySelector('[data-f="data"]').value}T${tr.querySelector('[data-f="hora"]').value || "00:00"}`; }
    if (campo === "nome" && lab) { const c = cat.find((c) => c.nome === val); if (c && c.laboratorio) { tr.querySelector('[data-f="laboratorio"]').value = c.laboratorio; await salvarCampo(r.x.id, r.k, "laboratorio", c.laboratorio); r.e.laboratorio = c.laboratorio; } }
    el.classList.add("salvando");
    try { await salvarCampo(r.x.id, r.k, campo, val); if (["paciente", "tutor"].includes(campo)) r.x[campo] = val; else r.e[campo] = val; el.classList.replace("salvando", "salvo"); setTimeout(() => el.classList.remove("salvo"), 1200); }
    catch (e) { el.classList.remove("salvando"); toast("Erro ao salvar: " + e.message); }
  };
  $("#pTb").onclick = async (ev) => {
    const a = ev.target.closest("[data-laudo]"); if (a) { ev.preventDefault(); return verLaudo(a.dataset.laudo); }
    const b = ev.target.closest("button[data-ac]"); if (!b) return; const tr = b.closest("tr"); const r = vis.find((v) => v.x.id === tr.dataset.id && v.k == tr.dataset.k);
    if (b.dataset.ac === "laudo") return emitirLaudo(r.x, r.e, r.k, profs);
    if (b.dataset.ac === "rm") {
      if (!confirm("Remover esta linha (exame)?")) return;
      await runTransaction(db, async (t) => { const ref = doc(db, "exames", r.x.id); const d = (await t.get(ref)).data(); const ex = d.exames.map(normEx); ex.splice(r.k, 1);
        ex.length ? t.update(ref, { exames: ex }) : t.delete(ref); });
      return render();
    }
    await runTransaction(db, async (t) => {
      const ref = doc(db, "exames", r.x.id); const d = (await t.get(ref)).data(); const ex = d.exames.map(normEx); const e = ex[r.k];
      if (b.dataset.ac === "aceitar") { if (e.coleta?.status !== "Aguardando") throw new Error("Já aceita."); e.coleta = { status: "Aceita", por: usuario.nome, uid: usuario.uid, aceitoEm: new Date().toISOString() }; }
      if (b.dataset.ac === "coletar") e.coleta = { ...e.coleta, status: "Coletado", coletadoEm: new Date().toISOString() };
      t.update(ref, { exames: ex });
    }).then(() => { toast(b.dataset.ac === "coletar" ? "Coletado! Pontos somados." : "Coleta aceita."); render(); }).catch((e) => toast(e.message));
  };
  // nova linha = cria uma solicitação de exame
  $("#pNova").onclick = () => abrirModal(lab ? "Nova linha — exame laboratorial" : "Nova linha — imagem / prestador", `
    <div class="duas"><label>Data<input type="date" name="data" required value="${hoje()}"></label><label>Hora<input type="time" name="hora" required value="${new Date().toTimeString().slice(0, 5)}"></label></div>
    ${lab ? `<div class="duas"><label>Exame<input name="nome" list="dlEx" required id="nlEx"></label><label>Laboratório<select name="laboratorio" id="nlLab">${opts(LABORATORIOS)}</select></label></div>`
          : `<div class="duas"><label>Médico veterinário<input name="realizadoPor" list="dlMed" required></label><label>Serviço realizado<input name="nome" list="dlEx" required></label></div>`}
    <div class="duas"><label>Nome do pet<input name="paciente" required></label><label>Responsável<input name="tutor" required></label></div>
    <div class="duas"><label>Origem<input name="origem" list="dlOri" value="PARTICULAR" required></label>${lab ? `<label>Valor (R$)<input name="valor"></label>` : `<label>Repasse (R$)<input name="repasse"></label>`}</div>
    <label>Obs.<input name="obs"></label>`,
  async (f) => {
    const e = { nome: f.nome.trim(), grupo: lab ? "Laboratorial" : (cat.find((c) => c.nome === f.nome)?.grupo || "Prestador"), realizadoEm: `${f.data}T${f.hora}`, origem: f.origem.trim().toUpperCase(), obs: f.obs,
      ...(lab ? { laboratorio: f.laboratorio, valor: f.valor, pontos: cat.find((c) => c.nome === f.nome)?.pontos || 1, coleta: { status: "Aguardando" } } : { realizadoPor: f.realizadoPor, repasse: f.repasse }) };
    await addDoc(collection(db, "exames"), { paciente: f.paciente.trim(), tutor: f.tutor.trim(), veterinario: usuario.nome, prioridade: "Rotina", exames: [e], obs: "", status: "Solicitado",
      historico: [{ status: "Solicitado", por: usuario.nome, em: new Date().toISOString(), nota: "Criado pela planilha" }], criadoPor: usuario.nome, criadoUid: usuario.uid, criadoEm: serverTimestamp() });
    toast("Linha adicionada (solicitação criada).");
  }, "Adicionar");
  $("#nlEx") && ($("#nlEx").onchange = (e) => { const c = cat.find((c) => c.nome === e.target.value); if (c?.laboratorio) $("#nlLab").value = c.laboratorio; });
  $("#pCsv").onclick = () => {
    const cab = lab ? ["DATA", "HORA", "LAB. ENVIADO", "EXAME", "NOME DO PET", "RESPONSÁVEL", "ORIGEM", "COLETA", "LAUDO", "PAGO", "VALOR", "COMPROVANTE", "OBS"]
                    : ["DATA", "HORA", "MÉDICO VETERINÁRIO", "SERVIÇO", "NOME DO PET", "RESPONSÁVEL", "ORIGEM", "DATA PAGTO VOLANTE", "LAUDO LIBERADO", "REPASSE", "COMPROVANTE", "OBS"];
    const rows = vis.map(({ x, e }) => lab ? [fmtData(dataDe(e)), horaDe(e), e.laboratorio, e.nome, x.paciente, x.tutor, origemDe(e, x), e.coleta?.status === "Coletado" ? e.coleta.por : e.coleta?.status || "", e.laudo || "", e.pago || "", e.valor || "", e.comprovante || "", e.obs || ""]
      : [fmtData(dataDe(e)), horaDe(e), e.realizadoPor, e.nome, x.paciente, x.tutor, origemDe(e, x), fmtData(e.dataPagamento), e.laudo || "", e.repasse || "", e.comprovante || "", e.obs || ""]);
    const csv = [cab, ...rows].map((r) => r.map((c) => String(c ?? "").replace(/;/g, ",")).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = `${lab ? "exames_laboratoriais" : "med_volante"}_${planMes}.csv`; a.click();
  };
}

/* ================= COMPARATIVO COM A PLANILHA DO LABORATÓRIO ================= */
const norm = (t) => String(t ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const PARADAS = new Set(["E", "DE", "DA", "DO", "COM", "PERFIL", "EXAME", "C"]);
const tokens = (t) => norm(t).split(" ").filter((w) => w.length > 1 && !PARADAS.has(w));
const parecido = (a, b) => { const A = tokens(a), B = tokens(b); if (!A.length || !B.length) return false;
  const nA = A.filter((w) => /\d/.test(w)), nB = B.filter((w) => /\d/.test(w)); if (nA.length && nB.length && !nA.some((w) => nB.includes(w))) return false; const comum = A.filter((w) => B.some((z) => z.startsWith(w) || w.startsWith(z))).length; return comum / Math.min(A.length, B.length) >= 0.5; };
function lerDataPlan(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const m = String(v || "").match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (m) return `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return String(v || "").slice(0, 10);
}
async function carregarXLSX() { if (window.XLSX) return; await new Promise((ok, err) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = err; document.head.appendChild(s); }); }

let compLab = LABORATORIOS[0];
async function telaComparativo(v) {
  v.innerHTML = `<div class="barra"><h2>Comparativo com a planilha do laboratório</h2></div>
  <div class="card" style="margin-bottom:14px">
    <p class="small">1) Escolha o laboratório e o mês · 2) envie a planilha que o laboratório mandou (.xlsx, .xls ou .csv) · 3) indique quais colunas são o pet, o exame, a data e o valor · 4) compare.</p>
    <div class="barra"><select id="cLab">${opts(LABORATORIOS, compLab)}</select><input type="month" id="cMes" value="${planMes}"><input type="file" id="cArq" accept=".xlsx,.xls,.csv"></div>
    <div id="cMap"></div></div><div id="cRes"></div>`;
  $("#cLab").onchange = (e) => (compLab = e.target.value);
  $("#cMes").onchange = (e) => (planMes = e.target.value);
  $("#cArq").onchange = async (ev) => {
    const arq = ev.target.files[0]; if (!arq) return;
    try { await carregarXLSX(); } catch { return toast("Não consegui carregar o leitor de planilhas. Verifique a internet."); }
    const wb = XLSX.read(await arq.arrayBuffer(), { type: "array", cellDates: true });
    const linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });
    const hIdx = linhas.findIndex((l) => l.filter((c) => String(c).trim()).length >= 3);
    const cab = linhas[hIdx].map((c, i) => String(c).trim() || `Coluna ${i + 1}`), dados = linhas.slice(hIdx + 1).filter((l) => l.some((c) => String(c).trim()));
    const chute = (re) => cab.findIndex((c) => re.test(norm(c)));
    const colSel = (id, label, idx, opc) => `<label>${label}<select id="${id}">${opc ? `<option value="-1">— não tem —</option>` : ""}${cab.map((c, i) => `<option value="${i}" ${i === idx ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>`;
    $("#cMap").innerHTML = `<p class="small"><b>${dados.length}</b> linhas lidas de "${esc(arq.name)}". Confira as colunas:</p>
      <div class="grid">${colSel("mPet", "Nome do pet / paciente", chute(/PET|PACIENTE|ANIMAL|NOME/))}${colSel("mEx", "Exame / perfil", chute(/EXAME|PERFIL|PROCED|SERVICO|DESCRI/))}
      ${colSel("mData", "Data", chute(/DATA|DT/), true)}${colSel("mVal", "Valor cobrado", chute(/VALOR|PRECO|COBRAD|TOTAL/), true)}</div>
      <button class="btn primary" id="cGo">Comparar</button>`;
    $("#cGo").onclick = async () => {
      const ci = (id) => Number($(id).value);
      const labRows = dados.map((l, i) => ({ i, pet: l[ci("#mPet")], exame: l[ci("#mEx")], data: ci("#mData") >= 0 ? lerDataPlan(l[ci("#mData")]) : "", valor: ci("#mVal") >= 0 ? l[ci("#mVal")] : "" })).filter((r) => String(r.pet).trim() || String(r.exame).trim());
      const sis = (await linhasDoMes(planMes)).filter((r) => !isPrest(r.e) && norm(r.e.laboratorio) === norm(compLab));
      const usados = new Set(), ok = [], soLab = [];
      for (const L of labRows) {
        const cand = sis.find((S, j) => { const pp = norm(S.x.paciente), lp = norm(L.pet); const mesmoPet = pp && lp && (pp === lp || pp.includes(lp) || lp.includes(pp));
          const dataOk = !L.data || !dataDe(S.e) || Math.abs(new Date(L.data) - new Date(dataDe(S.e))) <= 4 * 864e5; return mesmoPet && dataOk && parecido(S.e.nome, L.exame); });
        if (cand) { usados.add(cand); ok.push({ L, S: cand }); } else soLab.push(L);
      }
      const soSis = sis.filter((S) => !usados.has(S));
      const t = (titulo, cor, cab2, rows) => `<div class="card" style="margin-bottom:14px;border-left:5px solid var(--${cor})"><h3>${titulo} (${rows.length})</h3><div class="tabela-wrap"><table><thead><tr>${cab2.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${cab2.length}" class="muted">Nenhum.</td></tr>`}</tbody></table></div></div>`;
      $("#cRes").innerHTML = `<div class="grid"><div class="card kpi"><span class="muted">Conferem</span><b style="color:var(--verde)">${ok.length}</b></div>
        <div class="card kpi"><span class="muted">Cobrados pelo lab, sem registro aqui</span><b style="color:var(--vermelho)">${soLab.length}</b></div>
        <div class="card kpi"><span class="muted">Registrados aqui, fora da planilha do lab</span><b style="color:var(--amarelo)">${soSis.length}</b></div></div>
      ${t("⚠️ Estão na planilha do laboratório mas NÃO no sistema", "vermelho", ["Data", "Pet", "Exame (lab)", "Valor cobrado"], soLab.map((L) => `<tr><td>${fmtData(L.data)}</td><td>${esc(L.pet)}</td><td>${esc(L.exame)}</td><td>${esc(L.valor)}</td></tr>`))}
      ${t("⚠️ Estão no sistema mas NÃO vieram na planilha do laboratório", "amarelo", ["Data", "Pet", "Exame", "Origem", "Obs"], soSis.map((S) => `<tr><td>${fmtData(dataDe(S.e))}</td><td>${esc(S.x.paciente)}</td><td>${esc(S.e.nome)}</td><td>${esc(origemDe(S.e, S.x))}</td><td>${esc(S.e.obs || "")}</td></tr>`))}
      ${t("✅ Conferem", "verde", ["Data", "Pet", "Exame (sistema)", "Exame (lab)", "Origem", "Valor cobrado", "Obs"], ok.map(({ L, S }) => `<tr><td>${fmtData(dataDe(S.e))}</td><td>${esc(S.x.paciente)}</td><td>${esc(S.e.nome)}</td><td>${esc(L.exame)}</td><td>${esc(origemDe(S.e, S.x))}</td><td>${esc(L.valor)}</td><td>${esc(S.e.obs || "")}</td></tr>`))}
      <button class="btn" id="cCsv">Exportar comparativo (Excel)</button>`;
      $("#cCsv").onclick = () => {
        const r = [["SITUACAO", "DATA", "PET", "EXAME SISTEMA", "EXAME LAB", "ORIGEM", "VALOR LAB", "OBS"],
          ...ok.map(({ L, S }) => ["CONFERE", fmtData(dataDe(S.e)), S.x.paciente, S.e.nome, L.exame, origemDe(S.e, S.x), L.valor, S.e.obs || ""]),
          ...soLab.map((L) => ["SO NO LABORATORIO", fmtData(L.data), L.pet, "", L.exame, "", L.valor, ""]),
          ...soSis.map((S) => ["SO NO SISTEMA", fmtData(dataDe(S.e)), S.x.paciente, S.e.nome, "", origemDe(S.e, S.x), "", S.e.obs || ""])];
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + r.map((l) => l.map((c) => String(c ?? "").replace(/;/g, ",")).join(";")).join("\n")], { type: "text/csv" }));
        a.download = `comparativo_${compLab}_${planMes}.csv`; a.click(); };
    };
  };
}

/* ================= MODELOS DE LAUDO + EMISSÃO ================= */
const CAMPOS_LAUDO = ["hora", "paciente", "especie", "raca", "sexo", "idade", "peso", "tutor", "exame", "data", "solicitante", "profissional", "crmv"];
async function telaModelos(v) {
  const ms = (await getDocs(query(collection(db, "modelosLaudo"), orderBy("nome")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  v.innerHTML = `<div class="barra"><h2>Modelos de laudo</h2>${isMaster() ? `<button class="btn" id="seedM">Carregar modelos básicos (cães e gatos)</button><button class="btn primary" id="novoM">+ Novo modelo</button>` : ""}</div>
  <p class="muted small">Crie um modelo para cada exame. Use os campos automáticos entre chaves, que são preenchidos sozinhos: ${CAMPOS_LAUDO.map((c) => `<code>{{${c}}}</code>`).join(" ")}</p>
  <table><thead><tr><th>Modelo</th><th>Usado para os exames</th><th></th></tr></thead><tbody>
  ${[...new Set([...CATEGORIAS_LAUDO, ...ms.map((m) => m.categoria || "Sem categoria")])].map((cat) => { const lst = ms.filter((m) => (m.categoria || "Sem categoria") === cat); return lst.length ? `<tr class="cat-linha"><td colspan="3"><b>${esc(cat)}</b> <span class="muted small">(${lst.length})</span></td></tr>` + lst.map((m) => `<tr><td><b>${esc(m.nome)}</b></td><td class="small">${esc((m.exames || []).join(", "))}</td><td>${isMaster() ? `<button class="btn small" data-e="${m.id}">Editar</button><button class="btn small danger" data-x="${m.id}">Excluir</button>` : ""}</td></tr>`).join("") : ""; }).join("") || `<tr><td colspan="3" class="muted">Nenhum modelo. Use "Carregar modelos básicos".</td></tr>`}</tbody></table>`;
  const modal = (m = {}) => abrirModal(m.id ? "Editar modelo" : "Novo modelo de laudo", `
    <label>Nome do modelo<input name="nome" required value="${esc(m.nome)}" placeholder="Ex.: Ultrassonografia abdominal"></label>
    <label>Categoria<select name="categoria">${opts(CATEGORIAS_LAUDO.concat(m.categoria && !CATEGORIAS_LAUDO.includes(m.categoria) ? [m.categoria] : []), m.categoria || CATEGORIAS_LAUDO[0])}</select></label>
    <label>Exames que usam este modelo (separe por vírgula)<input name="exames" value="${esc((m.exames || []).join(", "))}" placeholder="ULTRASSOM ABDOMINAL, Ultrassonografia abdominal"></label>
    <label>Texto do laudo<textarea name="conteudo" rows="16" style="font-family:monospace">${esc(m.conteudo || "LAUDO DE {{exame}}\n\nPaciente: {{paciente}} · Espécie: {{especie}} · Raça: {{raca}} · Idade: {{idade}}\nTutor: {{tutor}} · Data: {{data}} · Solicitante: {{solicitante}}\n\nACHADOS:\n\n\nCONCLUSÃO:\n")}</textarea></label>`,
    async (f) => { const d = { nome: f.nome.trim(), categoria: f.categoria, exames: f.exames.split(",").map((t) => t.trim()).filter(Boolean), conteudo: f.conteudo };
      m.id ? await updateDoc(doc(db, "modelosLaudo", m.id), d) : await addDoc(collection(db, "modelosLaudo"), d); toast("Modelo salvo."); });
  $("#novoM") && ($("#novoM").onclick = () => modal());
  $("#seedM") && ($("#seedM").onclick = async () => { let n = 0; $("#seedM").disabled = true;
    for (const m of MODELOS_LAUDO) { if (ms.some((x) => norm(x.nome) === norm(m.nome))) continue; await addDoc(collection(db, "modelosLaudo"), { nome: m.nome, categoria: m.categoria, exames: [m.nome], conteudo: m.conteudo }); n++; }
    toast(n ? `${n} modelos carregados.` : "Os modelos básicos já estavam carregados."); render(); });
  v.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => modal(ms.find((m) => m.id === b.dataset.e))));
  v.querySelectorAll("[data-x]").forEach((b) => (b.onclick = async () => { if (confirm("Excluir modelo?")) { await deleteDoc(doc(db, "modelosLaudo", b.dataset.x)); render(); } }));
}

const paTexto = (e) => { const v = (e.pa || []).map(Number).filter(Boolean); if (!v.length) return "Aferições (mmHg): ___ ___ ___ ___ ___"; return v.map((n, i) => `${i + 1}ª aferição: ${n} mmHg`).join("\n") + `\nMédia: ${Math.round(v.reduce((s, n) => s + n, 0) / v.length)} mmHg`; };
async function emitirLaudo(x, e, k, profs) {
  const ms = (await getDocs(collection(db, "modelosLaudo"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const laudistas = profs.filter((p) => p.podeLaudar);
  const meu = meuProfissional(profs);
  const permitidos = isMaster() ? laudistas : laudistas.filter((p) => p.id === meu?.id);
  if (!permitidos.length) return toast(isMaster() ? "Cadastre um profissional com 'Pode liberar laudos' marcado." : "Seu login não está ligado a um profissional que libera laudos.");
  const sugerido = ms.find((m) => m.id === e.modeloId) || ms.find((m) => (m.exames || []).some((n) => norm(n) === norm(e.nome))) || ms.find((m) => parecido(m.nome, e.nome));
  const preencher = (txt, p) => txt.replace(/\{\{(\w+)\}\}/g, (_, c) => ({ paciente: x.paciente, especie: x.especie, raca: x.raca, sexo: x.sexo, idade: x.idade, peso: x.peso, tutor: x.tutor, exame: e.nome,
    pa: paTexto(e), data: fmtData($("#lAbre")?.value || dataDe(e) || hoje()), hora: horaDe(e) || "___:___", solicitante: x.veterinario, profissional: p?.nome, crmv: p?.crmv }[c] ?? ""));
  const pIni = permitidos.find((p) => p.nome === e.realizadoPor) || meu || permitidos[0];
  abrirModal(`Laudo — ${e.nome} · ${x.paciente}`, `
    <div class="duas"><label>Modelo<select id="lMod"><option value="">— texto livre —</option>${[...new Set(ms.map((m) => m.categoria || "Sem categoria"))].map((cat) => `<optgroup label="${esc(cat)}">${ms.filter((m) => (m.categoria || "Sem categoria") === cat).map((m) => `<option value="${m.id}" ${m.id === sugerido?.id ? "selected" : ""}>${esc(m.nome)}</option>`).join("")}</optgroup>`).join("")}</select></label>
    <label>Profissional que libera<select name="prof" id="lProf">${permitidos.map((p) => `<option value="${p.id}" ${p.id === pIni?.id ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select></label></div>
    <div class="duas"><label>Data de abertura da requisição<input type="date" name="dataAbertura" id="lAbre" value="${dataDe(e) || hoje()}"></label><label>Data da liberação do laudo<input type="date" name="dataLaudo" value="${hoje()}" required></label></div>
    <div class="duas"><label>Imagens do exame (opcional, até 4)<input type="file" name="imgs" accept="image/*" multiple></label></div>
    <label>Assinatura / carimbo do médico em imagem (opcional)<input type="file" name="assImg" accept="image/*"></label>
    <label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="usaAss" checked> Usar a assinatura cadastrada do profissional (se ele tiver)</label>
    <label>Texto do laudo (pode editar à vontade)<textarea name="texto" id="lTxt" rows="18" style="font-family:monospace"></textarea></label>
    <label>Imprimir em<select name="fmt"><option value="a4">Folha A4</option><option value="80">Bobina 80 mm</option></select></label>`,
  async (f, form) => {
    const p = permitidos.find((p) => p.id === f.prof);
    const ass = form.assImg.files[0] ? await comprimirAssinatura(form.assImg.files[0]) : f.usaAss ? p.assinatura || "" : "";
    const imagens = []; for (const fl of [...form.imgs.files].slice(0, 4)) imagens.push(await comprimirImagem(fl));
    if (JSON.stringify(imagens).length + ass.length > 800000) throw new Error("Imagens muito pesadas. Use menos imagens ou imagens menores.");
    const ref = await addDoc(collection(db, "laudos"), { exameId: x.id || "", k, paciente: x.paciente, tutor: x.tutor, solicitante: x.veterinario || "", crmvSolicitante: x.crmv || "", especie: x.especie || "", raca: x.raca || "", sexo: x.sexo || "", idade: x.idade || "", peso: x.peso || "", dataAbertura: f.dataAbertura || "", pacienteAvulso: !x.id, exame: e.nome, texto: f.texto, profissionalId: p.id, profissional: p.nome, crmv: p.crmv || "",
      assinatura: ass, imagens, dataLaudo: f.dataLaudo, regiao: e.regiao || "", liberadoPor: usuario.nome, liberadoUid: usuario.uid, liberadoEm: serverTimestamp() });
    if (x.id) { await salvarCampo(x.id, k, "laudoId", ref.id); await salvarCampo(x.id, k, "laudo", "SIM"); }
    imprimirLaudo({ regiao: e.regiao, paciente: x.paciente, tutor: x.tutor, solicitante: x.veterinario, crmvSolicitante: x.crmv, especie: x.especie, raca: x.raca, sexo: x.sexo, idade: x.idade, peso: x.peso, dataAbertura: f.dataAbertura, exame: e.nome, texto: f.texto, profissional: p.nome, crmv: p.crmv, assinatura: ass, imagens, dataLaudo: f.dataLaudo, liberadoEm: null }, f.fmt);
    toast("Laudo liberado e salvo.");
  }, "Liberar laudo e imprimir");
  const aplicar = () => { const m = ms.find((m) => m.id === $("#lMod").value); const p = permitidos.find((p) => p.id === $("#lProf").value); $("#lTxt").value = preencher(m?.conteudo || (ehPA(e) ? "Aferição de pressão arterial sistólica\nPaciente: {{paciente}} — Tutor: {{tutor}}\n\n{{pa}}\n\nObservações:\n" : ""), p); };
  $("#lMod").onchange = aplicar; $("#lProf").onchange = aplicar; $("#lAbre").onchange = aplicar; aplicar();
}
const LAUDO_CSS = `*{box-sizing:border-box}body{font-family:"Segoe UI",Roboto,Arial,sans-serif;font-size:12.5px;color:#1f2d3d;max-width:186mm;margin:0 auto;background:#fff}
 .topo{height:7px;background:linear-gradient(90deg,#0b3d91,#1e88e5 60%,#26c6da);border-radius:0 0 6px 6px}
 .lh{display:flex;align-items:center;gap:16px;padding:14px 0 12px;border-bottom:1px solid #dbe5f1}
 .lh img{max-height:74px;max-width:140px;object-fit:contain}
 .lh .tit{flex:1;border-left:3px solid #1e88e5;padding-left:14px}.lh .tit small{display:block;letter-spacing:3px;color:#1e88e5;font-weight:700;font-size:10px}
 .lh .tit h1{margin:2px 0 0;font-size:23px;line-height:1.15;color:#0b2e63;text-align:left;font-weight:700}
 .clin{margin-top:6px;font-size:10.5px;color:#5b6b7f;line-height:1.5}
 .pac{display:grid;grid-template-columns:1fr 1fr;gap:6px 22px;background:#f3f7fc;border:1px solid #dbe5f1;border-radius:10px;padding:11px 14px;margin:14px 0 6px;font-size:11.5px}
 .pac span{display:block;font-size:9.5px;text-transform:uppercase;letter-spacing:.8px;color:#6b7c93}.pac b{font-size:13px;color:#10284d;font-weight:600}
 .res{line-height:1.65;font-size:13px;margin-top:10px}
 .res h2{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#0b3d91;margin:16px 0 5px;padding:3px 0 3px 10px;border-left:4px solid #1e88e5;background:linear-gradient(90deg,#eaf3fd,transparent)}
 .res p{margin:3px 0}.res .k{font-weight:600;color:#12315f}
 .imgs{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:16px}.imgs img{width:100%;max-height:250px;object-fit:contain;border:1px solid #dbe5f1;border-radius:8px;padding:4px;background:#fafcff}
 .datas{font-size:10.5px;color:#6b7c93;text-align:right;margin-top:18px}
 .rod{margin-top:20px;border-top:1px solid #dbe5f1;padding-top:6px;text-align:center;font-size:9.5px;color:#8a99ad}
 .ass{margin-top:34px!important}.linha{border-top:1px solid #1f2d3d!important;font-size:12px}
 .barra-pdf{position:sticky;top:0;background:#0b2e63;color:#fff;padding:10px 14px;display:flex;gap:10px;align-items:center;margin:0 -8px 10px;z-index:5;font-family:Arial,sans-serif}
 .barra-pdf button{background:#fff;color:#0b2e63;border:0;border-radius:6px;padding:8px 14px;font-weight:700;cursor:pointer}.barra-pdf span{flex:1;font-size:12px;opacity:.85}
 @media print{.barra-pdf{display:none}}`;
function formatarLaudo(t) {
  return String(t || "").split(/\r?\n/).map((ln) => { const s = ln.trim(); if (!s || /^[=\-_*]{3,}$/.test(s)) return s ? "" : `<p>&nbsp;</p>`;
    if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9 \/()+,.\-–]{4,60}:?$/.test(s) && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3}/.test(s)) return `<h2>${esc(s.replace(/:$/, ""))}</h2>`;
    const m = s.match(/^([^:]{2,45}):\s*(.*)$/); if (m) return `<p><span class="k">${esc(m[1])}:</span> ${esc(m[2])}</p>`;
    return `<p>${esc(s)}</p>`; }).join("");
}
function imprimirLaudo(l, fmt = "a4") {
  const dtLaudo = l.dataLaudo ? fmtData(l.dataLaudo) : l.liberadoEm?.toDate ? l.liberadoEm.toDate().toLocaleDateString("pt-BR") : new Date().toLocaleDateString("pt-BR");
  if (fmt !== "a4") return docImpressao(`<div class="cab"><b>${esc(CLINICA.nome)}</b></div><h1>Laudo — ${esc(l.exame)}</h1><p><b>${esc(l.paciente)}</b> · ${esc(l.tutor || "")}</p><div class="texto">${esc(l.texto)}</div><p style="text-align:right"><small>${dtLaudo}</small></p>
    ${assinaturaHtml({ nome: l.profissional, crmv: l.crmv, assinatura: l.assinatura })}`, fmt, `Laudo ${l.exame} - ${l.paciente}`);
  const pet = [l.especie, l.raca, l.sexo, l.idade, l.peso && l.peso + " kg"].filter(Boolean).join(" · ");
  const logo = new URL(CLINICA.logoLaudo || "logo-vetplus.png", location.href).href;
  const corpo = `<div class="topo"></div><div class="lh"><img src="${logo}" alt="" onerror="this.remove()"><div class="tit"><small>LAUDO</small><h1>${esc(l.exame)}${l.regiao ? ` <span style="font-weight:400;font-size:15px">— ${esc(l.regiao)}</span>` : ""}</h1></div></div>
    <div class="clin">${[esc(CLINICA.nome), CLINICA.cnpj && "CNPJ " + esc(CLINICA.cnpj), esc(CLINICA.endereco || ""), [CLINICA.telefone && "Tel. " + esc(CLINICA.telefone), CLINICA.whatsapp && "WhatsApp " + esc(CLINICA.whatsapp)].filter(Boolean).join(" · ")].filter(Boolean).join(" · ")}</div>
    <div class="pac"><div><span>Paciente</span><b>${esc(l.paciente)}</b></div><div><span>Tutor</span><b>${esc(l.tutor || "—")}</b></div>
      ${pet ? `<div style="grid-column:1/3"><span>Espécie · raça · sexo · idade · peso</span><b>${esc(pet)}</b></div>` : ""}
      <div><span>Médico(a) solicitante</span><b>${esc(l.solicitante || "—")}${l.crmvSolicitante ? " · CRMV " + esc(l.crmvSolicitante) : ""}</b></div><div><span>Requisição aberta em</span><b>${l.dataAbertura ? fmtData(l.dataAbertura) : "—"}</b></div></div>
    <div class="res">${formatarLaudo(l.texto)}</div>
    ${(l.imagens || []).length ? `<div class="imgs">${l.imagens.map((s) => `<img src="${s}">`).join("")}</div>` : ""}
    <div class="datas">Laudo liberado em <b>${dtLaudo}</b></div>
    ${assinaturaHtml({ nome: l.profissional, crmv: l.crmv, assinatura: l.assinatura })}
    <div class="rod">${esc(CLINICA.nome)} · ${esc(CLINICA.endereco || "")}<br>Este laudo deve ser interpretado pelo médico veterinário responsável.</div>`;
  const arq = `Laudo ${l.exame} - ${l.paciente}`.replace(/[\\/:*?"<>|]/g, "");
  const assunto = encodeURIComponent(`Laudo ${l.exame} — ${l.paciente}`), texto = encodeURIComponent(`Segue o laudo de ${l.exame} do paciente ${l.paciente} (tutor: ${l.tutor || "—"}).\n\nO PDF está anexado.\n\n${CLINICA.nome}`);
  const barra = `<div class="barra-pdf"><span>Laudo pronto. Baixe o PDF e, se quiser, envie por e-mail.</span><button onclick="baixar()">⬇ Baixar PDF</button><button onclick="window.print()">🖨 Imprimir</button><button onclick="location.href='mailto:${esc(EMAIL_ATENDIMENTO || "")}?subject=${assunto}&body=${texto}'">✉ Enviar por e-mail</button></div>`;
  const w = window.open("", "_blank");
  w.document.write(`<html><head><meta charset="utf-8"><title>${esc(arq)}</title><style>@page{size:A4;margin:12mm}${LAUDO_CSS}
    .ass{margin-top:34px;text-align:center}.ass img{max-height:70px;max-width:220px;display:block;margin:0 auto -8px}.ass.sem{margin-top:22px}.linha{display:inline-block;padding-top:4px;min-width:260px}</style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script></head><body>${barra}<div id="folha">${corpo}</div>
    <script>function baixar(){ if(!window.html2pdf){ alert('Na janela de impressão escolha "Salvar como PDF".'); return window.print(); }
      html2pdf().set({margin:[10,8,10,8],filename:${JSON.stringify(arq + ".pdf")},image:{type:"jpeg",quality:.96},html2canvas:{scale:2,useCORS:true},jsPDF:{unit:"mm",format:"a4"}}).from(document.getElementById("folha")).save(); }<\/script></body></html>`);
  w.document.close();
}
async function verLaudo(id) { const d = await getDoc(doc(db, "laudos", id)); if (d.exists()) abrirLaudo(d.data()); }
function abrirLaudo(l) {
  if (l.pdfLink) return window.open(l.pdfLink, "_blank");
  if (l.pdf) { const b = atob(l.pdf.split(",")[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return window.open(URL.createObjectURL(new Blob([u], { type: "application/pdf" })), "_blank"); }
  imprimirLaudo(l);
}

/* ================= PEDIDO DE COTAÇÃO ================= */
async function telaCotacao(v) {
  await carregarProdutos();
  const forn = (await getDocs(collection(db, "fornecedores"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const cots = (await getDocs(query(collection(db, "cotacoes"), orderBy("criadoEm", "desc")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  v.innerHTML = `<div class="barra"><h2>Pedidos de cotação</h2><button class="btn primary" id="novaCot">+ Nova cotação</button></div>
  <p class="muted small">Monte a lista, envie a vários fornecedores, anote os preços que cada um responder e veja o menor preço destacado.</p>
  ${cots.map((c) => {
    const fs = c.fornecedores.map((id) => forn.find((f) => f.id === id)).filter(Boolean);
    const precos = c.precos || {};
    const tot = (fid) => c.itens.reduce((s, it, i) => s + (Number(precos[fid]?.[i]) || 0) * it.qtd, 0);
    return `<div class="card" style="margin-bottom:14px" data-c="${c.id}">
      <div class="barra"><h3 style="margin:0;flex:1">${esc(c.titulo)} <span class="tag ${c.status === "Concluída" ? "ok" : "alerta"}">${c.status}</span></h3><span class="muted small">${fmtTs(c.criadoEm)} · ${esc(c.criadoPor)}</span></div>
      <div class="tabela-wrap"><table><thead><tr><th>Item</th><th>Qtd</th>${fs.map((f) => `<th>${esc(f.nome)}<div class="small muted">preço unit.</div></th>`).join("")}</tr></thead><tbody>
      ${c.itens.map((it, i) => { const vals = fs.map((f) => Number(precos[f.id]?.[i]) || 0).filter((x) => x > 0); const min = vals.length ? Math.min(...vals) : null;
        return `<tr><td>${esc(it.nome)}</td><td>${it.qtd} ${esc(it.medida || "")}</td>${fs.map((f) => { const val = Number(precos[f.id]?.[i]) || ""; return `<td class="${val && val === min ? "melhor" : ""}"><input type="number" step="0.01" min="0" style="width:90px" data-f="${f.id}" data-i="${i}" value="${val}"></td>`; }).join("")}</tr>`; }).join("")}
      <tr><td colspan="2"><b>Total</b></td>${fs.map((f) => `<td><b>${brl(tot(f.id))}</b></td>`).join("")}</tr></tbody></table></div>
      <div class="barra" style="margin-top:8px">${fs.map((f) => `${f.whatsapp ? `<button class="btn small primary" data-wa="${f.id}">WhatsApp ${esc(f.nome)}</button>` : ""}${f.email ? `<button class="btn small" data-em="${f.id}">E-mail ${esc(f.nome)}</button>` : ""}`).join("")}
        <button class="btn small" data-cp="1">Copiar texto</button><span style="flex:1"></span>
        <button class="btn small" data-sv="1">Salvar preços</button>${c.status !== "Concluída" ? `<button class="btn small" data-ok="1">Concluir</button>` : ""}${isMaster() ? `<button class="btn small danger" data-rm="1">Excluir</button>` : ""}</div></div>`;
  }).join("") || `<p class="muted">Nenhuma cotação.</p>`}`;
  $("#novaCot").onclick = () => {
    abrirModal("Nova cotação", `
      <label>Título<input name="titulo" required value="Cotação ${fmtData(hoje())}"></label>
      <label>Produtos cadastrados (segure Ctrl para escolher vários)<select name="prods" multiple size="8">${produtos.map((p) => `<option value="${p.id}" ${!p.naoComprar && total(p.lotesEstoque) <= Number(p.minimo || 0) ? "selected" : ""}>${p.naoComprar ? "🚫 " : ""}${esc(p.nome)} (${total(p.lotesEstoque)}/${p.ideal})</option>`).join("")}</select></label>
      <label>Itens novos, um por linha no formato <i>nome; quantidade</i><textarea name="novos" rows="3" placeholder="Monitor multiparamétrico; 1"></textarea></label>
      <p class="small"><b>Enviar para:</b></p>${forn.map((f) => `<label style="flex-direction:row;gap:6px;align-items:center;margin:2px 0"><input type="checkbox" name="f_${f.id}">${esc(f.nome)} <span class="muted small">(${esc(f.distribuidora)})</span></label>`).join("") || `<p class="muted small">Cadastre fornecedores primeiro.</p>`}`,
    async (f, form) => {
      const sel = [...form.prods.selectedOptions].map((o) => produtos.find((p) => p.id === o.value));
      const itens = sel.map((p) => ({ produtoId: p.id, nome: p.nome, medida: p.medida, qtd: Math.max(1, Number(p.ideal || 0) - total(p.lotesEstoque)) }))
        .concat(f.novos.split("\n").map((l) => l.split(";")).filter((a) => a[0].trim()).map((a) => ({ produtoId: null, nome: a[0].trim(), medida: "", qtd: Number(a[1]) || 1 })));
      const fs = forn.filter((x) => f["f_" + x.id]).map((x) => x.id);
      if (!itens.length) throw new Error("Escolha ao menos um item."); if (!fs.length) throw new Error("Escolha ao menos um fornecedor.");
      await addDoc(collection(db, "cotacoes"), { titulo: f.titulo, itens, fornecedores: fs, precos: {}, status: "Aberta", criadoPor: usuario.nome, criadoEm: serverTimestamp() });
      toast("Cotação criada. Ajuste as quantidades se precisar e envie aos fornecedores.");
    }, "Criar");
  };
  v.querySelectorAll("[data-c]").forEach((card) => {
    const c = cots.find((x) => x.id === card.dataset.c);
    const texto = (f) => `Olá${f ? " " + f.nome : ""}! Gostaríamos de uma cotação para:\n\n${c.itens.map((it) => `• ${it.nome} — ${it.qtd} ${it.medida || ""}`).join("\n")}\n\nPor favor, informe preço unitário, prazo de entrega e condições de pagamento. Obrigado!`;
    card.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return; const f = forn.find((x) => x.id === (b.dataset.wa || b.dataset.em));
      if (b.dataset.wa) window.open(`https://wa.me/${f.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(texto(f))}`, "_blank");
      if (b.dataset.em) location.href = `mailto:${f.email}?subject=${encodeURIComponent("Pedido de cotação - " + c.titulo)}&body=${encodeURIComponent(texto(f))}`;
      if (b.dataset.cp) { await navigator.clipboard.writeText(texto()); toast("Texto copiado."); }
      if (b.dataset.sv || b.dataset.ok) {
        const precos = {}; card.querySelectorAll("input[data-f]").forEach((i) => { (precos[i.dataset.f] ??= {})[i.dataset.i] = Number(i.value) || 0; });
        await updateDoc(doc(db, "cotacoes", c.id), { precos, ...(b.dataset.ok ? { status: "Concluída" } : {}) }); toast("Cotação salva."); render();
      }
      if (b.dataset.rm && confirm("Excluir cotação?")) { await deleteDoc(doc(db, "cotacoes", c.id)); render(); }
    };
  });
}

/* ================= GERADOR DE RELATÓRIOS ================= */
const FONTES = {
  // ordem: solicitações, estoque, setores
  movimentos: { nome: "Movimentações de estoque (entradas, reposições, consumo, limbo)", data: true, soma: "Quantidade",
    async carregar(ini, fim) { const s = await getDocs(query(collection(db, "movimentos"), where("data", ">=", ini), where("data", "<=", fim), orderBy("data", "desc")));
      return s.docs.map((d) => d.data()).map((m) => ({ Data: fmtTs(m.data), Tipo: m.tipo, Produto: m.produtoNome, Quantidade: Number(m.qtd), Validade: fmtData(m.validade), Local: nomeSala(m.local), "Quem repôs": m.responsavel || "", "Lançado por": m.usuarioNome, Obs: m.obs || "" })); } },
  estoqueAtual: { nome: "Posição atual do estoque central", soma: "Quantidade",
    async carregar() { await carregarProdutos(); return produtos.map((p) => ({ Produto: p.nome, Marca: p.marca || "", Distribuidora: p.categoria, Tipo: p.tipo === "consumo" ? "Setor" : "Estoque", Quantidade: total(p.lotesEstoque), Ideal: p.ideal, Mínimo: p.minimo, "Próx. validade": fmtData(proxValidade(p.lotesEstoque)), "Não comprar": p.naoComprar ? "Sim" : "" })); } },
  salasAtual: { nome: "Posição atual das salas", soma: "Quantidade",
    async carregar() { const r = []; for (const s of SALAS) (await getDocs(collection(db, "salas", s.id, "itens"))).forEach((d) => { const it = d.data(); r.push({ Sala: s.nome, Produto: it.nome, Quantidade: total(it.lotes), Ideal: it.ideal, Crítico: it.critico, "Próx. validade": fmtData(proxValidade(it.lotes)), "Última reposição": it.ultimaReposicao ? `${it.ultimaReposicao.por} ${fmtData(it.ultimaReposicao.em)}` : "" }); }); return r; } },
  limbo: { nome: "Limbo (vencidos guardados)", soma: "Quantidade",
    async carregar() { await carregarProdutos(); return produtos.flatMap((p) => (p.lotesLimbo || []).map((l) => ({ Produto: p.nome, Marca: p.marca || "", Quantidade: l.qtd, Validade: fmtData(l.validade), Distribuidora: p.categoria }))); } },
  pendencias: { nome: "Pendências (entradas e retiradas confirmadas/recusadas)", data: true, soma: "Quantidade",
    async carregar(ini, fim) { const s = await getDocs(query(collection(db, "pendencias"), where("criadoEm", ">=", ini), where("criadoEm", "<=", fim), orderBy("criadoEm", "desc")));
      return s.docs.map((d) => d.data()).map((x) => ({ Data: fmtTs(x.criadoEm), Tipo: x.tipo === "entrada" ? "Entrada" : "Retirada", Produto: x.produtoNome, Quantidade: x.qtdConfirmada ?? x.qtd, Destino: x.tipo === "entrada" ? "Estoque central" : nomeSala(x.sala), "Pedido por": x.solicitanteNome, Status: x.status, "Resolvido por": x.resolvidoPor || "", Motivo: x.motivo || "" })); } },
  contagens: { nome: "Contagens dos setores (divergências)", data: true,
    async carregar(ini, fim) { const s = await getDocs(query(collection(db, "contagens"), where("em", ">=", ini), where("em", "<=", fim), orderBy("em", "desc")));
      return s.docs.map((d) => d.data()).flatMap((c) => c.itens.map((i) => ({ Data: fmtTs(c.em), Setor: nomeSala(c.sala), Item: i.nome, "No sistema": i.sistema, Contado: i.contado, Diferença: i.diferenca, "Contado por": c.por }))); } },
  alertas: { nome: "Alertas (quantidade, validade, sem uso)",
    async carregar() { return (await calcAlertas()).map((a) => ({ Local: a.local, Produto: a.nome, Alerta: a.tipo, Detalhe: a.detalhe })); } },
  exames: { nome: "Exames (por profissional, laboratório, convênio, coletas…)", data: true, soma: "Pontos",
    async carregar(ini, fim) { const s = await getDocs(query(collection(db, "exames"), where("criadoEm", ">=", ini), where("criadoEm", "<=", fim), orderBy("criadoEm", "desc")));
      return s.docs.map((d) => d.data()).flatMap((x) => x.exames.map(normEx).map((e) => ({ Data: fmtTs(x.criadoEm), Realização: e.realizadoEm ? new Date(e.realizadoEm).toLocaleString("pt-BR") : "", Paciente: x.paciente, Espécie: x.especie, Tutor: x.tutor, Exame: e.nome, Grupo: e.grupo,
        "Realizado por": e.realizadoPor || "", "Laudo por": e.laudoPor || "", Laboratório: e.laboratorio || "", Pagamento: e.pagamento || x.pagamento || "Particular", Convênio: e.pagamento ? e.convenio || "" : x.convenio || "", Coleta: e.coleta?.status || "", "Coletado por": e.coleta?.por || "", Pontos: e.coleta?.status === "Coletado" ? e.pontos || 1 : 0, Solicitante: x.veterinario, Status: x.status }))); } },
  inventario: { nome: "Inventário / patrimônio", soma: "Valor total",
    async carregar() { return (await getDocs(collection(db, "inventario"))).docs.map((d) => d.data()).map((x) => ({ Item: x.nome, Patrimônio: x.patrimonio || "", Descrição: x.descricao || "", Categoria: x.categoria, Local: x.local, Quantidade: x.qtd, "Valor unit.": x.valorUnit, "Valor total": x.qtd * x.valorUnit, Aquisição: fmtData(x.dataAquisicao), Fornecedor: x.fornecedor || "", NF: x.nf || "", Estado: x.estado, Situação: x.status || "Ativo" })); } },
  solicitacoes: { nome: "Solicitações de reposição", data: true, soma: "Quantidade",
    async carregar(ini, fim) { const s = await getDocs(query(collection(db, "solicitacoes"), where("criadoEm", ">=", ini), where("criadoEm", "<=", fim), orderBy("criadoEm", "desc")));
      return s.docs.map((d) => d.data()).map((x) => ({ Data: fmtTs(x.criadoEm), Produto: x.produtoNome, Novo: x.novo ? "Sim" : "Não", Quantidade: x.qtd, Para: nomeSala(x.sala), Urgência: x.urgencia, Solicitante: x.solicitanteNome, Status: x.status, "Atendido por": x.atendidoPor || "" })); } }
};

async function telaRelatorios(v, preset = "") {
  v.innerHTML = `<div class="card no-print" style="margin-bottom:14px"><h2 style="margin-top:0">Gerador de relatórios</h2>
    <div class="duas"><label>Relatório<select id="rF">${Object.entries(FONTES).map(([k, f]) => `<option value="${k}">${f.nome}</option>`).join("")}</select></label>
    <div class="duas" id="rDatas"><label>De<input type="date" id="rIni" value="${addDias(-30)}"></label><label>Até<input type="date" id="rFim" value="${hoje()}"></label></div></div>
    <div class="duas"><label>Filtrar (contém)<input id="rBusca" placeholder="Ex.: Centro Cirúrgico, Petlove, TECSA, Dra. Paula…"></label>
    <label>Agrupar por (resumo)<select id="rG"></select></label></div>
    <div class="barra"><button class="btn primary" id="rGerar">Gerar relatório</button><button class="btn" id="rCsv">Exportar CSV (Excel)</button><button class="btn" onclick="print()">Imprimir / PDF</button></div></div>
  <div id="rRes"></div>`;
  let linhas = [], cols = [];
  const fonte = () => FONTES[$("#rF").value];
  $("#rF").onchange = () => { $("#rDatas").classList.toggle("hidden", !fonte().data); $("#rG").innerHTML = `<option value="">— sem resumo —</option>`; $("#rRes").innerHTML = ""; };
  if (preset) { $("#rF").value = preset; }
  $("#rF").onchange();
  const gerar = async () => {
    const f = fonte();
    const ini = Timestamp.fromDate(new Date($("#rIni").value + "T00:00:00")), fim = Timestamp.fromDate(new Date($("#rFim").value + "T23:59:59"));
    const todas = await f.carregar(ini, fim);
    cols = todas.length ? Object.keys(todas[0]) : [];
    const gAtual = $("#rG").value;
    $("#rG").innerHTML = `<option value="">— sem resumo —</option>` + cols.filter((c) => !["Data", "Obs", "Detalhe", "Quantidade", "Valor total", "Valor unit."].includes(c)).map((c) => `<option ${c === gAtual ? "selected" : ""}>${c}</option>`).join("");
    const b = $("#rBusca").value.toLowerCase();
    linhas = todas.filter((l) => !b || Object.values(l).join(" ").toLowerCase().includes(b));
    const g = $("#rG").value, campoSoma = f.soma;
    let resumo = "";
    if (g) {
      const m = {}; linhas.forEach((l) => { const k = l[g] || "(vazio)"; m[k] ??= { n: 0, s: 0 }; m[k].n++; m[k].s += Number(l[campoSoma]) || 0; });
      resumo = `<h3>Resumo por ${esc(g)}</h3><table style="margin-bottom:16px"><thead><tr><th>${esc(g)}</th><th>Registros</th>${campoSoma ? `<th>${campoSoma}</th>` : ""}</tr></thead><tbody>
        ${Object.entries(m).sort((a, b) => b[1].n - a[1].n).map(([k, x]) => `<tr><td>${esc(k)}</td><td><b>${x.n}</b></td>${campoSoma ? `<td><b>${campoSoma === "Valor total" ? brl(x.s) : x.s}</b></td>` : ""}</tr>`).join("")}</tbody></table>`;
    }
    const fmt = (c, val) => (["Valor total", "Valor unit."].includes(c) ? brl(val) : esc(val));
    $("#rRes").innerHTML = `<h2>${esc(f.nome)}</h2><p class="muted small">${f.data ? `Período ${fmtData($("#rIni").value)} a ${fmtData($("#rFim").value)} · ` : ""}${linhas.length} registro(s)${b ? ` · filtro "${esc(b)}"` : ""} · gerado em ${new Date().toLocaleString("pt-BR")} por ${esc(usuario.nome)}</p>
      ${resumo}<div class="tabela-wrap"><table><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>
      ${linhas.map((l) => `<tr>${cols.map((c) => `<td>${fmt(c, l[c])}</td>`).join("")}</tr>`).join("") || `<tr><td class="muted">Sem dados.</td></tr>`}</tbody></table></div>`;
  };
  $("#rGerar").onclick = () => gerar().catch((e) => ($("#rRes").innerHTML = `<p class="erro">${esc(e.message)}</p>`));
  $("#rG").onchange = $("#rGerar").onclick;
  $("#rCsv").onclick = () => {
    if (!linhas.length) return toast("Gere o relatório primeiro.");
    const csv = [cols.join(";"), ...linhas.map((l) => cols.map((c) => String(l[c] ?? "").replace(/;/g, ",").replace(/\n/g, " ")).join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `relatorio_${$("#rF").value}_${hoje()}.csv`; a.click();
  };
}

/* ================= CATÁLOGO DE EXAMES ================= */
async function telaCatalogo(v) {
  const cat = (await getDocs(query(collection(db, "catalogoExames"), orderBy("nome")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const custos = isMaster() ? Object.fromEntries((await getDocs(collection(db, "catalogoCustos"))).docs.map((d) => [d.id, d.data().valorLaboratorio])) : {};
  v.innerHTML = `<div class="barra"><h2>Catálogo de exames</h2>
    ${isMaster() && !cat.length ? `<button class="btn" id="seed">Importar sugestão inicial</button>` : ""}
    ${isMaster() ? `<button class="btn" id="impCat">Importar catálogo completo (JSON/CSV)</button><button class="btn" id="impC">Importar lista</button><button class="btn primary" id="novoC">+ Novo exame</button>` : ""}</div>
  <p class="muted small">Cada exame já fica ligado ao laboratório para onde vai. Ao escolher "Perfil renal — VETER" na requisição, ele vai direto para o VETER. Um mesmo exame pode aparecer com dois laboratórios diferentes, se vocês usarem os dois. Os <b>pontos</b> são o que o membro da equipe ganha ao fazer a coleta.</p>
  <table><thead><tr><th>Exame</th><th>Tipo</th><th>Laboratório</th>${isMaster() ? "<th>Valor lab.</th>" : ""}<th>Valor Vet Plus</th><th>Pontos por coleta</th><th>Situação</th><th></th></tr></thead><tbody>
  ${cat.map((c) => `<tr><td><b>${esc(c.nome)}</b></td><td>${esc(c.grupo)}</td><td>${isPrest(c) ? `<span class="muted">feito na clínica</span>` : `<span class="tag neutro">${esc(c.laboratorio)}</span>`}</td>
    ${isMaster() ? `<td>${custos[c.id] != null ? brl(custos[c.id]) : "—"}</td>` : ""}<td>${c.valor ? brl(c.valor) : "—"}</td><td>${isPrest(c) ? "—" : c.pontos ?? 1}</td><td>${c.ativo !== false ? `<span class="tag ok">Ativo</span>` : `<span class="tag neutro">Inativo</span>`}</td>
    <td>${isMaster() ? `<button class="btn small" data-e="${c.id}">Editar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="8" class="muted">Catálogo vazio.</td></tr>`}</tbody></table>`;
  const modal = (c = {}) => abrirModal(c.id ? "Editar exame" : "Novo exame do catálogo", `
    <label>Nome do exame<input name="nome" required value="${esc(c.nome)}" placeholder="Ex.: Perfil renal"></label>
    <div class="duas"><label>Tipo<select name="grupo" id="cGr">${opts(["Laboratorial", "Imagem", "Prestador"], c.grupo)}</select></label>
    <label id="cLabBox">Laboratório<select name="laboratorio">${opts(LABORATORIOS, c.laboratorio)}</select></label></div>
    <div class="duas"><label id="cPtsBox">Pontos por coleta<input type="number" min="0" name="pontos" value="${c.pontos ?? 1}"></label>
    <label>Situação<select name="ativo"><option value="1">Ativo</option><option value="0" ${c.ativo === false ? "selected" : ""}>Inativo</option></select></label></div>`,
    async (f) => { const d = { nome: f.nome.trim(), grupo: f.grupo, laboratorio: f.grupo !== "Laboratorial" ? "" : f.laboratorio, pontos: Number(f.pontos || 0), ativo: f.ativo === "1" };
      c.id ? await updateDoc(doc(db, "catalogoExames", c.id), d) : await addDoc(collection(db, "catalogoExames"), d); catalogoCache = null; toast("Catálogo salvo."); });
  const tg = () => { const img = $("#cGr")?.value !== "Laboratorial"; $("#cLabBox")?.classList.toggle("hidden", img); $("#cPtsBox")?.classList.toggle("hidden", img); };
  $("#novoC") && ($("#novoC").onclick = () => { modal(); $("#cGr").onchange = tg; tg(); });
  v.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => { modal(cat.find((c) => c.id === b.dataset.e)); $("#cGr").onchange = tg; tg(); }));
  $("#impC") && ($("#impC").onclick = () => abrirModal("Importar catálogo de exames", `
    <p class="small">Cole um exame por linha no formato <b>Exame; Laboratório; Pontos</b> (pontos é opcional). Para imagem use <b>Exame; Imagem</b>; para consultas/anestesia de volante use <b>Serviço; Prestador</b>.<br>Dá para colar direto de uma planilha do Excel (colunas separadas por tabulação também funcionam).</p>
    <textarea name="txt" rows="12" placeholder="Perfil renal; VETER; 1&#10;Hemograma completo; TECSA; 1&#10;Ultrassonografia abdominal; Imagem"></textarea>`,
    async (f) => {
      const linhas = f.txt.split("\n").map((l) => l.split(/[;\t]/).map((x) => x.trim())).filter((a) => a[0]);
      if (!linhas.length) throw new Error("Nada para importar.");
      for (const [nome, dest = "", pts] of linhas) { const img = /^(imagem|prestador)$/i.test(dest);
        await addDoc(collection(db, "catalogoExames"), { nome, grupo: img ? (/^p/i.test(dest) ? "Prestador" : "Imagem") : "Laboratorial", laboratorio: img ? "" : dest.toUpperCase(), pontos: Number(pts) || 1, ativo: true }); }
      toast(`${linhas.length} exames importados.`);
    }, "Importar"));
  $("#impCat") && ($("#impCat").onclick = () => abrirModal("Importar catálogo completo", `<p class="small">Escolha o arquivo <b>catalogo_exames.json</b> (ou o .csv). Exames com o mesmo nome e laboratório são atualizados (preço, tubos, prazo); os novos entram. Entra tudo: preço Vet Plus, <b>valor do laboratório (visível só ao Master)</b>, tubos, composição e prazo. Exames antigos (lista sem preço) e exames de imagem fora da lista inicial ficam inativos.</p><label>Arquivo<input type="file" name="arq" accept=".json,.csv" required></label>`,
    async (f, form) => {
      const novos = lerCatalogo(await form.arq.files[0].text()); if (!novos.length) throw new Error("Não encontrei exames no arquivo.");
      const ids = new Set(novos.map((n) => slugId(n.nome, n.laboratorio)));
      for (let i = 0; i < novos.length; i += 200) { const b = writeBatch(db);
        novos.slice(i, i + 200).forEach((n) => { const { custo, ...pub } = n, id = slugId(n.nome, n.laboratorio);
          b.set(doc(db, "catalogoExames", id), pub); b.set(doc(db, "catalogoCustos", id), { nome: n.nome, laboratorio: n.laboratorio, valorLaboratorio: custo || 0 }); }); await b.commit(); }
      const imgIds = new Set(EXAMES_IMAGEM.map((n) => slugId(n, "imagem")));
      const velhos = cat.filter((c) => c.ativo !== false && ((c.grupo === "Laboratorial" && !ids.has(c.id) && !c.tubos) || (isPrest(c) && !imgIds.has(c.id) && !EXAMES_IMAGEM.some((n) => norm(n) === norm(c.nome))))); // lista antiga
      for (let i = 0; i < velhos.length; i += 400) { const b = writeBatch(db); velhos.slice(i, i + 400).forEach((c) => b.update(doc(db, "catalogoExames", c.id), { ativo: false })); await b.commit(); }
      for (const n of EXAMES_IMAGEM) { const ja = cat.find((c) => isPrest(c) && norm(c.nome) === norm(n)); await setDoc(doc(db, "catalogoExames", ja?.id || slugId(n, "imagem")), { nome: n, grupo: "Imagem", laboratorio: "", pontos: 0, ativo: true }, { merge: true }); }
      catalogoCache = null; toast(`${novos.length} exames importados (com valores do laboratório só para o Master)${velhos.length ? `, ${velhos.length} antigos desativados` : ""}. Imagem: ${EXAMES_IMAGEM.join(", ")}.`);
    }, "Importar"));
  $("#seed") && ($("#seed").onclick = async () => {
    for (const [nome, grupo, laboratorio] of CATALOGO_INICIAL) await addDoc(collection(db, "catalogoExames"), { nome, grupo, laboratorio, pontos: 1, ativo: true });
    toast("Sugestão importada. Ajuste os laboratórios se precisar."); render();
  });
}

/* ================= LIMBO (contagem própria) ================= */
async function telaLimbo(v) {
  await carregarProdutos();
  const lista = produtos.filter((p) => total(p.lotesLimbo) > 0);
  v.innerHTML = `<div class="barra"><h2>Limbo</h2><span class="muted small">Produtos vencidos guardados, separados do estoque e das salas.</span></div>
  <div class="grid"><div class="card kpi"><span class="muted">Produtos no limbo</span><b>${lista.length}</b></div><div class="card kpi"><span class="muted">Unidades no limbo</span><b>${lista.reduce((s, p) => s + total(p.lotesLimbo), 0)}</b></div></div>
  <div class="tabela-wrap"><table><thead><tr><th></th><th>Produto</th><th>Quantidade no limbo</th><th>Validades</th><th></th></tr></thead><tbody>
  ${lista.map((p) => `<tr><td>${fotoTag(p)}</td><td><b>${esc(p.nome)}</b><div class="muted small">${esc(p.marca || "")}</div></td><td><b>${total(p.lotesLimbo)}</b> ${esc(p.medida)}</td><td>${lotesHtml(p.lotesLimbo)}</td>
    <td>${podeConfirmar() ? `<button class="btn small" data-l="${p.id}">Movimentar / descartar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="5" class="muted">Limbo vazio.</td></tr>`}</tbody></table></div>`;
  v.querySelectorAll("[data-l]").forEach((b) => (b.onclick = () => modalLimbo(produtos.find((p) => p.id === b.dataset.l))));
}

/* ================= PENDÊNCIAS (confirmação da estoquista) ================= */
async function telaPendencias(v) {
  await carregarProdutos();
  const ps = (await getDocs(query(collection(db, "pendencias"), orderBy("criadoEm", "desc")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const abertas = ps.filter((x) => x.status === "Pendente"), hist = ps.filter((x) => x.status !== "Pendente").slice(0, 30);
  const linha = (x, acoes) => `<tr><td class="small">${fmtTs(x.criadoEm)}</td><td>${x.tipo === "entrada" ? `<span class="tag ok">Entrada</span>` : `<span class="tag alerta">Retirada</span>`}</td>
    <td><b>${esc(x.produtoNome)}</b></td><td>${x.qtd}</td><td>${x.tipo === "entrada" ? "Estoque central · val. " + fmtData(x.validade) : "→ " + esc(nomeSala(x.sala))}</td>
    <td>${esc(x.solicitanteNome)}</td><td class="small">${esc(x.obs || "")}</td><td>${acoes}</td></tr>`;
  v.innerHTML = `<div class="barra"><h2>Pendências de confirmação</h2></div>
  <p class="muted small">Entradas e retiradas lançadas pela equipe só mexem no estoque depois que a estoquista confirma.</p>
  <div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Qtd</th><th>Destino</th><th>Pedido por</th><th>Obs.</th><th></th></tr></thead><tbody>
  ${abertas.map((x) => linha(x, podeConfirmar() ? `<button class="btn small primary" data-ok="${x.id}">Confirmar</button><button class="btn small danger" data-no="${x.id}">Recusar</button>` : `<span class="tag critico">Aguardando</span>`)).join("") || `<tr><td colspan="8" class="muted">Nada pendente. 👍</td></tr>`}</tbody></table></div>
  <h3>Últimas resolvidas</h3><div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th>Produto</th><th>Qtd</th><th>Destino</th><th>Pedido por</th><th>Obs.</th><th>Resultado</th></tr></thead><tbody>
  ${hist.map((x) => linha(x, `<span class="tag ${x.status === "Confirmada" ? "ok" : "neutro"}">${x.status}</span><div class="small muted">${esc(x.resolvidoPor || "")}</div>`)).join("")}</tbody></table></div>`;
  v.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => {
    const x = abertas.find((y) => y.id === b.dataset.ok); const p = produtos.find((y) => y.id === x.produtoId);
    if (!p) return toast("Produto não existe mais.");
    abrirModal(`Confirmar ${x.tipo === "entrada" ? "entrada" : "retirada"} — ${x.produtoNome}`, `
      <p class="muted small">Pedido por ${esc(x.solicitanteNome)}. Em estoque agora: <b>${total(p.lotesEstoque)}</b> ${lotesHtml(p.lotesEstoque)}</p>
      <div class="duas"><label>Quantidade conferida<input type="number" min="1" name="qtd" value="${x.qtd}" required></label>
      ${x.tipo === "entrada" ? `<label>Validade<input type="date" name="validade" value="${esc(x.validade)}" required></label>` : `<label>Setor<select name="sala">${opts(SALAS, x.sala)}</select></label>`}</div>`,
    async (f) => {
      if (x.tipo === "entrada") await darEntrada(p, f.qtd, f.validade, `Confirmado · lançado por ${x.solicitanteNome}${x.obs ? " · " + x.obs : ""}`);
      else await darBaixa(p, f.sala, f.qtd, x.responsavel || x.solicitanteNome, `Confirmado por ${usuario.nome}${x.obs ? " · " + x.obs : ""}`);
      await updateDoc(doc(db, "pendencias", x.id), { status: "Confirmada", qtdConfirmada: Number(f.qtd), resolvidoPor: usuario.nome, resolvidoEm: serverTimestamp() });
      toast("Confirmado e lançado no estoque.");
    }, "Confirmar");
  }));
  v.querySelectorAll("[data-no]").forEach((b) => (b.onclick = () => abrirModal("Recusar lançamento", `<label>Motivo<input name="motivo" required></label>`,
    async (f) => { await updateDoc(doc(db, "pendencias", b.dataset.no), { status: "Recusada", motivo: f.motivo, resolvidoPor: usuario.nome, resolvidoEm: serverTimestamp() }); toast("Recusado."); }, "Recusar")));
}

/* ================= CONTAGEM DO SETOR ================= */
function modalContagem(itens) {
  if (!itens.length) return toast("Este setor ainda não tem itens configurados.");
  abrirModal(`Contagem — ${nomeSala(salaAtual)}`, `
    <p class="muted small">Conte cada item fisicamente e digite o que encontrou. Diferenças são ajustadas e ficam registradas.</p>
    ${regrasContagemHtml(salaAtual)}
    <table class="tab-contagem"><thead><tr><th></th><th>Item</th><th>No sistema</th><th>Contado</th></tr></thead><tbody>
    ${itens.map((it) => `<tr class="${it.controlado ? "linha-ctrl" : ""}"><td>${fotoTag(it.prod || {}).replace('class="foto"', 'class="foto foto-g"')}</td>
      <td><b>${esc(it.nome)}</b>${it.controlado ? ` <span class="tag critico">🔒 contar 1 a 1</span>` : ""}<div class="lotes">${lotesHtml(it.lotes)}</div>
      ${(it.lotes || []).some((l) => vencido(l.validade)) ? `<div class="small" style="color:var(--vermelho)">⚠️ Tem lote vencido: separe para o limbo</div>` : ""}
      ${salaAtual === "geladeira_vacina" ? ordemGeladeira(it.lotes) : ""}</td><td>${total(it.lotes)}</td>
      <td><input type="number" min="0" name="c_${it.id}" style="width:80px" required></td></tr>`).join("")}</tbody></table>
    <label>Observação<input name="obs"></label>`,
  async (f) => {
    const res = [];
    for (const it of itens) {
      const contado = Number(f["c_" + it.id]), sist = total(it.lotes), dif = contado - sist;
      res.push({ produtoId: it.id, nome: it.nome, sistema: sist, contado, diferenca: dif });
      if (!dif) continue;
      await runTransaction(db, async (t) => {
        const ref = doc(db, "salas", salaAtual, "itens", it.id); const d = (await t.get(ref)).data(); let lotes = d.lotes || [];
        if (dif < 0) lotes = retirarFEFO(lotes, -dif).lotes;
        else { const ult = [...lotes].sort((a, b) => b.validade.localeCompare(a.validade))[0]; lotes = addLote(lotes, dif, ult?.validade || addDias(365)); }
        t.update(ref, { lotes });
      });
      await log({ tipo: "ajuste", produtoId: it.id, produtoNome: it.nome, qtd: dif, local: salaAtual, obs: `Contagem: sistema ${sist}, contado ${contado}${f.obs ? " · " + f.obs : ""}` });
    }
    await addDoc(collection(db, "contagens"), { sala: salaAtual, itens: res, divergencias: res.filter((r) => r.diferenca).length, obs: f.obs, por: usuario.nome, em: serverTimestamp() });
    const n = res.filter((r) => r.diferenca).length;
    toast(n ? `Contagem salva com ${n} divergência(s) ajustada(s).` : "Contagem salva. Tudo bateu! ✅");
  }, "Salvar contagem");
}

/* ================= IMPORTAR LISTA DE PRODUTOS ================= */
function modalImportarProdutos() {
  abrirModal("Importar lista de produtos", `
    <p class="small">Cole um produto por linha (pode copiar direto do Excel):<br><b>Nome; Distribuidora; Medida; Marca; Ideal; Mínimo</b><br>
    Distribuidora: ${DISTRIBUIDORAS.map((d) => d.replace("Distribuidora ", "")).join(", ")}. Medida: ${MEDIDAS.join(", ")}.<br>Só o nome é obrigatório. As fotos você coloca depois em cada produto (botão "Buscar foto no Google").</p>
    <textarea name="txt" rows="12" placeholder="Cateter Nº 22 (Azul); hospitalar; Unidade; BD Insyte; 50; 20&#10;Seringa 1 ml; hospitalar; Unidade; ; 200; 50"></textarea>`,
  async (f) => {
    const linhas = f.txt.split("\n").map((l) => l.split(/[;\t]/).map((x) => x.trim())).filter((a) => a[0]);
    if (!linhas.length) throw new Error("Nada para importar.");
    const acha = (lista, t, def) => lista.find((x) => x.toLowerCase().includes((t || "").toLowerCase()) && t) || def;
    await carregarProdutos(); let n = 0, dup = 0;
    for (const [nome, dist, med, marca, ideal, minimo] of linhas) {
      if (produtos.some((p) => p.nome.toLowerCase() === nome.toLowerCase())) { dup++; continue; }
      await addDoc(collection(db, "produtos"), { nome, categoria: acha(DISTRIBUIDORAS, dist, DISTRIBUIDORAS[0]), medida: acha(MEDIDAS, med, "Unidade"), marca: marca || "", tipo: "estoque",
        ideal: Number(ideal) || 0, minimo: Number(minimo) || 0, lotesEstoque: [], lotesLimbo: [], fotoUrl: "", naoComprar: false, criadoEm: serverTimestamp() });
      n++;
    }
    toast(`${n} produto(s) importado(s)${dup ? `, ${dup} já existiam` : ""}.`);
  }, "Importar");
}

/* ================= IA (Gemini) PARA LER QUANTIDADES DA NOTA ================= */
async function interpretarComIA(itens) {
  const prompt = `Você é estoquista de uma clínica veterinária no Brasil. Para cada item de nota fiscal abaixo, descubra quantas UNIDADES individuais vêm em cada unidade comercial vendida.
Exemplos: "SERINGA 1ML CX C/100" vendida em CX -> fator 100, unidade "unidades". "LUVA PROC M CX 100UN" -> fator 100. "SORO FISIOL 500ML" vendido em UN -> fator 1, unidade "frascos". "AGULHA 25X7 C/100" em CX -> 100.
Se não houver indicação de quantidade por embalagem, use fator 1. Sugira também um nome curto e claro em português para o produto.
Responda APENAS um JSON: [{"i": índice, "fator": número, "unidade": "unidades|frascos|ampolas|...", "nome": "nome sugerido", "explicacao": "frase curta"}]
Itens: ${JSON.stringify(itens.map((it) => ({ i: it.i, descricao: it.nome, unidadeComercial: it.unid, quantidade: it.qtd })))}`;
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || r.status);
  return JSON.parse(j.candidates[0].content.parts[0].text);
}

/* ================= ORÇAMENTOS ================= */
// servico: { nome, categoria, especie: "Ambas"|"Canina"|"Felina", porPeso, faixas: [{ de, ate, precos: { PARTICULAR: 300, PETLOVE: 120, ... } }] }
const numBR = (v) => (v === "" || v == null ? null : Number(String(v).includes(",") ? String(v).replace(/\./g, "").replace(",", ".") : v));
async function carregarServicos() { return (await getDocs(query(collection(db, "servicos"), orderBy("nome")))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => s.ativo !== false); }
function faixaDe(sv, peso) {
  if (!sv.porPeso) return sv.faixas?.[0];
  return (sv.faixas || []).find((f) => peso >= Number(f.de) && peso <= Number(f.ate));
}
// Regra: preço da tabela escolhida; se o plano não cobre (sem preço), cobra PARTICULAR e marca "por fora".
function precoServico(sv, tabela, peso) {
  const f = faixaDe(sv, peso);
  if (!f) return { valor: null, aviso: `sem faixa para ${peso} kg` };
  const v = f.precos?.[tabela];
  if (v != null && v !== "") return { valor: Number(v), fonte: tabela, faixa: f };
  const p = f.precos?.PARTICULAR;
  if (tabela !== "PARTICULAR" && p != null && p !== "") return { valor: Number(p), fonte: "PARTICULAR", fora: true, faixa: f };
  return { valor: null, aviso: "sem preço" };
}
const faixaTxt = (sv, f) => (sv.porPeso && f ? `${String(f.de).replace(".", ",")}–${String(f.ate).replace(".", ",")} kg` : "");
const especieOk = (sv, esp) => !sv.especie || sv.especie === "Ambas" || !esp || sv.especie === esp;

/* ---------- Tabela de serviços ---------- */
async function telaServicos(v) {
  const svs = await carregarServicos();
  let busca = "";
  v.innerHTML = `<div class="barra"><h2>Tabela de serviços e preços</h2><input id="sB" placeholder="Buscar serviço…">
    ${isMaster() ? `<button class="btn" id="sImp">Importar planilha</button><button class="btn primary" id="sNovo">+ Novo serviço</button>` : ""}</div>
  <p class="muted small">Cada serviço pode ter preço único ou <b>faixas de peso</b>, e um preço por tabela (${TABELAS_PRECO.join(", ")}). <b>Preço em branco numa tabela de plano = o plano não cobre</b>, e o orçamento cobra esse item como particular, avisando que é "por fora".</p>
  <div class="tabela-wrap"><table><thead><tr><th>Serviço</th><th>Categoria</th><th>Espécie</th><th>Faixa</th>${TABELAS_PRECO.map((t) => `<th>${t}</th>`).join("")}<th></th></tr></thead><tbody id="sTb"></tbody></table></div>`;
  const desenhar = () => {
    $("#sTb").innerHTML = svs.filter((s) => !busca || s.nome.toLowerCase().includes(busca)).flatMap((sv) => (sv.faixas || [{}]).map((f, i) => `<tr>
      ${i === 0 ? `<td rowspan="${sv.faixas?.length || 1}"><b>${esc(sv.nome)}</b></td><td rowspan="${sv.faixas?.length || 1}">${esc(sv.categoria || "")}</td><td rowspan="${sv.faixas?.length || 1}">${esc(sv.especie || "Ambas")}</td>` : ""}
      <td class="small">${sv.porPeso ? faixaTxt(sv, f) : "único"}</td>
      ${TABELAS_PRECO.map((t) => `<td>${f.precos?.[t] != null && f.precos[t] !== "" ? brl(f.precos[t]) : `<span class="muted small">${t === "PARTICULAR" ? "—" : "não cobre"}</span>`}</td>`).join("")}
      ${i === 0 ? `<td rowspan="${sv.faixas?.length || 1}">${isMaster() ? `<button class="btn small" data-e="${sv.id}">Editar</button>` : ""}</td>` : ""}</tr>`)).join("") || `<tr><td colspan="${5 + TABELAS_PRECO.length}" class="muted">Nenhum serviço. Importe sua planilha de preços.</td></tr>`;
  };
  desenhar();
  $("#sB").oninput = (e) => { busca = e.target.value.toLowerCase(); desenhar(); };
  $("#sNovo") && ($("#sNovo").onclick = () => modalServico());
  $("#sImp") && ($("#sImp").onclick = modalImportarServicos);
  $("#sTb").onclick = (e) => { const b = e.target.closest("[data-e]"); if (b) modalServico(svs.find((s) => s.id === b.dataset.e)); };
}

function modalServico(sv = { faixas: [{ de: 0, ate: 999, precos: {} }] }) {
  let faixas = (sv.faixas || []).map((f) => ({ ...f, precos: { ...f.precos } }));
  abrirModal(sv.id ? "Editar serviço" : "Novo serviço", `
    <label>Nome do serviço<input name="nome" required value="${esc(sv.nome)}" placeholder="Ex.: OSH (castração fêmea)"></label>
    <div class="duas"><label>Categoria<select name="categoria">${opts(CATEGORIAS_SERVICO, sv.categoria)}</select></label><label>Espécie<select name="especie">${opts(["Ambas", "Canina", "Felina"], sv.especie)}</select></label></div>
    <label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="porPeso" id="svPeso" ${sv.porPeso ? "checked" : ""}> Preço varia conforme o peso</label>
    <div id="svFx"></div><button type="button" class="btn small" id="svAdd">+ Faixa de peso</button>
    <label>Situação<select name="ativo"><option value="1">Ativo</option><option value="0" ${sv.ativo === false ? "selected" : ""}>Inativo</option></select></label>`,
  async (f) => {
    ler(); const d = { nome: f.nome.trim(), categoria: f.categoria, especie: f.especie, porPeso: !!f.porPeso, ativo: f.ativo === "1",
      faixas: (f.porPeso ? faixas : faixas.slice(0, 1).map((x) => ({ ...x, de: 0, ate: 999 }))).sort((a, b) => a.de - b.de) };
    sv.id ? await updateDoc(doc(db, "servicos", sv.id), d) : await addDoc(collection(db, "servicos"), d); toast("Serviço salvo.");
  });
  function ler() { $("#svFx").querySelectorAll("[data-i]").forEach((r) => { const x = faixas[r.dataset.i]; x.de = numBR(r.querySelector(".fde")?.value) ?? 0; x.ate = numBR(r.querySelector(".fate")?.value) ?? 999;
    TABELAS_PRECO.forEach((t) => { const val = r.querySelector(`[data-t="${t}"]`).value; x.precos[t] = val === "" ? "" : numBR(val); }); }); }
  function desenhar() {
    const pp = $("#svPeso").checked; const lista = pp ? faixas : faixas.slice(0, 1);
    $("#svFx").innerHTML = `<table><thead><tr>${pp ? "<th>De (kg)</th><th>Até (kg)</th>" : ""}${TABELAS_PRECO.map((t) => `<th class="small">${t}</th>`).join("")}${pp ? "<th></th>" : ""}</tr></thead><tbody>
      ${lista.map((x, i) => `<tr data-i="${i}">${pp ? `<td><input class="fde" value="${x.de ?? ""}" style="width:60px"></td><td><input class="fate" value="${x.ate ?? ""}" style="width:60px"></td>` : ""}
        ${TABELAS_PRECO.map((t) => `<td><input data-t="${t}" value="${x.precos?.[t] ?? ""}" style="width:72px" placeholder="${t === "PARTICULAR" ? "R$" : "não cobre"}"></td>`).join("")}
        ${pp ? `<td><button type="button" class="btn small danger" data-rm="${i}">✕</button></td>` : ""}</tr>`).join("")}</tbody></table>`;
    $("#svFx").querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { ler(); faixas.splice(b.dataset.rm, 1); desenhar(); }));
    $("#svAdd").classList.toggle("hidden", !pp);
  }
  $("#svPeso").onchange = () => { ler(); desenhar(); };
  $("#svAdd").onclick = () => { ler(); const ult = faixas[faixas.length - 1]; faixas.push({ de: ult ? Number(ult.ate) + 0.1 : 0, ate: "", precos: {} }); desenhar(); };
  desenhar();
}

function modalImportarServicos() {
  abrirModal("Importar tabela de serviços", `
    <p class="small">Envie uma planilha (.xlsx/.csv) ou cole do Excel com as colunas:<br>
    <b>Serviço · Categoria · Espécie · Peso de · Peso até · ${TABELAS_PRECO.join(" · ")}</b><br>
    Uma linha por faixa de peso (repita o nome do serviço). Sem peso: deixe "Peso de/até" em branco. Preço em branco num plano = não coberto.</p>
    <input type="file" id="svArq" accept=".xlsx,.xls,.csv"><p class="small muted">…ou cole aqui (colunas separadas por TAB ou ;):</p>
    <textarea name="txt" rows="8" placeholder="OSH (castração fêmea)\tCirurgia\tCanina\t0\t10\t900\t450\t300"></textarea>
    <label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="substituir"> Apagar a tabela atual antes de importar</label>`,
  async (f) => {
    let linhas = [];
    const arq = $("#svArq").files[0];
    if (arq) { await carregarXLSX(); const wb = XLSX.read(await arq.arrayBuffer(), { type: "array" }); linhas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }); }
    else linhas = f.txt.split("\n").map((l) => l.split(/\t|;/));
    linhas = linhas.filter((l) => String(l[0] || "").trim() && !/^servi/i.test(norm(l[0])));
    if (!linhas.length) throw new Error("Nada para importar.");
    const grupos = {};
    for (const l of linhas) {
      const [nome, cat, esp, de, ate, ...pr] = l.map((c) => String(c ?? "").trim());
      const g = (grupos[norm(nome)] ??= { nome, categoria: CATEGORIAS_SERVICO.find((c) => norm(c) === norm(cat)) || cat || "Outros", especie: /fel|gat/i.test(esp) ? "Felina" : /can|cão|cao|cach/i.test(esp) ? "Canina" : "Ambas", faixas: [], ativo: true });
      const precos = {}; TABELAS_PRECO.forEach((t, i) => (precos[t] = pr[i] === "" || pr[i] == null ? "" : numBR(pr[i])));
      g.faixas.push({ de: de === "" ? 0 : numBR(de), ate: ate === "" ? 999 : numBR(ate), precos });
    }
    if (f.substituir) for (const d of (await getDocs(collection(db, "servicos"))).docs) await deleteDoc(d.ref);
    for (const g of Object.values(grupos)) { g.porPeso = g.faixas.length > 1 || g.faixas[0].ate < 999; g.faixas.sort((a, b) => a.de - b.de); await addDoc(collection(db, "servicos"), g); }
    toast(`${Object.keys(grupos).length} serviços importados.`);
  }, "Importar");
}

/* ---------- Pacotes (ex.: Castração) ---------- */
async function telaPacotes(v) {
  const [pcs, svs] = await Promise.all([getDocs(query(collection(db, "pacotes"), orderBy("nome"))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))), carregarServicos()]);
  v.innerHTML = `<div class="barra"><h2>Pacotes de orçamento</h2>${isMaster() ? `<button class="btn primary" id="pkNovo">+ Novo pacote</button>` : ""}</div>
  <p class="muted small">Um pacote é a lista de serviços de um procedimento (ex.: Castração = consulta pré, exames pré, anestesia, cirurgia, medicação). No orçamento você escolhe o pacote e a tabela (Petlove, Social, Particular…), e os preços saem pelo peso do pet.</p>
  <table><thead><tr><th>Pacote</th><th>Serviços</th><th></th></tr></thead><tbody>
  ${pcs.map((p) => `<tr><td><b>${esc(p.nome)}</b></td><td class="small">${p.itens.map((i) => `${i.qtd > 1 ? i.qtd + "× " : ""}${esc(svs.find((s) => s.id === i.servicoId)?.nome || "(removido)")}`).join(" · ")}</td>
    <td>${isMaster() ? `<button class="btn small" data-e="${p.id}">Editar</button><button class="btn small danger" data-x="${p.id}">Excluir</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">Nenhum pacote.</td></tr>`}</tbody></table>`;
  const modal = (p = { itens: [] }) => {
    let itens = p.itens.map((i) => ({ ...i }));
    abrirModal(p.id ? "Editar pacote" : "Novo pacote", `<label>Nome<input name="nome" required value="${esc(p.nome)}" placeholder="Ex.: Castração"></label>
      <label>Adicionar serviço<input list="dlSv" id="pkAdd" placeholder="Digite o serviço…"></label><datalist id="dlSv">${svs.map((s) => `<option value="${esc(s.nome)}">`).join("")}</datalist><div id="pkIt"></div>`,
    async (f) => { if (!itens.length) throw new Error("Adicione serviços."); const d = { nome: f.nome.trim(), itens };
      p.id ? await updateDoc(doc(db, "pacotes", p.id), d) : await addDoc(collection(db, "pacotes"), d); toast("Pacote salvo."); });
    const des = () => { $("#pkIt").innerHTML = `<table>${itens.map((i, k) => `<tr><td>${esc(svs.find((s) => s.id === i.servicoId)?.nome || "?")}</td><td><input type="number" min="1" value="${i.qtd}" data-q="${k}" style="width:60px"></td><td><button type="button" class="btn small danger" data-r="${k}">✕</button></td></tr>`).join("")}</table>`;
      $("#pkIt").querySelectorAll("[data-q]").forEach((x) => (x.onchange = () => (itens[x.dataset.q].qtd = Number(x.value) || 1)));
      $("#pkIt").querySelectorAll("[data-r]").forEach((x) => (x.onclick = () => { itens.splice(x.dataset.r, 1); des(); })); };
    $("#pkAdd").onchange = (e) => { const s = svs.find((s) => s.nome === e.target.value); if (s) { itens.push({ servicoId: s.id, qtd: 1 }); e.target.value = ""; des(); } };
    des();
  };
  $("#pkNovo") && ($("#pkNovo").onclick = () => modal());
  v.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => modal(pcs.find((p) => p.id === b.dataset.e))));
  v.querySelectorAll("[data-x]").forEach((b) => (b.onclick = async () => { if (confirm("Excluir pacote?")) { await deleteDoc(doc(db, "pacotes", b.dataset.x)); render(); } }));
}

/* ---------- Novo orçamento ---------- */
let orcRascunho = null;
async function telaOrcamento(v) {
  const [svs, pcs] = await Promise.all([carregarServicos(), getDocs(collection(db, "pacotes")).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() })))]);
  if (!svs.length) return (v.innerHTML = `<p>Cadastre ou importe a <a href="#servicos">Tabela de serviços</a> primeiro.</p>`);
  const o = orcRascunho || (orcRascunho = { pet: "", tutor: "", telefone: "", especie: "Canina", raca: "", idade: "", peso: "", titulo: "", tabelas: ["PARTICULAR"], itens: [], desconto: "", obs: "" });
  v.innerHTML = `<div class="barra"><h2>Novo orçamento</h2><button class="btn" id="oLimpar">Limpar</button></div>
  <div class="grid" style="grid-template-columns:1fr 1.4fr;align-items:start">
  <div class="card">
    <div class="duas"><label>Nome e sobrenome do pet<input id="oPet" value="${esc(o.pet)}"></label><label>Nome e sobrenome do tutor<input id="oTutor" value="${esc(o.tutor)}"></label></div>
    <div class="duas"><label>Telefone do tutor<input id="oTel" value="${esc(o.telefone)}"></label><label>Espécie<select id="oEsp">${opts(["Canina", "Felina", "Outra"], o.especie)}</select></label></div>
    <div class="duas"><label>Raça<input id="oRaca" value="${esc(o.raca)}"></label><label>Idade<input id="oIdade" value="${esc(o.idade)}"></label></div>
    <label>Peso (kg) — define as faixas de preço<input id="oPeso" value="${esc(o.peso)}" placeholder="Ex.: 12,5" style="font-size:1.1rem;font-weight:700"></label>
    <label>Pacote<select id="oPac"><option value="">— escolher pacote —</option>${pcs.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></label>
    <p class="small"><b>Tabela(s) de preço</b> — marque mais de uma para um <b>orçamento comparativo</b>:</p>
    <div class="barra">${TABELAS_PRECO.map((t) => `<label style="flex-direction:row;gap:4px;margin:0"><input type="checkbox" class="oTab" value="${t}" ${o.tabelas.includes(t) ? "checked" : ""}>${t}</label>`).join("")}</div>
    <label>Nome do orçamento<input id="oTit" value="${esc(o.titulo)}" placeholder="Ex.: Orçamento de castração — plano Petlove"></label>
    <label>Adicionar serviço avulso<input list="dlSv2" id="oAdd" placeholder="Digite o serviço…"></label><datalist id="dlSv2">${svs.map((s) => `<option value="${esc(s.nome)}">`).join("")}</datalist>
    <div class="duas"><label>Desconto (R$)<input id="oDesc" value="${esc(o.desconto)}"></label><label>Observações no PDF<input id="oObs" value="${esc(o.obs)}"></label></div>
  </div>
  <div><div id="oPrev"></div>
    <div class="acoes"><button class="btn primary" id="oGerar">💾 Salvar e gerar PDF</button></div></div></div>`;
  const ids = { pet: "#oPet", tutor: "#oTutor", telefone: "#oTel", especie: "#oEsp", raca: "#oRaca", idade: "#oIdade", peso: "#oPeso", titulo: "#oTit", desconto: "#oDesc", obs: "#oObs" };
  const sync = () => { Object.entries(ids).forEach(([k, s]) => (o[k] = $(s).value)); o.tabelas = [...v.querySelectorAll(".oTab:checked")].map((c) => c.value);
    if (!o.titulo || o._autoTit) { const pac = pcs.find((p) => p.id === o.pacoteId); o.titulo = pac ? `Orçamento de ${pac.nome.toLowerCase()} — ${o.tabelas.length > 1 ? "comparativo " + o.tabelas.join(" × ") : o.tabelas[0] === "PARTICULAR" ? "particular" : o.tabelas[0] === "SOCIAL" ? "social" : "plano " + o.tabelas[0]}` : o.titulo; o._autoTit = !!pac; $("#oTit").value = o.titulo; } };
  const calc = () => calcularOrcamento(o, svs);
  const prev = () => {
    sync(); const r = calc(); const comp = o.tabelas.length > 1;
    $("#oPrev").innerHTML = `<div class="card"><h3 style="margin-top:0">${esc(o.titulo || "Orçamento")}</h3>
      ${!numBR(o.peso) ? `<p class="erro">Informe o peso para calcular as faixas.</p>` : ""}
      <table><thead><tr><th>Serviço</th><th>Qtd</th>${o.tabelas.map((t) => `<th>${t}</th>`).join("")}<th></th></tr></thead><tbody>
      ${r.linhas.map((l, k) => `<tr><td>${esc(l.nome)}${l.faixa ? `<div class="muted small">${l.faixa}</div>` : ""}${l.ignorado ? `<div class="small" style="color:var(--amarelo)">não se aplica a ${esc(o.especie)}</div>` : ""}</td>
        <td><input type="number" min="1" value="${l.qtd}" data-q="${k}" style="width:55px"></td>
        ${o.tabelas.map((t) => { const c = l.col[t]; return `<td>${c.valor == null ? `<span class="erro small">${c.aviso || "—"}</span>` : brl(c.valor * l.qtd)}${c.fora ? `<div class="tag alerta" title="Não coberto pelo plano">por fora · particular</div>` : ""}</td>`; }).join("")}
        <td><button class="btn small danger" data-r="${k}">✕</button></td></tr>`).join("") || `<tr><td colspan="${3 + o.tabelas.length}" class="muted">Escolha um pacote ou adicione serviços.</td></tr>`}
      </tbody><tfoot>
        ${o.tabelas.some((t) => r.tot[t].fora) ? `<tr><td colspan="2" class="small">· coberto pelo plano / tabela<br>· por fora (particular)</td>${o.tabelas.map((t) => `<td class="small">${brl(r.tot[t].plano)}<br>${brl(r.tot[t].fora)}</td>`).join("")}<td></td></tr>` : ""}
        ${numBR(o.desconto) ? `<tr><td colspan="2">Desconto</td>${o.tabelas.map(() => `<td>- ${brl(numBR(o.desconto))}</td>`).join("")}<td></td></tr>` : ""}
        <tr><td colspan="2"><b>TOTAL</b></td>${o.tabelas.map((t) => `<td><b style="font-size:1.1rem">${brl(r.tot[t].total)}</b></td>`).join("")}<td></td></tr>
        ${comp ? `<tr><td colspan="2" class="small">Mais em conta</td>${o.tabelas.map((t) => `<td>${t === r.melhor ? `<span class="tag ok">✓ melhor opção</span>` : `<span class="small muted">+ ${brl(r.tot[t].total - r.tot[r.melhor].total)}</span>`}</td>`).join("")}<td></td></tr>` : ""}
      </tfoot></table><p class="muted small">Válido por ${VALIDADE_ORCAMENTO_DIAS} dias · até ${fmtData(addDias(VALIDADE_ORCAMENTO_DIAS))}</p></div>`;
    $("#oPrev").querySelectorAll("[data-q]").forEach((x) => (x.onchange = () => { o.itens[x.dataset.q].qtd = Number(x.value) || 1; prev(); }));
    $("#oPrev").querySelectorAll("[data-r]").forEach((x) => (x.onclick = () => { o.itens.splice(x.dataset.r, 1); prev(); }));
  };
  v.querySelectorAll("input,select").forEach((el) => el.id !== "oAdd" && el.id !== "oPac" && el.addEventListener("change", prev));
  $("#oTit").addEventListener("input", () => (o._autoTit = false));
  $("#oPac").onchange = (e) => { const p = pcs.find((p) => p.id === e.target.value); if (!p) return; o.pacoteId = p.id; o._autoTit = true; o.titulo = ""; o.itens = p.itens.map((i) => ({ ...i })); prev(); };
  $("#oAdd").onchange = (e) => { const s = svs.find((s) => s.nome === e.target.value); if (s) { o.itens.push({ servicoId: s.id, qtd: 1 }); e.target.value = ""; prev(); } };
  $("#oLimpar").onclick = () => { orcRascunho = null; render(); };
  $("#oGerar").onclick = async () => {
    sync(); const r = calc();
    if (!o.pet.trim() || !o.tutor.trim()) return toast("Informe o nome do pet e do tutor.");
    if (!numBR(o.peso)) return toast("Informe o peso.");
    if (!o.tabelas.length) return toast("Marque ao menos uma tabela.");
    if (!r.linhas.filter((l) => !l.ignorado).length) return toast("Adicione serviços.");
    if (r.linhas.some((l) => !l.ignorado && o.tabelas.some((t) => l.col[t].valor == null))) return toast("Há serviço sem preço/faixa para este peso. Ajuste a tabela de serviços.");
    const dados = { pet: o.pet.trim(), tutor: o.tutor.trim(), telefone: o.telefone, especie: o.especie, raca: o.raca, idade: o.idade, peso: numBR(o.peso), titulo: o.titulo || "Orçamento",
      tabelas: o.tabelas, comparativo: o.tabelas.length > 1, desconto: numBR(o.desconto) || 0, obs: o.obs,
      linhas: r.linhas.filter((l) => !l.ignorado).map((l) => ({ nome: l.nome, categoria: l.categoria, faixa: l.faixa, qtd: l.qtd, col: Object.fromEntries(o.tabelas.map((t) => [t, { unit: l.col[t].valor, total: l.col[t].valor * l.qtd, fora: !!l.col[t].fora }])) })),
      totais: r.tot, melhor: r.melhor, emitidoEm: hoje(), validoAte: addDias(VALIDADE_ORCAMENTO_DIAS), criadoPor: usuario.nome, criadoEm: serverTimestamp() };
    const s = await getDocs(collection(db, "orcamentos")); dados.numero = `${new Date().getFullYear()}-${String(s.size + 1).padStart(4, "0")}`;
    await addDoc(collection(db, "orcamentos"), dados);
    await gerarPdfOrcamento(dados); toast(`Orçamento ${dados.numero} salvo.`); orcRascunho = null; location.hash = "#orcamentos";
  };
  prev();
}

function calcularOrcamento(o, svs) {
  const peso = numBR(o.peso) || 0;
  const linhas = o.itens.map((i) => { const sv = svs.find((s) => s.id === i.servicoId); if (!sv) return null;
    const col = Object.fromEntries(o.tabelas.map((t) => [t, precoServico(sv, t, peso)]));
    const f = faixaDe(sv, peso);
    return { nome: sv.nome, categoria: sv.categoria, qtd: i.qtd || 1, faixa: faixaTxt(sv, f), ignorado: !especieOk(sv, o.especie), col }; }).filter(Boolean);
  const tot = Object.fromEntries(o.tabelas.map((t) => { let plano = 0, fora = 0;
    linhas.filter((l) => !l.ignorado).forEach((l) => { const c = l.col[t]; if (c.valor == null) return; (c.fora ? (fora += c.valor * l.qtd) : (plano += c.valor * l.qtd)); });
    return [t, { plano, fora, total: Math.max(0, plano + fora - (numBR(o.desconto) || 0)) }]; }));
  const melhor = o.tabelas.slice().sort((a, b) => tot[a].total - tot[b].total)[0];
  return { linhas, tot, melhor };
}

/* ---------- PDF ---------- */
async function carregarJsPDF() {
  if (window.jspdf?.jsPDF?.API?.autoTable) return true;
  const load = (src) => new Promise((ok, err) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = err; document.head.appendChild(s); });
  try { if (!window.jspdf) await load("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"); await load("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"); return true; }
  catch { return false; }
}
async function gerarPdfOrcamento(o) {
  const nomeArq = `Orcamento_${o.numero}_${o.pet.replace(/\s+/g, "_")}.pdf`;
  if (!(await carregarJsPDF())) return imprimirOrcamentoHtml(o); // sem internet p/ biblioteca: usa impressão (Salvar como PDF)
  const { jsPDF } = window.jspdf; const d = new jsPDF({ unit: "mm", format: "a4" });
  const azul = [21, 101, 192], W = 210;
  d.setFillColor(...azul); d.rect(0, 0, W, 26, "F"); d.setTextColor(255); d.setFontSize(16); d.setFont(undefined, "bold"); d.text(CLINICA.nome, 14, 12);
  d.setFontSize(9); d.setFont(undefined, "normal"); d.text(`${CLINICA.endereco} · ${CLINICA.telefone}`, 14, 19);
  d.setFontSize(10); d.text(`Orçamento nº ${o.numero}`, W - 14, 12, { align: "right" }); d.text(`Emitido em ${fmtData(o.emitidoEm)}`, W - 14, 19, { align: "right" });
  d.setTextColor(13, 60, 120); d.setFontSize(14); d.setFont(undefined, "bold"); d.text(o.titulo, 14, 36);
  d.setTextColor(40); d.setFontSize(10); d.setFont(undefined, "normal");
  d.autoTable({ startY: 40, theme: "plain", styles: { fontSize: 10, cellPadding: 1.2 }, body: [
    [`Pet: ${o.pet}`, `Tutor: ${o.tutor}${o.telefone ? " · " + o.telefone : ""}`],
    [`Espécie: ${o.especie}${o.raca ? " · Raça: " + o.raca : ""}`, `Idade: ${o.idade || "—"} · Peso: ${String(o.peso).replace(".", ",")} kg`]] });
  const comp = o.tabelas.length > 1;
  const head = [["Serviço", "Qtd", ...o.tabelas.map((t) => (comp ? t : "Valor"))]];
  const body = o.linhas.map((l) => [l.nome + (l.faixa ? `\n(${l.faixa})` : ""), l.qtd, ...o.tabelas.map((t) => brl(l.col[t].total) + (l.col[t].fora ? "\n* particular" : ""))]);
  const foot = [];
  if (o.tabelas.some((t) => o.totais[t].fora)) foot.push(["Coberto pela tabela / plano", "", ...o.tabelas.map((t) => brl(o.totais[t].plano))], ["* Por fora (particular, não coberto)", "", ...o.tabelas.map((t) => brl(o.totais[t].fora))]);
  if (o.desconto) foot.push(["Desconto", "", ...o.tabelas.map(() => "- " + brl(o.desconto))]);
  foot.push(["TOTAL", "", ...o.tabelas.map((t) => brl(o.totais[t].total))]);
  d.autoTable({ startY: d.lastAutoTable.finalY + 4, head, body, foot, theme: "grid", headStyles: { fillColor: azul }, footStyles: { fillColor: [227, 240, 252], textColor: [13, 60, 120], fontStyle: "bold" },
    styles: { fontSize: 9, cellPadding: 2 }, columnStyles: { 1: { halign: "center", cellWidth: 12 }, ...Object.fromEntries(o.tabelas.map((_, i) => [i + 2, { halign: "right" }])) } });
  let y = d.lastAutoTable.finalY + 8;
  if (comp) { d.setFont(undefined, "bold"); d.setTextColor(31, 157, 85); d.text(`Opção mais em conta: ${o.melhor} (${brl(o.totais[o.melhor].total)})`, 14, y); y += 7; d.setFont(undefined, "normal"); d.setTextColor(40); }
  if (o.linhas.some((l) => o.tabelas.some((t) => l.col[t].fora))) { d.setFontSize(8.5); d.text("* Serviços não cobertos pelo plano de saúde são cobrados como particular.", 14, y); y += 6; }
  if (o.obs) { d.setFontSize(9.5); d.text(d.splitTextToSize("Observações: " + o.obs, W - 28), 14, y); y += 10; }
  d.setFillColor(253, 243, 220); d.roundedRect(14, y, W - 28, 12, 2, 2, "F"); d.setTextColor(120, 80, 0); d.setFontSize(10); d.setFont(undefined, "bold");
  d.text(`Orçamento válido por ${VALIDADE_ORCAMENTO_DIAS} dias — até ${fmtData(o.validoAte)}`, W / 2, y + 7.5, { align: "center" });
  d.setFont(undefined, "normal"); d.setFontSize(8); d.setTextColor(120);
  d.text("Valores sujeitos a alteração conforme avaliação clínica, intercorrências e materiais utilizados.", W / 2, 285, { align: "center" });
  d.text(`Emitido por ${o.criadoPor}`, W / 2, 290, { align: "center" });
  d.save(nomeArq);
}
function imprimirOrcamentoHtml(o) {
  docImpressao(`<div class="cab"><b>${esc(CLINICA.nome)}</b><br><small>${esc(CLINICA.endereco)} · ${esc(CLINICA.telefone)}</small></div><h1>${esc(o.titulo)}</h1>
    <p>Nº ${esc(o.numero)} · ${fmtData(o.emitidoEm)}<br><b>Pet:</b> ${esc(o.pet)} · <b>Tutor:</b> ${esc(o.tutor)}<br>${esc(o.especie)} ${esc(o.raca || "")} · ${esc(o.idade || "")} · ${o.peso} kg</p>
    <table><tr><th align="left">Serviço</th><th>Qtd</th>${o.tabelas.map((t) => `<th align="right">${t}</th>`).join("")}</tr>
    ${o.linhas.map((l) => `<tr><td>${esc(l.nome)} <small>${esc(l.faixa || "")}</small></td><td align="center">${l.qtd}</td>${o.tabelas.map((t) => `<td align="right">${brl(l.col[t].total)}${l.col[t].fora ? "*" : ""}</td>`).join("")}</tr>`).join("")}
    <tr><td><b>TOTAL</b></td><td></td>${o.tabelas.map((t) => `<td align="right"><b>${brl(o.totais[t].total)}</b></td>`).join("")}</tr></table>
    <p><small>* não coberto pelo plano, cobrado como particular.</small></p><p><b>Válido até ${fmtData(o.validoAte)}.</b></p>`, "a4", "Orçamento " + o.numero);
}

/* ---------- Emitidos ---------- */
async function telaOrcamentos(v) {
  const os = (await getDocs(query(collection(db, "orcamentos"), orderBy("criadoEm", "desc")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  let busca = "";
  v.innerHTML = `<div class="barra"><h2>Orçamentos emitidos</h2><input id="obB" placeholder="Buscar pet, tutor, título…"><a class="btn primary" href="#orcamento">+ Novo orçamento</a></div>
  <div class="tabela-wrap"><table><thead><tr><th>Nº</th><th>Emissão</th><th>Pet / tutor</th><th>Orçamento</th><th>Peso</th><th>Total</th><th>Validade</th><th>Por</th><th></th></tr></thead><tbody id="obTb"></tbody></table></div>`;
  const des = () => { $("#obTb").innerHTML = os.filter((o) => !busca || `${o.pet} ${o.tutor} ${o.titulo}`.toLowerCase().includes(busca)).map((o) => `<tr>
    <td>${esc(o.numero)}</td><td>${fmtData(o.emitidoEm)}</td><td><b>${esc(o.pet)}</b><div class="muted small">${esc(o.tutor)}</div></td><td>${esc(o.titulo)}</td><td>${String(o.peso).replace(".", ",")} kg</td>
    <td class="small">${o.tabelas.map((t) => `${o.comparativo ? t + ": " : ""}<b>${brl(o.totais[t].total)}</b>`).join("<br>")}</td>
    <td>${o.validoAte >= hoje() ? `<span class="tag ok">até ${fmtData(o.validoAte)}</span>` : `<span class="tag neutro">vencido</span>`}</td><td class="small">${esc(o.criadoPor)}</td>
    <td class="acoes-linha"><button class="btn small" data-pdf="${o.id}">PDF</button><button class="btn small" data-dup="${o.id}">Refazer</button>${isMaster() ? `<button class="btn small danger" data-x="${o.id}">Excluir</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="9" class="muted">Nenhum orçamento.</td></tr>`; };
  des(); $("#obB").oninput = (e) => { busca = e.target.value.toLowerCase(); des(); };
  $("#obTb").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return; const o = os.find((x) => x.id === Object.values(b.dataset)[0]);
    if (b.dataset.pdf) gerarPdfOrcamento(o);
    if (b.dataset.dup) { // refaz com preços atuais e nova validade
      const svs = await carregarServicos();
      orcRascunho = { pet: o.pet, tutor: o.tutor, telefone: o.telefone, especie: o.especie, raca: o.raca, idade: o.idade, peso: String(o.peso).replace(".", ","), titulo: o.titulo, tabelas: o.tabelas,
        itens: o.linhas.map((l) => ({ servicoId: svs.find((s) => s.nome === l.nome)?.id, qtd: l.qtd })).filter((i) => i.servicoId), desconto: o.desconto || "", obs: o.obs || "" };
      location.hash = "#orcamento";
    }
    if (b.dataset.x && confirm("Excluir orçamento?")) { await deleteDoc(doc(db, "orcamentos", o.id)); render(); }
  };
}

/* ================= 7 · VACINAS: PETS, TUTORES E PORTAL ================= */
const soDig = (t) => String(t || "").replace(/\D/g, "");
const fmtCpf = (c) => soDig(c).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
function cpfValido(c) { c = soDig(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  for (const t of [9, 10]) { let s = 0; for (let i = 0; i < t; i++) s += c[i] * (t + 1 - i); if (((s * 10) % 11) % 10 != c[t]) return false; } return true; }
async function sha256(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }
const waLink = (tel, txt) => `https://wa.me/${(soDig(tel).length <= 11 ? "55" : "") + soDig(tel)}?text=${encodeURIComponent(txt)}`;
const idadeDe = (nasc) => { if (!nasc) return ""; const m = Math.floor((Date.now() - new Date(nasc)) / (30.44 * 864e5)); return m < 12 ? `${m} meses` : `${Math.floor(m / 12)} ano(s)`; };
async function carregarPets() { return (await getDocs(query(collection(db, "pets"), orderBy("nome")))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.ativo !== false); }
async function carregarVacinacoes() { return (await getDocs(collection(db, "vacinacoes"))).docs.map((d) => ({ id: d.id, ...d.data() })); }

// Situação de cada (pet, vacina): última dose aplicada, próxima dose e agendamentos
function situacaoVacinas(pets, vacs) {
  const linhas = [];
  for (const p of pets) {
    const doPet = vacs.filter((v) => v.petId === p.id);
    for (const nome of [...new Set(doPet.map((v) => v.vacina))]) {
      const ds = doPet.filter((v) => v.vacina === nome);
      const ult = ds.filter((v) => v.status === "Aplicada").sort((a, b) => b.data.localeCompare(a.data))[0];
      const ag = ds.filter((v) => v.status === "Agendada").sort((a, b) => a.data.localeCompare(b.data))[0];
      const faltou = ds.filter((v) => v.status === "Faltou").sort((a, b) => b.data.localeCompare(a.data))[0];
      const prox = ag?.data || ult?.proximaDose || "";
      let st = "Em dia";
      if ((ag && ag.data < hoje()) || (faltou && (!ult || faltou.data > ult.data))) st = "Não veio";
      else if (prox && prox < hoje()) st = "Atrasado";
      else if (prox && prox <= addDias(DIAS_A_VENCER)) st = "A vencer";
      linhas.push({ p, vacina: nome, ult, ag, prox, st, diasAtraso: prox && prox < hoje() ? Math.round((new Date(hoje()) - new Date(prox)) / 864e5) : 0 });
    }
  }
  return linhas;
}
const corSt = { "Em dia": "ok", "A vencer": "alerta", "Atrasado": "critico", "Não veio": "critico" };
const msgVacina = (l) => `Olá, ${l.p.tutorNome?.split(" ")[0] || ""}! Aqui é da ${CLINICA.nome} 🐾\n${l.st === "A vencer" ? `A vacina *${l.vacina}* do(a) *${l.p.nome}* vence em ${fmtData(l.prox)}.` : `A vacina *${l.vacina}* do(a) *${l.p.nome}* está ${l.st === "Não veio" ? "pendente (o agendamento não foi realizado)" : `atrasada desde ${fmtData(l.prox)}`}.`}\nVamos agendar? É só responder esta mensagem. 💉`;

let vacF = { st: "Atrasado", vacina: "", busca: "" };
async function telaVacinas(v) {
  const [pets, vacs] = await Promise.all([carregarPets(), carregarVacinacoes()]);
  const todas = situacaoVacinas(pets, vacs);
  const nomes = [...new Set([...VACINAS.map((x) => x.nome), ...todas.map((l) => l.vacina)])];
  v.innerHTML = `<div class="barra"><h2>Situação das vacinas</h2>
    <input id="vB" placeholder="Buscar pet ou tutor…" value="${esc(vacF.busca)}">
    <select id="vVac"><option value="">Todas as vacinas</option>${opts(nomes, vacF.vacina)}</select>
    <button class="btn" id="vGrupo">📋 Texto para o grupo</button><button class="btn" id="vCsv">Exportar contatos</button></div>
  <div class="grid">${["Em dia", "A vencer", "Atrasado", "Não veio"].map((st) => `<div class="card kpi" data-st="${st}" style="cursor:pointer;${vacF.st === st ? "outline:3px solid var(--azul)" : ""}"><span class="muted">${st}${st === "A vencer" ? ` (≤${DIAS_A_VENCER} dias)` : ""}</span><b style="color:var(--${{ "Em dia": "verde", "A vencer": "amarelo", Atrasado: "vermelho", "Não veio": "vermelho" }[st]})">${todas.filter((l) => l.st === st && (!vacF.vacina || l.vacina === vacF.vacina)).length}</b></div>`).join("")}
    <div class="card kpi" data-st="" style="cursor:pointer;${!vacF.st ? "outline:3px solid var(--azul)" : ""}"><span class="muted">Todos</span><b>${todas.length}</b></div></div>
  <div class="tabela-wrap"><table><thead><tr><th>Pet</th><th>Tutor / telefone</th><th>Vacina</th><th>Última dose</th><th>Próxima dose</th><th>Situação</th><th></th></tr></thead><tbody id="vTb"></tbody></table></div>`;
  let vis = [];
  const des = () => { const b = vacF.busca.toLowerCase();
    vis = todas.filter((l) => (!vacF.st || l.st === vacF.st) && (!vacF.vacina || l.vacina === vacF.vacina) && (!b || `${l.p.nome} ${l.p.tutorNome}`.toLowerCase().includes(b))).sort((a, b) => (a.prox || "").localeCompare(b.prox || ""));
    $("#vTb").innerHTML = vis.map((l, i) => `<tr><td><b>${esc(l.p.nome)}</b><div class="muted small">${esc(l.p.especie || "")} ${esc(l.p.raca || "")}</div></td>
      <td>${esc(l.p.tutorNome || "")}<div class="muted small">${esc(l.p.telefone || "")}</div></td><td>${esc(l.vacina)}</td>
      <td>${l.ult ? fmtData(l.ult.data) : "—"}</td><td>${l.prox ? fmtData(l.prox) : "—"}${l.ag ? ` <span class="tag neutro">agendada</span>` : ""}</td>
      <td><span class="tag ${corSt[l.st]}">${l.st}${l.diasAtraso ? ` · ${l.diasAtraso}d` : ""}</span></td>
      <td class="acoes-linha">${l.p.telefone && l.st !== "Em dia" ? `<a class="btn small primary" target="_blank" href="${waLink(l.p.telefone, msgVacina(l))}">WhatsApp</a>` : ""}
        <button class="btn small" data-ap="${i}">Aplicar</button><button class="btn small" data-ag="${i}">Agendar</button>${l.ag ? `<button class="btn small" data-fa="${i}">Faltou</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Ninguém nesta situação. 👍</td></tr>`; };
  des();
  v.querySelectorAll("[data-st]").forEach((c) => (c.onclick = () => { vacF.st = c.dataset.st; render(); }));
  $("#vVac").onchange = (e) => { vacF.vacina = e.target.value; render(); };
  $("#vB").oninput = (e) => { vacF.busca = e.target.value; des(); };
  $("#vTb").onclick = async (e) => { const b = e.target.closest("button"); if (!b) return; const l = vis[Object.values(b.dataset)[0]];
    if (b.dataset.ap) modalVacina(l.p, { vacina: l.vacina, agendamento: l.ag });
    if (b.dataset.ag) modalAgendarVacina(l.p, l.vacina, l.prox);
    if (b.dataset.fa) { await updateDoc(doc(db, "vacinacoes", l.ag.id), { status: "Faltou", atualizadoPor: usuario.nome }); toast("Marcado: não veio."); render(); } };
  $("#vGrupo").onclick = () => {
    const por = {}; vis.forEach((l) => (por[l.vacina] ??= []).push(l));
    const txt = Object.entries(por).map(([vac, ls]) => `💉 *${vac}* — ${vacF.st || "lista"}\n${ls.map((l) => `• ${l.p.nome} (${l.p.tutorNome?.split(" ")[0] || ""})${l.prox ? " – " + fmtData(l.prox) : ""}`).join("\n")}`).join("\n\n");
    abrirModal("Texto para o grupo de WhatsApp", `<p class="muted small">Copie e cole no grupo. Para mandar a cada tutor em particular, use o botão WhatsApp de cada linha.</p><textarea rows="14" id="gTxt">${esc(`Olá, pessoal! 🐾 Lembrete da ${CLINICA.nome}:\n\n${txt}\n\nResponda aqui ou no privado para agendar!`)}</textarea>`,
      async () => { await navigator.clipboard.writeText($("#gTxt").value); toast("Texto copiado."); }, "Copiar texto");
  };
  $("#vCsv").onclick = () => {
    const csv = [["pet", "tutor", "telefone", "vacina", "ultima_dose", "proxima_dose", "situacao", "link_whatsapp"].join(";"),
      ...vis.map((l) => [l.p.nome, l.p.tutorNome, l.p.telefone, l.vacina, fmtData(l.ult?.data), fmtData(l.prox), l.st, l.p.telefone ? waLink(l.p.telefone, msgVacina(l)) : ""].map((c) => String(c ?? "").replace(/;/g, ",").replace(/\n/g, " ")).join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = `vacinas_${(vacF.st || "todos").replace(" ", "_")}_${hoje()}.csv`; a.click();
  };
}

function modalVacina(p, { vacina = "", agendamento = null } = {}) {
  const cat = VACINAS.filter((x) => x.especie === "Ambas" || x.especie === p.especie || !p.especie);
  abrirModal(`Aplicar vacina — ${p.nome}`, `
    <label>Vacina<input name="vacina" list="dlVac" required value="${esc(vacina)}" id="mvVac"></label><datalist id="dlVac">${cat.map((x) => `<option value="${esc(x.nome)}">`).join("")}</datalist>
    <div class="duas"><label>Data da aplicação<input type="date" name="data" required value="${hoje()}" id="mvData"></label><label>Próxima dose em (dias)<input type="number" name="dias" id="mvDias" value="${cat.find((x) => x.nome === vacina)?.reforcoDias || 365}"></label></div>
    <label>Data da próxima dose<input type="date" name="proximaDose" id="mvProx"></label>
    <div class="duas"><label>Dose<select name="dose">${opts(["1ª dose", "2ª dose", "3ª dose", "4ª dose", "Reforço anual", "Dose única"])}</select></label><label>Lote<input name="lote"></label></div>
    <div class="duas"><label>Fabricante<input name="fabricante"></label><label>Veterinário<input name="veterinario" value="${esc(usuario.nome)}"></label></div>
    <label>Nome comercial (aparece na etiqueta do cartão)<input name="produto" id="mvProd" list="dlCom" placeholder="Escolha ou digite: Vanguard Plus, Rabisin…"></label><datalist id="dlCom"></datalist>
    <div id="mvRot" style="max-width:220px;margin:-4px 0 10px"></div>
    <label style="flex-direction:row;gap:8px;align-items:center"><input type="checkbox" name="baixa" checked> Dar baixa de 1 dose na <b>Geladeira de Vacina</b> (se o produto existir lá)</label>`,
  async (f, form) => {
    await addDoc(collection(db, "vacinacoes"), { produto: f.produto.trim(), cor: VACINAS.find((x) => x.nome === f.vacina.trim())?.cor || "", petId: p.id, petNome: p.nome, tutorUid: p.tutorUid || "", tutorCpf: p.tutorCpf || "", vacina: f.vacina.trim(), data: f.data, proximaDose: f.proximaDose, dose: f.dose,
      lote: f.lote, fabricante: f.fabricante, veterinario: f.veterinario, status: "Aplicada", criadoPor: usuario.nome, criadoEm: serverTimestamp() });
    if (agendamento) await updateDoc(doc(db, "vacinacoes", agendamento.id), { status: "Realizada" });
    if (f.baixa) { const its = await getDocs(collection(db, "salas", "geladeira_vacina", "itens")); const it = its.docs.find((d) => parecido(d.data().nome, f.vacina));
      if (it) { try { await runTransaction(db, async (t) => { const d = (await t.get(it.ref)).data(); t.update(it.ref, { lotes: retirarFEFO(d.lotes, 1).lotes }); });
        await log({ tipo: "consumo", produtoId: it.id, produtoNome: it.data().nome, qtd: 1, local: "geladeira_vacina", obs: `Vacina em ${p.nome}` }); } catch (e) { toast("Vacina salva, mas sem estoque na geladeira: " + e.message); } } }
    toast("Vacina registrada no cartão.");
  }, "Registrar");
  const calc = () => { $("#mvProx").value = addDiasA($("#mvData").value, Number($("#mvDias").value || 0)); };
  $("#mvVac").onchange = () => { const c = VACINAS.find((x) => x.nome === $("#mvVac").value); if (c) $("#mvDias").value = c.reforcoDias; calc(); };
  $("#mvData").onchange = calc; $("#mvDias").oninput = calc; calc();
  if (!document.getElementById("cvCss")) { const st = document.createElement("style"); st.id = "cvCss"; st.textContent = CARTAO_CSS; document.head.appendChild(st); }
  const prev = () => ($("#mvRot").innerHTML = `<div class="cv-rot">${rotulo({ produto: $("#mvProd").value, vacina: $("#mvVac").value, cor: VACINAS.find((x) => x.nome === $("#mvVac").value)?.cor })}</div>`);
  const coms = () => { const t = $("#mvVac").value; $("#dlCom").innerHTML = VACINAS_COMERCIAIS.filter((c) => !t || c.tipo === t || !VACINAS.some((x) => x.nome === t)).map((c) => `<option value="${esc(c.produto)}">${esc(c.fabricante)}</option>`).join(""); };
  $("#mvProd").oninput = () => { const c = VACINAS_COMERCIAIS.find((c) => c.produto === $("#mvProd").value); if (c) { if (!$("#mvVac").value) { $("#mvVac").value = c.tipo; $("#mvVac").dispatchEvent(new Event("change")); } $("#modalCorpo [name=fabricante]").value = c.fabricante; } prev(); };
  $("#mvVac").addEventListener("input", () => { coms(); prev(); }); $("#mvVac").addEventListener("change", () => { coms(); prev(); }); coms(); prev();
}
const addDiasA = (iso, n) => { if (!iso) return ""; const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function modalAgendarVacina(p, vacina = "", data = "") {
  abrirModal(`Agendar vacina — ${p.nome}`, `<label>Vacina<input name="vacina" list="dlVac2" required value="${esc(vacina)}"></label><datalist id="dlVac2">${VACINAS.map((x) => `<option value="${esc(x.nome)}">`).join("")}</datalist>
    <div class="duas"><label>Data<input type="date" name="data" required value="${data && data >= hoje() ? data : hoje()}"></label><label>Hora<input type="time" name="hora"></label></div>`,
  async (f) => { await addDoc(collection(db, "vacinacoes"), { petId: p.id, petNome: p.nome, tutorUid: p.tutorUid || "", tutorCpf: p.tutorCpf || "", vacina: f.vacina.trim(), data: f.data, hora: f.hora, status: "Agendada", criadoPor: usuario.nome, criadoEm: serverTimestamp() });
    toast("Agendado."); }, "Agendar");
}

/* ---------- Pets, tutores e cartão ---------- */
async function telaPets(v) {
  const [pets, vacs] = await Promise.all([carregarPets(), carregarVacinacoes()]);
  let busca = "";
  v.innerHTML = `<div class="barra"><h2>Pets e cartões de vacina</h2><input id="ptB" placeholder="Buscar pet, tutor ou CPF…"><button class="btn primary" id="ptNovo">+ Novo pet</button></div>
  <p class="muted small">O tutor acessa o cartão online em <b>${esc(location.origin + location.pathname.replace(/[^/]*$/, ""))}tutor.html</b> com o CPF e a senha que você cria aqui (botão "Acesso do tutor").</p>
  <div class="tabela-wrap"><table><thead><tr><th>Pet</th><th>Tutor</th><th>CPF</th><th>Telefone</th><th>Vacinas</th><th>Portal</th><th></th></tr></thead><tbody id="ptTb"></tbody></table></div>`;
  const des = () => { const b = busca.toLowerCase(), bd = soDig(busca);
    $("#ptTb").innerHTML = pets.filter((p) => !b || `${p.nome} ${p.tutorNome}`.toLowerCase().includes(b) || (bd && p.tutorCpf?.includes(bd))).map((p) => { const n = vacs.filter((x) => x.petId === p.id && x.status === "Aplicada").length;
      return `<tr><td><b>${esc(p.nome)}</b><div class="muted small">${esc([p.especie, p.raca, p.sexo, idadeDe(p.nascimento)].filter(Boolean).join(" · "))}</div></td><td>${esc(p.tutorNome || "")}</td><td class="small">${fmtCpf(p.tutorCpf)}</td><td class="small">${esc(p.telefone || "")}</td>
      <td>${n} dose(s)</td><td>${p.tutorUid ? `<span class="tag ok">Ativo</span>` : `<span class="tag neutro">Sem acesso</span>`}</td>
      <td class="acoes-linha"><button class="btn small primary" data-c="${p.id}">Cartão</button><button class="btn small" data-v="${p.id}">+ Vacina</button><button class="btn small" data-a="${p.id}">Acesso do tutor</button><button class="btn small" data-e="${p.id}">Editar</button></td></tr>`; }).join("") || `<tr><td colspan="7" class="muted">Nenhum pet.</td></tr>`; };
  des(); $("#ptB").oninput = (e) => { busca = e.target.value; des(); };
  $("#ptNovo").onclick = () => modalPet();
  $("#ptTb").onclick = (e) => { const b = e.target.closest("button"); if (!b) return; const p = pets.find((x) => x.id === Object.values(b.dataset)[0]);
    if (b.dataset.c) cartaoVacina(p, vacs.filter((x) => x.petId === p.id)); if (b.dataset.v) modalVacina(p); if (b.dataset.a) modalAcessoTutor(p); if (b.dataset.e) modalPet(p); };
}

function modalPet(p = {}) {
  abrirModal(p.id ? "Editar pet" : "Novo pet", `
    <div class="duas"><label>Nome do pet<input name="nome" required value="${esc(p.nome)}"></label><label>Espécie<select name="especie">${opts(["Canina", "Felina", "Outra"], p.especie)}</select></label></div>
    <div class="duas"><label>Raça<input name="raca" value="${esc(p.raca)}"></label><label>Sexo<select name="sexo">${opts(["Macho", "Fêmea", "Macho castrado", "Fêmea castrada"], p.sexo)}</select></label></div>
    <div class="duas"><label>Nascimento<input type="date" name="nascimento" value="${esc(p.nascimento)}"></label><label>Pelagem / sinais<input name="pelagem" value="${esc(p.pelagem)}"></label></div>
    <hr><div class="duas"><label>Nome do tutor<input name="tutorNome" required value="${esc(p.tutorNome)}"></label><label>CPF do tutor<input name="tutorCpf" required value="${fmtCpf(p.tutorCpf)}"></label></div>
    <label>Telefone / WhatsApp<input name="telefone" value="${esc(p.telefone)}" placeholder="(11) 99999-0000"></label>`,
  async (f) => {
    if (!cpfValido(f.tutorCpf)) throw new Error("CPF inválido.");
    const cpf = soDig(f.tutorCpf);
    const tut = await getDoc(doc(db, "tutores", cpf));
    const tutorUid = tut.exists() ? tut.data().uid || "" : "";
    await setDoc(doc(db, "tutores", cpf), { cpf, nome: f.tutorNome.trim(), telefone: f.telefone, ...(tut.exists() ? {} : { uid: "", criadoEm: serverTimestamp() }) }, { merge: true });
    const d = { nome: f.nome.trim(), especie: f.especie, raca: f.raca, sexo: f.sexo, nascimento: f.nascimento, pelagem: f.pelagem, tutorNome: f.tutorNome.trim(), tutorCpf: cpf, telefone: f.telefone, tutorUid, ativo: true };
    p.id ? await updateDoc(doc(db, "pets", p.id), d) : await addDoc(collection(db, "pets"), { ...d, criadoEm: serverTimestamp() });
    toast("Pet salvo.");
  });
}

// Cria (ou recria) o login do tutor: e-mail interno <cpf>.<versão>@DOMINIO_TUTOR. Nenhum e-mail é enviado.
function modalAcessoTutor(p) {
  const senhaSug = Math.random().toString(36).slice(2, 8);
  abrirModal(`Acesso do tutor — ${p.tutorNome}`, `
    <p class="small">O tutor entra no <b>portal do cartão de vacina</b> com o <b>CPF ${fmtCpf(p.tutorCpf)}</b> e a senha abaixo. Ele vê todos os pets ligados a esse CPF.
    ${p.tutorUid ? "<br><b>Já existe um acesso.</b> Salvar cria uma <b>nova senha</b> (a anterior deixa de funcionar)." : ""}</p>
    <label>Senha (mín. 6 caracteres)<input name="senha" required minlength="6" value="${senhaSug}"></label>`,
  async (f) => {
    const cpf = p.tutorCpf; const h = await sha256(cpf);
    const ac = await getDoc(doc(db, "acessos", h)); const versao = (ac.exists() ? ac.data().v : 0) + 1;
    const sec = initializeApp(firebaseConfig, "tut" + Date.now());
    let uid;
    try { uid = (await createUserWithEmailAndPassword(getAuth(sec), `${cpf}.${versao}@${DOMINIO_TUTOR}`, f.senha)).user.uid; await signOut(getAuth(sec)); }
    finally { await deleteApp(sec); }
    await setDoc(doc(db, "acessos", h), { v: versao });
    await updateDoc(doc(db, "tutores", cpf), { uid });
    for (const pd of (await getDocs(query(collection(db, "pets"), where("tutorCpf", "==", cpf)))).docs) await updateDoc(pd.ref, { tutorUid: uid });
    for (const vd of (await getDocs(query(collection(db, "vacinacoes"), where("tutorCpf", "==", cpf)))).docs) await updateDoc(vd.ref, { tutorUid: uid });
    const portal = location.origin + location.pathname.replace(/[^/]*$/, "") + "tutor.html";
    const msg = `Olá, ${p.tutorNome.split(" ")[0]}! 🐾 O cartão de vacina online do(a) ${p.nome} já está disponível.\nAcesse: ${portal}\nCPF: ${fmtCpf(cpf)}\nSenha: ${f.senha}\n(Você pode trocar a senha dentro do portal.)`;
    abrirModal("Acesso criado ✅", `<textarea rows="7" readonly>${esc(msg)}</textarea>${p.telefone ? `<p><a class="btn primary" target="_blank" href="${waLink(p.telefone, msg)}">Enviar pelo WhatsApp</a></p>` : ""}`, async () => {}, "Fechar");
    throw new Error(""); // mantém o modal de resultado aberto
  }, "Criar acesso");
}

function cartaoVacina(p, vacs) {
  if (!document.getElementById("cvCss")) { const st = document.createElement("style"); st.id = "cvCss"; st.textContent = CARTAO_CSS; document.head.appendChild(st); }
  abrirModal(`Cartão de vacina — ${p.nome}`, cartaoHtml(p, vacs, CLINICA), async () => imprimirCartao(p, vacs), "Imprimir / PDF");
  $("#modal .modal-card").style.width = "min(900px,100%)";
}
function imprimirCartao(p, vacs) {
  const w = window.open("", "_blank");
  w.document.write(`<html><head><title>Cartão de vacina - ${esc(p.nome)}</title><style>${CARTAO_CSS} body{margin:10mm} @page{size:A4 landscape;margin:8mm}</style></head><body>${cartaoHtml(p, vacs, CLINICA, { aberto: true })}<script>window.onload=()=>print()<\/script></body></html>`);
  w.document.close();
}

/* ---------- Vencimentos por faixa ---------- */
const FAIXAS_VENC = [[3, "Até 3 dias"], [7, "Até 1 semana"], [15, "Até 15 dias"], [30, "Até 30 dias"], [90, "Até 3 meses"]];
let vencF = { faixa: 7, vacina: "", soSemAviso: false };
async function telaVencimentos(v) {
  const [pets, vacs] = await Promise.all([carregarPets(), carregarVacinacoes()]);
  const base = situacaoVacinas(pets, vacs).filter((l) => l.prox && l.prox >= hoje() && !l.ag && l.st !== "Não veio")
    .map((l) => ({ ...l, dias: Math.round((new Date(l.prox + "T12:00") - new Date(hoje() + "T12:00")) / 864e5) }));
  const deFaixa = (l, lim) => { const i = FAIXAS_VENC.findIndex(([d]) => d === lim); const ant = i > 0 ? FAIXAS_VENC[i - 1][0] : -1; return l.dias > ant && l.dias <= lim; };
  const nomes = [...new Set(base.map((l) => l.vacina))].sort();
  const avisados = new Set((await getDocs(query(collection(db, "avisosVacina"), where("em", ">=", addDias(-30))))).docs.map((d) => d.data().chave));
  const chave = (l) => `${l.p.id}|${l.vacina}|${l.prox}`;
  v.innerHTML = `<div class="barra"><h2>Vacinas a vencer</h2><select id="vnVac"><option value="">Todas as vacinas</option>${opts(nomes, vencF.vacina)}</select>
    <label style="flex-direction:row;gap:6px;align-items:center;margin:0"><input type="checkbox" id="vnSem" ${vencF.soSemAviso ? "checked" : ""}> Só quem ainda não foi avisado</label>
    <button class="btn" id="vnGrupo">📋 Texto para o grupo</button><button class="btn" id="vnCsv">Exportar contatos</button></div>
  <div class="grid">${FAIXAS_VENC.map(([d, n]) => { const q = base.filter((l) => deFaixa(l, d) && (!vencF.vacina || l.vacina === vencF.vacina)).length;
    return `<div class="card kpi" data-fx="${d}" style="cursor:pointer;${vencF.faixa === d ? "outline:3px solid var(--azul)" : ""}"><span class="muted">${n}</span><b style="color:var(--${d <= 7 ? "vermelho" : d <= 30 ? "amarelo" : "azul"})">${q}</b></div>`; }).join("")}</div>
  <p class="muted small">Cada faixa mostra só quem vence dentro dela (ex.: "Até 1 semana" = de 4 a 7 dias). Ao clicar em WhatsApp, o aviso fica marcado para não mandar duas vezes.</p>
  <div class="tabela-wrap"><table><thead><tr><th>Vence em</th><th>Pet</th><th>Tutor / telefone</th><th>Vacina</th><th>Última dose</th><th>Aviso</th><th></th></tr></thead><tbody id="vnTb"></tbody></table></div>`;
  const msg = (l) => `Olá, ${l.p.tutorNome?.split(" ")[0] || ""}! Aqui é da ${CLINICA.nome} 🐾\nA vacina *${l.vacina}* do(a) *${l.p.nome}* vence ${l.dias === 0 ? "*hoje*" : l.dias === 1 ? "*amanhã*" : `em *${l.dias} dias* (${fmtData(l.prox)})`}.\nQuer agendar? É só responder esta mensagem. 💉`;
  let vis = [];
  const des = () => {
    vis = base.filter((l) => deFaixa(l, vencF.faixa) && (!vencF.vacina || l.vacina === vencF.vacina) && (!vencF.soSemAviso || !avisados.has(chave(l)))).sort((a, b) => a.dias - b.dias);
    $("#vnTb").innerHTML = vis.map((l, i) => `<tr><td><b>${l.dias === 0 ? "Hoje" : l.dias === 1 ? "Amanhã" : l.dias + " dias"}</b><div class="muted small">${fmtData(l.prox)}</div></td>
      <td><b>${esc(l.p.nome)}</b><div class="muted small">${esc(l.p.especie || "")}</div></td><td>${esc(l.p.tutorNome || "")}<div class="muted small">${esc(l.p.telefone || "")}</div></td>
      <td>${esc(l.vacina)}</td><td>${fmtData(l.ult?.data)}</td><td>${avisados.has(chave(l)) ? `<span class="tag ok">avisado</span>` : `<span class="tag neutro">não</span>`}</td>
      <td class="acoes-linha">${l.p.telefone ? `<a class="btn small primary" target="_blank" data-wa="${i}" href="${waLink(l.p.telefone, msg(l))}">WhatsApp</a>` : ""}<button class="btn small" data-ag="${i}">Agendar</button></td></tr>`).join("")
      || `<tr><td colspan="7" class="muted">Ninguém vence nesta faixa.</td></tr>`;
  };
  des();
  v.querySelectorAll("[data-fx]").forEach((c) => (c.onclick = () => { vencF.faixa = Number(c.dataset.fx); render(); }));
  $("#vnVac").onchange = (e) => { vencF.vacina = e.target.value; render(); };
  $("#vnSem").onchange = (e) => { vencF.soSemAviso = e.target.checked; des(); };
  $("#vnTb").onclick = async (e) => {
    const a = e.target.closest("[data-wa]"); if (a) { const l = vis[a.dataset.wa]; avisados.add(chave(l));
      await addDoc(collection(db, "avisosVacina"), { chave: chave(l), petId: l.p.id, vacina: l.vacina, prox: l.prox, por: usuario.nome, em: hoje() }); setTimeout(des, 300); }
    const b = e.target.closest("[data-ag]"); if (b) { const l = vis[b.dataset.ag]; modalAgendarVacina(l.p, l.vacina, l.prox); }
  };
  $("#vnGrupo").onclick = () => { const fx = FAIXAS_VENC.find(([d]) => d === vencF.faixa)[1].toLowerCase(); const por = {}; vis.forEach((l) => (por[l.vacina] ??= []).push(l));
    const txt = `Olá, pessoal! 🐾 Vacinas que vencem ${fx} na ${CLINICA.nome}:\n\n` + Object.entries(por).map(([vac, ls]) => `💉 *${vac}*\n${ls.map((l) => `• ${l.p.nome} (${l.p.tutorNome?.split(" ")[0] || ""}) – ${fmtData(l.prox)}`).join("\n")}`).join("\n\n") + "\n\nResponda para agendar!";
    abrirModal("Texto para o grupo", `<textarea rows="14" id="gTxt2">${esc(txt)}</textarea>`, async () => { await navigator.clipboard.writeText($("#gTxt2").value); toast("Copiado."); }, "Copiar texto"); };
  $("#vnCsv").onclick = () => { const csv = [["vence_em_dias", "data", "pet", "tutor", "telefone", "vacina", "link_whatsapp"].join(";"), ...vis.map((l) => [l.dias, fmtData(l.prox), l.p.nome, l.p.tutorNome, l.p.telefone, l.vacina, l.p.telefone ? waLink(l.p.telefone, msg(l)) : ""].map((c) => String(c ?? "").replace(/;/g, ",").replace(/\n/g, " ")).join(";"))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = `vacinas_vencendo_${vencF.faixa}d_${hoje()}.csv`; a.click(); };
}

/* ================= 8 · AMBULATÓRIO (roteiro programado) ================= */
let ambF = { vista: "hoje", tipo: "" };
const RECORR = { "": "Não repete", "1": "Todo dia", "2": "A cada 2 dias", "7": "Toda semana", "15": "A cada 15 dias", "21": "A cada 21 dias", "30": "Todo mês", "90": "A cada 3 meses", "180": "A cada 6 meses", "365": "Todo ano" };
async function telaAmbulatorio(v) {
  const [itens, pets] = await Promise.all([getDocs(query(collection(db, "programados"), orderBy("data"))).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))), carregarPets()]);
  const abertos = itens.filter((x) => x.status === "Pendente");
  const filtro = { hoje: (x) => x.data === hoje(), semana: (x) => x.data >= hoje() && x.data <= addDias(7), atrasados: (x) => x.data < hoje(), todos: () => true };
  const lista = (ambF.vista === "historico" ? itens.filter((x) => x.status !== "Pendente").reverse().slice(0, 100) : abertos.filter(filtro[ambF.vista])).filter((x) => !ambF.tipo || x.tipo === ambF.tipo);
  const icon = { "Check-up": "🩺", Exame: "🧪", Consulta: "👩‍⚕️", Medicação: "💊", Curativo: "🩹", Retorno: "🔁" };
  v.innerHTML = `<div class="barra"><h2>Ambulatório — roteiro programado</h2><select id="amT"><option value="">Todos os tipos</option>${opts(TIPOS_AMBULATORIO, ambF.tipo)}</select><button class="btn primary" id="amNovo">+ Programar</button></div>
  <div class="tabs">${[["hoje", `Hoje (${abertos.filter(filtro.hoje).length})`], ["semana", `Próximos 7 dias (${abertos.filter(filtro.semana).length})`], ["atrasados", `Atrasados (${abertos.filter(filtro.atrasados).length})`], ["todos", "Todos pendentes"], ["historico", "Histórico"]]
    .map(([k, n]) => `<button class="btn ${ambF.vista === k ? "ativo" : ""}" data-vi="${k}">${n}</button>`).join("")}</div>
  <div class="tabela-wrap"><table><thead><tr><th>Data / hora</th><th>Tipo</th><th>Pet / tutor</th><th>O quê</th><th>Repete</th><th>Responsável</th><th>Situação</th><th></th></tr></thead><tbody>
  ${lista.map((x) => `<tr class="${x.status === "Pendente" && x.data < hoje() ? "linha-alerta" : ""}"><td><b>${fmtData(x.data)}</b> ${esc(x.hora || "")}</td><td>${icon[x.tipo] || ""} ${esc(x.tipo)}</td>
    <td><b>${esc(x.petNome)}</b><div class="muted small">${esc(x.tutorNome || "")} ${esc(x.telefone || "")}</div></td><td>${esc(x.descricao)}${x.obs ? `<div class="muted small">${esc(x.obs)}</div>` : ""}</td>
    <td class="small">${RECORR[x.recorrencia || ""]}</td><td class="small">${esc(x.responsavel || "")}</td>
    <td>${x.status === "Pendente" ? (x.data < hoje() ? `<span class="tag critico">Atrasado</span>` : `<span class="tag alerta">Pendente</span>`) : `<span class="tag ${x.status === "Feito" ? "ok" : "neutro"}">${x.status}</span><div class="small muted">${esc(x.feitoPor || "")}</div>`}</td>
    <td class="acoes-linha">${x.status === "Pendente" ? `<button class="btn small primary" data-ok="${x.id}">✔ Feito</button><button class="btn small" data-rm="${x.id}">Remarcar</button><button class="btn small" data-fa="${x.id}">Faltou</button>
      ${x.telefone ? `<a class="btn small" target="_blank" href="${waLink(x.telefone, `Olá, ${(x.tutorNome || "").split(" ")[0]}! Lembrete da ${CLINICA.nome} 🐾: ${x.tipo.toLowerCase()} do(a) *${x.petNome}* — ${x.descricao} — em ${fmtData(x.data)}${x.hora ? " às " + x.hora : ""}. Podemos confirmar?`)}">Lembrete</a>` : ""}` : ""}</td></tr>`).join("")
    || `<tr><td colspan="8" class="muted">Nada aqui. 👍</td></tr>`}</tbody></table></div>`;
  v.querySelectorAll("[data-vi]").forEach((b) => (b.onclick = () => { ambF.vista = b.dataset.vi; render(); }));
  $("#amT").onchange = (e) => { ambF.tipo = e.target.value; render(); };
  $("#amNovo").onclick = () => modalProgramar(pets);
  const achar = (id) => itens.find((x) => x.id === id);
  v.querySelectorAll("[data-ok]").forEach((b) => (b.onclick = () => { const x = achar(b.dataset.ok);
    abrirModal(`Concluir — ${x.petNome}`, `<p>${esc(x.tipo)}: ${esc(x.descricao)}</p><label>Observação do que foi feito<input name="obs"></label>
      ${x.recorrencia ? `<p class="small">Repete: <b>${RECORR[x.recorrencia]}</b>. A próxima será criada para <b>${fmtData(addDiasA(hoje(), Number(x.recorrencia)))}</b>.</p>` : ""}`,
    async (f) => { await updateDoc(doc(db, "programados", x.id), { status: "Feito", feitoPor: usuario.nome, feitoEm: hoje(), obsFeito: f.obs });
      if (x.recorrencia && (!x.ate || addDiasA(hoje(), Number(x.recorrencia)) <= x.ate)) { const { id, ...resto } = x;
        await addDoc(collection(db, "programados"), { ...resto, data: addDiasA(hoje(), Number(x.recorrencia)), status: "Pendente", feitoPor: "", obsFeito: "", criadoEm: serverTimestamp() }); }
      toast("Concluído."); }, "Concluir"); }));
  v.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { const x = achar(b.dataset.rm);
    abrirModal("Remarcar", `<div class="duas"><label>Nova data<input type="date" name="data" required value="${x.data}"></label><label>Hora<input type="time" name="hora" value="${esc(x.hora || "")}"></label></div>`,
      async (f) => { await updateDoc(doc(db, "programados", x.id), { data: f.data, hora: f.hora }); toast("Remarcado."); }, "Salvar"); }));
  v.querySelectorAll("[data-fa]").forEach((b) => (b.onclick = async () => { await updateDoc(doc(db, "programados", b.dataset.fa), { status: "Faltou", feitoPor: usuario.nome, feitoEm: hoje() }); toast("Marcado como falta."); render(); }));
}
function modalProgramar(pets) {
  abrirModal("Programar atendimento", `
    <label>Pet (digite o nome)<input list="dlPets" id="prPet" required placeholder="Pet — tutor"></label><datalist id="dlPets">${pets.map((p) => `<option value="${esc(p.nome)} — ${esc(p.tutorNome)}">`).join("")}</datalist>
    <p class="muted small">Pet ainda não cadastrado? Cadastre em 7 · Vacinas → Pets.</p>
    <div class="duas"><label>Tipo<select name="tipo">${opts(TIPOS_AMBULATORIO)}</select></label><label>Responsável<input name="responsavel" value="${esc(usuario.nome)}"></label></div>
    <label>O quê<input name="descricao" required placeholder="Ex.: Cytopoint 20 mg SC / Hemograma de controle / Check-up geriátrico"></label>
    <div class="duas"><label>Data<input type="date" name="data" required value="${hoje()}"></label><label>Hora<input type="time" name="hora"></label></div>
    <div class="duas"><label>Repetir<select name="recorrencia">${Object.entries(RECORR).map(([k, n]) => `<option value="${k}">${n}</option>`).join("")}</select></label><label>Repetir até (opcional)<input type="date" name="ate"></label></div>
    <label>Observação<input name="obs"></label>`,
  async (f) => {
    const p = pets.find((p) => `${p.nome} — ${p.tutorNome}` === $("#prPet").value); if (!p) throw new Error("Escolha um pet da lista.");
    await addDoc(collection(db, "programados"), { petId: p.id, petNome: p.nome, tutorNome: p.tutorNome, telefone: p.telefone || "", tipo: f.tipo, descricao: f.descricao.trim(), data: f.data, hora: f.hora,
      recorrencia: f.recorrencia, ate: f.ate, responsavel: f.responsavel, obs: f.obs, status: "Pendente", criadoPor: usuario.nome, criadoEm: serverTimestamp() });
    toast("Programado.");
  }, "Programar");
}


/* ================= IMPORTAR A PLANILHA DA CLÍNICA (xlsx com uma aba por categoria) ================= */
function modalImportarPlanilhaClinica() {
  abrirModal("📥 Importar planilha", `<p class="small">Envie a planilha no <b>modelo do VetControl</b> (ou o <b>Controle_Estoque_e_Patrimonio.xlsx</b>): uma aba por categoria${DISTRIBUIDORAS.length ? ` (${DISTRIBUIDORAS.map(esc).join(", ")})` : ""} e, se quiser, uma aba <b>Salas</b> com o que cada setor deve ter. Produtos que já existem (mesmo código ou mesmo nome) são <b>ignorados</b>, então dá para importar de novo quando a planilha crescer.</p>
    <p><button type="button" class="btn" id="plModelo">⬇ Baixar modelo em branco (.xlsx)</button></p>
    <input type="file" id="plArq" accept=".xlsx,.xls"><div id="plPrev" style="margin-top:10px"></div>`, async () => { if (!window.__plan) throw new Error("Escolha a planilha primeiro."); await gravarPlanilha(window.__plan); }, "Importar");
  $("#modalOk").disabled = true;
  $("#plModelo").onclick = baixarModeloPlanilha;
  $("#plArq").onchange = async (e) => {
    const arq = e.target.files[0]; if (!arq) return; $("#plPrev").innerHTML = "Lendo…";
    await carregarXLSX(); const wb = XLSX.read(await arq.arrayBuffer(), { type: "array", cellDates: true });
    const abas = Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: "" })]));
    const r = lerPlanilhaClinica(abas); await carregarProdutos();
    const existe = (p) => produtos.some((x) => (p.codigo && x.codigo === p.codigo) || norm(x.nome) === norm(p.nome));
    r.novos = r.produtos.filter((p) => !existe(p)); window.__plan = r;
    const porCat = {}; r.novos.forEach((p) => (porCat[p.categoria] = (porCat[p.categoria] || 0) + 1));
    $("#plPrev").innerHTML = `<div class="grid"><div class="card kpi"><span class="muted">Produtos novos</span><b>${r.novos.length}</b><span class="small">${r.produtos.length - r.novos.length} já existiam</span></div>
      <div class="card kpi"><span class="muted">Com saldo inicial</span><b>${r.novos.filter((p) => p.qtdInicial > 0).length}</b></div><div class="card kpi"><span class="muted">🔒 Controlados</span><b>${r.novos.filter((p) => p.controlado).length}</b></div>
      <div class="card kpi"><span class="muted">Grupos de equivalentes</span><b>${r.grupos.length}</b></div>${r.salas.length ? `<div class="card kpi"><span class="muted">Itens de sala</span><b>${r.salas.length}</b></div>` : ""}</div>
      <p class="small">${Object.entries(porCat).map(([c, n]) => `${esc(c)}: <b>${n}</b>`).join(" · ")}${r.inventario.length ? ` · Inventário: <b>${r.inventario.length}</b>` : ""}${r.compras.length ? ` · Compras marketplace: <b>${r.compras.length}</b>` : ""}</p>
      ${r.avisos.length ? `<details class="regras" open><summary>Avisos (${r.avisos.length})</summary><ul>${r.avisos.map((a) => `<li>${esc(a)}</li>`).join("")}</ul></details>` : ""}
      <p class="small muted">${r.novos.some((p) => p.validadeInicial) ? "Produtos sem validade na planilha entram como \"sem validade informada\": lance a validade na primeira conferência." : "A planilha não tem validades: o saldo entra como \"sem validade informada\". Lance a validade na primeira conferência."} Os controlados foram marcados pelo princípio ativo: confira. Depois da importação, use <b>🖼 Buscar fotos</b>.</p>`;
    $("#modalOk").disabled = false;
  };
}
async function gravarPlanilha(r) {
  const idPorCodigo = {}, idPorNome = {}, dadosPorId = {}; let n = 0;
  produtos.forEach((p) => { p.codigo && (idPorCodigo[p.codigo] = p.id); idPorNome[norm(p.nome)] = p.id; dadosPorId[p.id] = p; });
  for (const p of r.novos) {
    const { qtdInicial, validadeInicial, loteInicial, ...dados } = p;
    const ref = await addDoc(collection(db, "produtos"), { ...dados, fotoUrl: "", lotesEstoque: qtdInicial > 0 ? [{ qtd: qtdInicial, validade: validadeInicial || "" }] : [], lotesLimbo: [], criadoEm: serverTimestamp() });
    idPorCodigo[p.codigo] = ref.id; idPorNome[norm(p.nome)] = ref.id; dadosPorId[ref.id] = p; (p.codigosExtras || []).forEach((c) => (idPorCodigo[c] = ref.id));
    if (qtdInicial > 0) await log({ tipo: "entrada", produtoId: ref.id, produtoNome: p.nome, qtd: qtdInicial, validade: validadeInicial || "", local: "estoque", obs: "Saldo inicial (planilha)" });
    if (++n % 20 === 0) $("#plPrev").insertAdjacentHTML("afterbegin", `<p class="small">${n} de ${r.novos.length} produtos…</p>`);
  }
  const eqs = await carregarEquivalencias();
  for (const g of r.grupos) { if (eqs.some((e) => norm(e.principio) === norm(g.principio))) continue;
    await addDoc(collection(db, "equivalencias"), { ...g, itens: g.itens.map(({ codigo, ...i }) => ({ ...i, produtoId: idPorCodigo[codigo] || "" })), criadoPor: usuario.nome, criadoEm: serverTimestamp() }); }
  for (const x of r.inventario) await addDoc(collection(db, "inventario"), { ...x, status: "Ativo", criadoPor: usuario.nome, criadoEm: serverTimestamp() });
  for (const c of r.compras) await addDoc(collection(db, "listaCompras"), { ...c, criadoEm: serverTimestamp() });
  // Aba "Salas": cria/atualiza o ideal e o crítico de cada item em cada sala (nunca mexe nas quantidades já contadas)
  let nSalas = 0, criados = 0; const semSala = [];
  for (const x of r.salas) {
    const sala = SALAS.find((z) => z.id === x.sala || norm(z.nome) === norm(x.sala) || (norm(x.sala) && norm(z.nome).includes(norm(x.sala))));
    let pid = (x.codigo && idPorCodigo[x.codigo]) || idPorNome[norm(x.produto)], pd = dadosPorId[pid];
    if (!pd && sala && x.produto) { // item do setor que ainda não está no cadastro: cria o produto (saldo zero) para já entrar na ficha
      pd = { codigo: x.codigo, nome: x.produto, categoria: x.categoria, subcategoria: "", tipoItem: "", principio: "", especie: "", marca: "", medida: x.medida, concentracao: "", conteudo: "", localizacao: "", obs: x.obs,
        controlado: x.controlado, controladoAuto: x.controlado, minimo: 0, ideal: 0, tipo: "estoque", valorUnit: 0, naoComprar: x.naoComprar };
      pid = (await addDoc(collection(db, "produtos"), { ...pd, fotoUrl: "", lotesEstoque: [], lotesLimbo: [], criadoEm: serverTimestamp() })).id;
      idPorNome[norm(pd.nome)] = pid; if (pd.codigo) idPorCodigo[pd.codigo] = pid; dadosPorId[pid] = pd; criados++;
    }
    if (!sala || !pd) { semSala.push(`${x.sala || "?"} / ${x.codigo || x.produto}`); continue; }
    const ref = doc(db, "salas", sala.id, "itens", pid);
    if ((await getDoc(ref)).exists()) await updateDoc(ref, { ideal: x.ideal, critico: x.critico });
    else await setDoc(ref, { nome: pd.nome, medida: pd.medida, controlado: !!pd.controlado, lotes: x.atual > 0 ? [{ qtd: x.atual, validade: "" }] : [], ideal: x.ideal, critico: x.critico });
    nSalas++;
  }
  window.__plan = null;
  toast(`Importado: ${r.novos.length} produtos, ${r.grupos.length} grupos de equivalentes${r.salas.length ? `, ${nSalas} itens de sala${criados ? ` (${criados} produtos novos criados com saldo zero)` : ""}${semSala.length ? ` (${semSala.length} não encontrados: ${semSala.slice(0, 3).join("; ")}…)` : ""}` : ""}.`);
}

/* ================= MEDICAMENTOS EQUIVALENTES ================= */
// grupo: { principio, forma, concentracao, semEquivalente, obs, itens: [{ nome, fabricante, concentracao, relacao: "identico"|"ressalva", ressalva, produtoId, fotoUrl, preferencial }] }
let equivalencias = [];
async function carregarEquivalencias() { equivalencias = (await getDocs(query(collection(db, "equivalencias"), orderBy("principio")))).docs.map((d) => ({ id: d.id, ...d.data() })); return equivalencias; }
const casaTermo = (g, texto) => (g.termos || []).some((t) => (" " + norm(texto) + " ").includes(" " + norm(t) + " ") || norm(texto).startsWith(norm(t)));
const grupoDoProduto = (p) => equivalencias.find((g) => g.itens.some((i) => i.produtoId === p.id || norm(i.nome) === norm(p.nome))) || equivalencias.find((g) => casaTermo(g, p.nome));
const textoEquiv = (p) => { const g = grupoDoProduto(p); return g ? g.itens.map((i) => i.nome).join(" ") + " " + (g.termos || []).join(" ") : ""; }; // busca por nome comercial equivalente
async function semearEquivalenciasMercado() { // cria os grupos de mercado que ainda não existem (não duplica)
  await carregarEquivalencias(); let n = 0;
  for (const g of GRUPOS_MERCADO) { if (equivalencias.some((e) => norm(e.principio) === norm(g.principio))) continue;
    await addDoc(collection(db, "equivalencias"), { ...g, itens: g.itens.map((i) => ({ ...i, produtoId: produtos.find((p) => parecido(p.nome, i.nome))?.id || "" })), semEquivalente: false, criadoPor: usuario.nome, criadoEm: serverTimestamp() }); n++; }
  await carregarEquivalencias(); return n;
}
const estoqueDe = (i) => { const p = produtos.find((x) => x.id === i.produtoId); return p ? total(p.lotesEstoque) : null; };
const fotoItem = (i) => { const p = produtos.find((x) => x.id === i.produtoId); return p && fotoSrc(p) ? fotoTag(p) : i.fotoUrl ? `<img class="foto" src="${esc(i.fotoUrl)}">` : `<div class="foto foto-letra">${esc((i.nome || "?")[0])}</div>`; };
function equivResumo(p) {
  const g = grupoDoProduto(p); if (!g) return "";
  if (g.semEquivalente) return `<div class="small equiv" data-eq="${g.id}">🚫 Sem equivalente — ${esc(g.obs || "o veterinário define outra opção")}</div>`;
  const outros = g.itens.filter((i) => i.produtoId !== p.id && norm(i.nome) !== norm(p.nome) && !casaTermo({ termos: [i.nome] }, p.nome));
  const zerado = total(p.lotesEstoque) <= 0;
  return `<div class="small equiv ${zerado ? "falta" : ""}" data-eq="${g.id}">${zerado ? "⚠️ Sem estoque → usar: " : "🔁 Igual a: "}${outros.map((i) => `${i.relacao === "ressalva" ? "⚠" : "="} ${esc(i.nome)}${estoqueDe(i) != null ? ` (${estoqueDe(i)})` : ""}`).join(" · ")}</div>`;
}
function verGrupoEquiv(id) {
  const g = equivalencias.find((x) => x.id === id);
  abrirModal(`${g.principio}${g.concentracao ? " " + g.concentracao : ""}`, grupoHtml(g), async () => {}, "Fechar");
  $("#modal .modal-card").style.width = "min(760px,100%)";
}
function grupoHtml(g) {
  return `<div class="muted small">${esc(g.forma || "")}${g.obs ? " · " + esc(g.obs) : ""}</div>
  ${g.semEquivalente ? `<div class="aviso-ctrl" style="margin-top:8px">🚫 <b>Não tem equivalente.</b> ${esc(g.obs || "")}</div>` : ""}
  <div class="equiv-grid">${g.itens.map((i) => { const q = estoqueDe(i); return `<div class="equiv-card ${i.preferencial ? "pref" : ""}">
    ${fotoItem(i).replace('class="foto"', 'class="foto foto-g"').replace('class="foto foto-letra"', 'class="foto foto-g foto-letra"')}
    <div><b>${esc(i.nome)}</b>${i.preferencial ? ` <span class="tag ok">⭐ principal</span>` : ""}<div class="muted small">${esc(i.fabricante || "")}${i.concentracao ? " · " + esc(i.concentracao) : ""}</div>
    ${g.semEquivalente ? "" : i.relacao === "ressalva" ? `<div class="tag alerta">⚠ substituto com ressalva</div><div class="small" style="color:#8a5a00">${esc(i.ressalva || "")}</div>` : `<div class="tag ok">= mesmo princípio e concentração</div>`}
    <div class="small">${q == null ? `<span class="muted">não ligado ao estoque</span>` : q > 0 ? `<b style="color:var(--verde)">${q} em estoque</b>` : `<b style="color:var(--vermelho)">em falta</b>`}</div></div></div>`; }).join("")}</div>`;
}

async function telaEquivalentes(v) {
  await Promise.all([carregarProdutos(), carregarEquivalencias()]);
  let busca = "";
  v.innerHTML = `<div class="barra"><h2>Medicamentos equivalentes</h2><input id="eqB" placeholder="Buscar princípio ativo ou nome comercial…">
    ${podeConfirmar() && !equivalencias.length ? `<button class="btn" id="eqSeed">Carregar exemplos da clínica</button>` : ""}${podeConfirmar() ? `<button class="btn" id="eqMercado">Carregar equivalentes de mercado (fios e dexametasona)</button>` : ""}${podeConfirmar() ? `<button class="btn primary" id="eqNovo">+ Novo grupo</button>` : ""}</div>
  <p class="muted small"><b>=</b> idêntico (mesmo princípio ativo e mesma concentração: pode trocar direto) · <b>⚠</b> substituto com ressalva (outra concentração ou formulação: confirmar com o veterinário e recalcular a dose) · <b>⭐</b> o que a clínica usa como principal.</p>
  <div id="eqLista"></div>`;
  const des = () => { const b = norm(busca);
    $("#eqLista").innerHTML = equivalencias.filter((g) => !b || norm(g.principio + " " + g.itens.map((i) => i.nome).join(" ") + " " + (g.termos || []).join(" ")).includes(b)).map((g) => `<div class="card" style="margin-bottom:12px">
      <div class="barra" style="margin:0"><h3 style="margin:0;flex:1">${esc(g.principio)} <span class="muted small">${esc(g.concentracao || "")} · ${esc(g.forma || "")}</span></h3>${podeConfirmar() ? `<button class="btn small" data-e="${g.id}">Editar</button>` : ""}</div>${grupoHtml(g)}</div>`).join("")
      || `<p class="muted">Nenhum grupo cadastrado.</p>`; };
  des(); $("#eqB").oninput = (e) => { busca = e.target.value; des(); };
  $("#eqNovo") && ($("#eqNovo").onclick = () => modalGrupoEquiv());
  $("#eqLista").onclick = (e) => { const b = e.target.closest("[data-e]"); if (b) modalGrupoEquiv(equivalencias.find((g) => g.id === b.dataset.e)); };
  $("#eqMercado") && ($("#eqMercado").onclick = async () => { const n = await semearEquivalenciasMercado(); toast(n ? `${n} grupos de mercado carregados. Confira e ligue ao estoque.` : "Os grupos de mercado já estavam carregados."); render(); });
  $("#eqSeed") && ($("#eqSeed").onclick = async () => {
    const I = (nome, fabricante, concentracao, relacao, extra = {}) => ({ nome, fabricante, concentracao, relacao, ressalva: "", produtoId: produtos.find((p) => parecido(p.nome, nome))?.id || "", fotoUrl: "", preferencial: false, ...extra });
    const grupos = [
      { principio: "Maropitant (antiemético)", forma: "Injetável", concentracao: "10 mg/ml", obs: "", itens: [I("Cerenia injetável", "Zoetis", "10 mg/ml", "identico", { preferencial: true }), I("Marovet injetável", "", "10 mg/ml", "identico")] },
      { principio: "Amoxicilina + clavulanato", forma: "Injetável", concentracao: "", obs: "", itens: [I("Agemoxi CL injetável", "Agener União", "", "identico", { preferencial: true }),
        I("Amoxicilina injetável (sem clavulanato)", "", "", "ressalva", { ressalva: "Não tem clavulanato: espectro menor contra bactérias produtoras de betalactamase. Usar só com aval do veterinário." })] },
      { principio: "Oxitetraciclina", forma: "Injetável", concentracao: "200 mg/ml (LA)", obs: "", itens: [I("Terramicina LA", "Zoetis", "200 mg/ml", "identico", { preferencial: true }),
        I("Outra oxitetraciclina injetável", "", "", "ressalva", { ressalva: "Conferir a concentração no rótulo (existem apresentações diferentes) e recalcular a dose." })] },
      { principio: "Meloxicam (anti-inflamatório)", forma: "Injetável", concentracao: "0,2% (2 mg/ml)", obs: "", itens: [I("Elo-xicam injetável 0,2%", "Chemitec", "0,2%", "identico", { preferencial: true }), I("Maxicam 0,2% injetável", "Ourofino", "0,2%", "identico")] },
      { principio: "Cefovecina (antibiótico de longa ação)", forma: "Injetável", concentracao: "", semEquivalente: true, obs: "Não há outro com a mesma ação prolongada; o veterinário escolhe outro antibiótico.", itens: [I("Convenia", "Zoetis", "", "identico", { preferencial: true })] }];
    for (const g of grupos) await addDoc(collection(db, "equivalencias"), { ...g, semEquivalente: !!g.semEquivalente, criadoPor: usuario.nome, criadoEm: serverTimestamp() });
    toast("Exemplos carregados. Confira e ligue cada nome ao produto do estoque."); render();
  });
}

function modalGrupoEquiv(g = { itens: [] }) {
  let itens = g.itens.map((i) => ({ ...i }));
  abrirModal(g.id ? "Editar grupo de equivalentes" : "Novo grupo de equivalentes", `
    <div class="duas"><label>Princípio ativo<input name="principio" required value="${esc(g.principio)}" placeholder="Ex.: Maropitant"></label><label>Forma<input name="forma" value="${esc(g.forma)}" placeholder="Injetável / comprimido…"></label></div>
    <div class="duas"><label>Concentração<input name="concentracao" value="${esc(g.concentracao)}" placeholder="Ex.: 10 mg/ml"></label>
    <label style="flex-direction:row;gap:8px;align-items:center;margin-top:18px"><input type="checkbox" name="semEquivalente" ${g.semEquivalente ? "checked" : ""}> 🚫 Não tem equivalente</label></div>
    <label>Observação<input name="obs" value="${esc(g.obs)}"></label>
    <h4 style="margin:6px 0">Nomes comerciais</h4><div id="eqIt"></div><button type="button" class="btn small" id="eqAdd">+ Nome comercial</button>
    <datalist id="dlProdEq">${produtos.map((p) => `<option value="${esc(p.nome)}">`).join("")}</datalist>`,
  async (f) => {
    ler(); if (!itens.length) throw new Error("Inclua pelo menos um nome comercial.");
    const d = { principio: f.principio.trim(), forma: f.forma, concentracao: f.concentracao, semEquivalente: !!f.semEquivalente, obs: f.obs, itens };
    g.id ? await updateDoc(doc(db, "equivalencias", g.id), d) : await addDoc(collection(db, "equivalencias"), { ...d, criadoPor: usuario.nome, criadoEm: serverTimestamp() });
    toast("Grupo salvo.");
  });
  function ler() { $("#eqIt").querySelectorAll("[data-k]").forEach((r) => { const i = itens[r.dataset.k];
    ["nome", "fabricante", "concentracao", "ressalva", "fotoUrl"].forEach((c) => (i[c] = r.querySelector(`[data-c="${c}"]`).value.trim()));
    i.relacao = r.querySelector('[data-c="relacao"]').value; i.preferencial = r.querySelector('[data-c="preferencial"]').checked;
    i.produtoId = produtos.find((p) => p.nome === r.querySelector('[data-c="estoque"]').value)?.id || ""; }); }
  function des() {
    $("#eqIt").innerHTML = itens.map((i, k) => `<div class="card" data-k="${k}" style="padding:10px;margin-bottom:8px">
      <div class="duas"><label>Nome comercial<input data-c="nome" value="${esc(i.nome)}"></label><label>Fabricante<input data-c="fabricante" value="${esc(i.fabricante)}"></label></div>
      <div class="duas"><label>Concentração<input data-c="concentracao" value="${esc(i.concentracao)}"></label><label>Relação<select data-c="relacao"><option value="identico" ${i.relacao !== "ressalva" ? "selected" : ""}>= Idêntico (troca direta)</option><option value="ressalva" ${i.relacao === "ressalva" ? "selected" : ""}>⚠ Substituto com ressalva</option></select></label></div>
      <label>Ressalva (quando houver)<input data-c="ressalva" value="${esc(i.ressalva)}" placeholder="Ex.: concentração diferente, recalcular dose"></label>
      <div class="duas"><label>Ligar ao produto do estoque (mostra quantidade e foto)<input data-c="estoque" list="dlProdEq" value="${esc(produtos.find((p) => p.id === i.produtoId)?.nome || "")}"></label>
      <label>Link da foto (se não estiver no estoque) <a href="${googleImg(i.nome + " " + (i.fabricante || ""))}" target="_blank" class="small">🔎 Google</a><input data-c="fotoUrl" value="${esc(i.fotoUrl)}"></label></div>
      <div class="barra" style="margin:0"><label style="flex-direction:row;gap:6px;align-items:center;margin:0"><input type="checkbox" data-c="preferencial" ${i.preferencial ? "checked" : ""}> ⭐ Principal da clínica</label><span style="flex:1"></span><button type="button" class="btn small danger" data-rm="${k}">Remover</button></div></div>`).join("");
    $("#eqIt").querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { ler(); itens.splice(b.dataset.rm, 1); des(); }));
  }
  $("#eqAdd").onclick = () => { ler(); itens.push({ nome: "", fabricante: "", concentracao: "", relacao: "identico", ressalva: "", produtoId: "", fotoUrl: "", preferencial: false }); des(); };
  des(); $("#modal .modal-card").style.width = "min(760px,100%)";
}


/* ================= 1.3 BUSCA INTELIGENTE DE EXAMES (menor preço entre laboratórios) ================= */
// Dados em dados-exames.js, cálculo em busca-exames.js. "Usar na solicitação" leva a combinação para a Nova solicitação.
let buscaSel = [], buscaOff = new Set(), preSolicitacao = null;
const BUSCA_ATALHOS = ["HEMOGRAMA", "UREIA", "CREATININA", "ALT", "AST", "FA", "ALBUMINA", "GLICOSE", "POTASSIO", "SODIO", "LACTATO", "GGT"];
const rs = (n) => "R$ " + Number(n).toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
async function telaBuscaExames(v) {
  const cat0 = (await carregarCatalogo()).filter((c) => c.laboratorio && !isPrest(c) && c.valor > 0);
  if (!cat0.length) { v.innerHTML = `<div class="card"><p class="erro">Importe o catálogo de exames primeiro (Catálogo de exames → Importar catálogo completo).</p></div>`; return; }
  const { IT, LB } = montarBusca(cat0), LABS = [...new Set(IT.map((i) => i[1]))].sort();
  const cobre = {}; IT.forEach((i) => i[5].forEach((c) => (cobre[c] = 1)));
  const IDS = Object.keys(cobre).filter((c) => LB[c]).sort((a, b) => LB[a].localeCompare(LB[b], "pt"));
  v.innerHTML = `<div id="beRaiz"><div class="card" style="margin-bottom:14px"><h2 style="margin-top:0">Quais exames o paciente precisa?</h2>
    <input id="beQ" type="search" placeholder="Digite um exame: hemograma, ureia, lactato…" autocomplete="off" style="width:100%"><div id="beSug"></div>
    <div class="barra" id="beChips" style="margin:10px 0 0"></div><div class="barra" id="beQuick" style="margin:10px 0 0"></div>
    <p class="muted small" style="margin:12px 0 6px">Laboratórios considerados (toque para ligar ou desligar):</p><div class="barra" id="beLabs" style="margin:0"></div></div><div id="beOut"></div></div>`;
  const desenharTopo = () => {
    $("#beChips").innerHTML = buscaSel.length ? buscaSel.map((c) => `<button class="be-chip on" data-rm="${esc(c)}">${esc(LB[c])} ×</button>`).join("") : `<span class="muted small">Nenhum exame escolhido ainda.</span>`;
    $("#beQuick").innerHTML = `<span class="muted small">Atalhos:</span>` + BUSCA_ATALHOS.filter((c) => LB[c] && !buscaSel.includes(c)).map((c) => `<button class="be-chip" data-add="${esc(c)}">+ ${esc(LB[c])}</button>`).join("");
    $("#beLabs").innerHTML = LABS.map((l) => `<button class="be-chip ${buscaOff.has(l) ? "off" : "on"}" data-lab="${esc(l)}">${esc(l)}</button>`).join("");
  };
  const desenharSug = () => {
    const q = norm($("#beQ").value.trim()), box = $("#beSug");
    const ws = q.split(/\s+/).filter(Boolean), r = IDS.filter((c) => !buscaSel.includes(c) && ws.every((w) => norm(LB[c]).includes(w)));
    box.innerHTML = r.length ? `<div class="be-sug" style="max-height:260px">${r.map((c) => `<button data-add="${esc(c)}">${esc(LB[c])}</button>`).join("")}</div>` : `<p class="muted small">Nenhum exame com esse nome.</p>`;
  };
  let resultado = [];
  const desenharResultado = () => {
    const o = $("#beOut");
    if (!buscaSel.length) { o.innerHTML = `<div class="card"><p class="muted small" style="margin:0">Escolha os exames acima. A busca testa perfis, painéis e exames avulsos de todos os laboratórios e mostra as 6 combinações mais baratas pelo valor Vet Plus.</p></div>`; return; }
    if (buscaSel.length > 16) { o.innerHTML = `<div class="card"><p class="erro">Escolha no máximo 16 exames por vez.</p></div>`; return; }
    const pool = IT.filter((i) => !buscaOff.has(i[1])), r = resolverCombinacoes(pool, buscaSel, 6);
    if (r.missing) { o.innerHTML = `<div class="card"><p class="erro">Nenhum laboratório ligado faz “${esc(LB[r.missing])}”. Ligue outro laboratório ou retire o exame.</p></div>`; return; }
    const base = r.res[0].cost; resultado = r.res.map((x) => x.ch.map((i) => pool[i]));
    const tipo = (its) => { const p = its.filter((i) => i[3] === "Perfis/Painéis").length; return p === 0 ? "Somente exames avulsos" : p === its.length ? (p === 1 ? "Perfil / painel único" : "Perfis combinados") : "Perfil + avulsos"; };
    o.innerHTML = `<h2>${r.res.length} combinações mais baratas</h2>` + r.res.map((x, k) => {
      const its = resultado[k], extra = [...new Set(its.flatMap((i) => i[4]))].filter((c) => !buscaSel.includes(c) && LB[c]), tb = tubosPorLab(its.map((i) => i[6])), nl = tb.labs.length;
      return `<div class="card be-rank"><div class="be-pos">${k + 1}º</div><div style="min-width:0">
        <div class="barra" style="justify-content:space-between;margin-bottom:6px"><div class="be-tot">${rs(x.cost)}</div><div class="barra" style="margin:0"><span class="tag neutro">${tipo(its)}</span><span class="tag neutro">${nl} ${nl === 1 ? "laboratório" : "laboratórios"}</span>${k ? `<span class="tag neutro">+${rs(x.cost - base)} que o 1º</span>` : `<span class="tag ok">Mais barato</span>`}</div></div>
        ${its.map((i) => `<div class="be-it"><span>${i[3] === "Perfis/Painéis" ? "<b>Perfil/painel</b> " : ""}${esc(i[0])} <span class="tag neutro">${esc(i[1])}</span> <span class="muted small">${esc(prazoDe(i[6]))}</span>${i[3] === "Perfis/Painéis" ? `<div class="muted small">${i[4].map((c) => esc(LB[c] || c)).join(", ")}</div>` : ""}</span><b>${rs(i[2])}</b></div>`).join("")}
        ${extra.length ? `<p class="muted small" style="margin:8px 0 0">Exames extras incluídos sem pedir: ${extra.map((c) => esc(LB[c])).join(", ")}.</p>` : ""}
        <div class="be-tubes">${tb.labs.map((l) => `<div class="be-labbox"><b>${esc(l.lab)}</b>${["roxo", "vermelho", "cinza", "azul", "outro"].filter((t) => l[t]).map((t) => `<div class="be-tl"><span class="be-dot" style="background:${COR_TUBO[t][1]}"></span>${COR_TUBO[t][0]}<b>${l[t]}</b></div>`).join("")}<p class="muted small" style="margin:4px 0 0">${esc(l.comentario)}</p></div>`).join("")}</div>
        <div class="barra" style="margin:10px 0 0"><button class="btn primary" data-usar="${k}">➡ Usar na requisição</button><button class="btn" data-copy="${k}">Copiar lista</button></div></div></div>`;
    }).join("") + `<p class="muted small">Valores = valor cobrado pela Vet Plus. Perfis são comparados pelos exames que os compõem, mesmo com nomes diferentes entre laboratórios.</p>`;
  };
  const atualizar = () => { desenharTopo(); desenharSug(); desenharResultado(); };
  $("#beRaiz").onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.add) { if (!buscaSel.includes(b.dataset.add)) buscaSel.push(b.dataset.add); $("#beQ").value = ""; atualizar(); }
    else if (b.dataset.rm) { buscaSel = buscaSel.filter((c) => c !== b.dataset.rm); atualizar(); }
    else if (b.dataset.lab) { buscaOff.has(b.dataset.lab) ? buscaOff.delete(b.dataset.lab) : buscaOff.add(b.dataset.lab); atualizar(); }
    else if (b.dataset.copy !== undefined) {
      const its = resultado[+b.dataset.copy], tx = its.map((i) => `${i[0]} - ${i[1]} - ${rs(i[2])}`).join("\n") + "\nTotal: " + rs(its.reduce((s, i) => s + i[2], 0));
      (navigator.clipboard?.writeText(tx) || Promise.reject()).then(() => (b.textContent = "Copiado"), () => (b.textContent = "Copie manualmente"));
    } else if (b.dataset.usar !== undefined) {
      const its = resultado[+b.dataset.usar], tb = tubosPorLab(its.map((i) => i[6])), agora = agoraLocal();
      preSolicitacao = { exames: its.map((i) => ({ realizadoEm: agora, catId: i[6].id, nome: i[6].nome, grupo: "Laboratorial", laboratorio: i[6].laboratorio, pontos: Number(i[6].pontos || 1), valor: i[6].valor || 0, tubos: i[6].tubos || null, analitos: i[6].analitos || 0, prazo: i[6].prazo || "", composicao: i[6].composicao || [], pagamento: "Particular", convenio: "", coleta: { status: "Aguardando" } })),
        obs: "Coleta sugerida — " + tb.labs.map((l) => `${l.lab}: ${l.comentario}`).join(" | ") };
      location.hash = "#nova-solicitacao";
    }
  };
  $("#beQ").oninput = desenharSug;
  atualizar();
}

/* ================= REPASSE OU VENDA (empréstimo/venda de produto do estoque) ================= */
let filtroRp = { status: "aberto", busca: "" };
async function telaRepasses(v) {
  await carregarProdutos();
  const todos = (await getDocs(query(collection(db, "repasses"), orderBy("criadoEm", "desc")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  v.innerHTML = `<div class="barra"><h2>Repasse ou venda</h2><button class="btn primary" id="rpNovo">+ Novo repasse / venda</button>
    <input id="rpB" placeholder="Buscar pessoa, empresa ou produto…" value="${esc(filtroRp.busca)}"><select id="rpS"><option value="aberto">Em aberto (com a pessoa/empresa)</option><option value="todos">Todos</option><option>Devolvido</option><option>Vendido</option></select></div>
  <p class="muted small">Use quando um produto do estoque sai emprestado ou vendido. Ele é retirado do estoque na hora e fica anotado aqui até a devolução ou a venda ser confirmada.</p>
  <div class="tabela-wrap"><table><thead><tr><th>Retirado em</th><th>Produto</th><th>Tipo</th><th>Pessoa / empresa</th><th>Quem buscou</th><th>Situação</th><th></th></tr></thead><tbody id="rpTb"></tbody></table></div>`;
  $("#rpS").value = filtroRp.status;
  const des = () => { const b = norm(filtroRp.busca), st = filtroRp.status;
    $("#rpTb").innerHTML = todos.filter((r) => (!b || norm(`${r.destinatario} ${r.produtoNome} ${r.quemBuscou}`).includes(b)) && (st === "todos" || (st === "aberto" ? r.status === "Em aberto" : r.status === st)))
      .map((r) => `<tr><td class="small">${esc(String(r.retiradoEm || "").replace("T", " ").slice(0, 16))}</td><td><b>${esc(r.produtoNome)}</b><div class="muted small">${esc(r.qtd)} ${esc(r.medida || "")}${r.valor ? " · " + brl(r.valor) : ""}</div></td>
      <td><span class="tag ${r.tipo === "Venda" ? "ok" : "alerta"}">${esc(r.tipo)}</span></td><td>${esc(r.destinatario)}<div class="muted small">${esc(r.tipoDest || "")}${r.contato ? " · " + esc(r.contato) : ""}</div></td>
      <td class="small">${esc(r.quemBuscou)}${r.obs ? `<div class="muted">${esc(r.obs)}</div>` : ""}</td><td><span class="tag ${r.status === "Em aberto" ? "alerta" : "ok"}">${esc(r.status)}</span>${r.fechadoEm ? `<div class="muted small">${esc(String(r.fechadoEm).replace("T", " ").slice(0, 16))}</div>` : ""}</td>
      <td class="acoes-linha">${r.status === "Em aberto" ? `${r.tipo === "Empréstimo" ? `<button class="btn small primary" data-dev="${r.id}">Voltou ao estoque</button>` : ""}<button class="btn small" data-ven="${r.id}">${r.tipo === "Venda" ? "Venda concluída" : "Virou venda"}</button>` : ""}${isMaster() ? `<button class="btn small danger" data-del="${r.id}">Excluir</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="7" class="muted">Nada por aqui.</td></tr>`; };
  des(); $("#rpB").oninput = (e) => { filtroRp.busca = e.target.value; des(); }; $("#rpS").onchange = (e) => { filtroRp.status = e.target.value; des(); };
  $("#rpNovo").onclick = () => abrirModal("Novo repasse ou venda", `
    <label>Produto do estoque<select name="produto" required><option value="">— escolha —</option>${produtos.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></label>
    <div class="duas"><label>Quantidade<input name="qtd" type="number" min="0.01" step="any" required></label><label>Tipo<select name="tipo"><option>Empréstimo</option><option>Venda</option></select></label></div>
    <div class="duas"><label>Para<select name="tipoDest"><option>Pessoa</option><option>Empresa</option></select></label><label>Nome da pessoa ou empresa<input name="destinatario" required></label></div>
    <div class="duas"><label>Contato (telefone)<input name="contato"></label><label>Valor da venda (opcional)<input name="valor" type="number" step="0.01" min="0"></label></div>
    <label>Quem veio buscar (ex.: motoboy João, Uber, a própria pessoa…)<input name="quemBuscou" required></label>
    <label>📅 Data e hora da retirada<input type="datetime-local" name="retiradoEm" required value="${agoraLocal()}"></label>
    <label>Observações<textarea name="obs" rows="2"></textarea></label>`,
  async (f) => { const p = produtos.find((x) => x.id === f.produto), qtd = Number(f.qtd); let retirados = [];
    await runTransaction(db, async (t) => { const ref = doc(db, "produtos", p.id), pd = (await t.get(ref)).data(), r = retirarFEFO(pd.lotesEstoque, qtd); retirados = r.retirados; t.update(ref, { lotesEstoque: r.lotes }); });
    await addDoc(collection(db, "repasses"), JSON.parse(JSON.stringify({ produtoId: p.id, produtoNome: p.nome, medida: p.medida || "", qtd, tipo: f.tipo, tipoDest: f.tipoDest, destinatario: f.destinatario.trim(), contato: f.contato, valor: Number(f.valor) || 0,
      quemBuscou: f.quemBuscou.trim(), retiradoEm: f.retiradoEm, obs: f.obs, lotes: retirados, status: "Em aberto", criadoPor: usuario.nome, criadoUid: usuario.uid, criadoEm: serverTimestamp() })));
    await log({ tipo: "repasse", produtoId: p.id, produtoNome: p.nome, qtd, obs: `${f.tipo} para ${f.destinatario}` }); toast("Retirado do estoque e anotado."); render(); }, "Retirar do estoque e anotar");
  $("#rpTb").onclick = async (e) => { const b = e.target.closest("button"); if (!b) return; const r = todos.find((x) => x.id === (b.dataset.dev || b.dataset.ven || b.dataset.del)); if (!r) return;
    if (b.dataset.del) { if (confirm("Excluir este registro? O estoque NÃO volta sozinho.")) { await deleteDoc(doc(db, "repasses", r.id)); render(); } return; }
    if (b.dataset.dev) { if (!confirm(`Confirmar que ${r.qtd} ${r.produtoNome} voltou ao estoque?`)) return;
      await runTransaction(db, async (t) => { const ref = doc(db, "produtos", r.produtoId), pd = (await t.get(ref)).data(); let lotes = pd.lotesEstoque || []; (r.lotes || []).forEach((x) => (lotes = addLote(lotes, x.qtd, x.validade))); t.update(ref, { lotesEstoque: lotes }); });
      await updateDoc(doc(db, "repasses", r.id), { status: "Devolvido", fechadoEm: agoraLocal(), fechadoPor: usuario.nome }); await log({ tipo: "repasse", produtoId: r.produtoId, produtoNome: r.produtoNome, qtd: r.qtd, obs: "Devolução de " + r.destinatario }); toast("Voltou ao estoque."); return render(); }
    if (b.dataset.ven) { if (!confirm("Marcar como vendido (o produto não volta ao estoque)?")) return; await updateDoc(doc(db, "repasses", r.id), { status: "Vendido", tipo: "Venda", fechadoEm: agoraLocal(), fechadoPor: usuario.nome }); toast("Venda registrada."); render(); } };
}

/* ================= 1.1 NOVA SOLICITAÇÃO (tela própria) ================= */
async function telaNovaSolicitacao(v) {
  const profs = await carregarProfissionais();
  v.innerHTML = `<div class="card grande-acao"><span style="font-size:3rem">🧪</span><h2>Nova requisição de exames</h2>
    <p class="muted">Dados do pet e do tutor, quem está solicitando, data da coleta e, em cada exame, se é particular ou qual plano.<br>Exames para o <b>LAB VETPLUS</b> e de imagem vão automaticamente para <b>Laudos → Liberar laudos</b>.</p>
    <button class="btn primary grande" id="abrirForm">+ Preencher nova requisição</button> <a class="btn grande" href="#busca-exames">💡 Busca inteligente (menor preço)</a></div>`;
  const pre = preSolicitacao; preSolicitacao = null; // vindo da Busca inteligente: já traz os exames, os laboratórios e a coleta sugerida
  const abrir = () => modalExame(pre ? { exames: pre.exames, obs: pre.obs } : {}, profs, { aposSalvar: () => (location.hash = "#exames") });
  $("#abrirForm").onclick = abrir; abrir();
}

/* ================= 2.1 LIBERAR LAUDOS / 2.3 LAUDOS LIBERADOS ================= */
async function telaLaudosPendentes(v) {
  const [docs, profs] = await Promise.all([getDocs(collection(db, "exames")).then((s) => s.docs.map((d) => ({ id: d.id, ...d.data() }))), carregarProfissionais()]);
  const pend = docs.flatMap((x) => (x.exames || []).map(normEx).map((e, k) => ({ x, e, k }))).filter(({ e }) => precisaLaudo(e))
    .sort((a, b) => (a.x.prioridade === "Urgente" ? -1 : 0) - (b.x.prioridade === "Urgente" ? -1 : 0) || (a.e.realizadoEm || "").localeCompare(b.e.realizadoEm || ""));
  v.innerHTML = `<div class="barra"><h2>Laudos para liberar (${pend.length})</h2><button class="btn primary" id="lbNovo">+ Liberar laudo (novo)</button></div>
  <p class="muted small">Exames de imagem e do LAB VETPLUS entram aqui sozinhos. Libere pelo <b>modelo</b> (texto com assinatura digital) ou <b>anexe o PDF</b> pronto.</p>
  <div class="tabela-wrap"><table><thead><tr><th>Coleta / realização</th><th>Paciente / tutor</th><th>Exame</th><th>Destino</th><th>Solicitante</th><th></th></tr></thead><tbody>
  ${pend.map(({ x, e }, i) => `<tr><td>${e.realizadoEm ? new Date(e.realizadoEm).toLocaleString("pt-BR").slice(0, 17) : "—"}${x.prioridade === "Urgente" ? ` <span class="tag critico">Urgente</span>` : ""}</td>
    <td><b>${esc(x.paciente)}</b><div class="muted small">${esc(x.tutor)}</div></td><td><b>${esc(e.nome)}</b>${e.regiao ? `<div class="muted small">${esc(e.regiao)}</div>` : ""}</td>
    <td class="small">${isPrest(e) ? "Imagem" + (e.realizadoPor ? " · " + esc(e.realizadoPor) : "") : esc(e.laboratorio || "")}</td><td>${esc(x.veterinario || "")}</td>
    <td class="acoes-linha"><button class="btn small primary" data-m="${i}">📝 Pelo modelo</button><button class="btn small" data-p="${i}">📎 Anexar PDF</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Nenhum laudo pendente. 👍</td></tr>`}</tbody></table></div>`;
  $("#lbNovo").onclick = async () => {
    const ms = (await getDocs(collection(db, "modelosLaudo"))).docs.map((d) => ({ id: d.id, ...d.data() })).sort((p, q) => (p.categoria || "").localeCompare(q.categoria || "") || p.nome.localeCompare(q.nome));
    const todos = docs.flatMap((x) => (x.exames || []).map(normEx).map((e, k) => ({ x, e, k }))).sort((p, q) => (q.e.realizadoEm || "").localeCompare(p.e.realizadoEm || ""));
    abrirModal("Liberar laudo", `<p class="muted small" style="margin:0">Puxe um paciente que já está no histórico <b>ou</b> preencha abaixo os mesmos dados da requisição.</p>
      <input id="lbBusca" autocomplete="off" placeholder="🔎 Buscar no histórico: paciente, tutor ou exame"><div id="lbRes" class="small res-cat" style="max-height:140px"></div>
      <h3 style="margin:8px 0 2px">Paciente</h3>
      <div class="duas"><label>Nome e sobrenome do pet<input name="paciente" required></label><label>Nome e sobrenome do tutor<input name="tutor" required></label></div>
      <div class="duas"><label>Espécie<input name="especie"></label><label>Raça<input name="raca"></label></div>
      <div class="duas"><label>Sexo<input name="sexo"></label><label>Idade<input name="idade"></label></div>
      <div class="duas"><label>Peso (kg)<input name="peso"></label><label>Data de abertura da requisição<input type="date" name="abre" value="${hoje()}"></label></div>
      <div class="duas"><label>Médico(a) solicitante<input name="vet"></label><label>CRMV do solicitante<input name="crmvSol"></label></div>
      <h3 style="margin:8px 0 2px">Exame / base do laudo</h3>
      <div class="duas"><label>Modelo de laudo<select name="modelo" id="lbMod"><option value="">— texto livre —</option>${[...new Set(ms.map((m) => m.categoria || "Sem categoria"))].map((cat) => `<optgroup label="${esc(cat)}">${ms.filter((m) => (m.categoria || "Sem categoria") === cat).map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join("")}</optgroup>`).join("")}</select></label>
      <label>Nome do exame<input name="exame" id="lbEx" placeholder="Ex.: Ultrassom abdominal"></label></div>`,
    async (f) => { const m = ms.find((m) => m.id === f.modelo), nome = (f.exame || m?.nome || "").trim(); if (!nome) throw new Error("Escolha o modelo ou digite o nome do exame.");
      setTimeout(() => emitirLaudo({ paciente: f.paciente.trim(), tutor: f.tutor.trim(), veterinario: f.vet, crmv: f.crmvSol, especie: f.especie, raca: f.raca, sexo: f.sexo, idade: f.idade, peso: f.peso }, { nome, realizadoEm: f.abre || hoje(), modeloId: f.modelo }, 0, profs), 50); }, "Continuar para o laudo");
    $("#lbMod").onchange = () => { const m = ms.find((m) => m.id === $("#lbMod").value); if (m && !$("#lbEx").value) $("#lbEx").value = m.nome; };
    const mostra = () => { const q = norm($("#lbBusca").value); const r = todos.filter(({ x, e }) => !q || norm(`${x.paciente} ${x.tutor} ${e.nome}`).includes(q)).slice(0, 30);
      $("#lbRes").innerHTML = r.map(({ x, e }, i) => `<button type="button" class="res-item" data-i="${i}"><b>${esc(x.paciente)}</b> · ${esc(x.tutor || "")} — ${esc(e.nome)}</button>`).join("") || `<span class="muted">Nada no histórico.</span>`;
      $("#lbRes").onclick = (ev) => { const b = ev.target.closest("[data-i]"); if (!b) return; const it = r[b.dataset.i]; fecharModal(); emitirLaudo(it.x, it.e, it.k, profs); }; };
    $("#lbBusca").oninput = mostra; mostra();
  };
  v.querySelectorAll("[data-m]").forEach((b) => (b.onclick = () => { const r = pend[b.dataset.m]; emitirLaudo(r.x, r.e, r.k, profs); }));
  v.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => anexarLaudoPdf(pend[b.dataset.p], profs)));
}
function anexarLaudoPdf({ x, e, k }, profs) {
  const laud = profs.filter((p) => p.podeLaudar);
  abrirModal(`📎 Anexar laudo em PDF — ${e.nome} · ${x.paciente}`, `
    <label>Arquivo PDF (até 700 KB)<input type="file" name="pdf" accept="application/pdf"></label>
    <p class="muted small">PDF maior? Salve no Google Drive, copie o link de compartilhamento e cole abaixo.</p>
    <label>…ou link do PDF<input name="link" placeholder="https://drive.google.com/…"></label>
    <label>Profissional responsável<select name="prof"><option value="">—</option>${laud.map((p) => `<option value="${p.id}" ${p.nome === (e.laudoPor || e.realizadoPor) ? "selected" : ""}>${esc(p.nome)}</option>`).join("")}</select></label>`,
  async (f, form) => {
    const arq = form.pdf.files[0]; let pdf = "";
    if (arq) { if (arq.size > 700 * 1024) throw new Error("PDF maior que 700 KB: use o link do Google Drive."); pdf = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(arq); }); }
    if (!pdf && !f.link.trim()) throw new Error("Escolha o PDF ou cole o link.");
    const p = laud.find((p) => p.id === f.prof);
    const ref = await addDoc(collection(db, "laudos"), { exameId: x.id, k, paciente: x.paciente, tutor: x.tutor, exame: e.nome, pdf, pdfLink: f.link.trim(), nomeArquivo: arq?.name || "",
      profissional: p?.nome || "", crmv: p?.crmv || "", liberadoPor: usuario.nome, liberadoUid: usuario.uid, liberadoEm: serverTimestamp() });
    await salvarCampo(x.id, k, "laudoId", ref.id); await salvarCampo(x.id, k, "laudo", "SIM");
    toast("Laudo anexado e liberado.");
  }, "Liberar laudo");
}
// Só quem liberou o laudo pode editar (as regras do Firestore também garantem isso)
function editarLaudo(l) {
  if (l.liberadoUid !== usuario.uid) return toast("Só quem liberou este laudo pode editá-lo.");
  abrirModal(`Editar laudo — ${l.exame} · ${l.paciente}`, `<div class="duas"><label>Data de abertura da requisição<input type="date" name="dataAbertura" value="${esc(l.dataAbertura || "")}"></label><label>Data da liberação<input type="date" name="dataLaudo" value="${esc(l.dataLaudo || hoje())}"></label></div>
    <label>Texto do laudo<textarea name="texto" rows="20" style="font-family:monospace">${esc(l.texto || "")}</textarea></label>
    <p class="muted small">Seu nome, CRMV e assinatura continuam os mesmos. A edição fica registrada.</p>`,
  async (f) => { await updateDoc(doc(db, "laudos", l.id), { texto: f.texto, dataAbertura: f.dataAbertura, dataLaudo: f.dataLaudo, editadoEm: serverTimestamp(), editadoPor: usuario.nome }); toast("Laudo atualizado."); render(); }, "Salvar alterações");
}
async function telaLaudosLiberados(v) {
  const ls = (await getDocs(query(collection(db, "laudos"), orderBy("liberadoEm", "desc")))).docs.map((d) => ({ id: d.id, ...d.data() }));
  let busca = "";
  v.innerHTML = `<div class="barra"><h2>Laudos liberados</h2><input id="lbB" placeholder="Buscar paciente, tutor, exame, profissional…"></div>
    <div class="tabela-wrap"><table><thead><tr><th>Liberado em</th><th>Paciente / tutor</th><th>Exame</th><th>Profissional</th><th>Formato</th><th></th></tr></thead><tbody id="lbTb"></tbody></table></div>`;
  const des = () => { const b = busca.toLowerCase();
    $("#lbTb").innerHTML = ls.filter((l) => !b || `${l.paciente} ${l.tutor} ${l.exame} ${l.profissional}`.toLowerCase().includes(b)).map((l) => `<tr><td>${fmtTs(l.liberadoEm)}</td>
      <td><b>${esc(l.paciente)}</b><div class="muted small">${esc(l.tutor || "")}</div></td><td>${esc(l.exame)}</td><td>${esc(l.profissional || "")}<div class="muted small">por ${esc(l.liberadoPor || "")}</div></td>
      <td>${l.pdf || l.pdfLink ? `<span class="tag neutro">PDF</span>` : `<span class="tag ok">Modelo</span>`}</td><td class="acoes-linha"><button class="btn small primary" data-v="${l.id}">Abrir</button>${l.liberadoUid === usuario.uid && !(l.pdf || l.pdfLink) ? `<button class="btn small" data-ed="${l.id}">✏️ Editar</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="6" class="muted">Nenhum laudo.</td></tr>`; };
  des(); $("#lbB").oninput = (e) => { busca = e.target.value; des(); };
  $("#lbTb").onclick = (e) => { const b = e.target.closest("[data-v]"); if (b) return abrirLaudo(ls.find((l) => l.id === b.dataset.v));
    const ed = e.target.closest("[data-ed]"); if (ed) editarLaudo(ls.find((l) => l.id === ed.dataset.ed)); };
}

/* ================= 3 · PRODUÇÃO POR MÉDICO, POR SEMANA ================= */
const inicioSemana = (iso) => { const d = new Date((iso || hoje()).slice(0, 10) + "T12:00"); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
async function telaProducao(v) {
  const linhas = await linhasDoMes(planMes);
  const montar = (filtro, chave) => { const m = {}, sem = new Set();
    linhas.filter(filtro).forEach(({ x, e }) => { const k = chave(x, e) || "(sem nome)", s = inicioSemana(e.realizadoEm); sem.add(s); m[k] ??= {}; m[k][s] = (m[k][s] || 0) + 1; });
    return { m, sem: [...sem].sort() }; };
  const tabela = (titulo, { m, sem }) => `<div class="card" style="margin-bottom:14px"><h3 style="margin-top:0">${titulo}</h3><div class="tabela-wrap"><table><thead><tr><th>Profissional</th>${sem.map((s) => `<th>Semana de ${fmtData(s).slice(0, 5)}</th>`).join("")}<th>Total</th></tr></thead><tbody>
    ${Object.entries(m).sort((a, b) => Object.values(b[1]).reduce((x, y) => x + y, 0) - Object.values(a[1]).reduce((x, y) => x + y, 0)).map(([k, w]) => `<tr><td><b>${esc(k)}</b></td>${sem.map((s) => `<td>${w[s] || ""}</td>`).join("")}<td><b>${Object.values(w).reduce((x, y) => x + y, 0)}</b></td></tr>`).join("") || `<tr><td class="muted">Sem registros.</td></tr>`}</tbody></table></div></div>`;
  const real = montar(({ e }) => isPrest(e), (x, e) => e.realizadoPor), sol = montar(() => true, (x) => x.veterinario);
  v.innerHTML = `<div class="barra"><h2>Produção por médico</h2><input type="month" id="pdMes" value="${planMes}"><button class="btn" id="pdCsv">Exportar (Excel)</button><button class="btn" onclick="print()">Imprimir</button></div>
    ${tabela("Exames de imagem / serviços realizados", real)}${tabela("Exames solicitados (por quem pediu)", sol)}`;
  $("#pdMes").onchange = (e) => { planMes = e.target.value; render(); };
  $("#pdCsv").onclick = () => { const rows = [["tipo", "profissional", "semana", "quantidade"]];
    [["realizados", real], ["solicitados", sol]].forEach(([t, { m }]) => Object.entries(m).forEach(([k, w]) => Object.entries(w).forEach(([s, n]) => rows.push([t, k, fmtData(s), n]))));
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.join(";")).join("\n")], { type: "text/csv" })); a.download = `producao_${planMes}.csv`; a.click(); };
}
