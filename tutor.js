// Portal do tutor: acesso só de leitura aos próprios pets e vacinas (garantido pelas regras do Firestore).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, updatePassword } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { cartaoHtml, CARTAO_CSS } from "./cartao.js";
import { firebaseConfig, CLINICA, DOMINIO_TUTOR, DIAS_A_VENCER } from "./firebase-config.js";

const app = initializeApp(firebaseConfig), auth = getAuth(app), db = getFirestore(app);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const dig = (t) => String(t || "").replace(/\D/g, "");
const fmt = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const hoje = new Date().toLocaleDateString("sv-SE");
const em = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString("sv-SE"); };
async function sha256(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""); }

$("#clinica").textContent = CLINICA.nome;
document.head.insertAdjacentHTML("beforeend", `<style>${CARTAO_CSS}</style>`);
$("#agendar").href = `https://wa.me/${dig(CLINICA.whatsapp || CLINICA.telefone).replace(/^(?!55)/, "55")}?text=${encodeURIComponent("Olá! Gostaria de agendar uma vacina. 🐾")}`;
$("#login").cpf.oninput = (e) => { const d = dig(e.target.value).slice(0, 11); e.target.value = d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"); };

$("#login").onsubmit = async (e) => {
  e.preventDefault(); $("#erro").textContent = "Entrando…";
  const cpf = dig(e.target.cpf.value);
  try {
    const ac = await getDoc(doc(db, "acessos", await sha256(cpf)));
    if (!ac.exists()) throw 0;
    await signInWithEmailAndPassword(auth, `${cpf}.${ac.data().v}@${DOMINIO_TUTOR}`, e.target.senha.value);
  } catch { $("#erro").textContent = "CPF ou senha incorretos."; }
};
$("#sair").onclick = () => signOut(auth);
$("#imprimir").onclick = () => print();
$("#trocar").onclick = async () => {
  const s = prompt("Nova senha (mínimo 6 caracteres):"); if (!s) return;
  if (s.length < 6) return alert("A senha precisa ter pelo menos 6 caracteres.");
  try { await updatePassword(auth.currentUser, s); alert("Senha alterada!"); } catch { alert("Por segurança, saia e entre de novo antes de trocar a senha."); }
};

onAuthStateChanged(auth, async (u) => {
  $("#login").classList.toggle("hidden", !!u); $("#area").classList.toggle("hidden", !u);
  if (!u) return;
  const [ps, vs] = await Promise.all([getDocs(query(collection(db, "pets"), where("tutorUid", "==", u.uid))), getDocs(query(collection(db, "vacinacoes"), where("tutorUid", "==", u.uid)))]);
  const pets = ps.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.ativo !== false), vacs = vs.docs.map((d) => d.data());
  $("#ola").textContent = `Olá, ${pets[0]?.tutorNome?.split(" ")[0] || "tutor(a)"}! 🐾`;
  $("#pets").innerHTML = pets.map((p) => {
    const aplic = vacs.filter((v) => v.petId === p.id && v.status === "Aplicada").sort((a, b) => b.data.localeCompare(a.data));
    const agend = vacs.filter((v) => v.petId === p.id && v.status === "Agendada" && v.data >= hoje);
    const porVac = {}; aplic.forEach((v) => (porVac[v.vacina] ??= v));
    return `<div class="card pet"><h2>${p.especie === "Felina" ? "🐱" : "🐶"} ${esc(p.nome)}</h2><div class="info">${esc([p.especie, p.raca, p.sexo].filter(Boolean).join(" · "))}${p.nascimento ? " · nasc. " + fmt(p.nascimento) : ""}</div>
      ${Object.values(porVac).map((v) => { const st = !v.proximaDose ? ["ok", "Em dia"] : v.proximaDose < hoje ? ["critico", "Atrasada"] : v.proximaDose <= em(DIAS_A_VENCER) ? ["alerta", "Vence em breve"] : ["ok", "Em dia"];
        return `<div class="vac"><div><b>${esc(v.vacina)}</b><span class="muted">Última: ${fmt(v.data)} · Próxima: <b>${fmt(v.proximaDose)}</b></span></div><span class="tag ${st[0]}">${st[1]}</span></div>`; }).join("") || `<p class="muted">Nenhuma vacina registrada ainda.</p>`}
      ${agend.map((a) => `<div class="vac"><div><b>${esc(a.vacina)}</b><span class="muted">Agendada para ${fmt(a.data)} ${esc(a.hora || "")}</span></div><span class="tag alerta">Agendada</span></div>`).join("")}
      <div style="margin-top:14px">${cartaoHtml(p, vacs.filter((v) => v.petId === p.id), CLINICA)}</div></div>`;
  }).join("") || `<div class="card">Nenhum pet encontrado. Fale com a clínica.</div>`;
});
