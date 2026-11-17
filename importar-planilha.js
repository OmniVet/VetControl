// Lê a planilha "Controle_Estoque_e_Patrimonio.xlsx" da clínica (uma aba por categoria) e transforma em dados do sistema.
// Entrada: { "Nome da aba": [[cabeçalho...], [linha...], ...] }. Não grava nada: só devolve o que será importado.
const ABAS_PRODUTO = ["Hospitalar Humano", "Veterinário", "Distribuidora Odontológica", "Especiais e Oncológicos", "Limpeza e Escritório", "Outros Custos"];
const MEDIDA = { unidade: "Unidade", un: "Unidade", ampola: "Ampola", rolo: "Rolo", pacote: "Pacote", "frasco-ampola": "Frasco-ampola", frasco: "Frasco", caixa: "Caixa", cx: "Caixa",
  galao: "Galão", "bag / galao": "Galão", "bolsa / frasco": "Bolsa", bolsa: "Bolsa", flaconete: "Flaconete", l: "Litro", litro: "Litro", ml: "Frasco", saco: "Saco", kit: "Kit" };
// Princípios sujeitos a controle especial (Portaria 344): marcados automaticamente, conferir.
const CONTROLADOS = /cetamina|ketamina|morfina|metadona|fentanil|remifentanil|tramadol|midazolam|diazepam|butorfanol|tiopental|fenobarbital|petidina|meperidina|buprenorfina|zolazepam|tiletamina|code[ií]na|nalbufina|clonazepam|alprazolam|gabapentina|pregabalina/i;
const semAcento = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const txt = (v) => (v == null ? "" : String(v).trim());
const numero = (v) => (v == null || v === "" ? null : Number(String(v).replace(",", ".")) || 0);
const dataIso = (v) => { if (!v) return ""; if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); return m ? `${m[3].length === 2 ? "20" + m[3] : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : ""; };
const ehExemplo = (obs) => /exemplo/i.test(obs || "");

function objetos(linhas) {
  const cab = (linhas[0] || []).map(txt);
  return linhas.slice(1).filter((l) => txt(l[0]) && l.slice(1).some((c) => txt(c))).map((l) => Object.fromEntries(cab.map((c, i) => [c, l[i]])));
}

export function lerPlanilhaClinica(abas) {
  const produtos = [], inventario = [], avisos = [];
  for (const aba of ABAS_PRODUTO) {
    if (!abas[aba]) { avisos.push(`Aba "${aba}" não encontrada.`); continue; }
    for (const r of objetos(abas[aba])) {
      const obs = txt(r["Observações"]); if (ehExemplo(obs)) continue;
      const nome = txt(r["Nome comercial"] || r["Produto"] || r["Item"]); if (!nome) continue;
      const principio = txt(r["Princípio ativo"]);
      const apres = semAcento(r["Apresentação"]), unid = semAcento(r["Unidade"]);
      const qtd = numero(r["Qtd. em estoque"]) || 0, validade = dataIso(r["Validade"] || r["Validade (se houver)"]);
      const minimo = numero(r["Estoque mínimo"]) || 0;
      const controlado = CONTROLADOS.test(principio + " " + nome);
      produtos.push({
        codigo: txt(r["Código"]), nome, categoria: aba, subcategoria: txt(r["Subcategoria"] || r["Tipo"] || r["Categoria"]), tipoItem: txt(r["Tipo"]),
        principio, especie: txt(r["Espécie indicada"]), marca: txt(r["Marca / Fabricante"] || r["Marca"]),
        medida: MEDIDA[apres] || MEDIDA[unid] || "Unidade", concentracao: txt(r["Concentração / Calibre"]), conteudo: [txt(r["Volume / Conteúdo"] || r["Volume / Tamanho"] || r["Tamanho / Conteúdo"]), txt(r["Unidade"])].filter(Boolean).join(" "),
        localizacao: txt(r["Localização"]), obs, controlado, controladoAuto: controlado,
        minimo, ideal: minimo ? minimo * 2 : 0, tipo: "estoque", qtdInicial: qtd, validadeInicial: validade, loteInicial: txt(r["Lote (opcional)"]),
        valorUnit: numero(r["Valor unitário"]) || 0, naoComprar: false,
      });
    }
  }
  // Instrumentais cirúrgicos e Inventário -> inventário/patrimônio
  for (const r of objetos(abas["Instrumentais Cirúrgicos"] || [])) {
    const obs = txt(r["Observações"]); if (ehExemplo(obs)) continue;
    inventario.push({ nome: txt(r["Instrumental"]), descricao: [txt(r["Função"]), txt(r["Modelo (reto/curvo…)"]), r["Tamanho (cm)"] ? r["Tamanho (cm)"] + " cm" : "", txt(r["Kit / Caixa cirúrgica"])].filter(Boolean).join(" · "),
      categoria: "Instrumental cirúrgico", local: "Sala de Instrumentais", qtd: numero(r["Qtd. em estoque"]) || 1, valorUnit: numero(r["Valor unitário"]) || 0, dataAquisicao: dataIso(r["Data de aquisição"]),
      estado: txt(r["Estado de conservação"]) || "Bom", fornecedor: txt(r["Marca"]), nf: "", patrimonio: txt(r["Código"]), obs });
  }
  for (const r of objetos(abas["Inventário"] || [])) {
    const obs = txt(r["Observações"]); if (ehExemplo(obs)) continue;
    inventario.push({ nome: txt(r["Item"]), descricao: txt(r["Marca / Modelo"]), categoria: txt(r["Categoria"]) || "Outros", local: txt(r["Setor / Local"]) || "Sala de Estoque",
      qtd: numero(r["Quantidade"]) || 1, valorUnit: numero(r["Valor unitário"]) || 0, dataAquisicao: dataIso(r["Data de aquisição"]), estado: txt(r["Estado de conservação"]) || "Bom",
      fornecedor: "", nf: txt(r["Nota fiscal / Fornecedor"]), patrimonio: txt(r["Nº patrimônio"]), obs });
  }
  // Compras de marketplace (Shopee…) -> lista de compras para o pedido
  const compras = objetos(abas["Compras Shopee e Similares"] || []).filter((r) => !ehExemplo(r["Observações"]) && txt(r["Item"]))
    .map((r) => ({ item: [txt(r["Item"]), txt(r["Especificação / variação"])].filter(Boolean).join(" — "), plataforma: txt(r["Plataforma"]), status: txt(r["Status"]), obs: txt(r["Observações"]), link: txt(r["Link do anúncio"]) }));
  // Avisos de nomes repetidos
  // Mesmo item em duas abas (ex.: álcool em Hospitalar e em Limpeza): fica um só, somando o saldo
  const vistos = {};
  const unicos = [];
  for (const p of produtos) { const k = semAcento(p.nome), o = vistos[k];
    if (!o) { vistos[k] = p; unicos.push(p); continue; }
    if (o.categoria !== p.categoria) { o.qtdInicial += p.qtdInicial; o.codigosExtras = [...(o.codigosExtras || []), p.codigo]; avisos.push(`"${p.nome}": ${o.codigo} (${o.categoria}) e ${p.codigo} (${p.categoria}) viraram um produto só.`); }
    else { unicos.push(p); avisos.push(`"${p.nome}" aparece duas vezes na aba ${p.categoria} (${o.codigo} e ${p.codigo}). Importei os dois: confira se são marcas diferentes e renomeie.`); } }
  produtos.length = 0; produtos.push(...unicos);
  // Grupos de equivalentes: produtos com o mesmo princípio ativo
  const porPrincipio = {};
  produtos.filter((p) => p.principio).forEach((p) => (porPrincipio[semAcento(p.principio)] ??= []).push(p));
  const conc = (p) => { const t = semAcento(p.concentracao + " " + p.nome).replace(",", "."); const m = t.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|ui|g)\s*\/\s*(\d*\s*ml)/) || t.match(/(\d+(?:\.\d+)?)\s*(%)/); return m ? m.slice(1).join("").replace(/\s/g, "") : semAcento(p.concentracao); };
  const FORMAS = ["alcoolica", "degermante", "aquosa", "topica", "oral", "gel", "spray", "pomada", "colirio", "comprimido"];
  const forma = (p) => FORMAS.filter((f) => semAcento(p.nome + " " + p.subcategoria).includes(f)).join(",");
  const relacao = (p, base) => (conc(p) !== conc(base) ? "Concentração diferente: recalcular a dose." : forma(p) !== forma(base) ? "Formulação diferente (ex.: alcoólica × degermante): não é troca direta." : "");
  const grupos = Object.values(porPrincipio).filter((l) => l.length > 1).map((l) => ({
    principio: l[0].principio, forma: l[0].subcategoria, concentracao: l[0].concentracao, semEquivalente: false, obs: "Criado da planilha: confirme o que é troca direta.",
    itens: l.map((p) => ({ codigo: p.codigo, nome: p.nome, fabricante: p.marca, concentracao: p.concentracao || p.conteudo, relacao: relacao(p, l[0]) ? "ressalva" : "identico", ressalva: relacao(p, l[0]), produtoId: "", fotoUrl: "", preferencial: false })) }));
  return { produtos, inventario, compras, grupos, avisos };
}
