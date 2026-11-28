// "Nosso time": agenda de atividades, relatórios/avaliações (só master) e presença (ponto).
// Recebe do app.js as ferramentas prontas (banco, janelas, impressão…) para não repetir código.
import { ROTINAS } from "./rotinas.js";
import { formDadosDescricao, lerDadosDescricao, htmlDescricao, CSS_DESCRICAO, NOTAS, LEGENDA, FAIXAS, faixaDe, pctDe, fichaDoCargo, NOME_FICHA, PERGUNTAS_AVALIADO, DESCRICOES } from "./cargos-rh.js";
export function iniciarTime(c) {
  const { db, fb, $, esc, toast, abrirModal, opts, hoje, eu, isMaster, docImpressao, sha256, entrarComSenha, CRITERIOS, CLINICA_NOME, cltDe } = c;
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
      for (const a of minhas) { if (!((a.dias || []).includes(w) || (a.diaMes && a.diaMes === dt(d).getDate()))) continue; plan++; if (feitas.has(a.id + "_" + d)) feito++; else (falt[a.id] ||= { titulo: a.titulo, vezes: 0 }).vezes++; } }
    return { plan, feito, pct: plan ? Math.round((feito * 100) / plan) : 0, falt: Object.values(falt) };
  }
  const barra = (p) => `<div class="barra-pct"><div style="width:${p}%"></div></div>`;

  /* ---------- 1. AGENDA DE ATIVIDADES ---------- */
  async function telaAgenda(v) {
    const me = eu(); const [pes, ats] = await Promise.all([pessoas(), lista("timeAtividades")]);
    let pid = pes.some((p) => p.id === sessionStorage.getItem("timePessoa")) ? sessionStorage.getItem("timePessoa") : me.uid, sem = segunda(hoje()), dia = hoje();
    v.innerHTML = `<div class="barra"><h2>Agenda de atividades do time</h2>
      <select id="tgP">${opts(pes.map((p) => ({ id: p.id, nome: p.nome + (p.id === me.uid ? " (eu)" : "") })), pid)}</select>
      ${isMaster() ? `<button class="btn primary" id="tgNova">+ Nova atividade</button><button class="btn small" id="tgRot">Carregar rotinas dos cargos</button>` : ""}</div><div id="tgAtraso"></div>
      <p class="muted small">Todos podem ver a rotina dos colegas. Cada pessoa marca as próprias atividades como concluídas; o sistema soma a porcentagem da semana.</p><div id="tgCorpo"></div>`;
    const desenhar = async () => {
      const fimSem = mais(sem, 6), feitas = await concluidas(sem, fimSem), st = stats(ats, feitas, pid, sem, fimSem);
      const minhas = ats.filter((a) => a.pessoaId === pid), wd = dt(dia).getDay();
      const doDia = minhas.filter((a) => a.ativo !== false && ((a.dias || []).includes(wd) || (a.diaMes && a.diaMes === dt(dia).getDate()))).sort((a, b) => String(a.horaIni || "99").localeCompare(String(b.horaIni || "99")));
      const pode = (pid === me.uid || isMaster()) && dia <= hoje();
      $("#tgCorpo").innerHTML = `<div class="card"><div class="barra" style="margin:0"><button class="btn small" id="tgAnt">◀</button><b>Semana de ${br(sem)} a ${br(fimSem)}</b><button class="btn small" id="tgPro">▶</button>
        <span style="margin-left:auto"><b>${st.pct}%</b> concluído (${st.feito} de ${st.plan} até hoje)</span></div>${barra(st.pct)}
        <div class="tabs" style="margin-top:10px">${intervalo(sem, fimSem).map((d) => `<button class="btn ${d === dia ? "ativo" : ""}" data-d="${d}">${DIAS[dt(d).getDay()]} ${br(d).slice(0, 5)}</button>`).join("")}</div>
        ${doDia.length ? doDia.map((a) => { const ok = feitas.has(a.id + "_" + dia); return `<div class="linha-ativ ${ok ? "feita" : ""}">
          <span class="hora">${esc(a.horaIni || "")}${a.horaFim ? "–" + esc(a.horaFim) : ""}${a.horaIni ? "" : "—"}</span><span style="flex:1"><b>${esc(a.titulo)}</b>${a.obs ? `<div class="small muted">${esc(a.obs)}</div>` : ""}</span>
          ${pode ? `<button class="btn small ${ok ? "" : "primary"}" data-c="${a.id}">${ok ? "✔ Feito (desfazer)" : "Concluir"}</button>` : ok ? "✔" : ""}</div>`; }).join("") : `<p class="muted">Nenhuma atividade neste dia.</p>`}</div>
        ${isMaster() ? `<h3>Grade completa</h3><table><thead><tr><th>Atividade</th><th>Horário</th><th>Dias</th><th></th></tr></thead><tbody>${minhas.map((a) => `<tr class="${a.ativo === false ? "muted" : ""}"><td>${esc(a.titulo)}</td><td>${esc(a.horaIni || "—")}${a.horaFim ? "–" + esc(a.horaFim) : ""}</td>
          <td>${a.diaMes ? "todo dia " + a.diaMes : (a.dias || []).map((d) => DIAS[d]).join(", ")}</td><td class="acoes-linha"><button class="btn small" data-e="${a.id}">Editar</button><button class="btn small" data-x="${a.id}">${a.ativo === false ? "Reativar" : "Desativar"}</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Sem atividades cadastradas para esta pessoa.</td></tr>`}</tbody></table>` : ""}`;
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
    $("#tgRot") && ($("#tgRot").onclick = async () => { let n = 0, sem = [];
      for (const [cargo, lst] of Object.entries(ROTINAS)) { const gente = pes.filter((p) => p.cargo === cargo); if (!gente.length) { sem.push(cargo); continue; }
        for (const p of gente) for (const r of lst) { if (ats.some((a) => a.pessoaId === p.id && a.titulo === r.titulo)) continue;
          await addDoc(collection(db, "timeAtividades"), { pessoaId: p.id, pessoaNome: p.nome, titulo: r.titulo, horaIni: r.horaIni || "", horaFim: r.horaFim || "", dias: r.dias || [], diaMes: r.diaMes || 0, obs: r.obs || "", ativo: true, criadoPor: me.nome, criadoEm: serverTimestamp() }); n++; } }
      toast(`${n} atividades criadas.${sem.length ? " Sem ninguém com o cargo: " + sem.join(", ") + " (defina o cargo em Usuários)." : ""}`); telaAgenda(v); });
    (async () => { const L = []; const h = hoje();
      try { (await lista("repasses", where("status", "==", "Em aberto"))).forEach((r) => { if (r.prazo && r.prazo <= mais(h, 3)) L.push([r.prazo, `${r.tipo}: ${r.produtoNome} com ${r.destinatario} — ${(r.prazoTipo || "devolver").toLowerCase()} até ${br(r.prazo)}`]); }); } catch (e) {}
      try { if (isMaster() || me.cargo === "gerente") (await lista("clinicaDocs")).forEach((d) => { if (d.validade && d.validade <= mais(h, 30)) L.push([d.validade, `Documento da clínica: ${d.nome} — vence ${br(d.validade)}`]); }); } catch (e) {}
      L.sort(); if (!L.length) return;
      $("#tgAtraso").innerHTML = `<div class="card" style="border:2px solid #d98a00"><b>⏰ Atrasados e próximos do prazo</b>${L.map(([d, tx]) => `<div class="small">${d < h ? `<span class="tag alerta" style="background:#fde0e0;color:#a11">ATRASADO</span>` : `<span class="tag alerta">em breve</span>`} ${esc(tx)}</div>`).join("")}</div>`; })();
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
    const me = eu(), master = isMaster() || me.cargo === "gerente"; let mes = mesAtual(); // "master" aqui = gestão (Master ou Gerente)
    const [pes, ats, ass] = await Promise.all([pessoas(), lista("timeAtividades"), master ? lista("timeAssinaturas") : lista("timeAssinaturas", where("pessoaId", "==", me.uid))]);
    const avs = master ? await lista("timeAvaliacoes") : await lista("timeAvaliacoes", where("pessoaId", "==", me.uid));
    v.innerHTML = `<div class="barra"><h2>Relatórios e histórico do time</h2><label class="inline">Mês <input type="month" id="trMes" value="${mes}"></label>
      ${master ? `<button class="btn primary" id="trPlano">+ Planejar avaliação</button>${Object.entries(NOME_FICHA).map(([id, n]) => `<button class="btn small" data-fb="${id}">🖨 Ficha em branco: ${esc(n)}</button>`).join("")}` : ""}</div>
      ${master && pes.some((p) => !p.cargo) ? `<p class="aviso-ctrl small">Há pessoas sem cargo definido. Defina em Configurações → Usuários para entrarem (ou não) nas avaliações.</p>` : ""}${master ? `<p class="muted small">🔒 As avaliações só aparecem para o Gerente/Master. A pessoa avaliada vê apenas o próprio percentual e a confirmação para assinar.</p>` : ""}<div id="trCorpo"></div>`;
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
          <td>${esc(a.status)}${s ? ` · ${s.status === "Assinado" ? "assinada" : "aguardando assinatura"}` : ""}</td><td class="acoes-linha"><button class="btn small" data-v="${a.id}">${a.status === "Agendada" ? "Aplicar" : "Ver / editar"}</button><button class="btn small" data-ia="${a.id}">Copiar resumo p/ IA</button><button class="btn small" data-pf="${a.id}">🖨 Ficha</button></td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">Nenhuma avaliação planejada.</td></tr>`}</tbody></table>` : ""}
        ${!master && avs.length ? `<h3>Minhas avaliações</h3><table><thead><tr><th>Período</th><th>Conversa</th><th>Situação</th><th>Feedback</th></tr></thead><tbody>${avs.map((a) => `<tr><td>${esc(a.periodo)}</td><td>${esc(br(a.dataHora))}</td><td>${esc(a.status)}</td><td class="small">${esc(a.feedback || "—")}</td></tr>`).join("")}</tbody></table>` : ""}
        <h3>${master ? "Confirmações e assinaturas" : "Minhas confirmações de avaliação"}</h3><table><thead><tr><th>Pessoa</th><th>Período</th><th>Conversa</th><th>Assinatura</th><th></th></tr></thead><tbody>${ass.map(assHtml).join("") || `<tr><td colspan="5" class="muted">Nada por aqui ainda.</td></tr>`}</tbody></table>`;
    };
    $("#trMes").onchange = (e) => { mes = e.target.value || mes; desenhar(); };
    const planejar = () => abrirModal("Planejar avaliação", `<label>Colaborador(a)<select name="pessoaId">${opts(pes.filter(cltDe))}</select></label>
      <p class="small muted">Médicos veterinários são PJ e não entram em avaliação. Só Auxiliar, Gerente, Recepção e Assistente operacional.</p>
      <label>Período avaliado<input type="month" name="periodo" value="${mes}" required></label><label>Data e hora da conversa<input type="datetime-local" name="dataHora" required></label>
      <p class="small muted">O sistema monta o plano com o percentual de atividades cumpridas e as não cumpridas no período, e os critérios de avaliação.</p>`, async (f) => {
      const p = pes.find((x) => x.id === f.pessoaId), plano = stats(ats, await concluidas(f.periodo + "-01", fimDoMes(f.periodo)), p.id, f.periodo + "-01", fimDoMes(f.periodo));
      await addDoc(collection(db, "timeAvaliacoes"), { pessoaId: p.id, pessoaNome: p.nome, periodo: f.periodo, dataHora: f.dataHora, status: "Agendada", plano: { pct: plano.pct, feito: plano.feito, plan: plano.plan, falt: plano.falt }, ficha: p.cargo || "auxiliar", criterios: fichaDoCargo(p.cargo || "auxiliar").map((k) => ({ nome: k.nome, grupo: k.grupo, nota: "" })), pontos: "", combinados: "", feedback: "", criadoPor: me.nome, criadoEm: serverTimestamp() }); });
    const abrirAv = (a) => abrirModal(`Avaliação – ${a.pessoaNome} (${a.periodo})${a.ficha ? " · ficha " + (NOME_FICHA[a.ficha] || "") : ""}`, `<p class="small">Conversa marcada para <b>${esc(br(a.dataHora))} ${esc(String(a.dataHora).slice(11, 16))}</b>. Atividades cumpridas no período: <b>${a.plano?.pct ?? 0}%</b> (${a.plano?.feito ?? 0} de ${a.plano?.plan ?? 0}).</p>
      ${(a.plano?.falt || []).length ? `<p class="small"><b>Não cumpridas:</b> ${a.plano.falt.map((f) => `${esc(f.titulo)} (${f.vezes}x)`).join("; ")}</p>` : ""}
      ${a.ficha ? `<p class="muted small">${LEGENDA.map(([l, n, d]) => `<b>${l}</b> ${n}`).join(" · ")}</p>${[...new Set(a.criterios.map((k) => k.grupo))].map((g) => `<h4 style="margin:10px 0 2px">${esc(g)}</h4><div class="duas">${a.criterios.map((k, i) => [k, i]).filter(([k]) => k.grupo === g).map(([k, i]) => `<label>${esc(k.nome)}<select name="n${i}"><option value="">—</option>${["A", "B", "C", "D"].map((n) => `<option ${k.nota === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div>`).join("")}`
      : `<div class="duas">${a.criterios.map((k, i) => `<label>${esc(k.nome)} (1 a 5)<select name="n${i}"><option value="0">—</option>${[1, 2, 3, 4, 5].map((n) => `<option ${k.nota === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>`).join("")}</div>`}
      <label>Pontos a melhorar<textarea name="pontos" rows="3">${esc(a.pontos || "")}</textarea></label><label>Curso de especialização (técnico ou comportamental) melhoraria o desempenho? Justifique<textarea name="curso" rows="2">${esc(a.curso || "")}</textarea></label><label>Combinados<textarea name="combinados" rows="2">${esc(a.combinados || "")}</textarea></label><label>Considerações finais do avaliador<textarea name="feedback" rows="3">${esc(a.feedback || "")}</textarea></label>`, async (f) => {
      const criterios = a.criterios.map((k, i) => ({ nome: k.nome, grupo: k.grupo, nota: a.ficha ? f["n" + i] || "" : Number(f["n" + i]) || 0 }));
      const d = { criterios, pontos: f.pontos, curso: f.curso, combinados: f.combinados, feedback: f.feedback, ...(a.ficha ? { pct: pctDe(criterios), faixa: faixaDe(pctDe(criterios)).nome } : {}) };
      if (a.assinaturaId) return updateDoc(doc(db, "timeAvaliacoes", a.id), d);
      const s = await addDoc(collection(db, "timeAssinaturas"), { avaliacaoId: a.id, pessoaId: a.pessoaId, pessoaNome: a.pessoaNome, periodo: a.periodo, dataConversa: a.dataHora, conduzidaPor: me.nome, status: "Aguardando", criadoEm: serverTimestamp() });
      await updateDoc(doc(db, "timeAvaliacoes", a.id), { ...d, status: "Aplicada", aplicadaEm: serverTimestamp(), assinaturaId: s.id }); toast("Avaliação aplicada" + (a.ficha ? ` — resultado ${d.pct}% (${d.faixa}).` : ".") + " A pessoa já pode assinar a confirmação."); }, "Salvar / aplicar");
    const imprimirFicha = (a, cargo) => {
      const itens = a ? a.criterios : fichaDoCargo(cargo), pct = a ? pctDe(itens) : null, fx = pct != null ? faixaDe(pct) : null, mk = (k, l) => (k.nota === l ? "X" : "");
      const tabela = (g) => `<table class="fa"><tr><th class="g">${esc(g.toUpperCase())}</th>${["A", "B", "C", "D"].map((l) => `<th class="l">${l}</th>`).join("")}</tr>${itens.filter((k) => k.grupo === g).map((k) => `<tr><td><b>${esc(k.nome)}</b><br><span>${esc(k.desc || fichaDoCargo(cargo).find((x) => x.nome === k.nome)?.desc || "")}</span></td>${["A", "B", "C", "D"].map((l) => `<td class="l">${mk(k, l)}</td>`).join("")}</tr>`).join("")}</table>`;
      const linhas = (n) => Array.from({ length: n }, () => `<div class="ln"></div>`).join("");
      docImpressao(`<div class="cab"><b>FICHA DE AVALIAÇÃO DE DESEMPENHO — ${esc((NOME_FICHA[cargo] || "").toUpperCase())}</b><br><small>${esc(CLINICA_NOME)}</small></div>
        <table class="fa"><tr><td><b>NOME:</b> ${esc(a?.pessoaNome || "")}</td><td><b>CARGO:</b> ${esc(NOME_FICHA[cargo] || "")}</td></tr><tr><td><b>DATA ADMISSÃO:</b> ____/____/______</td><td><b>PERÍODO AVALIADO:</b> ${esc(a?.periodo || "")}</td></tr><tr><td><b>GESTOR:</b> ${esc(a?.conduzidaPor || "")}</td><td><b>DATA DA AVALIAÇÃO:</b> ${a ? esc(br(a.dataHora)) : "____/____/______"}</td></tr></table>
        <p class="peq"><b>Preenchimento:</b> responda com cuidado; avalie cada item separadamente; marque X na graduação que melhor reflete a realidade. ${LEGENDA.map(([l, n, d]) => `<b>${l} – ${n}:</b> ${d}.`).join(" ")}</p>
        ${[...new Set(itens.map((k) => k.grupo))].map(tabela).join("")}
        <table class="fa"><tr><td>ASSINATURA DO AVALIADO: ____________________________</td><td>DATA: ____/____/______</td></tr><tr><td>ASSINATURA DO AVALIADOR: ____________________________</td><td>DATA: ____/____/______</td></tr></table>
        <div class="quebra"></div><h2>AVALIAÇÃO DE DESEMPENHO — AVALIADO</h2>${PERGUNTAS_AVALIADO.map((q, i) => `<p><b>${"ABCDE"[i]})</b> ${esc(q)} ( ) SIM ( ) NÃO. Justifique:</p>${linhas(2)}`).join("")}<p><b>F)</b> Descreva aqui algum assunto que gostaria que fosse abordado:</p>${linhas(2)}<p>ASSINATURA DO AVALIADO: ____________________________ DATA: ____/____/______</p>
        <h2>AVALIAÇÃO DE DESEMPENHO — RESULTADO</h2>${pct != null ? `<p><b>Pontuação: ${pct}% — ${esc(fx.nome)}</b><br>${esc(fx.texto)}</p>` : ""}<table class="fa">${FAIXAS.map((f) => `<tr><td><b>${esc(f.nome)}</b><br><span>${esc(f.texto)}</span></td></tr>`).join("")}</table>
        <h2>AVALIAÇÃO DE DESEMPENHO — AVALIADOR</h2><p><b>A)</b> Pontos que devem ser melhorados:</p>${a?.pontos ? `<p>${esc(a.pontos)}</p>` : linhas(3)}<p><b>B)</b> O desempenho seria melhor com algum curso de especialização, comportamental ou técnico? ( ) SIM ( ) NÃO. Justifique:</p>${a?.curso ? `<p>${esc(a.curso)}</p>` : linhas(2)}<p><b>C)</b> Considerações finais do avaliador:</p>${a?.feedback ? `<p>${esc(a.feedback)}</p>` : linhas(3)}<p>ASSINATURA DO AVALIADOR: ____________________________ DATA: ____/____/______</p>`, "a4", "Ficha de avaliação " + (a?.pessoaNome || NOME_FICHA[cargo]),
        `.fa{margin:8px 0;font-size:11px}.fa td,.fa th{border:1px solid #444;padding:4px 6px}.fa th.g{background:#0d3c78;color:#fff;text-align:left}.fa .l{width:26px;text-align:center}.fa span{color:#555;font-size:10px}.peq{font-size:10.5px}.ln{border-bottom:1px solid #777;height:20px}.quebra{page-break-before:always}h2{background:#e8f0fb;padding:5px;font-size:13px;text-align:left}`); };
    $("#trPlano") && ($("#trPlano").onclick = planejar);
    v.querySelectorAll("[data-fb]").forEach((b) => (b.onclick = () => imprimirFicha(null, b.dataset.fb)));
    $("#trCorpo").onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.v) return abrirAv(avs.find((x) => x.id === b.dataset.v));
      if (b.dataset.pf) { const a = avs.find((x) => x.id === b.dataset.pf); return imprimirFicha(a.ficha ? a : null, a.ficha || pes.find((p) => p.id === a.pessoaId)?.cargo || "auxiliar"); }
      if (b.dataset.fb) return imprimirFicha(null, b.dataset.fb);
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
    let pid = me.uid, mes = mesAtual(); const semPonto = () => !cltDe(pes.find((p) => p.id === pid) || {});
    v.innerHTML = `<div class="barra"><h2>Presença do time</h2>${isMaster() ? `<select id="tpP">${opts(pes.filter(cltDe).concat(pes.filter((p) => p.id === me.uid && !cltDe(p))).map((p) => ({ id: p.id, nome: p.nome + (p.id === me.uid ? " (eu)" : "") })), pid)}</select><button class="btn" id="tpCfg">Configurar</button>` : ""}</div>
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
      $("#tpCorpo").innerHTML = `${pid === me.uid ? (semPonto() ? `<p class="aviso-ctrl">Seu cargo (médico veterinário PJ, ou cargo ainda não definido) não registra presença. Se for engano, peça ao master para definir o cargo em Usuários.</p>` : `<div class="card"><b>Hoje, ${br(hoje())}:</b> ${hojeM.map((m) => `${TIPOS[m.tipo]} ${hhmm(m.em)}`).join(" · ") || "nenhum registro ainda"}<div style="margin-top:10px">
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
      <p class="small muted">Quem registra presença é definido pelo cargo (Usuários): Auxiliar, Gerente, Recepção e Assistente operacional. Médicos veterinários (PJ) não registram.</p>`, async (f) => {
      cfg = { inicioTeste: f.inicioTeste }; await setDoc(doc(db, "timeConfig", "geral"), cfg); }));
    desenhar();
  }
  /* ===== DOCUMENTAÇÃO (check de documentos assinados por colaborador) ===== */
  const SUGESTOES_DOCS = [
    { nome: "Missão, visão e valores da clínica (ciência)", aplica: "todos", descricao: "Recebeu e leu." },
    { nome: "Código de ética e conduta profissional (ciência)", aplica: "todos", descricao: "" },
    { nome: "Regulamento interno (ciência)", aplica: "todos", descricao: "Regras de jornada, uniforme, celular, atrasos, sigilo, uso de materiais." },
    { nome: "Descrição de cargo entregue", aplica: "todos", descricao: "Impressa em Nosso time → Descrição de cargo." },
    { nome: "Termo de confidencialidade e LGPD", aplica: "todos", descricao: "Sigilo de dados de tutores, pacientes e da clínica (Lei nº 13.709/2018)." },
    { nome: "Autorização de uso de imagem", aplica: "todos", descricao: "Fotos e vídeos de pacientes e da equipe para uso da clínica." },
    { nome: "Contrato de trabalho (CLT)", aplica: "clt", descricao: "Contrato assinado; contrato de experiência quando houver." },
    { nome: "Descrição de cargo e Manual de Rotinas (ciência)", aplica: "clt", descricao: "Impressa em Nosso time → Descrição de cargo, com o nome do colaborador." },
    { nome: "Termo de recebimento de EPIs", aplica: "clt", descricao: "Luvas, máscara, avental, óculos e calçado fechado." },
    { nome: "ASO admissional", aplica: "clt", descricao: "Atestado de saúde ocupacional do exame admissional." },
    { nome: "Contrato de prestação de serviços (PJ)", aplica: "pj", descricao: "Contrato do médico(a) veterinário(a) prestador(a) de serviços." },
    { nome: "Cartão CNPJ e dados para pagamento", aplica: "pj", descricao: "" },
    { nome: "Carteira do CRMV", aplica: "pj", descricao: "Registro regular no CRMV-CE." }
  ];
  const vinculoDe = (p) => (cltDe(p) ? "clt" : "pj");
  const APLICA = { todos: "Todos", clt: "CLT", pj: "PJ (médicos)" };
  async function telaDocs(v) {
    const [pes, modelos, ass] = await Promise.all([pessoas(), lista("timeDocModelos"), lista("timeDocAssin")]);
    modelos.sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    const mapa = new Map(ass.map((a) => [a.pessoaId + "_" + a.modeloId, a]));
    const doPessoa = (p) => modelos.filter((m) => m.ativo !== false && (m.aplica === "todos" || m.aplica === vinculoDe(p)));
    const resumo = (p) => { const l = doPessoa(p); return { tot: l.length, ok: l.filter((m) => mapa.has(p.id + "_" + m.id)).length }; };
    let sel = pes[0]?.id;
    v.innerHTML = `<div class="barra"><h2>Documentação do time</h2><select id="dcP">${pes.map((p) => { const r = resumo(p); return `<option value="${p.id}">${esc(p.nome)} — ${r.ok}/${r.tot}</option>`; }).join("")}</select>
      <button class="btn small" id="dcNovo">+ Novo documento</button><button class="btn small" id="dcSug">Carregar documentos sugeridos</button></div>
      <p class="muted small">Marque o quadradinho quando a pessoa assinar o documento. Cada tipo de vínculo (CLT ou PJ) tem a sua lista. As sugestões são um ponto de partida: confirme com o contador/advogado.</p>
      <div id="dcLista"></div><h3>Modelos de documento</h3><div class="tabela-wrap"><table><thead><tr><th>Documento</th><th>Aplica a</th><th>Descrição</th><th></th></tr></thead><tbody>${modelos.map((m) => `<tr><td><b>${esc(m.nome)}</b>${m.link ? ` <a href="${esc(m.link)}" target="_blank" rel="noopener">abrir</a>` : ""}</td><td>${APLICA[m.aplica] || ""}</td><td class="small">${esc(m.descricao || "")}</td><td class="acoes-linha"><button class="btn small" data-e="${m.id}">Editar</button><button class="btn small danger" data-x="${m.id}">Excluir</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nenhum documento ainda. Use "Carregar documentos sugeridos".</td></tr>`}</tbody></table></div>`;
    const des = () => { const p = pes.find((x) => x.id === sel); if (!p) { $("#dcLista").innerHTML = ""; return; } const l = doPessoa(p), r = resumo(p);
      $("#dcLista").innerHTML = `<div class="card"><b>${esc(p.nome)}</b> <span class="tag neutro">${APLICA[vinculoDe(p)]}</span> — ${r.ok} de ${r.tot} assinados ${barra(r.tot ? Math.round((r.ok * 100) / r.tot) : 0)}
        ${l.map((m) => { const a = mapa.get(p.id + "_" + m.id); return `<label style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #e3e9f3"><input type="checkbox" data-m="${m.id}" ${a ? "checked" : ""}> <span style="flex:1"><b>${esc(m.nome)}</b>${m.link ? ` <a href="${esc(m.link)}" target="_blank" rel="noopener">abrir</a>` : ""}<br><span class="muted small">${esc(m.descricao || "")}</span></span>${a ? `<span class="small">✔ ${esc(br(a.data))} · ${esc(a.marcadoPor || "")}</span>` : `<span class="small muted">pendente</span>`}</label>`; }).join("") || `<p class="muted">Sem documentos para este vínculo.</p>`}</div>`; };
    des(); $("#dcP").onchange = (e) => { sel = e.target.value; des(); };
    $("#dcLista").onchange = async (e) => { const c = e.target.closest("[data-m]"); if (!c) return; const id = sel + "_" + c.dataset.m;
      if (c.checked) { const a = { pessoaId: sel, modeloId: c.dataset.m, data: hoje(), marcadoPor: eu().nome, marcadoEm: serverTimestamp() }; await setDoc(doc(db, "timeDocAssin", id), a); mapa.set(id, { ...a }); }
      else { if (!confirm("Desmarcar este documento (a pessoa ainda não assinou)?")) { c.checked = true; return; } await deleteDoc(doc(db, "timeDocAssin", id)); mapa.delete(id); }
      const o = $("#dcP").querySelector(`option[value="${sel}"]`), p = pes.find((x) => x.id === sel), r = resumo(p); o.textContent = `${p.nome} — ${r.ok}/${r.tot}`; des(); };
    const form = (m) => abrirModal(m ? "Editar documento" : "Novo documento", `<label>Nome do documento<input name="nome" required value="${esc(m?.nome || "")}"></label><label>Aplica a<select name="aplica">${Object.entries(APLICA).map(([k, n]) => `<option value="${k}" ${m?.aplica === k ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <label>Descrição / observações<textarea name="descricao" rows="2">${esc(m?.descricao || "")}</textarea></label><label>Link do documento (Drive, opcional)<input name="link" value="${esc(m?.link || "")}"></label>`,
      async (f) => { const d = { nome: f.nome.trim(), aplica: f.aplica, descricao: f.descricao, link: f.link, ativo: true }; if (m) await updateDoc(doc(db, "timeDocModelos", m.id), d); else await addDoc(collection(db, "timeDocModelos"), { ...d, criadoEm: serverTimestamp() }); toast("Documento salvo."); telaDocs(v); }, "Salvar");
    $("#dcNovo").onclick = () => form(null);
    $("#dcSug").onclick = async () => { const tem = new Set(modelos.map((m) => m.nome)); const novos = SUGESTOES_DOCS.filter((s) => !tem.has(s.nome)); if (!novos.length) return toast("As sugestões já estão carregadas."); for (const s of novos) await addDoc(collection(db, "timeDocModelos"), { ...s, ativo: true, criadoEm: serverTimestamp() }); toast(novos.length + " documentos adicionados."); telaDocs(v); };
    v.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => form(modelos.find((m) => m.id === b.dataset.e))));
    v.querySelectorAll("[data-x]").forEach((b) => (b.onclick = async () => { if (confirm("Excluir este documento da lista? As marcações antigas somem da tela.")) { await deleteDoc(doc(db, "timeDocModelos", b.dataset.x)); telaDocs(v); } }));
  }

  /* ===== TREINAMENTOS (check-in de quem participou) ===== */
  const SUGESTOES_TREINOS = ["Atendimento ao cliente", "Importância da documentação na clínica veterinária", "Biossegurança, limpeza e esterilização", "Contenção e manejo de pacientes", "Atendimento telefônico, agenda e cobranças", "Primeiros socorros e emergências"];
  async function telaTreinos(v) {
    const [pes, treinos] = await Promise.all([pessoas(), lista("timeTreinos")]);
    let ano = hoje().slice(0, 4), pessoaF = "";
    const anos = () => [...new Set([hoje().slice(0, 4), ...treinos.map((t) => String(t.data || "").slice(0, 4)).filter(Boolean)])].sort().reverse();
    v.innerHTML = `<div class="barra"><h2>Treinamentos</h2><select id="trA">${anos().map((a) => `<option>${a}</option>`).join("")}</select><select id="trP"><option value="">Todas as pessoas</option>${pes.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select>
      <button class="btn primary" id="trNovo">+ Novo treinamento</button><button class="btn small" id="trSug">Carregar sugestões do ano</button></div>
      <p class="muted small">Faça o check-in de quem participou de cada treinamento. Ao escolher uma pessoa, a lista mostra o que ela já fez.</p><div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Treinamento</th><th>Instrutor / carga</th><th>Participantes</th><th></th></tr></thead><tbody id="trTb"></tbody></table></div>`;
    const des = () => { const l = treinos.filter((t) => (!t.data || String(t.data).startsWith(ano))).sort((a, b) => String(a.data || "9").localeCompare(String(b.data || "9")));
      $("#trTb").innerHTML = l.map((t) => { const pt = t.participantes || {}, n = Object.keys(pt).length, fez = pessoaF ? !!pt[pessoaF] : null;
        return `<tr><td>${t.data ? esc(br(t.data)) : "a definir"}</td><td><b>${esc(t.nome)}</b>${t.obs ? `<div class="muted small">${esc(t.obs)}</div>` : ""}</td><td class="small">${esc(t.instrutor || "—")}${t.cargaH ? " · " + esc(t.cargaH) + " h" : ""}</td>
        <td>${pessoaF ? (fez ? `<span class="tag ok">✔ participou</span>` : `<span class="tag alerta">não participou</span>`) : `${n} de ${pes.length}`}</td><td class="acoes-linha"><button class="btn small primary" data-c="${t.id}">Check-in</button><button class="btn small" data-e="${t.id}">Editar</button><button class="btn small danger" data-x="${t.id}">Excluir</button></td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">Nenhum treinamento neste ano.</td></tr>`; };
    des(); $("#trA").onchange = (e) => { ano = e.target.value; des(); }; $("#trP").onchange = (e) => { pessoaF = e.target.value; des(); };
    const form = (t) => abrirModal(t ? "Editar treinamento" : "Novo treinamento", `<label>Nome do treinamento<input name="nome" required value="${esc(t?.nome || "")}"></label><div class="duas"><label>Data<input type="date" name="data" value="${esc(t?.data || "")}"></label><label>Carga horária (h)<input name="cargaH" value="${esc(t?.cargaH || "")}"></label></div>
      <label>Instrutor / empresa<input name="instrutor" value="${esc(t?.instrutor || "")}"></label><label>Observações<textarea name="obs" rows="2">${esc(t?.obs || "")}</textarea></label>`,
      async (f) => { const d = { nome: f.nome.trim(), data: f.data, cargaH: f.cargaH, instrutor: f.instrutor, obs: f.obs }; if (t) await updateDoc(doc(db, "timeTreinos", t.id), d); else await addDoc(collection(db, "timeTreinos"), { ...d, participantes: {}, criadoEm: serverTimestamp() }); toast("Treinamento salvo."); telaTreinos(v); }, "Salvar");
    $("#trNovo").onclick = () => form(null);
    $("#trSug").onclick = async () => { const tem = new Set(treinos.filter((t) => !t.data || String(t.data).startsWith(ano)).map((t) => t.nome)); const novos = SUGESTOES_TREINOS.filter((n) => !tem.has(n)); if (!novos.length) return toast("Já estão na lista."); for (const n of novos) await addDoc(collection(db, "timeTreinos"), { nome: n, data: "", cargaH: "", instrutor: "", obs: "Ano " + ano, participantes: {}, criadoEm: serverTimestamp() }); toast(novos.length + " treinamentos adicionados (sem data)."); telaTreinos(v); };
    $("#trTb").onclick = async (e) => { const b = e.target.closest("button"); if (!b) return; const t = treinos.find((x) => x.id === (b.dataset.c || b.dataset.e || b.dataset.x)); if (!t) return;
      if (b.dataset.e) return form(t);
      if (b.dataset.x) { if (confirm("Excluir este treinamento e os check-ins?")) { await deleteDoc(doc(db, "timeTreinos", t.id)); telaTreinos(v); } return; }
      const pt = t.participantes || {};
      abrirModal(`Check-in — ${t.nome}`, `<p class="muted small">Marque quem participou. Data do treinamento: ${t.data ? esc(br(t.data)) : "a definir"}.</p><div class="duas"><button type="button" class="btn small" id="ckTodos">Marcar todos</button><button type="button" class="btn small" id="ckNenhum">Limpar</button></div>
        ${pes.map((p) => `<label style="display:flex;gap:8px;align-items:center;padding:4px 0"><input type="checkbox" data-p="${p.id}" ${pt[p.id] ? "checked" : ""}> ${esc(p.nome)} <span class="muted small">${esc(pt[p.id] ? "✔ " + br(pt[p.id].em) : "")}</span></label>`).join("")}`,
        async () => { const novo = {}; $("#modalCorpo").querySelectorAll("[data-p]").forEach((c) => { if (c.checked) { const p = pes.find((x) => x.id === c.dataset.p); novo[p.id] = pt[p.id] || { nome: p.nome, em: t.data || hoje(), por: eu().nome }; } });
          await updateDoc(doc(db, "timeTreinos", t.id), { participantes: novo }); toast("Check-in salvo."); telaTreinos(v); }, "Salvar check-in");
      $("#ckTodos").onclick = () => $("#modalCorpo").querySelectorAll("[data-p]").forEach((c) => (c.checked = true)); $("#ckNenhum").onclick = () => $("#modalCorpo").querySelectorAll("[data-p]").forEach((c) => (c.checked = false)); };
  }


  /* ===== CHECKLIST DO FUNCIONÁRIO ===== */
  const EPI_ITENS = [["mascara", "Máscara descartável", "livre"], ["luva_proc", "Luvas de procedimento", "livre"], ["luva_limp", "Luvas de limpeza", "livre"], ["avental", "Avental/capote descartável", "eventual"], ["touca", "Touca / propé", "eventual"], ["oculos", "Óculos de proteção", "eventual"], ["auricular", "Protetor auricular", "eventual"], ["chumbo", "Avental/protetor de chumbo (radiação)", "eventual"]];
  const EXTRAS = [["ficha_epi", "Ficha de EPI assinada (NR-6)"], ["nr32", "Treinamento de biossegurança (NR-32) feito"], ["cartao_vac", "Cópia da carteira de vacinação arquivada"], ["docs_pessoais", "Documentos pessoais arquivados (RG, CPF, comprovante de endereço)"], ["registro", "Registro em carteira / eSocial (CLT) ou contrato + CNPJ (PJ) em dia"], ["vt", "Opção de vale-transporte registrada (CLT)"], ["dosimetro", "Dosímetro entregue (só quem trabalha com radiação)"], ["conselho", "Registro no conselho (CRMV/outro) conferido"]];
  const TIPOS_MED = ["Admissional", "Periódico", "Retorno ao trabalho", "Mudança de função", "Demissional"];
  const addM = (s, n) => { const d = dt(s); d.setMonth(d.getMonth() + n); return iso(d); };
  const venc = (p) => { if (!p) return `<span class="muted small">sem prazo</span>`; const dias = Math.round((dt(p) - dt(hoje())) / 86400000);
    return dias < 0 ? `<span class="tag alerta" style="background:#fde0e0;color:#a11">VENCIDO ${br(p)}</span>` : dias <= 30 ? `<span class="tag alerta">vence ${br(p)} (${dias}d)</span>` : `<span class="tag ok">próximo ${br(p)}</span>`; };
  async function telaCheck(v) {
    const [pes, ass, modelos, chks] = await Promise.all([pessoas(), lista("timeDocAssin"), lista("timeDocModelos"), lista("timeCheck")]);
    const dados = new Map(chks.map((c) => [c.id, c]));
    const get = (id) => { if (!dados.has(id)) dados.set(id, { vac: [], med: [], rad: { ativo: false, regs: [] }, epi: {}, email: {}, ext: {} }); const c = dados.get(id); c.vac ||= []; c.med ||= []; c.rad ||= { ativo: false, regs: [] }; c.rad.regs ||= []; c.epi ||= {}; c.email ||= {}; c.ext ||= {}; return c; };
    const salvar = async (id) => { const c = JSON.parse(JSON.stringify(get(id))); delete c.id; await setDoc(doc(db, "timeCheck", id), c); };
    const mapa = new Map(ass.map((a) => [a.pessoaId + "_" + a.modeloId, a]));
    const doPessoa = (p) => modelos.filter((m) => m.ativo !== false && (m.aplica === "todos" || m.aplica === vinculoDe(p))).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
    let sel = pes[0]?.id, ym = mesAtual();
    const ultimo = (l) => [...l].sort((a, b) => String(b.data).localeCompare(String(a.data)))[0];
    const alertas = () => { const r = []; for (const p of pes) { const c = get(p.id); const add = (t, prox) => { if (prox && prox <= addM(hoje(), 1)) r.push([p.nome, t, prox]); };
      const um = ultimo(c.med); if (um) add("Exame médico", um.prox); if (c.rad.ativo) { const ur = ultimo(c.rad.regs); if (ur) add("Exame de radiação", ur.prox); else r.push([p.nome, "Exame de radiação", ""]); }
      if (!c.vac.some((x) => String(x.data).startsWith(hoje().slice(0, 4)))) r.push([p.nome, "Vacinação do ano", ""]); if (!um) r.push([p.nome, "Exame médico", ""]); } return r; };
    v.innerHTML = `<div class="barra"><h2>Checklist do funcionário</h2><select id="ckP">${pes.map((p) => `<option value="${p.id}">${esc(p.nome)}</option>`).join("")}</select></div>
      <p class="muted small">Prazos são sugestões padrão (12 meses) e podem ser mudados em cada lançamento. Confirme a periodicidade com o médico do trabalho (PCMSO) e o contador.</p>
      <div id="ckAl"></div><div id="ckCorpo"></div><div id="ckEquipe"></div>`;
    const des = () => { const p = pes.find((x) => x.id === sel); if (!p) return; const c = get(p.id), clt = vinculoDe(p) === "clt";
      const al = alertas(); $("#ckAl").innerHTML = `<details class="card"${al.length ? " open" : ""}><summary><b>⚠ Atenção da equipe (${al.length})</b> <span class="muted small">vencidos, a vencer em 30 dias ou sem registro</span></summary>${al.map((a) => `<div class="small">• <b>${esc(a[0])}</b> — ${a[1]} ${a[2] ? venc(a[2]) : `<span class="tag alerta">sem registro</span>`}</div>`).join("") || "<p class='muted small'>Tudo em dia.</p>"}</details>`;
      const docs = doPessoa(p), nOk = docs.filter((m) => mapa.has(p.id + "_" + m.id)).length;
      const uv = ultimo(c.vac), anoV = c.vac.some((x) => String(x.data).startsWith(hoje().slice(0, 4)));
      const um = ultimo(c.med), ur = ultimo(c.rad.regs), epiM = c.epi[ym] || {};
      $("#ckCorpo").innerHTML = `<div class="card"><h3 style="margin-top:0">${esc(p.nome)} <span class="tag neutro">${APLICA[vinculoDe(p)]}</span></h3>
      <h4>1. Documentos assinados — ${nOk}/${docs.length}</h4>${barra(docs.length ? Math.round(nOk * 100 / docs.length) : 0)}
      ${docs.map((m) => { const a = mapa.get(p.id + "_" + m.id); return `<label style="display:flex;gap:8px;align-items:center;padding:4px 0"><input type="checkbox" data-doc="${m.id}" ${a ? "checked" : ""}> ${esc(m.nome)} ${a ? `<span class="muted small">assinado em ${br(a.data)}</span>` : ""}</label>`; }).join("") || `<p class="muted small">Nenhum documento cadastrado. Vá em Documentos assinados → "Carregar documentos sugeridos".</p>`}
      <h4>2. Vacinação ${anoV ? `<span class="tag ok">✔ feita em ${hoje().slice(0, 4)}</span>` : `<span class="tag alerta">sem vacina registrada em ${hoje().slice(0, 4)}</span>`}</h4>
      <button class="btn small" id="vAdd">+ Registrar vacina</button>
      <div class="tabela-wrap"><table><thead><tr><th>Vacina</th><th>Data</th><th>Próxima</th><th></th></tr></thead><tbody>${[...c.vac].sort((a, b) => String(b.data).localeCompare(String(a.data))).map((x) => `<tr><td>${esc(x.n)}</td><td>${br(x.data)}</td><td>${venc(x.prox)}</td><td><button class="btn small danger" data-dv="${x.id}">✕</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nenhuma.</td></tr>`}</tbody></table></div>
      <p class="muted small">Sugestão para quem trabalha com animais: tétano/difteria (dT), hepatite B, raiva (pré-exposição) e gripe anual — definidas pelo médico do trabalho no PCMSO.</p>
      <h4>3. EPI do mês <input type="month" id="epiM" value="${ym}" style="width:auto"></h4>
      <p class="muted small">Toque em + sempre que a pessoa pegar. "Livre" = à vontade (só para saber o consumo); "eventual" = entrega registrada.</p>
      <div class="tabela-wrap"><table><thead><tr><th>Item</th><th>Tipo</th><th>Neste mês</th><th></th></tr></thead><tbody>${EPI_ITENS.map(([k, n, t]) => `<tr><td>${n}</td><td class="muted small">${t}</td><td><b>${epiM[k] || 0}</b></td><td><button class="btn small" data-epi="${k}" data-d="-1">−</button> <button class="btn small primary" data-epi="${k}" data-d="1">+</button></td></tr>`).join("")}</tbody></table></div>
      <h4>4. Radiação ${ur ? venc(ur.prox) : ""}</h4>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="radA" ${c.rad.ativo ? "checked" : ""}> Esta pessoa tem contato com radiação (raio-x)</label>
      ${c.rad.ativo ? `<button class="btn small" id="rAdd">+ Registrar teste/avaliação anual</button><div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Próximo</th><th>Obs.</th><th></th></tr></thead><tbody>${[...c.rad.regs].sort((a, b) => String(b.data).localeCompare(String(a.data))).map((x) => `<tr><td>${br(x.data)}</td><td>${venc(x.prox)}</td><td class="small">${esc(x.obs || "")}</td><td><button class="btn small danger" data-dr="${x.id}">✕</button></td></tr>`).join("") || `<tr><td colspan="4" class="muted">Nenhum.</td></tr>`}</tbody></table></div>` : ""}
      <h4>5. Exame médico ocupacional ${um ? venc(um.prox) : `<span class="tag alerta">sem registro</span>`}</h4>
      <button class="btn small" id="mAdd">+ Registrar exame (ASO)</button>
      <div class="tabela-wrap"><table><thead><tr><th>Tipo</th><th>Data</th><th>Próximo</th><th>Médico/obs.</th><th></th></tr></thead><tbody>${[...c.med].sort((a, b) => String(b.data).localeCompare(String(a.data))).map((x) => `<tr><td>${esc(x.tipo)}</td><td>${br(x.data)}</td><td>${venc(x.prox)}</td><td class="small">${esc(x.obs || "")}</td><td><button class="btn small danger" data-dm="${x.id}">✕</button></td></tr>`).join("") || `<tr><td colspan="5" class="muted">Nenhum.</td></tr>`}</tbody></table></div>
      <p class="muted small">Pela NR-7 (PCMSO), CLT: exame <b>admissional</b> antes de começar; <b>periódico</b> (em geral a cada 12 meses para quem tem exposição a risco, como biológico/radiação; até 24 meses para os demais, a critério do médico); <b>retorno</b> após afastamento de 30+ dias; <b>mudança de função</b>; <b>demissional</b> (até 10 dias após o desligamento, salvo dispensas da NR-7). Confirme com o médico coordenador do PCMSO.</p>
      <h4>6. Documentos enviados ao e-mail pessoal ${c.email.data ? `<span class="tag ok">✔ ${br(c.email.data)}</span>` : `<span class="tag alerta">não enviado</span>`}</h4>
      <div class="duas"><label>E-mail pessoal<input id="emEnd" value="${esc(c.email.end || "")}"></label><label>Data do envio<input type="date" id="emData" value="${c.email.data || ""}"></label></div><button class="btn small" id="emSalvar">Salvar</button>
      <h4>7. Complementares</h4>
      ${EXTRAS.map(([k, n]) => `<label style="display:flex;gap:8px;align-items:center;padding:3px 0"><input type="checkbox" data-ex="${k}" ${c.ext[k] ? "checked" : ""}> ${n} ${c.ext[k] ? `<span class="muted small">${br(c.ext[k])}</span>` : ""}</label>`).join("")}
      <p style="margin-top:12px"><button class="btn" id="ckPrint">🖨 Imprimir checklist</button></p></div>`;
      // EQUIPE: EPI do mês
      const tot = {}; for (const q of pes) { const e = (get(q.id).epi || {})[ym] || {}; for (const [k, n] of Object.entries(e)) tot[k] = (tot[k] || 0) + n; }
      $("#ckEquipe").innerHTML = `<details class="card"><summary><b>Consumo de EPI da equipe em ${ym.split("-").reverse().join("/")}</b></summary><div class="tabela-wrap"><table><thead><tr><th>Item</th><th>Total</th>${pes.map((q) => `<th class="small">${esc(q.nome.split(" ")[0])}</th>`).join("")}</tr></thead><tbody>${EPI_ITENS.map(([k, n]) => `<tr><td>${n}</td><td><b>${tot[k] || 0}</b></td>${pes.map((q) => `<td>${((get(q.id).epi || {})[ym] || {})[k] || 0}</td>`).join("")}</tr>`).join("")}</tbody></table></div></details>`;
      const sv = async () => { await salvar(sel); des(); };
      $("#ckCorpo").querySelectorAll("[data-doc]").forEach((cb) => (cb.onchange = async () => { const id = sel + "_" + cb.dataset.doc;
        if (cb.checked) { const a = { pessoaId: sel, modeloId: cb.dataset.doc, data: hoje(), marcadoPor: eu().nome, marcadoEm: serverTimestamp() }; await setDoc(doc(db, "timeDocAssin", id), a); mapa.set(id, { ...a }); }
        else { if (!confirm("Desmarcar este documento?")) { cb.checked = true; return; } await deleteDoc(doc(db, "timeDocAssin", id)); mapa.delete(id); } des(); }));
      $("#ckCorpo").querySelectorAll("[data-ex]").forEach((cb) => (cb.onchange = () => { if (cb.checked) c.ext[cb.dataset.ex] = hoje(); else delete c.ext[cb.dataset.ex]; sv(); }));
      $("#ckCorpo").querySelectorAll("[data-epi]").forEach((b) => (b.onclick = () => { const e = (c.epi[ym] ||= {}); e[b.dataset.epi] = Math.max(0, (e[b.dataset.epi] || 0) + Number(b.dataset.d)); sv(); }));
      $("#epiM").onchange = (e) => { ym = e.target.value || mesAtual(); des(); };
      $("#radA").onchange = (e) => { c.rad.ativo = e.target.checked; sv(); };
      const rm = (arr, id) => { const i = arr.findIndex((x) => x.id === id); if (i >= 0 && confirm("Remover este registro?")) { arr.splice(i, 1); sv(); } };
      $("#ckCorpo").querySelectorAll("[data-dv]").forEach((b) => (b.onclick = () => rm(c.vac, b.dataset.dv)));
      $("#ckCorpo").querySelectorAll("[data-dr]").forEach((b) => (b.onclick = () => rm(c.rad.regs, b.dataset.dr)));
      $("#ckCorpo").querySelectorAll("[data-dm]").forEach((b) => (b.onclick = () => rm(c.med, b.dataset.dm)));
      const uid = () => Math.random().toString(36).slice(2, 9);
      $("#vAdd").onclick = () => abrirModal("Registrar vacina", `<label>Vacina<input name="n" list="vl" required><datalist id="vl"><option>Hepatite B</option><option>Tétano/difteria (dT)</option><option>Raiva (pré-exposição)</option><option>Gripe (influenza)</option></datalist></label><div class="duas"><label>Data<input type="date" name="data" required value="${hoje()}"></label><label>Próxima dose/reforço (opcional)<input type="date" name="prox" value="${addM(hoje(), 12)}"></label></div>`, async (f) => { c.vac.push({ id: uid(), n: f.n.trim(), data: f.data, prox: f.prox || "" }); await sv(); }, "Salvar");
      $("#mAdd")?.addEventListener("click", () => abrirModal("Registrar exame ocupacional", `<label>Tipo<select name="tipo">${TIPOS_MED.map((t) => `<option>${t}</option>`).join("")}</select></label><div class="duas"><label>Data do exame<input type="date" name="data" required value="${hoje()}"></label><label>Próximo exame (padrão 12 meses)<input type="date" name="prox" value="${addM(hoje(), 12)}"></label></div><label>Médico / observações<input name="obs"></label>`, async (f) => { c.med.push({ id: uid(), tipo: f.tipo, data: f.data, prox: f.prox || "", obs: f.obs }); await sv(); }, "Salvar"));
      $("#rAdd")?.addEventListener("click", () => abrirModal("Registrar teste de radiação", `<div class="duas"><label>Data<input type="date" name="data" required value="${hoje()}"></label><label>Próximo (padrão 12 meses)<input type="date" name="prox" value="${addM(hoje(), 12)}"></label></div><label>Observações (dosimetria, médico…)<input name="obs"></label>`, async (f) => { c.rad.regs.push({ id: uid(), data: f.data, prox: f.prox || "", obs: f.obs }); await sv(); }, "Salvar"));
      $("#emSalvar").onclick = () => { c.email = { end: $("#emEnd").value.trim(), data: $("#emData").value }; sv(); toast("Salvo."); };
      $("#ckPrint").onclick = () => docImpressao(`<h2>Checklist — ${esc(p.nome)}</h2><p>${APLICA[vinculoDe(p)]} · ${br(hoje())}</p><h4>Documentos</h4>${docs.map((m) => `<div>${mapa.has(p.id + "_" + m.id) ? "☑" : "☐"} ${esc(m.nome)}</div>`).join("")}<h4>Vacinação</h4><div>${c.vac.map((x) => `${esc(x.n)}: ${br(x.data)} (próx. ${br(x.prox) || "—"})`).join("<br>") || "—"}</div><h4>Exame médico</h4><div>${c.med.map((x) => `${esc(x.tipo)}: ${br(x.data)} (próx. ${br(x.prox) || "—"})`).join("<br>") || "—"}</div>${c.rad.ativo ? `<h4>Radiação</h4><div>${c.rad.regs.map((x) => `${br(x.data)} (próx. ${br(x.prox) || "—"})`).join("<br>") || "—"}</div>` : ""}<h4>E-mail pessoal</h4><div>${esc(c.email.end || "—")} ${c.email.data ? br(c.email.data) : ""}</div><h4>Complementares</h4>${EXTRAS.map(([k, n]) => `<div>${c.ext[k] ? "☑" : "☐"} ${n}</div>`).join("")}`, "a4", "Checklist"); };
    des(); $("#ckP").onchange = (e) => { sel = e.target.value; des(); };
  }

  /* ===== DOCUMENTOS DA CLÍNICA (validade e aviso de vencimento) ===== */
  const SUG_CLINICA = [
    ["Alvará de funcionamento", "Licenças", 12], ["Licença sanitária (Vigilância Sanitária)", "Licenças", 12], ["Certificado de regularidade no CRMV (empresa) + ART do responsável técnico", "Licenças", 12],
    ["AVCB / certificado do Corpo de Bombeiros", "Licenças", 12], ["Manutenção/recarga dos extintores", "Segurança", 12],
    ["PGR — Programa de Gerenciamento de Riscos (NR-1)", "Saúde e segurança", 24], ["PCMSO — Programa de Controle Médico (NR-7)", "Saúde e segurança", 12], ["Laudo de insalubridade / LTCAT", "Saúde e segurança", 12],
    ["Plano de radioproteção (raio-x)", "Radiação", 48], ["Levantamento radiométrico", "Radiação", 48], ["Teste de controle de qualidade do raio-x", "Radiação", 12], ["Dosímetros — relatório mensal em dia", "Radiação", 1],
    ["PGRSS — plano de resíduos de saúde", "Resíduos e higiene", 12], ["Contrato/certificado da empresa de coleta de resíduos", "Resíduos e higiene", 12], ["Dedetização / controle de pragas", "Resíduos e higiene", 6], ["Limpeza da caixa d'água", "Resíduos e higiene", 6],
    ["Calibração/manutenção da autoclave", "Equipamentos", 12], ["Manutenção de equipamentos (ultrassom, monitor, anestesia)", "Equipamentos", 12], ["Seguro da clínica", "Outros", 12]];
  async function telaClinica(v) {
    let docs = await lista("clinicaDocs"), fil = "";
    const dias = (p) => Math.round((dt(p) - dt(hoje())) / 86400000);
    const des = () => { docs.sort((a, b) => String(a.validade || "9999").localeCompare(String(b.validade || "9999")));
      const l = docs.filter((d) => !fil || (fil === "venc" ? d.validade && dias(d.validade) <= 30 : fil === "sem" ? !d.validade : d.categoria === fil));
      const nv = docs.filter((d) => d.validade && dias(d.validade) < 0).length, na = docs.filter((d) => d.validade && dias(d.validade) >= 0 && dias(d.validade) <= 30).length, ns = docs.filter((d) => !d.validade).length;
      const cats = [...new Set(docs.map((d) => d.categoria).filter(Boolean))];
      $("#clRes").innerHTML = `<span class="tag alerta" style="background:#fde0e0;color:#a11">${nv} vencido(s)</span> <span class="tag alerta">${na} vencem em 30 dias</span> <span class="tag neutro">${ns} sem data</span> <span class="tag ok">${docs.length - nv - na - ns} em dia</span>`;
      $("#clFil").innerHTML = `<option value="">Todos</option><option value="venc">Vencidos / a vencer (30 dias)</option><option value="sem">Sem data</option>${cats.map((c) => `<option>${esc(c)}</option>`).join("")}`; $("#clFil").value = fil;
      $("#clTb").innerHTML = l.map((d) => `<tr><td><b>${esc(d.nome)}</b>${d.obs ? `<div class="muted small">${esc(d.obs)}</div>` : ""}</td><td class="small">${esc(d.categoria || "")}</td><td class="small">${esc(d.responsavel || "—")}</td><td>${d.emissao ? br(d.emissao) : "—"}</td><td>${venc(d.validade)}</td><td class="small">${d.meses ? d.meses + " m" : ""}</td>
        <td class="acoes-linha">${d.link ? `<a class="btn small" href="${esc(d.link)}" target="_blank">Abrir</a>` : ""}<button class="btn small primary" data-r="${d.id}">Renovar</button><button class="btn small" data-e="${d.id}">Editar</button><button class="btn small danger" data-x="${d.id}">✕</button></td></tr>`).join("") || `<tr><td colspan="7" class="muted">Nenhum documento. Use "Carregar sugestões".</td></tr>`; };
    v.innerHTML = `<div class="barra"><h2>Documentos da clínica</h2><select id="clFil"></select><button class="btn primary" id="clNovo">+ Novo documento</button><button class="btn small" id="clSug">Carregar sugestões</button></div><div id="clRes" style="margin:6px 0"></div>
      <p class="muted small">Cadastre a validade de cada licença/programa. Os vencidos e os que vencem em 30 dias aparecem em vermelho/amarelo. As sugestões e prazos são um ponto de partida: confirme com contador, Vigilância Sanitária e engenheiro de segurança.</p>
      <div class="tabela-wrap"><table><thead><tr><th>Documento</th><th>Tipo</th><th>Responsável</th><th>Emitido</th><th>Validade</th><th>Ciclo</th><th></th></tr></thead><tbody id="clTb"></tbody></table></div>`;
    const recarregar = async () => { docs = await lista("clinicaDocs"); des(); };
    const form = (d) => abrirModal(d ? "Editar documento" : "Novo documento", `<label>Nome<input name="nome" required value="${esc(d?.nome || "")}"></label><div class="duas"><label>Tipo<input name="categoria" value="${esc(d?.categoria || "")}"></label><label>Responsável / órgão<input name="responsavel" value="${esc(d?.responsavel || "")}"></label></div>
      <div class="duas"><label>Data de emissão<input type="date" name="emissao" value="${d?.emissao || ""}"></label><label>Validade (vencimento)<input type="date" name="validade" value="${d?.validade || ""}"></label></div>
      <label>Ciclo de renovação (meses)<input type="number" min="0" name="meses" value="${d?.meses || ""}"></label><label>Link (Drive)<input name="link" value="${esc(d?.link || "")}"></label><label>Observações<textarea name="obs" rows="2">${esc(d?.obs || "")}</textarea></label>`,
      async (f) => { const x = { nome: f.nome.trim(), categoria: f.categoria, responsavel: f.responsavel, emissao: f.emissao, validade: f.validade, meses: Number(f.meses) || 0, link: f.link, obs: f.obs }; if (d) await updateDoc(doc(db, "clinicaDocs", d.id), x); else await addDoc(collection(db, "clinicaDocs"), x); await recarregar(); });
    $("#clNovo").onclick = () => form(null); $("#clFil").onchange = (e) => { fil = e.target.value; des(); };
    $("#clSug").onclick = async () => { const tem = new Set(docs.map((d) => d.nome)); const n = SUG_CLINICA.filter((x) => !tem.has(x[0])); if (!n.length) return toast("Já carregado."); for (const [nome, categoria, meses] of n) await addDoc(collection(db, "clinicaDocs"), { nome, categoria, meses, responsavel: "", emissao: "", validade: "", link: "", obs: "" }); toast(n.length + " documentos adicionados. Preencha as validades."); recarregar(); };
    $("#clTb").onclick = async (e) => { const b = e.target.closest("button"); if (!b) return; const d = docs.find((x) => x.id === (b.dataset.r || b.dataset.e || b.dataset.x)); if (!d) return;
      if (b.dataset.e) return form(d);
      if (b.dataset.x) { if (confirm("Excluir este documento?")) { await deleteDoc(doc(db, "clinicaDocs", d.id)); recarregar(); } return; }
      abrirModal("Renovar — " + d.nome, `<div class="duas"><label>Nova emissão<input type="date" name="emissao" required value="${hoje()}"></label><label>Nova validade<input type="date" name="validade" id="rnV" value="${d.meses ? addM(hoje(), d.meses) : ""}"></label></div><p class="muted small">Se o ciclo estiver preenchido, a validade sugerida é a emissão + ${d.meses || "?"} meses. Pode ajustar.</p>`,
        async (f) => { await updateDoc(doc(db, "clinicaDocs", d.id), { emissao: f.emissao, validade: f.validade }); await recarregar(); }, "Renovar"); };
    des();
  }

  function telaCargos(v) {
    let cur = "auxiliar";
    const html = (d, nome) => htmlDescricao(d, CLINICA_NOME, nome);
    const des = () => { v.querySelector("#cgDoc").innerHTML = html(DESCRICOES[cur], $("#cgNome").value.trim()); };
    v.innerHTML = `<div class="barra"><h2>Descrições de cargo</h2><select id="cgSel">${Object.entries(DESCRICOES).map(([id, d]) => `<option value="${id}">${esc(d.nome)}</option>`).join("")}</select><input id="cgNome" placeholder="Nome do(a) empregado(a) ou candidato(a)" style="min-width:260px"><button class="btn primary" id="cgPrint">🖨 Imprimir / salvar PDF</button></div>
      <p class="muted small">Textos em <code>cargos-rh.js</code>. Itens como CBO, jornada e insalubridade devem ser conferidos com o contador ou advogado trabalhista antes de assinar.</p><div class="card" id="cgDoc" style="font-size:13px"></div>`;
    $("#cgSel").onchange = (e) => { cur = e.target.value; des(); }; $("#cgNome").oninput = des; $("#cgPrint").onclick = () => abrirModal("Dados para imprimir a descrição de cargo", formDadosDescricao($("#cgNome").value.trim()), (f) => { const dd = lerDadosDescricao(f); docImpressao(htmlDescricao(DESCRICOES[cur], CLINICA_NOME, dd.nome, dd), "a4", "Descrição de cargo " + DESCRICOES[cur].nome + " - " + dd.nome, CSS_DESCRICAO); }, "Imprimir");
    des();
  }
  return { "time-clinica": telaClinica, "time-check": telaCheck, "time-docs": telaDocs, "time-treino": telaTreinos, "time-cargos": telaCargos, "time-agenda": telaAgenda, "time-relatorios": telaRelatorios, "time-presenca": telaPresenca };
}
