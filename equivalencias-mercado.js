// Equivalentes de mercado (Brasil) que já vêm prontos no sistema. Botão: Equivalentes → "Carregar equivalentes de mercado".
// "termos": pedaços de nome que fazem o produto do estoque entrar no grupo (ex.: digitar "Vicryl" mostra todos os fios do mesmo tipo).
// ATENÇÃO: confira com a tabela/rótulos da clínica; a gestora pode editar qualquer grupo na tela.
const I = (nome, fabricante, relacao = "identico", ressalva = "", extra = {}) => ({ nome, fabricante, concentracao: "", relacao, ressalva, produtoId: "", fotoUrl: "", preferencial: false, ...extra });
const CONF = "Marca do mercado veterinário: conferir no rótulo se a concentração e o volume são iguais antes de trocar.";

export const GRUPOS_MERCADO = [
  // Conforme a tabela de equivalência da clínica (colunas: Atramat · Ethicon · Covidien · B.Braun)
  { principio: "Fio absorvível – Ácido poliglicólico rápido (PGA Rapid)", forma: "Fio de sutura", concentracao: "", obs: "Absorção rápida. Covidien não tem equivalente.",
    termos: ["PGA RAPID", "VICRYL RAPID", "SAFIL QUICK"], itens: [I("PGA Rapid", "Atramat", "identico", "", { preferencial: true }), I("Vicryl Rapid", "Ethicon"), I("Safil Quick", "B.Braun")] },
  { principio: "Fio absorvível – Ácido poliglicólico (PGA)", forma: "Fio de sutura", concentracao: "", obs: "Mesmo tipo de fio, nomes comerciais diferentes (tabela da clínica).",
    termos: ["PGA", "VICRYL", "POLYCRYL", "SAFIL", "ACIDO POLIGLICOLICO"], itens: [I("PGA", "Atramat", "identico", "", { preferencial: true }), I("Vicryl", "Ethicon"), I("Polycryl", "Covidien"), I("Safil", "B.Braun")] },
  { principio: "Fio absorvível – Polidioxanona (PDX)", forma: "Fio de sutura", concentracao: "", obs: "Mesmo tipo de fio, nomes comerciais diferentes (tabela da clínica).",
    termos: ["PDX", "PDS", "PSDII", "PS2", "SURGICRYL", "MAXON", "MONOPLUS", "POLIDIOXANONA"], itens: [I("PDX", "Atramat", "identico", "", { preferencial: true }), I("PSDII", "Ethicon"), I("Surgicryl ou Maxon", "Covidien"), I("Monoplus", "B.Braun")] },
  { principio: "Fio absorvível – Poliglecaprone 25 (PGC25)", forma: "Fio de sutura", concentracao: "", obs: "Mesmo tipo de fio, nomes comerciais diferentes (tabela da clínica).",
    termos: ["PGC25", "PGC 25", "MONOCRYL", "MONOFYL", "MONOSYN", "POLIGLECAPRONE"], itens: [I("PGC25", "Atramat", "identico", "", { preferencial: true }), I("Monocryl", "Ethicon"), I("Monofyl", "Covidien"), I("Monosyn", "B.Braun")] },
  { principio: "Fio absorvível – Catgut cromado", forma: "Fio de sutura", concentracao: "", obs: "B.Braun não tem equivalente. Cromado e simples NÃO são iguais.",
    termos: ["CATGUT CROMADO", "CATEGUTE CROMADO"], itens: [I("Catgut cromado", "Atramat", "identico", "", { preferencial: true }), I("Catgut cromado", "Ethicon"), I("Catgut cromado", "Covidien")] },
  { principio: "Fio absorvível – Catgut simples", forma: "Fio de sutura", concentracao: "", obs: "B.Braun não tem equivalente.",
    termos: ["CATGUT SIMPLES", "CATEGUTE SIMPLES"], itens: [I("Catgut simples", "Atramat", "identico", "", { preferencial: true }), I("Catgut simples", "Ethicon"), I("Catgut simples", "Covidien")] },
  { principio: "Dexametasona (injetável)", forma: "Injetável", concentracao: "2 mg/ml – frasco 10 ml", obs: "Mesma concentração e volume: marcas do mercado veterinário brasileiro. Conferir o rótulo.",
    termos: ["DEXAMETASONA", "CORTIVET", "CORTVET", "AZIUM", "DEXAJECT", "DEXADOR"], itens: [I("Cortvet / Cortivet 2 mg/ml", "", "identico", "", { preferencial: true }), I("Azium", "MSD Saúde Animal", "ressalva", CONF), I("Dexaject", "", "ressalva", CONF), I("Dexador", "", "ressalva", CONF), I("Dexametasona 2 mg/ml (outras marcas)", "", "ressalva", CONF)] },
  { principio: "Dexametasona (injetável) – frasco grande", forma: "Injetável", concentracao: "2 mg/ml – frasco 50 ml", obs: "Mesma concentração, apresentação de 50 ml.",
    termos: [], itens: [I("Cortvet 2 mg/ml 50 ml", "", "identico", "", { preferencial: true }), I("Dexametasona 2 mg/ml 50 ml (outras marcas)", "", "ressalva", CONF)] },
  { principio: "Dexametasona 2,5 mg/ml (com ressalva)", forma: "Injetável", concentracao: "2,5 mg/ml", obs: "Concentração diferente de 2 mg/ml: recalcular a dose.",
    termos: ["DEXACORT"], itens: [I("Dexacort 2,5 mg/ml", "", "ressalva", "Concentração 2,5 mg/ml (não 2 mg/ml): recalcular a dose.")] }
];
