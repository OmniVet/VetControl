// Cartão de vacina com visual de cartão físico. Usado pelo sistema (app.js) e pelo portal do tutor (tutor.js).
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = (iso) => (iso ? iso.split("-").reverse().join("/") : "");

export const CARTAO_CSS = `
.cv-wrap{perspective:1600px;max-width:820px;margin:0 auto;font-family:Georgia,'Times New Roman',serif;color:#1f2a44}
.cv-capa{position:relative;background:linear-gradient(135deg,#1565c0,#0d3c78);color:#fff;border-radius:14px 22px 22px 14px;min-height:430px;padding:28px 24px;box-shadow:0 14px 34px #0d3c7855,inset 8px 0 0 #0b2f5e;
  display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;cursor:pointer;transform-origin:left center;transition:transform .9s cubic-bezier(.3,.7,.3,1),opacity .9s;max-width:400px;margin:auto}
.cv-capa .pata{font-size:64px;line-height:1;margin-bottom:10px}
.cv-capa h2{font-size:1.7rem;margin:6px 0;letter-spacing:1px;text-transform:uppercase}
.cv-capa .nome{background:#fff;color:#0d3c78;border-radius:8px;padding:8px 18px;font-size:1.35rem;font-weight:bold;margin:14px 0 6px;min-width:70%}
.cv-capa .clin{opacity:.85;font-size:.9rem;margin-top:18px;font-family:system-ui,sans-serif}
.cv-capa .abrir{margin-top:22px;font-family:system-ui,sans-serif;font-size:.85rem;background:#ffffff26;border-radius:99px;padding:7px 16px}
.cv-wrap.aberto .cv-capa{transform:rotateY(-170deg);opacity:0;pointer-events:none;position:absolute;left:0;right:0}
.cv-livro{display:none;grid-template-columns:1fr 1fr;background:#fffdf6;border-radius:12px;box-shadow:0 14px 34px #0d3c7840;overflow:hidden;animation:cvAbre .7s ease}
.cv-wrap.aberto .cv-livro{display:grid}
@keyframes cvAbre{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:none}}
.cv-pag{padding:18px 16px;background-image:repeating-linear-gradient(#fffdf6 0 27px,#e9eef6 27px 28px)}
.cv-pag+.cv-pag{border-left:2px dashed #c9d3e2}
.cv-pag h3{margin:0 0 10px;color:#0d3c78;font-size:1.05rem;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1565c0;padding-bottom:4px}
.cv-id div{display:flex;gap:6px;margin:6px 0;font-size:.95rem}.cv-id b{min-width:92px;color:#0d3c78}
.cv-id span{flex:1;border-bottom:1px dotted #8aa0bf;font-family:'Segoe Print','Bradley Hand',cursive}
.cv-grade{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cv-slot{border:1.5px solid #9fb3cf;border-radius:6px;background:#fff;padding:6px;min-height:168px;display:flex;flex-direction:column;gap:4px;font-size:.78rem;position:relative}
.cv-slot.vazio{background:repeating-linear-gradient(45deg,#fff 0 8px,#f6f8fc 8px 16px)}
.cv-rot{height:74px;display:flex;align-items:center;justify-content:center}
.cv-etq{width:96%;height:58px;border-radius:5px;box-shadow:1px 2px 4px #0003,inset 0 1px 0 #fff6;transform:rotate(-2deg);display:flex;flex-direction:column;justify-content:center;
  padding:4px 10px;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;position:relative;overflow:hidden}
.cv-etq::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 55%,#ffffff2e 56%,transparent 75%)}
.cv-etq .m{font-size:.8rem;font-weight:600;opacity:.95;line-height:1.05}
.cv-etq .n{font-size:.98rem;font-weight:800;letter-spacing:.3px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cv-slot .lin{display:flex;justify-content:space-between;border-bottom:1px dotted #b8c6da;padding:1px 0}
.cv-slot .lin span:last-child{font-family:'Segoe Print','Bradley Hand',cursive;color:#1a237e}
.cv-slot .prox{background:#e3f0fc;border-radius:4px;padding:3px 5px;font-weight:bold;color:#0d3c78;display:flex;justify-content:space-between}
.cv-slot .prox.atras{background:#fde8e8;color:#b71c1c}.cv-slot .prox.breve{background:#fdf3dc;color:#8a5a00}
.cv-slot .vet{font-size:.7rem;color:#555;text-align:center;border-top:1px solid #ccd6e4;margin-top:auto;padding-top:2px;font-style:italic}
.cv-fechar{display:none;margin:10px auto 0;font-family:system-ui,sans-serif}
.cv-wrap.aberto .cv-fechar{display:block}
@media (max-width:640px){.cv-livro{grid-template-columns:1fr}.cv-pag+.cv-pag{border-left:0;border-top:2px dashed #c9d3e2}}
@media print{.cv-capa,.cv-fechar{display:none!important}.cv-livro{display:grid!important;box-shadow:none;border:1px solid #999}.cv-slot{break-inside:avoid}}
`;

// Rótulo ilustrativo (desenho genérico): nome comercial em 2 linhas, cor fixa por vacina. Sem lote/validade.
const CORES = ["#5b2a86", "#1565c0", "#00897b", "#c62828", "#ef6c00", "#2e7d32", "#ad1457", "#455a64", "#6d4c41", "#283593"];
// Cor pelo TIPO de vacina (V10 azul, antirrábica vermelha…), igual para todas as marcas do mesmo tipo
const CORES_TIPO = [[/v10|v8|polivalente can|virose de c/i, "#1565c0"], [/v5|rcpch felv/i, "#00695c"], [/v4|felino 4|feline 4|rcpch|cvr/i, "#00796b"], [/v3|tricat|rcp|crp|virose de g/i, "#00897b"],
  [/felv|leuc/i, "#6a1b9a"], [/raiv|rab|antirr|defensor/i, "#c62828"], [/tosse|gripe|kc|bronch|respira|pneumo|bordet/i, "#ef6c00"], [/gi[aá]rd/i, "#2e7d32"], [/leish/i, "#6d4c41"]];
function corDe(nome, tipo = "") { for (const [re, c] of CORES_TIPO) if (re.test(tipo)) return c; for (const [re, c] of CORES_TIPO) if (re.test(nome)) return c;
  let h = 0; for (const ch of String(nome).toUpperCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return CORES[h % CORES.length]; }
export function rotulo(d) {
  const nome = (d.produto || d.vacina || "").trim(), partes = nome.split(/\s+/);
  const k = partes.length > 2 && /^(vanguard|nobivac|purevax|felocell|recombitek|duramune|providean|bronchi-shield|canigen|defense)$/i.test(partes[0]) && /^(viratec|i|b)$/i.test(partes[1]) ? 2 : 1;
  const [m, n] = partes.length > 1 ? [partes.slice(0, k).join(" "), partes.slice(k).join(" ")] : ["", nome];
  const c = d.cor || corDe(nome, d.vacina);
  return `<div class="cv-etq" style="background:linear-gradient(90deg,${c}cc,${c} 45%,${c})">${m ? `<span class="m">${esc(m)}</span>` : ""}<span class="n" ${m ? "" : 'style="font-size:1.15rem"'}>${esc(n)}</span></div>`;
}

export function cartaoHtml(p, doses, clinica, opts = {}) {
  const hoje = new Date().toLocaleDateString("sv-SE");
  const breve = (() => { const d = new Date(); d.setDate(d.getDate() + 15); return d.toLocaleDateString("sv-SE"); })();
  const ap = doses.filter((d) => d.status === "Aplicada").sort((a, b) => a.data.localeCompare(b.data));
  const ultimaDe = {}; ap.forEach((d) => (ultimaDe[d.vacina] = d)); // só a última dose de cada vacina conta para o alerta
  const slot = (d) => {
    const ehUlt = ultimaDe[d.vacina] === d, cls = ehUlt && d.proximaDose ? (d.proximaDose < hoje ? "atras" : d.proximaDose <= breve ? "breve" : "") : "";
    return `<div class="cv-slot"><div class="cv-rot">${rotulo(d)}</div>
      <div class="lin"><span>Vacina</span><span>${esc(d.vacina)}</span></div><div class="lin"><span>Data</span><span>${fmt(d.data)}</span></div>
      ${d.dose ? `<div class="lin"><span>Dose</span><span>${esc(d.dose)}</span></div>` : ""}
      ${d.proximaDose ? `<div class="prox ${cls}"><span>Próxima</span><span>${fmt(d.proximaDose)}${ehUlt ? "" : " ✓"}</span></div>` : ""}
      <div class="vet">${esc(d.veterinario || "")}</div></div>`;
  };
  const vazios = Math.max(0, (Math.ceil((ap.length + 1) / 4) * 4) - ap.length);
  const id = "cv" + Math.random().toString(36).slice(2, 8);
  return `<div class="cv-wrap ${opts.aberto ? "aberto" : ""}" id="${id}">
    <div class="cv-capa" onclick="document.getElementById('${id}').classList.add('aberto')">
      <div class="pata">${p.especie === "Felina" ? "🐱" : "🐶"}</div><h2>Cartão de Vacinação</h2><div class="nome">${esc(p.nome)}</div>
      <div>${esc([p.especie, p.raca].filter(Boolean).join(" · "))}</div><div class="clin">${esc(clinica?.nome || "")}</div><div class="abrir">👆 Toque para abrir</div></div>
    <div class="cv-livro">
      <div class="cv-pag"><h3>Identificação</h3><div class="cv-id">
        <div><b>Nome</b><span>${esc(p.nome)}</span></div><div><b>Espécie</b><span>${esc(p.especie || "")}</span></div><div><b>Raça</b><span>${esc(p.raca || "")}</span></div>
        <div><b>Sexo</b><span>${esc(p.sexo || "")}</span></div><div><b>Nascimento</b><span>${fmt(p.nascimento)}</span></div><div><b>Pelagem</b><span>${esc(p.pelagem || "")}</span></div>
        <div><b>Tutor</b><span>${esc(p.tutorNome || "")}</span></div><div><b>Telefone</b><span>${esc(p.telefone || "")}</span></div></div>
        <h3 style="margin-top:18px">Clínica</h3><div class="cv-id"><div><b>${esc(clinica?.nome || "")}</b></div><div><span>${esc(clinica?.endereco || "")}</span></div><div><span>${esc(clinica?.telefone || "")}</span></div></div></div>
      <div class="cv-pag"><h3>Vacinas</h3><div class="cv-grade">${ap.map(slot).join("")}${'<div class="cv-slot vazio"></div>'.repeat(vazios)}</div></div>
    </div>
    <button class="cv-fechar" onclick="document.getElementById('${id}').classList.remove('aberto')">Fechar cartão</button></div>`;
}
