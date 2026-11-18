// Busca inteligente de exames: acha as combinações mais baratas de perfis/painéis/avulsos entre os laboratórios
// e calcula os tubos de coleta. Item da listagem: [nome, laboratório, valor, grupo, exames que o compõem, exames que cobre].
export const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const popc = (x) => { let n = 0; while (x) { n += x & 1; x >>= 1; } return n; };

// Busca em ordem de custo (A*): devolve as K combinações mais baratas que cobrem todos os exames pedidos (req).
export function resolverCombinacoes(items, req, K) {
  const m = req.length, full = (1 << m) - 1, idx = {}; req.forEach((r, i) => (idx[r] = i));
  let c = []; items.forEach((it, i) => { let mk = 0; it[5].forEach((x) => { if (x in idx) mk |= 1 << idx[x]; }); if (mk) c.push({ i, mk, p: it[2] + 0.01, pc: popc(mk) }); });
  c.sort((a, b) => a.p - b.p || b.pc - a.pc);
  const keep = []; c.forEach((a) => { if (!c.some((b) => b !== a && (b.mk & a.mk) === a.mk && b.p <= a.p && (b.mk !== a.mk || b.p < a.p || b.i < a.i))) keep.push(a); });
  c = keep;
  for (let a = 0; a < m; a++) if (!c.some((x) => (x.mk >> a) & 1)) return { missing: req[a] };
  const share = Array(m).fill(Infinity); c.forEach((x) => { for (let a = 0; a < m; a++) if ((x.mk >> a) & 1) share[a] = Math.min(share[a], x.p / x.pc); });
  const cand = Array.from({ length: m }, (_, a) => c.filter((x) => (x.mk >> a) & 1));
  const lb = (mask) => { let s = 0; for (let a = 0; a < m; a++) if (!((mask >> a) & 1)) s += share[a]; return s; };
  const heap = [];
  const push = (n) => { heap.push(n); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= heap[i].f) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const t = heap[0], l = heap.pop(); if (heap.length) { heap[0] = l; let i = 0; for (;;) { const a = 2 * i + 1, b = a + 1; let s = i; if (a < heap.length && heap[a].f < heap[s].f) s = a; if (b < heap.length && heap[b].f < heap[s].f) s = b; if (s === i) break; [heap[s], heap[i]] = [heap[i], heap[s]]; i = s; } } return t; };
  push({ mask: 0, cost: 0, f: lb(0), ch: [] });
  const res = [], seen = new Set(); let pops = 0;
  while (heap.length && res.length < K && pops < 400000) {
    const n = pop(); pops++;
    if (n.mask === full) {
      const key = n.ch.map((x) => x.i).sort((a, b) => a - b).join(","); if (seen.has(key)) continue; seen.add(key);
      const mk = n.ch.map((x) => x.mk); if (mk.some((_, j) => mk.reduce((o, v, k) => (k === j ? o : o | v), 0) === full)) continue; // item sobrando
      res.push({ ch: n.ch.map((x) => x.i), cost: n.cost }); continue;
    }
    let a = -1, best = 1e9; for (let k = 0; k < m; k++) if (!((n.mask >> k) & 1) && cand[k].length < best) { best = cand[k].length; a = k; }
    for (const x of cand[a]) { if (n.ch.some((y) => y.i === x.i)) continue; const nm = n.mask | x.mk; push({ mask: nm, cost: n.cost + x.p, f: n.cost + x.p + lb(nm), ch: n.ch.concat([x]) }); }
  }
  res.forEach((r) => (r.cost = r.ch.reduce((s, i) => s + items[i][2], 0)));
  return { res, pops };
}

// Tubos de coleta
export const TUBOS = { l: ["Roxo / lilás (EDTA)", "#a78bd4"], v: ["Vermelho (soro)", "#d4473b"], c: ["Cinza (fluoreto)", "#8d979b"], a: ["Azul (citrato)", "#4f8fd6"], o: ["Outro recipiente", "#c9a24a"] };
function classePartes(p) {
  const s = norm(p);
  if (/urina|urinalise|fezes|parasitol|histopat|citolog|biops|cultura|raspado|tricograma|swab|medula|mielograma|liquor|micolog|pele|acaros|ectopar|bacterioscop|fungos|giardia|kit/.test(s)) return "o";
  if (/glicose|glicemia|lactato/.test(s)) return "c";
  if (/coagul|protrombina|ttpa|fibrinog|dimero|\btp\b/.test(s)) return "a";
  if (/hemograma|reticul|hemoparas|hematozo|glicada|eritro|coombs|tipagem|\bpcr\b|leucograma|plaquet|hematocrito|babesia|ehrlichia|anaplasma|rangelia|hepatozoon|dirofilaria|mycoplasma|leishmania/.test(s)) return "l";
  return "v";
}
function tubosDoItem(it, LB) {
  const t = { l: 0, v: 0, c: 0, a: 0, o: 0 }; let n = 0;
  it[4].forEach((c) => { const k = classePartes(LB[c] || c); t[k] = 1; if (k === "v") n++; });
  return { t, n: n || (t.v ? 1 : 0) };
}
// Por laboratório: quantos tubos de cada tipo (1 vermelho a cada 10 análises de soro)
export function calcularTubos(items, LB) {
  const labs = {};
  items.forEach((it) => { const { t, n } = tubosDoItem(it, LB); const b = (labs[it[1]] = labs[it[1]] || { l: 0, v: 0, c: 0, a: 0, o: 0, vn: 0 });
    ["l", "c", "a"].forEach((k) => { if (t[k]) b[k] = 1; }); if (t.v) b.vn += n; if (t.o) b.o += 1; });
  Object.values(labs).forEach((b) => { b.v = b.vn ? Math.max(1, Math.ceil(b.vn / 10)) : 0; });
  return labs;
}
export function textoTubos(b) {
  const p = [];
  if (b.l) p.push("1 roxo");
  if (b.v) p.push(b.v + (b.v > 1 ? " vermelhos" : " vermelho") + " (" + b.vn + (b.vn > 1 ? " análises" : " análise") + " de soro, 1 tubo a cada 10)");
  if (b.c) p.push("1 cinza (glicose/lactato)");
  if (b.a) p.push("1 azul (coagulação)");
  if (b.o) p.push(b.o + " recipiente(s) à parte");
  return p.join(" · ") || "sem coleta";
}
