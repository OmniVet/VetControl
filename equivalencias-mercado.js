// Equivalentes de mercado (Brasil) que já vêm prontos no sistema. Botão: Equivalentes → "Carregar equivalentes de mercado".
// "termos": pedaços de nome que fazem o produto do estoque entrar no grupo (ex.: digitar "Vicryl" mostra todos os fios do mesmo tipo).
// ATENÇÃO: confira com a tabela/rótulos da clínica; a gestora pode editar qualquer grupo na tela.
const I = (nome, fabricante, relacao = "identico", ressalva = "", extra = {}) => ({ nome, fabricante, concentracao: "", relacao, ressalva, produtoId: "", fotoUrl: "", preferencial: false, ...extra });
const CONF = "Marca do mercado veterinário: conferir no rótulo se a concentração e o volume são iguais antes de trocar.";

export const GRUPOS_MERCADO = [
  { principio: "Fio absorvível – Poliglactina 910 (multifilamento)", forma: "Fio de sutura", concentracao: "", obs: "Absorção em ~56–70 dias. Mesmo tipo de fio, nomes comerciais diferentes.",
    termos: ["VICRYL", "POLYSORB", "POLIGLACTINA", "POLYGLACTIN"], itens: [I("Vicryl", "Ethicon", "identico", "", { preferencial: true }), I("Polysorb", "Covidien / Medtronic"), I("Poliglactina 910 (genérico)", "Shalon / Technew / outros", "ressalva", "Confirmar calibre, agulha e tempo de absorção na embalagem.")] },
  { principio: "Fio absorvível – Polidioxanona (monofilamento, longa duração)", forma: "Fio de sutura", concentracao: "", obs: "Absorção lenta (~180 dias). Mesmo tipo de fio, nomes comerciais diferentes.",
    termos: ["PDS", "PS2", "POLIDIOXANONA", "MONOPLUS"], itens: [I("PDS II", "Ethicon", "identico", "", { preferencial: true }), I("Monoplus", "B. Braun"), I("Polidioxanona (genérico)", "Shalon / Technew / outros", "ressalva", "Confirmar calibre, agulha e tempo de absorção na embalagem.")] },
  { principio: "Fio absorvível – Poliglecaprone 25 (monofilamento)", forma: "Fio de sutura", concentracao: "", obs: "Ideal para pele e tecidos delicados; absorção ~90–120 dias.",
    termos: ["MONOCRYL", "POLIGLECAPRONE", "MONOSYN QUICK", "CAPROSYN"], itens: [I("Monocryl", "Ethicon", "identico", "", { preferencial: true }), I("Caprosyn", "Covidien / Medtronic", "ressalva", "Material parecido (poliglitona 6211), absorção mais rápida: confirmar com o veterinário."), I("Poliglecaprone (genérico)", "outros", "ressalva", "Confirmar calibre, agulha e tempo de absorção.")] },
  { principio: "Fio absorvível – Poligleconato (monofilamento)", forma: "Fio de sutura", concentracao: "", obs: "Absorção ~180 dias.",
    termos: ["MAXON", "MONOSYN", "POLIGLECONATO", "POLYGLYCONATE"], itens: [I("Maxon", "Covidien / Medtronic", "identico", "", { preferencial: true }), I("Monosyn", "B. Braun")] },
  { principio: "Fio absorvível – Ácido poliglicólico (multifilamento)", forma: "Fio de sutura", concentracao: "", obs: "Absorção ~60–90 dias.",
    termos: ["DEXON", "SAFIL", "POLIGLICOLICO", "ACIDO POLIGLICOLICO"], itens: [I("Dexon", "Covidien / Medtronic", "identico", "", { preferencial: true }), I("Safil", "B. Braun")] },
  { principio: "Fio absorvível – Categute (simples / cromado)", forma: "Fio de sutura", concentracao: "", obs: "Origem animal; absorve em 7–14 dias (simples) ou ~20 dias (cromado). Simples e cromado NÃO são iguais.",
    termos: ["CATGUT", "CATEGUTE", "CATGUT CROMADO"], itens: [I("Categute simples", "Ethicon / Shalon / Technew", "identico", "", { preferencial: true }), I("Categute cromado", "Ethicon / Shalon / Technew", "ressalva", "Absorve mais devagar que o simples: não são intercambiáveis sem aval do veterinário.")] },
  { principio: "Dexametasona (injetável)", forma: "Injetável", concentracao: "2 mg/ml – frasco 10 ml", obs: "Mesma concentração e volume: marcas do mercado veterinário brasileiro. Conferir o rótulo.",
    termos: ["DEXAMETASONA", "CORTIVET", "CORTVET", "AZIUM", "DEXAJECT", "DEXADOR"], itens: [I("Cortvet / Cortivet 2 mg/ml", "", "identico", "", { preferencial: true }), I("Azium", "MSD Saúde Animal", "ressalva", CONF), I("Dexaject", "", "ressalva", CONF), I("Dexador", "", "ressalva", CONF), I("Dexametasona 2 mg/ml (outras marcas)", "", "ressalva", CONF)] },
  { principio: "Dexametasona (injetável) – frasco grande", forma: "Injetável", concentracao: "2 mg/ml – frasco 50 ml", obs: "Mesma concentração, apresentação de 50 ml.",
    termos: [], itens: [I("Cortvet 2 mg/ml 50 ml", "", "identico", "", { preferencial: true }), I("Dexametasona 2 mg/ml 50 ml (outras marcas)", "", "ressalva", CONF)] },
  { principio: "Dexametasona 2,5 mg/ml (com ressalva)", forma: "Injetável", concentracao: "2,5 mg/ml", obs: "Concentração diferente de 2 mg/ml: recalcular a dose.",
    termos: ["DEXACORT"], itens: [I("Dexacort 2,5 mg/ml", "", "ressalva", "Concentração 2,5 mg/ml (não 2 mg/ml): recalcular a dose.")] }
];
