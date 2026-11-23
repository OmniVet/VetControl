// Prepara o catálogo novo (Firestore) para a Busca inteligente: dá a mesma "chave" a exames iguais de laboratórios diferentes.
const n = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const ALIAS = [[/^(gama ?gt|ggt)( |$)/, "ggt"], [/^colesterol( total)?$/, "colesterol"], [/^cpk/, "cpk"], [/^bilirrubin/, "bilirrubina"], [/^(acido )?lactic|^lactato$|^acido lactico/, "lactato"],
  [/^(contagem de )?plaquetas/, "plaquetas"], [/^(contagem de )?reticulocitos/, "reticulocitos"], [/^ttpa|^tempo de tromboplastina/, "ttpa"], [/^tp( |$)|^tempo de protrombina/, "tp"],
  [/^urinalise/, "urinalise"], [/^proteina total/, "proteina total"], [/^fosfatase alcalina|^fa$/, "fa"], [/^alt( |$)/, "alt"], [/^ast( |$)/, "ast"], [/^calcio ionico/, "calcio ionico"], [/^glicose/, "glicose"], [/^cloro/, "cloro"],
  [/^hemograma completo( |$)(?!.*(aves|repteis))/, "hemograma"], [/^hemograma completo.*(aves|repteis)/, "hemograma aves"]];
export function chave(nome) {
  const t = n(nome).replace(/\(.*?\)/g, " ").replace(/[^a-z0-9]+/g, " ").trim(), comParen = n(nome).replace(/[^a-z0-9]+/g, " ").trim();
  for (const [re, k] of ALIAS) if (re.test(t) || re.test(comParen)) return k;
  return t;
}
// Devolve IT = [nome, laboratório, valor Vet Plus, grupo, composição(chaves), exames que cobre(chaves), item do catálogo] e LB = chave → nome para mostrar.
export function montarBusca(cat) {
  const IT = [], LB = {};
  for (const c of cat) {
    const perfil = c.tipo === "perfil" || c.tipo === "painel", ks = perfil && (c.composicao || []).length ? [...new Set(c.composicao.map(chave))] : [chave(c.nome)];
    if (!perfil) LB[ks[0]] = LB[ks[0]] || c.nome.replace(/\s*\(.*?\)\s*/g, " ").trim();
    else (c.composicao || []).forEach((x) => { const k = chave(x); LB[k] = LB[k] || x; });
    IT.push([c.nome, c.laboratorio, Number(c.valor), perfil ? "Perfis/Painéis" : "Avulso", ks, ks, c]);
  }
  IT.forEach((i) => { i[4].forEach((k) => { LB[k] = LB[k] || k; }); });
  return { IT, LB };
}
