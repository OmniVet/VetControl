import { DESCRICOES, htmlDescricao, CSS_DESCRICAO, CARGO_DA_VAGA } from "./cargos-rh.js";
// Módulo "Entrevista": só Master e Gerente. Fichas de entrevista por tipo de vaga, com perguntas, comentários e sinais (+/−) para o balanço final.
const GERAIS = [
  "Qual a sua experiência na área?",
  "O que você mais gostava de fazer? Por quê?",
  "Qual foi o maior desafio que enfrentou? Por quê?",
  "Por quanto tempo trabalhou em cada lugar?",
  "Acha que aprende rápido? Pode dar um exemplo?",
  "Já teve experiência com emergências veterinárias?",
  "Tem dificuldade em falar ao telefone? E com pessoas novas?"
];
export const CATEGORIAS_ENTREVISTA = [
  { id: "estagiario", nome: "Estagiário(a)", icone: "🎓", anexos: true,
    atribuicoes: "Acompanhar rotina clínica; auxiliar na contenção e no preparo dos pacientes; organização e limpeza dos setores; apoio aos veterinários.",
    perguntas: ["Em que período do curso está e qual a previsão de formatura?", "Qual a sua disponibilidade de dias e horários (aulas, provas)?", "Por que escolheu estagiar aqui?", "Qual área da veterinária mais te interessa? Por quê?", "Como lida com a contenção de animais agressivos ou assustados?", "Como reage quando comete um erro ou recebe uma correção?", "Aceita plantões ou fins de semana quando necessário?"] },
  { id: "aux_vet", nome: "Auxiliar veterinário(a)", icone: "🩺", anexos: false,
    atribuicoes: "Contenção e preparo de pacientes; auxílio em consultas, exames e procedimentos; internamento (medicações, fluidoterapia, higiene); limpeza e organização de material; reposição de estoque dos setores.",
    perguntas: ["Há quanto tempo é formado(a)? Por onde?", "Qual a sua experiência profissional?", "Tem experiência com urgência e emergência? Fez algum curso recente nesta área? Qual?", "Tem experiência em cirurgia? Quais já acompanhou? Sabe o nome dos principais instrumentais cirúrgicos? E dos fios cirúrgicos?", "Consegue identificar um paciente que precisa de atendimento emergencial?", "Com os tutores: o que pensa deles? Como é a sua comunicação com eles? E com os demais membros da equipe? Trabalha bem com outras pessoas?", "Já trabalhou com animais exóticos ou silvestres? Trabalharia?", "Cria algum animal? Quais?", "Qual a sua experiência com internamento?", "Qual a sua disponibilidade para plantões de última hora?", "Quais procedimentos consegue realizar sozinho(a)? (deixe falar e depois pergunte: acesso venoso, coleta de sangue — com que técnica —, limpeza de feridas, retirada de pontos, contenção de animais, limpeza de baias, administração de medicação ocular, oral, retal e otológica)", "Consegue aprender rápido? Executa as atividades de forma rápida ou lenta?", "Tem experiência com recepção: atender telefone, marcar consultas, receber pagamentos e fazer cobranças? Como lida com um tutor que reclama de valores?"] },
  { id: "recepcao", nome: "Recepcionista", icone: "🛎️", anexos: true,
    atribuicoes: "Atendimento presencial e telefônico; agendamentos; cadastro de tutores e pacientes; orçamentos e cobranças; comunicação com a equipe; WhatsApp e redes.",
    perguntas: ["Tem experiência com atendimento ao público e telefone? Onde?", "Como lida com um cliente irritado ou com pressa?", "Usa bem computador, WhatsApp e planilhas? Já usou sistema de gestão?", "Como organiza várias demandas ao mesmo tempo (telefone, balcão, agenda)?", "Tem experiência com caixa, cobranças, Pix e maquininha?", "Como falaria com um tutor sobre um orçamento alto?", "Como lida com sigilo de informações de clientes e da clínica?"] },
  { id: "aux_oper", nome: "Auxiliar operacional", icone: "🧹", anexos: false,
    atribuicoes: "Limpeza e desinfecção de ambientes e materiais; lavagem e esterilização de instrumentais; reposição de insumos; descarte correto de resíduos; apoio à equipe.",
    perguntas: ["Tem experiência com limpeza hospitalar ou de clínicas?", "Sabe a diferença entre limpeza e desinfecção? Como faz cada uma?", "Conhece o descarte correto de lixo comum, infectante e perfurocortante?", "Já usou EPIs (luvas, avental, máscara)? Costuma usar sempre?", "Como organiza a rotina de limpeza de vários setores?", "Tem alguma restrição de saúde ou alergia a produtos de limpeza?", "Tem medo ou dificuldade com animais?"] },
  { id: "gerente", nome: "Gerente", icone: "📊", anexos: false,
    atribuicoes: "Gestão da equipe e das escalas; controle de estoque, compras e financeiro; indicadores e relatórios; qualidade do atendimento; apoio ao dono nas decisões.",
    perguntas: ["Qual a sua experiência com gestão de pessoas? Quantas pessoas liderou?", "Como resolve um conflito entre colaboradores?", "Como faz controle de estoque, compras e custos?", "Que indicadores acompanha no dia a dia de uma clínica?", "Como dá feedback a um colaborador que não está rendendo?", "Conhece rotinas trabalhistas básicas (escala, folga, ponto, férias)?", "Descreva uma situação de crise que resolveu. O que fez?"] },
  { id: "medico", nome: "Médico(a) veterinário(a)", icone: "👩‍⚕️", anexos: true,
    atribuicoes: "Consultas, exames e procedimentos; emissão de laudos e receitas; acompanhamento de internados; discussão de casos; atendimento de qualidade e registro correto em prontuário. Contratação como prestador(a) PJ.",
    perguntas: ["Qual a sua formação, pós-graduação e áreas de maior experiência?", "Qual o seu número de CRMV e está regular?", "Como conduz uma emergência (parada, trauma, intoxicação)?", "Como explica um diagnóstico difícil ou um prognóstico ruim ao tutor?", "Costuma atualizar-se? Quais cursos e congressos fez recentemente?", "Como trabalha em equipe com auxiliares e outros colegas?", "Qual a sua disponibilidade (dias, plantões) e a sua expectativa de remuneração?"] }
];
export { GERAIS };
const SINAIS = { "+": "➕", "-": "➖", "": "·" };

export function iniciarEntrevista(c) {
  const { db, fb, $, esc, toast, abrirModal, opts, eu, podeAcessar, docImpressao, comprimirImagem, CLINICA_NOME } = c;
  const { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } = fb;
  const agora = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
  const fdh = (s) => (s ? new Date(s).toLocaleString("pt-BR").slice(0, 17) : "—");
  const maskCpf = (s) => String(s || "").replace(/\D/g, "").slice(0, 11).replace(/(\d{3})(\d{3})(\d{3})(\d{0,2})/, (_, a, b, c2, d) => a + "." + b + "." + c2 + (d ? "-" + d : ""));
  const balanco = (ps) => { const mais = ps.filter((p) => p.sinal === "+").length, menos = ps.filter((p) => p.sinal === "-").length; return { mais, menos, saldo: mais - menos, resp: ps.filter((p) => p.sinal).length, total: ps.length }; };

  async function tela(v) {
    if (!podeAcessar()) { v.innerHTML = `<p class="aviso-ctrl">Este módulo é restrito ao Master e ao Gerente.</p>`; return; }
    const todas = (await getDocs(query(collection(db, "entrevistas"), orderBy("dataHora", "desc")))).docs.map((d) => ({ id: d.id, ...d.data() }));
    const inicio = () => {
      v.innerHTML = `<div class="barra"><h2>Entrevistas</h2></div><p class="muted small">🔒 Documentos restritos ao Master e ao Gerente. Escolha o tipo de vaga.</p>
        <div class="tiles">${CATEGORIAS_ENTREVISTA.map((k) => `<a class="tile" href="javascript:void 0" data-k="${k.id}"><span class="tile-ico">${k.icone}</span><b>${esc(k.nome)}</b><span class="tile-info">${todas.filter((x) => x.categoria === k.id).length} entrevista(s)</span></a>`).join("")}</div>`;
      v.querySelectorAll("[data-k]").forEach((a) => (a.onclick = () => lista(a.dataset.k)));
    };
    const lista = (kid) => {
      const k = CATEGORIAS_ENTREVISTA.find((x) => x.id === kid), itens = todas.filter((x) => x.categoria === kid);
      v.innerHTML = `<div class="barra"><button class="btn small" id="eVolta">◀ Tipos</button><h2 style="margin:0;flex:1">${k.icone} ${esc(k.nome)}</h2><button class="btn primary" id="eNova">+ Nova entrevista</button></div>
        <table><thead><tr><th>Data e hora</th><th>Candidato(a)</th><th>Telefone</th><th>Balanço</th><th>Parecer</th><th></th></tr></thead><tbody>${itens.map((x) => { const b = balanco(x.perguntas || []);
          return `<tr><td>${fdh(x.dataHora)}</td><td><b>${esc(x.nome)}</b></td><td>${esc(x.telefone || "")}</td><td>➕${b.mais} ➖${b.menos} <b>(${b.saldo > 0 ? "+" : ""}${b.saldo})</b></td><td>${esc(x.parecer || "—")}</td>
          <td class="acoes-linha"><button class="btn small" data-v="${x.id}">Abrir</button><button class="btn small" data-i="${x.id}">🖨 Ficha</button>${CARGO_DA_VAGA[k.id] ? `<button class="btn small" data-dc="${x.id}">🖨 Descrição de cargo</button>` : ""}<button class="btn small danger" data-x="${x.id}">Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="6" class="muted">Nenhuma entrevista ainda.</td></tr>`}</tbody></table>`;
      $("#eVolta").onclick = inicio; $("#eNova").onclick = () => ficha(k, null);
      v.querySelectorAll("[data-v]").forEach((b) => (b.onclick = () => ficha(k, itens.find((x) => x.id === b.dataset.v))));
      v.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => imprimir(k, itens.find((x) => x.id === b.dataset.i))));
      v.querySelectorAll("[data-dc]").forEach((b) => (b.onclick = () => { const x = itens.find((y) => y.id === b.dataset.dc); docImpressao(htmlDescricao(DESCRICOES[CARGO_DA_VAGA[k.id]], CLINICA_NOME, x.nome), "a4", "Descrição de cargo - " + x.nome, CSS_DESCRICAO); }));
      v.querySelectorAll("[data-x]").forEach((b) => (b.onclick = async () => { if (confirm("Excluir esta entrevista? Não dá para desfazer.")) { await deleteDoc(doc(db, "entrevistas", b.dataset.x)); toast("Entrevista excluída."); tela(v); } }));
    };
    function ficha(k, e) {
      const ps = e?.perguntas?.length ? e.perguntas.map((p) => ({ ...p })) : [...GERAIS.map((t) => ({ texto: t, geral: true })), ...k.perguntas.map((t) => ({ texto: t }))].map((p) => ({ resposta: "", comentario: "", sinal: "", ...p }));
      const dh = e?.dataHora || agora(); let inicioMs = e?.cronoInicio || null, anexos = { redacao: e?.redacaoFoto || "", termo: e?.termoFoto || "" };
      v.innerHTML = `<div class="barra"><button class="btn small" id="fVolta">◀ ${esc(k.nome)}</button><h2 style="margin:0;flex:1">Entrevista – ${esc(k.nome)}</h2><span class="tag neutro" id="fCrono">⏱ 30:00</span><button class="btn small" id="fIni">Iniciar cronômetro (30 min)</button></div>
        <div class="card"><h3 style="margin-top:0">1. Candidato(a)</h3><div class="duas"><label>Nome completo<input id="fNome" value="${esc(e?.nome || "")}"></label><label>CPF<input id="fCpf" value="${esc(e?.cpf || "")}" inputmode="numeric"></label></div>
          <div class="duas"><label>Telefone de contato<input id="fTel" value="${esc(e?.telefone || "")}"></label><label>Data e hora da entrevista<input type="datetime-local" id="fDh" value="${esc(dh)}"></label></div></div>
        <div class="card"><h3 style="margin-top:0">2. A vaga</h3><div class="duas"><label>Valor do emprego (R$)<input id="fVal" value="${esc(e?.valor || "")}" placeholder="Ex.: 1.800,00"></label><label>Carga horária / período<input id="fCh" value="${esc(e?.cargaHoraria || "")}" placeholder="Ex.: 44h semanais, 12x36"></label></div>
          <label>Descrição do cargo<textarea id="fDesc" rows="3">${esc(e?.descricao || "")}</textarea></label>
          <label>Atribuições a realizar (pontos mais importantes)<textarea id="fAtr" rows="3">${esc(e?.atribuicoes ?? k.atribuicoes)}</textarea></label></div>
        ${k.anexos ? `<div class="card"><h3 style="margin-top:0">Anexos (fotos)</h3><div class="duas"><label>Foto da redação<input type="file" id="fRed" accept="image/*"></label><label>Foto do termo de recebimento das explicações sobre o emprego (documento geral)<input type="file" id="fTer" accept="image/*"></label></div>
          <div class="duas"><div id="pvRed"></div><div id="pvTer"></div></div></div>` : ""}
        <div class="card"><h3 style="margin-top:0">3. Perguntas <span class="muted small">(use ➕ ou ➖ em cada resposta para o balanço)</span></h3><div id="fPerg"></div><button class="btn small" id="fMais">+ Pergunta extra</button></div>
        <div class="card"><h3 style="margin-top:0">4. Balanço final</h3><div id="fBal"></div>
          <div class="duas"><label>Parecer<select id="fPar">${["", "Recomendado(a)", "Recomendado(a) com ressalvas", "Banco de reserva", "Não recomendado(a)"].map((o) => `<option ${e?.parecer === o ? "selected" : ""}>${o}</option>`).join("")}</select></label>
          <label>Observações finais<textarea id="fObs" rows="2">${esc(e?.obsFinal || "")}</textarea></label></div></div>
        <div class="barra"><button class="btn primary" id="fSalvar">Salvar entrevista</button></div>`;
      const rPerg = () => { $("#fPerg").innerHTML = ps.map((p, i) => `<div class="perg"><div class="perg-t"><b>${i + 1}.</b> ${esc(p.texto)}<span class="sinais">${["+", "-"].map((s) => `<button type="button" class="btn small ${p.sinal === s ? (s === "+" ? "primary" : "danger") : ""}" data-s="${i}${s}">${SINAIS[s]}</button>`).join("")}</span></div>
          <textarea rows="2" placeholder="Resposta" data-r="${i}">${esc(p.resposta)}</textarea><input placeholder="Comentário do entrevistador" data-c="${i}" value="${esc(p.comentario)}"></div>`).join(""); bal(); };
      const bal = () => { const b = balanco(ps); $("#fBal").innerHTML = `<p style="font-size:1.1rem">➕ <b>${b.mais}</b> &nbsp; ➖ <b>${b.menos}</b> &nbsp; Saldo: <b style="color:${b.saldo >= 0 ? "#2e7d32" : "#c62828"}">${b.saldo > 0 ? "+" : ""}${b.saldo}</b> <span class="muted small">(${b.resp} de ${b.total} perguntas avaliadas)</span></p>`; };
      $("#fPerg").oninput = (ev) => { const t = ev.target; if (t.dataset.r !== undefined) ps[t.dataset.r].resposta = t.value; if (t.dataset.c !== undefined) ps[t.dataset.c].comentario = t.value; };
      $("#fPerg").onclick = (ev) => { const b = ev.target.closest("[data-s]"); if (!b) return; const i = parseInt(b.dataset.s), s = b.dataset.s.slice(String(i).length); ps[i].sinal = ps[i].sinal === s ? "" : s; rPerg(); };
      $("#fMais").onclick = () => { const t = prompt("Digite a pergunta extra:"); if (t) { ps.push({ texto: t.trim(), resposta: "", comentario: "", sinal: "" }); rPerg(); } };
      $("#fCpf").oninput = (ev) => (ev.target.value = maskCpf(ev.target.value));
      const prev = () => { if ($("#pvRed")) { $("#pvRed").innerHTML = anexos.redacao ? `<img src="${anexos.redacao}" style="max-width:100%;max-height:180px">` : ""; $("#pvTer").innerHTML = anexos.termo ? `<img src="${anexos.termo}" style="max-width:100%;max-height:180px">` : ""; } };
      if (k.anexos) { $("#fRed").onchange = async (ev) => { if (ev.target.files[0]) { anexos.redacao = await comprimirImagem(ev.target.files[0], 1100); prev(); } }; $("#fTer").onchange = async (ev) => { if (ev.target.files[0]) { anexos.termo = await comprimirImagem(ev.target.files[0], 1100); prev(); } }; }
      let timer = null; const tic = () => { const s = Math.max(0, 1800 - Math.floor((Date.now() - inicioMs) / 1000)), el = $("#fCrono"); if (!el) return clearInterval(timer); el.textContent = `⏱ ${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; el.className = "tag " + (s === 0 ? "critico" : s < 300 ? "alerta" : "neutro"); };
      $("#fIni").onclick = () => { inicioMs = Date.now(); clearInterval(timer); timer = setInterval(tic, 1000); tic(); };
      $("#fVolta").onclick = () => { clearInterval(timer); lista(k.id); };
      $("#fSalvar").onclick = async () => {
        const nome = $("#fNome").value.trim(); if (!nome) return toast("Digite o nome completo.");
        const d = { categoria: k.id, nome, cpf: $("#fCpf").value, telefone: $("#fTel").value, dataHora: $("#fDh").value, valor: $("#fVal").value, cargaHoraria: $("#fCh").value, descricao: $("#fDesc").value, atribuicoes: $("#fAtr").value,
          perguntas: ps, parecer: $("#fPar").value, obsFinal: $("#fObs").value, redacaoFoto: anexos.redacao, termoFoto: anexos.termo, duracaoMin: inicioMs ? Math.round((Date.now() - inicioMs) / 60000) : e?.duracaoMin || null, atualizadoPor: eu().nome, atualizadoEm: serverTimestamp() };
        if (JSON.stringify(d).length > 900000) return toast("Fotos muito pesadas. Use fotos menores.");
        clearInterval(timer);
        if (e) await updateDoc(doc(db, "entrevistas", e.id), d); else await addDoc(collection(db, "entrevistas"), { ...d, criadoPor: eu().nome, criadoEm: serverTimestamp() });
        toast("Entrevista salva."); tela(v);
      };
      rPerg(); prev();
    }
    function imprimir(k, x) {
      const b = balanco(x.perguntas || []);
      docImpressao(`<div class="cab"><b>${esc(CLINICA_NOME)}</b><br>Ficha de entrevista – ${esc(k.nome)}</div>
        <p><b>Candidato(a):</b> ${esc(x.nome)} &nbsp; <b>CPF:</b> ${esc(x.cpf || "")} &nbsp; <b>Tel.:</b> ${esc(x.telefone || "")}<br><b>Data e hora:</b> ${esc(fdh(x.dataHora))} ${x.duracaoMin ? `· duração ${x.duracaoMin} min` : ""}</p>
        <p><b>Vaga:</b> R$ ${esc(x.valor || "—")} · ${esc(x.cargaHoraria || "—")}<br><b>Descrição:</b> ${esc(x.descricao || "—")}<br><b>Atribuições:</b> ${esc(x.atribuicoes || "—")}</p>
        <table>${(x.perguntas || []).map((p, i) => `<tr><td style="width:55%"><b>${i + 1}. ${esc(p.texto)}</b><br>${esc(p.resposta || "")}${p.comentario ? `<br><i>${esc(p.comentario)}</i>` : ""}</td><td style="width:8%;font-size:18px">${p.sinal === "+" ? "➕" : p.sinal === "-" ? "➖" : ""}</td></tr>`).join("")}</table>
        <p><b>Balanço:</b> ➕ ${b.mais} · ➖ ${b.menos} · saldo ${b.saldo > 0 ? "+" : ""}${b.saldo}<br><b>Parecer:</b> ${esc(x.parecer || "—")}<br>${esc(x.obsFinal || "")}</p>
        ${x.redacaoFoto ? `<p><b>Redação</b><br><img src="${x.redacaoFoto}" style="max-width:100%"></p>` : ""}${x.termoFoto ? `<p><b>Termo de recebimento</b><br><img src="${x.termoFoto}" style="max-width:100%"></p>` : ""}
        <p class="small">Documento confidencial (dados pessoais – LGPD). Acesso restrito à gestão.</p>`, "a4", `Entrevista ${x.nome}`);
    }
    inicio();
  }
  return { entrevista: tela };
}
