// Funções da Solicitação de exames: ler o catálogo (JSON/CSV), tubos por laboratório, prazo e dinheiro.
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const slugId = (nome, lab) => norm(`${nome}_${lab}`).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 120);
const num = (s) => { if (typeof s === "number") return s; const t = String(s ?? "").trim().replace(/\./g, "").replace(",", "."); const n = parseFloat(t); return Number.isFinite(n) ? n : 0; };

// Lê o catálogo (JSON ou CSV com ponto e vírgula). "custo" = valor do laboratório: vai para uma coleção só do Master.
export function lerCatalogo(texto) {
  texto = texto.replace(/^﻿/, "").trim(); let lin;
  if (texto.startsWith("[")) lin = JSON.parse(texto).map((x) => ({ nome: x.nome_sistema, lab: x.laboratorio, categoria: x.categoria, tipo: x.tipo, composicao: x.composicao || [], custo: num(x.valor_laboratorio), valor: num(x.valor_vetplus),
    tubos: { roxo: x.tubos?.roxo || 0, vermelho: x.tubos?.vermelho || 0, cinza: x.tubos?.cinza || 0, azul: x.tubos?.azul || 0, outro: x.tubos?.outro || 0 }, analitos: num(x.analitos_soro), prazo: x.prazo_liberacao || "" }));
  else { const L = texto.split(/\r?\n/).filter(Boolean), H = L[0].split(";").map((h) => h.trim());
    lin = L.slice(1).map((l) => { const c = l.split(";"), g = (n) => c[H.indexOf(n)] ?? "";
      return { nome: g("nome_sistema"), lab: g("laboratorio"), categoria: g("categoria"), tipo: g("tipo"), composicao: [], custo: num(g("valor_laboratorio")), valor: num(g("valor_vetplus")),
        tubos: { roxo: num(g("tubo_roxo")), vermelho: num(g("tubo_vermelho")), cinza: num(g("tubo_cinza")), azul: num(g("tubo_azul")), outro: num(g("outro_recipiente")) }, analitos: num(g("analitos_soro")), prazo: g("prazo_liberacao").trim() }; }); }
  return lin.filter((x) => x.nome && x.lab).map((x) => ({ nome: String(x.nome).trim(), laboratorio: String(x.lab).trim().toUpperCase(), categoria: x.categoria, tipo: x.tipo, composicao: x.composicao, custo: x.custo, valor: x.valor, tubos: x.tubos, analitos: x.analitos, prazo: x.prazo, grupo: "Laboratorial", pontos: 1, ativo: true }));
}

export const prazoDe = (e, prest) => e.prazo || (prest ? "até 72h úteis" : "a confirmar");

export const COR_TUBO = { roxo: ["Roxo (EDTA)", "#a78bd4"], vermelho: ["Vermelho (soro)", "#d4473b"], cinza: ["Cinza (fluoreto)", "#8d979b"], azul: ["Azul (citrato)", "#4f8fd6"], outro: ["Outro recipiente", "#c9a063"] };
const lista = (a) => (a.length <= 2 ? a.join(" e ") : a.slice(0, 2).join(", ") + " e outros");
// Tubos por laboratório: laboratórios diferentes nunca dividem tubo. Vermelho = 1 a cada 10 análises de soro.
export function tubosPorLab(itens) {
  const L = {};
  for (const e of itens) { if (!e.tubos || !e.laboratorio) continue;
    const l = (L[e.laboratorio] ||= { lab: e.laboratorio, roxo: 0, cinza: 0, azul: 0, outro: 0, soro: 0, n: { roxo: [], cinza: [], azul: [], outro: [] } });
    for (const c of ["roxo", "cinza", "azul"]) if (e.tubos[c]) { l[c] = 1; l.n[c].push(e.nome); }
    if (e.tubos.outro) { l.outro += Number(e.tubos.outro); l.n.outro.push(e.nome); }
    l.soro += Number(e.analitos) || (e.tubos.vermelho ? 1 : 0); }
  const out = Object.values(L).map((l) => { l.vermelho = l.soro ? Math.ceil(l.soro / 10) : 0; const p = [];
    if (l.vermelho) p.push(`${l.vermelho} vermelho${l.vermelho > 1 ? "s" : ""} por ${l.soro} análise${l.soro > 1 ? "s" : ""} de soro`);
    if (l.roxo) p.push(`1 roxo para ${lista(l.n.roxo)}`); if (l.cinza) p.push(`1 cinza para ${lista(l.n.cinza)}`); if (l.azul) p.push(`1 azul para ${lista(l.n.azul)}`);
    if (l.outro) p.push(`${l.outro} outro${l.outro > 1 ? "s" : ""} recipiente${l.outro > 1 ? "s" : ""} para ${lista(l.n.outro)}`);
    l.comentario = p.join("; "); return l; });
  const total = { roxo: 0, vermelho: 0, cinza: 0, azul: 0, outro: 0 }; out.forEach((l) => Object.keys(total).forEach((c) => (total[c] += l[c])));
  return { labs: out, total };
}
