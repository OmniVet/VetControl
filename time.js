// "Nosso time": agenda de atividades, relatórios/avaliações (só master) e presença (ponto).
// Recebe do app.js as ferramentas prontas (banco, janelas, impressão…) para não repetir código.
export function iniciarTime(c) {
  const { db, fb, $, esc, toast, abrirModal, opts, hoje, eu, isMaster, docImpressao, sha256, entrarComSenha, CRITERIOS, CLINICA_NOME } = c;
  const { collection, doc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, serverTimestamp } = fb;
  const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const dt = (s) => new Date(s + "T12:00:00");
  const mais = (s, n) => { const d = dt(s); d.setDate(d.getDate() + n); return iso(d); };
  const segunda = (s) => mais(s, -((dt(s).getDay() + 6) % 7));
  const intervalo = (a, b) => { const r = []; for (let d = a; d <= b; d = mais(d, 1)) r.push(d); return r; };
  const br = (s) => String(s || "").slice(0, 10).split("-").reverse().join("/");
  const fdh = (ts) => (ts?.toDate ? ts.toDate().toLocaleString("pt-BR") : "—");
  const hhmm = (ts) => (ts?.toDate ? ts.toDate().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
  const mesAtual = () => hoje().slice(0, 7);
  const fimDoMes = (m) => { const [y, mm] = m.split("-").map(Number); return iso(new Date(y, mm, 0, 12)); };
  const lista = async (nome, ...w) => (await getDocs(w.length ? query(collection(db, nome), ...w) : collection(db, nome))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const pessoas = async () => (await lista("users")).filter((u) => u.ativo).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const concluidas = async (ini, fim) => new Set((await lista("timeConclusoes", where("data", ">=", ini), where("data", "<=", fim))).map((x) => x.atividadeId + "_" + x.data));

  // contas de uma pessoa num período (só conta dias até hoje)
  function stats(ats, feitas, pid, ini, fim) {
    const minhas = ats.filter((a) => a.pessoaId === pid && a.ativo !== false); let plan = 0, feito = 0; const falt = {};
    for (const d of intervalo(ini, fim)) { if (d > hoje()) break; const w = dt(d).getDay();
      for (const a of minhas) { if (!(a.dias || []).includes(w)) continue; plan++; if (feitas.has(a.id + "_" + d)) feito++; else (falt[a.id] ||= { titulo: a.titulo, vezes: 0 }).vezes++; } }
    return { plan, feito, pct: plan ? Math.round((feito * 100) / plan) : 0, falt: Object.values(falt) };
  }
  const barra = (p) => `<div class="barra-pct"><div style="width:${p}%"></div></div>`;

  /* ---------- 1. AGENDA DE ATIVIDADES ---------- */
  async function telaAgenda(v) {
    const me = eu(); const [pes, ats] = await Promise.all([pessoas(), lista("timeAtividades")]);
    let pid = pes.some((p) => p.id === sessionStorage.getItem("timePessoa")) ? sessionStorage.getItem("timePessoa") : me.uid, sem = segunda(hoje()), dia = hoje();
    v.innerHTML = `<div class="barra"><h2>Agenda de atividades do time</h2>
      <select id="tgP">${opts(pes.map((p) => ({ id: p.id, nome: p.nome + (p.id === me.uid ? " (eu)" : "") })), pid)}</select>
      ${isMaster() ? `<button class="btn primary" id="tgNova">+ Nova atividade</button>` : ""}</div>
      <p class="muted small">Todos podem ver a rotina dos colegas. Cada pessoa marca as próprias atividades como concluídas; o sistema soma a porcentagem da semana.</p><div id="tgCorpo"></div>`;
    const desenhar = async () => {
      const fimSem = mais(sem, 6), feitas = await concluidas(sem, fimSem), st = stats(ats, feitas, pid, sem, fimSem);
      const minhas = ats.filter((a) => a.pessoaId === pid), wd = dt(dia).getDay();
      const doDia = minhas.filter((a) => a.ativo !== false && (a.dias || []).includes(wd)).sort((a, b) => String(a.horaIni || "99").localeCompare(String(b.horaIni || "99")));
      const pode = (pid === me.uid || isMaster()) && dia <= hoje();
      $("#tgCorpo").innerHTML = `<div class="card"><div class="barra" style="margin:0"><button class="btn small" id="tgAnt">◀</button><b>Semana de ${br(sem)} a ${br(fimSem)}</b><button class="btn small" id="tgPro">▶</button>
        <span style="margin-left:auto"><b>${st.pct}%</b> concluído (${st.feito} de ${st.plan} até hoje)</span></div>${barra(st.pct)}
        <div class="tabs" style="margin-top:10px">${intervalo(sem, fimSem).map((d) => `<button class="btn ${d === dia ? "ativo" : ""}" data-d="${d}">${DIAS[dt(d).getDay()]} ${br(d).slice(0, 5)}</button>`).join("")}</div>
        ${doDia.length ? doDia.map((a) => { const ok = feitas.has(a.id + "_" + dia); return `<div class="linha-ativ ${ok ? "feita" : ""}">
          <span class="hora">${esc(a.horaIni || "")}${a.horaFim ? "–" + esc(a.horaFim) : ""}${a.horaIni ? "" : "—"}</span><span style="flex:1"><b>${esc(a.titulo)}</b>${a.obs ? `<div class="small muted">${esc(a.obs)}</div>` : ""}</span>
          ${pode ? `<button class="btn small ${ok ? "" : "primary"}" data-c="${a.id}">${ok ? "✔ Feito (desfazer)" : "Concluir"}</button>` : ok ? "✔" : ""}</div>`; }).join("") : `<p class="muted">Nenhuma atividade neste dia.</p>`}</div>
        ${isMaster() ? `<h3>Grade completa</h3><table><thead><tr><th>Atividade</th><th>Horário</th><th>Dias</th><th></th></tr></thead><tbody>${minhas.map((a) => `<tr class="${a.ativo === false ? "muted" : ""}"><td>${esc(a.titulo)}</td><td>${esc(a.horaIni || "—")}${a.horaFim ? "–" + esc(a.horaFim) : ""}</td>
          <td>${(a.dias || []).map((d) => DIAS[d]).join(", ")}</td><td class="acoes-linha"><button class="btn small" data-e="${a.id}">Editar</button><button class="btn small" data-x="${a.id}">${a.ativo === false ? "Reativar" : "Desativar"}</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Sem atividades cadastradas para esta pessoa.</td></tr>`}</tbody></table>` : ""}`;
    };
    const modal = (a = {}) => abrirModal(a.id ? "Editar atividade" : "Nova atividade", `<label>Pessoa<select name="pessoaId">${opts(pes, a.pessoaId || pid)}</select></label>
      <label>Atividade<input name="titulo" required value="${esc(a.titulo || "")}"></label>
      <div class="duas"><label>Horário fixo – início (opcional)<input type="time" name="horaIni" value="${esc(a.horaIni || "")}"></label><label>Término (opcional)<input type="time" name="horaFim" value="${esc(a.horaFim || "")}"></label></div>
      <div>Dias da semana:<div class="dias-chk">${DIAS.map((n, i) => `<label><input type="checkbox" name="d${i}" ${(a.dias || [1, 2, 3, 4, 5]).includes(i) ? "checked" : ""}> ${n}</label>`).join("")}</div></div>
      <label>Observação<input name="obs" value="${esc(a.obs || "")}"></label>`, async (f) => {
      const dias = DIAS.map((_, i) => i).filter((i) => f["d" + i]); if (!dias.length) throw new Error("Marque ao menos um dia.");
      const p = pes.find((x) => x.id === f.pessoaId), d = { pessoaId: f.pessoaId, pessoaNome: p?.nome || "", titulo: f.titulo.trim(), horaIni: f.horaIni, horaFim: f.horaFim, dias, obs: f.obs, ativo: a.ativo !== false };
      a.id ? await updateDoc(doc(db, "timeAtividades", a.id), d) : await addDoc(collection(db, "timeAtividades"), { ...d, criadoPor: me.nome, criadoEm: serverTimestamp() });
    });
    $("#tgP").onchange = (e) => { pid = e.target.value; sessionStorage.setItem("timePessoa", pid); desenhar(); };
    $("#tgNova") && ($("#tgNova").onclick = () => modal());
    $("#tgCorpo").onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.id === "tgAnt") { sem = mais(sem, -7); dia = sem; return desenhar(); }
      if (b.id === "tgPro") { sem = mais(sem, 7); dia = sem; return desenhar(); }
      if (b.dataset.d) { dia = b.dataset.d; return desenhar(); }
      if (b.dataset.c) { const id = b.dataset.c + "_" + dia, ref = doc(db, "timeConclusoes", id); b.disabled = true;
        if ((await concluidas(dia, dia)).has(id)) await deleteDoc(ref); else await setDoc(ref, { atividadeId: b.dataset.c, pessoaId: pid, data: dia, por: me.nome, em: serverTimestamp() });
        return desenhar(); }
      if (b.dataset.e) return modal(ats.find((x) => x.id === b.dataset.e));
      if (b.dataset.x) { const a = ats.find((x) => x.id === b.dataset.x); await updateDoc(doc(db, "timeAtividades", a.id), { ativo: a.ativo === false }); a.ativo = a.ativo === false; return desenhar(); }
    };
    desenhar();
  }

  /* ---------- 2. RELATÓRIOS, AVALIAÇÕES E ASSINATURAS ---------- */
  const resumoIA = (av) => `Resumo anonimizado do desempenho (sem nomes). Período: ${av.periodo}. Conclusão das atividades: ${av.plano?.pct ?? 0}%.\nAtividades não cumpridas: ${(av.plano?.falt || []).map((f) => `${f.titulo} (${f.vezes}x)`).join("; ") || "nenhuma"}.\nNotas (1 a 5): ${(av.criterios || []).filter((x) => x.nota).map((x) => `${x.nome}: ${x.nota}`).join("; ") || "ainda não preenchidas"}.\nPeço: sugestões gentis de pontos a melhorar e de elogios, em texto curto, para o gestor revisar e conversar com a pessoa. Não atribua nota nem punição.`;
  function imprimirConfirmacao(s) {
    docImpressao(`<div class="cab"><b>${esc(CLINICA_NOME)}</b><br>Confirmação de conversa de avaliação</div>
      <p>Confirmo que participei da conversa de avaliação de desempenho referente ao período <b>${esc(s.periodo)}</b>, realizada em <b>${esc(br(s.dataConversa))} às ${esc(String(s.dataConversa).slice(11, 16))}</b>, conduzida por <b>${esc(s.conduzidaPor || "")}</b>.</p>
      <p>Colaborador(a): <b>${esc(s.pessoaNome)}</b></p>
      <p>Assinado eletronicamente por <b>${esc(s.pessoaNome)}</b> em <b>${esc(fdh(s.assinadoEm))}</b>, mediante confirmação da própria senha de acesso.</p>
      <p class="small">Código de verificação (SHA-256): ${esc(s.hash)}</p>
      <p class="small">Este documento confirma a realização da conversa e a assinatura; o conteúdo da avaliação é restrito à gestão.</p>
      <br><br><div style="display:flex;gap:40px"><div style="flex:1;border-top:1px solid #333;text-align:center">${esc(s.pessoaNome)}</div><div style="flex:1;border-top:1px solid #333;text-align:center">${esc(s.conduzidaPor || "Gestão")}</div></div>`, "a4", "Confirmação de avaliação");
  }
  function modalAssinar(s) {
    abrirModal("Assinar confirmação", `<p>Confirmo que participei da conversa de avaliação (${esc(s.periodo)}) em <b>${esc(br(s.dataConversa))} ${esc(String(s.dataConversa).slice(11, 16))}</b>.</p>
      <p class="small muted">Para assinar, digite a sua senha de acesso. A data e a hora são gravadas pelo servidor.</p><label>Senha<input type="password" name="senha" required autocomplete="current-password"></label>`, async (f) => {
      try { await entrarComSenha(eu().email, f.senha); } catch { throw new Error("Senha incorreta."); }
      const hash = await sha256([s.id, s.pessoaId, s.periodo, s.dataConversa, s.pessoaNome].join("|"));
      await updateDoc(doc(db, "timeAssinaturas", s.id), { status: "Assinado", assinadoEm: serverTimestamp(), hash }); toast("Assinado."); }, "Assinar");
  }

  async function telaRelatorios(v) {
    const me = eu(), master = isMaster(); let mes = mesAtual();
    const [pes, ats, ass] = await Promise.all([pessoas(), lista("timeAtividades"), master ? lista("timeAssinaturas") : lista("timeAssinaturas", where("pessoaId", "==", me.uid))]);
    const avs = master ? await lista("timeAvaliacoes") : [];
    v.innerHTML = `<div class="barra"><h2>Relatórios e histórico do time</h2><label class="inline">Mês <input type="month" id="trMes" value="${mes}"></label>
      ${master ? `<button class="btn primary" id="trPlano">+ Planejar avaliação</button>` : ""}</div>
      ${master ? `<p class="muted small">🔒 As avaliações só aparecem para o Gerente/Master. A pessoa avaliada vê apenas o próprio percentual e a confirmação para assinar.</p>` : ""}<div id="trCorpo"></div>`;
    const desenhar = async () => {
      const fim = fimDoMes(mes), feitas = await concluidas(mes + "-01", fim), quem = master ? pes : pes.filter((p) => p.id === me.uid);
      const linhas = quem.map((p) => ({ p, s: stats(ats, feitas, p.id, mes + "-01", fim) })).filter((x) => x.s.plan);
      const assHtml = (s) => `<tr><td>${esc(s.pessoaNome)}</td><td>${esc(s.periodo)}</td><td>${esc(br(s.dataConversa))} ${esc(String(s.dataConversa).slice(11, 16))}</td>
        <td>${s.status === "Assinado" ? `<span class="tag ok">Assinado ${esc(fdh(s.assinadoEm))}</span>` : `<span class="tag alerta">Aguardando assinatura</span>`}</td><td class="acoes-linha">
        ${s.status === "Assinado" ? `<button class="btn small" data-i="${s.id}">🖨 Imprimir confirmação</button>` : s.pessoaId === me.uid ? `<button class="btn small primary" data-a="${s.id}">Assinar</button>` : ""}</td></tr>`;
      $("#trCorpo").innerHTML = `<div class="card"><h3 style="margin-top:0">Atividades concluídas em ${mes.split("-").reverse().join("/")}</h3>
        <table><thead><tr><th>Pessoa</th><th>Feitas / previstas</th><th>%</th><th>Não cumpridas</th></tr></thead><tbody>${linhas.map(({ p, s }) => `<tr><td>${esc(p.nome)}</td><td>${s.feito} / ${s.plan}</td><td style="min-width:140px"><b>${s.pct}%</b>${barra(s.pct)}</td>
          <td class="small">${s.falt.map((f) => `${esc(f.titulo)} (${f.vezes}x)`).join("; ") || "—"}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">Sem atividades previstas neste mês.</td></tr>`}</tbody></table></div>
        ${master ? `<h3>Avaliações (só gestão)</h3><table><thead><tr><th>Pessoa</th><th>Período</th><th>Data e hora</th><th>Situação</th><th></th></tr></thead><tbody>${avs.sort((a, b) => String(b.dataHora).localeCompare(String(a.dataHora))).map((a) => {
          const s = ass.find((x) => x.id === a.assinaturaId); return `<tr><td>${esc(a.pessoaNome)}</td><td>${esc(a.periodo)}</td><td>${esc(br(a.dataHora))} ${esc(String(a.dataHora).slice(11, 16))}</td>
          <td>${esc(a.status)}${s ? ` · ${s.status === "Assinado" ? "assinada" : "aguardando assinatura"}` : ""}</td><td class="acoes-linha"><button class="btn small" data-v="${a.id}">${a.status === "Agendada" ? "Aplicar" : "Ver / editar"}</button><button class="btn small" data-ia="${a.id}">Copiar resumo p/ IA</button></td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">Nenhuma avaliação planejada.</td></tr>`}</tbody></table>` : ""}
        <h3>${master ? "Confirmações e assinaturas" : "Minhas confirmações de avaliação"}</h3><table><thead><tr><th>Pessoa</th><th>Período</th><th>Conversa</th><th>Assinatura</th><th></th></tr></thead><tbody>${ass.map(assHtml).join("") || `<tr><td colspan="5" class="muted">Nada por aqui ainda.</td></tr>`}</tbody></table>`;
    };
    $("#trMes").onchange = (e) => { mes = e.target.value || mes; desenhar(); };
    const planejar = () => abrirModal("Planejar avaliação", `<label>Colaborador(a)<select name="pessoaId">${opts(pes)}</select></label>
      <label>Período avaliado<input type="month" name="periodo" value="${mes}" required></label><label>Data e hora da conversa<input type="datetime-local" name="dataHora" required></label>
      <p class="small muted">O sistema monta o plano com o percentual de atividades cumpridas e as não cumpridas no período, e os critérios de avaliação.</p>`, async (f) => {
      const p = pes.find((x) => x.id === f.pessoaId), plano = stats(ats, await concluidas(f.periodo + "-01", fimDoMes(f.periodo)), p.id, f.periodo + "-01", fimDoMes(f.periodo));
      await addDoc(collection(db, "timeAvaliacoes"), { pessoaId: p.id, pessoaNome: p.nome, periodo: f.periodo, dataHora: f.dataHora, status: "Agendada", plano: { pct: plano.pct, feito: plano.feito, plan: plano.plan, falt: plano.falt }, criterios: CRITERIOS.map((n) => ({ nome: n, nota: 0 })), pontos: "", combinados: "", feedback: "", criadoPor: me.nome, criadoEm: serverTimestamp() }); });
    const abrirAv = (a) => abrirModal(`Avaliação – ${a.pessoaNome} (${a.periodo})`, `<p class="small">Conversa marcada para <b>${esc(br(a.dataHora))} ${esc(String(a.dataHora).slice(11, 16))}</b>. Atividades cumpridas no período: <b>${a.plano?.pct ?? 0}%</b> (${a.plano?.feito ?? 0} de ${a.plano?.plan ?? 0}).</p>
      ${(a.plano?.falt || []).length ? `<p class="small"><b>Não cumpridas:</b> ${a.plano.falt.map((f) => `${esc(f.titulo)} (${f.vezes}x)`).join("; ")}</p>` : ""}
      <div class="duas">${a.criterios.map((k, i) => `<label>${esc(k.nome)} (1 a 5)<select name="n${i}"><option value="0">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${k.nota === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div>
      <label>Pontos a melhorar<textarea name="pontos" rows="3">${esc(a.pontos || "")}</textarea></label><label>Combinados<textarea name="combinados" rows="2">${esc(a.combinados || "")}</textarea></label><label>Feedback<textarea name="feedback" rows="3">${esc(a.feedback || "")}</textarea></label>`, async (f) => {
      const d = { criterios: a.criterios.map((k, i) => ({ nome: k.nome, nota: Number(f["n" + i]) || 0 })), pontos: f.pontos, combinados: f.combinados, feedback: f.feedback };
      if (a.assinaturaId) return updateDoc(doc(db, "timeAvaliacoes", a.id), d);
      const s = await addDoc(collection(db, "timeAssinaturas"), { avaliacaoId: a.id, pessoaId: a.pessoaId, pessoaNome: a.pessoaNome, periodo: a.periodo, dataConversa: a.dataHora, conduzidaPor: me.nome, status: "Aguardando", criadoEm: serverTimestamp() });
      await updateDoc(doc(db, "timeAvaliacoes", a.id), { ...d, status: "Aplicada", aplicadaEm: serverTimestamp(), assinaturaId: s.id }); toast("Avaliação aplicada. A pessoa já pode assinar a confirmação."); }, "Salvar / aplicar");
    $("#trPlano") && ($("#trPlano").onclick = planejar);
    $("#trCorpo").onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.v) return abrirAv(avs.find((x) => x.id === b.dataset.v));
      if (b.dataset.ia) { await navigator.clipboard.writeText(resumoIA(avs.find((x) => x.id === b.dataset.ia))); return toast("Resumo (sem nomes) copiado. Cole no Gemini e revise o texto antes de usar."); }
      if (b.dataset.a) return modalAssinar(ass.find((x) => x.id === b.dataset.a));
      if (b.dataset.i) return imprimirConfirmacao(ass.find((x) => x.id === b.dataset.i));
    };
    desenhar();
  }

  /* ---------- 3. PRESENÇA (PONTO) ---------- */
  const TIPOS = { entrada: "Entrada", "intervalo-ini": "Saída p/ intervalo", "intervalo-fim": "Volta do intervalo", saida: "Saída" };
  function minutosDoDia(marcas) { let ini = null, tot = 0;
    for (const m of marcas) { const t = m.t.getTime();
      if (m.tipo === "entrada" || m.tipo === "intervalo-fim") ini = t; else if (ini != null) { tot += t - ini; ini = null; } }
    return { min: Math.round(tot / 60000), aberto: ini != null }; }
  const hm = (min) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
  const calcHash = (m, ant) => sha256([ant, m.uid, m.tipo, m.seq, m.relogioLocal].join("|"));

  async function telaPresenca(v) {
    const me = eu(); let cfg = (await lista("timeConfig")).find((x) => x.id === "geral") || {}; const pes = await pessoas();
    let pid = me.uid, mes = mesAtual(); const semPonto = () => (cfg.semPonto || []).includes(pid);
    v.innerHTML = `<div class="barra"><h2>Presença do time</h2>${isMaster() ? `<select id="tpP">${opts(pes.map((p) => ({ id: p.id, nome: p.nome + (p.id === me.uid ? " (eu)" : "") })), pid)}</select><button class="btn" id="tpCfg">Configurar</button>` : ""}</div>
      <div class="aviso-ctrl small">Controle interno de presença (não é o ponto oficial homologado). O horário é gravado pelo servidor, os registros não podem ser alterados nem apagados por ninguém (nem pelo master); erros são corrigidos por pedido com justificativa. ${cfg.inicioTeste ? `Período de teste iniciado em <b>${esc(br(cfg.inicioTeste))}</b>.` : ""}</div><div id="tpCorpo"></div>`;
    const desenhar = async () => {
      const [marcasTodas, cors] = await Promise.all([lista("timePonto", where("uid", "==", pid)), lista("timeCorrecoes", ...(isMaster() ? [] : [where("uid", "==", me.uid)]))]);
      const marcas = marcasTodas.sort((a, b) => a.seq - b.seq).map((m) => ({ ...m, t: m.em?.toDate ? m.em.toDate() : new Date() }));
      const doMes = marcas.filter((m) => iso(m.t).slice(0, 7) === mes), dias = {}; doMes.forEach((m) => (dias[iso(m.t)] ||= []).push(m));
      const corsPessoa = cors.filter((x) => x.uid === pid);
      const hojeM = marcas.filter((m) => iso(m.t) === hoje()), prox = !hojeM.length ? "entrada" : { entrada: "intervalo-ini", "intervalo-ini": "intervalo-fim", "intervalo-fim": "saida", saida: "entrada" }[hojeM[hojeM.length - 1].tipo];
      let total = 0;
      const linhas = Object.keys(dias).sort().map((d) => { const r = minutosDoDia(dias[d]); total += r.min; const cs = corsPessoa.filter((x) => x.data === d && x.status === "Aprovada");
        return `<tr><td>${br(d)} ${DIAS[dt(d).getDay()]}</td><td>${dias[d].map((m) => `${TIPOS[m.tipo].split(" ")[0]} ${hhmm(m.em)}`).join(" · ")}${cs.map((x) => `<div class="small" style="color:#8a5a00">Correção aprovada: ${esc(TIPOS[x.tipo])} ${esc(x.hora)} — ${esc(x.justificativa)}</div>`).join("")}</td><td>${hm(r.min)}${r.aberto ? ` <span class="tag alerta">incompleto</span>` : ""}</td></tr>`; });
      const pend = cors.filter((x) => x.status === "Pendente");
      $("#tpCorpo").innerHTML = `${pid === me.uid ? (semPonto() ? `<p class="aviso-ctrl">Você está marcada(o) como prestador(a) sem ponto. Não é necessário registrar presença.</p>` : `<div class="card"><b>Hoje, ${br(hoje())}:</b> ${hojeM.map((m) => `${TIPOS[m.tipo]} ${hhmm(m.em)}`).join(" · ") || "nenhum registro ainda"}<div style="margin-top:10px">
        <button class="btn primary grande" id="tpMarca" data-t="${prox}">⏱ Registrar: ${TIPOS[prox]}</button> <button class="btn small" id="tpOutro">Outro tipo…</button> <button class="btn small" id="tpCorrigir">Pedir correção</button></div></div>`) : ""}
        <div class="barra" style="margin-top:14px"><h3 style="margin:0;flex:1">Espelho do mês</h3><input type="month" id="tpMes" value="${mes}"><button class="btn small" id="tpImp">🖨 Imprimir</button><button class="btn small" id="tpVer">Verificar integridade</button></div>
        <table><thead><tr><th>Dia</th><th>Registros</th><th>Horas</th></tr></thead><tbody>${linhas.join("") || `<tr><td colspan="3" class="muted">Sem registros neste mês.</td></tr>`}</tbody></table><p><b>Total do mês: ${hm(total)}</b></p>
        ${pend.length || corsPessoa.length ? `<h3>Pedidos de correção</h3><table><thead><tr><th>Quem</th><th>Dia</th><th>Registro</th><th>Justificativa</th><th>Situação</th><th></th></tr></thead><tbody>${(isMaster() ? cors : corsPessoa).sort((a, b) => String(b.data).localeCompare(String(a.data))).map((x) => `<tr><td>${esc(x.nome)}</td><td>${br(x.data)}</td><td>${esc(TIPOS[x.tipo])} ${esc(x.hora)}</td><td>${esc(x.justificativa)}</td><td>${esc(x.status)}</td>
          <td class="acoes-linha">${isMaster() && x.status === "Pendente" ? `<button class="btn small primary" data-ok="${x.id}">Aprovar</button><button class="btn small" data-no="${x.id}">Recusar</button>` : ""}</td></tr>`).join("")}</tbody></table>` : ""}`;
      $("#tpMes").onchange = (e) => { mes = e.target.value || mes; desenhar(); };
      $("#tpMarca") && ($("#tpMarca").onclick = (e) => marcar(e.target.dataset.t, e.target));
      $("#tpOutro") && ($("#tpOutro").onclick = () => abrirModal("Registrar presença", `<label>Tipo<select name="t">${opts(Object.entries(TIPOS).map(([id, nome]) => ({ id, nome })), prox)}</select></label>`, async (f) => marcar(f.t)));
      $("#tpCorrigir") && ($("#tpCorrigir").onclick = () => abrirModal("Pedir correção de registro", `<div class="duas"><label>Dia<input type="date" name="data" required value="${hoje()}"></label><label>Hora correta<input type="time" name="hora" required></label></div>
        <label>Tipo<select name="tipo">${opts(Object.entries(TIPOS).map(([id, nome]) => ({ id, nome })))}</select></label><label>Justificativa<textarea name="justificativa" rows="3" required></textarea></label>
        <p class="small muted">O registro original continua guardado. Se o pedido for aprovado, a correção aparece no espelho.</p>`, async (f) => { await addDoc(collection(db, "timeCorrecoes"), { uid: me.uid, nome: me.nome, ...f, status: "Pendente", em: serverTimestamp() }); toast("Pedido enviado ao gestor."); }, "Enviar pedido"));
      $("#tpImp").onclick = () => docImpressao(`<div class="cab"><b>${esc(CLINICA_NOME)}</b><br>Espelho de presença – ${esc(pes.find((p) => p.id === pid)?.nome || me.nome)} – ${esc(mes.split("-").reverse().join("/"))}</div>
        <table border="1" cellspacing="0" cellpadding="4" style="width:100%;border-collapse:collapse"><tr><th>Dia</th><th>Registros</th><th>Horas</th></tr>${linhas.join("")}</table><p><b>Total: ${hm(total)}</b></p><p class="small">Controle interno. Assinatura do colaborador: ______________________________</p>`, "a4", "Espelho de presença");
      $("#tpVer").onclick = async () => { let ant = "INICIO", ok = true; for (const m of marcas) { if (m.hashAnt !== ant || m.hash !== (await calcHash(m, ant))) { ok = false; toast(`Registro nº ${m.seq} não confere com a cadeia!`); break; } ant = m.hash; } if (ok) toast(`Integridade OK (${marcas.length} registros encadeados).`); };
      $("#tpCorpo").onclick = async (e) => { const b = e.target.closest("button"); if (!b || !(b.dataset.ok || b.dataset.no)) return;
        await updateDoc(doc(db, "timeCorrecoes", b.dataset.ok || b.dataset.no), { status: b.dataset.ok ? "Aprovada" : "Recusada", decididoPor: me.nome, decididoEm: serverTimestamp() }); desenhar(); };
      async function marcar(tipo, btn) {
        if (btn) btn.disabled = true;
        const ult = (await lista("timePonto", where("uid", "==", me.uid))).sort((a, b) => b.seq - a.seq)[0], m = { uid: me.uid, nome: me.nome, tipo, seq: (ult?.seq || 0) + 1, hashAnt: ult?.hash || "INICIO", relogioLocal: new Date().toISOString() };
        m.hash = await calcHash(m, m.hashAnt); await addDoc(collection(db, "timePonto"), { ...m, em: serverTimestamp() }); toast(`${TIPOS[tipo]} registrada.`); desenhar();
      }
    };
    $("#tpP") && ($("#tpP").onchange = (e) => { pid = e.target.value; desenhar(); });
    $("#tpCfg") && ($("#tpCfg").onclick = () => abrirModal("Configurar presença", `<label>Data de início do período de teste<input type="date" name="inicioTeste" value="${esc(cfg.inicioTeste || "")}"></label>
      <div>Quem NÃO bate ponto (prestadores PJ):<div class="dias-chk">${pes.map((p) => `<label><input type="checkbox" name="pj_${p.id}" ${(cfg.semPonto || []).includes(p.id) ? "checked" : ""}> ${esc(p.nome)}</label>`).join("")}</div></div>`, async (f) => {
      cfg = { inicioTeste: f.inicioTeste, semPonto: pes.filter((p) => f["pj_" + p.id]).map((p) => p.id) }; await setDoc(doc(db, "timeConfig", "geral"), cfg); }));
    desenhar();
  }
  return { "time-agenda": telaAgenda, "time-relatorios": telaRelatorios, "time-presenca": telaPresenca };
}
