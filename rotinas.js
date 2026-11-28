// Rotinas fixas de cada cargo (viram atividades na Agenda do time). dias: 0=Dom … 6=Sáb. diaMes: todo dia N do mês.
// Horários marcados "sugerido" foram estimados: ajuste na Agenda (Editar) se precisar.
const SEG_SAB = [1, 2, 3, 4, 5, 6], SEG_SEX = [1, 2, 3, 4, 5];
export const ROTINAS = {
  auxiliar: [
    { titulo: "Anotar temperatura da geladeira (1ª tarefa ao chegar)", horaIni: "08:00", horaFim: "08:10", dias: SEG_SAB, obs: "Obrigatório todos os dias." },
    { titulo: "Repor álcool, clorexidina, água oxigenada, álcool em gel e papel toalha; atualizar datas das ampolas/frascos abertos", horaIni: "08:00", horaFim: "09:00", dias: [1] },
    { titulo: "Retirar o lixo da clínica (dia do lixo)", horaIni: "08:30", horaFim: "09:00", dias: [2, 4, 6], obs: "Horário sugerido." },
    { titulo: "Limpeza de instrumentais cirúrgicos e do centro cirúrgico", horaIni: "09:00", horaFim: "11:00", dias: SEG_SAB, obs: "Horário sugerido." },
    { titulo: "Limpar as mantinhas", horaIni: "10:00", horaFim: "11:00", dias: SEG_SAB, obs: "Horário sugerido." },
    { titulo: "Trocar kit de retirada de pontos e porta-agulha (levar o usado ao material sujo)", horaIni: "11:00", horaFim: "11:30", dias: [6] },
    { titulo: "Anotar temperatura da geladeira (fim do dia)", horaIni: "18:00", horaFim: "18:10", dias: SEG_SAB },
    { titulo: "Conferir lixeiras (infectante e comum) e retirar o lixo se precisar", horaIni: "17:30", horaFim: "18:00", dias: SEG_SAB, obs: "Perto do fim do expediente." },
    { titulo: "Acompanhar o recolhimento do lixo infectocontagioso pela empresa (incineração)", diaMes: 5, horaIni: "08:00", obs: "Todo dia 5." }
  ],
  gerente: [
    { titulo: "Análise financeira semanal (conciliar extratos, maquininhas/Pix, contas a pagar, estornos e NF, recebimento de planos)", horaIni: "08:00", horaFim: "10:00", dias: [1], obs: "Home office." },
    { titulo: "Produção de relatórios e KPIs (atendimentos, retornos, quem não veio; pedir avaliação no Google)", horaIni: "10:00", horaFim: "12:00", dias: [1] },
    { titulo: "Planejamento da semana (3 prioridades por dia, pauta da semana)", horaIni: "14:00", horaFim: "16:00", dias: [1] },
    { titulo: "Marketing e metas (métricas, calendário de posts e campanhas)", horaIni: "16:00", horaFim: "18:00", dias: [1] },
    { titulo: "Financeiro resumido, pagamento de médicos volantes/NF/estornos e recebimento de mercadoria", horaIni: "09:00", horaFim: "10:00", dias: [2, 4], obs: "Presencial." },
    { titulo: "Reunião de start da semana com a equipe", horaIni: "10:00", horaFim: "11:00", dias: [2] },
    { titulo: "Verificar preenchimento e arquivamento de prontuários", horaIni: "11:00", horaFim: "12:00", dias: [2] },
    { titulo: "Marketing local, vídeo para redes e tráfego pago; RH (triar currículos, agendar entrevistas)", horaIni: "14:00", horaFim: "16:00", dias: [2] },
    { titulo: "Marketing e conteúdos (repostar, panfletos, campanhas e promoções)", horaIni: "08:00", horaFim: "12:00", dias: [3], obs: "Home office." },
    { titulo: "Relatórios de quem não retornou; conferir planilhas (laboratório, médicos volantes); WhatsApp e e-mails de atendimento", horaIni: "14:00", horaFim: "18:00", dias: [3] },
    { titulo: "Reposição de estoque por sala e troca de rotulagem; conferir validades", horaIni: "10:00", horaFim: "11:00", dias: [4] },
    { titulo: "Contagem de vacinas (vacina / validade / quantidade) e baixa no sistema", horaIni: "11:00", horaFim: "12:30", dias: [4] },
    { titulo: "Gestão de estoque e compras: níveis críticos, cotações e pedidos aos fornecedores", horaIni: "14:00", horaFim: "16:00", dias: [4] },
    { titulo: "Buscar novos parceiros e fornecedores; elaborar POPs", horaIni: "16:00", horaFim: "18:00", dias: [4] },
    { titulo: "Financeiro (resumo) e pagamento de médicos volantes/NF/estornos", horaIni: "08:00", horaFim: "08:30", dias: [5] },
    { titulo: "Reunião de fechamento com a equipe (feedbacks e metas)", horaIni: "10:00", horaFim: "11:00", dias: [5] },
    { titulo: "Plano de ação da autoinspeção e conferência dos livros sanitários (validades: caixa d'água, potabilidade, dedetização)", horaIni: "11:00", horaFim: "12:00", dias: [5] },
    { titulo: "Tarefas pendentes e planejamento da próxima semana", horaIni: "14:00", horaFim: "16:30", dias: [5] },
    { titulo: "Aprovar pagamentos", horaIni: "09:00", horaFim: "09:30", dias: SEG_SEX, obs: "Horário sugerido." },
    { titulo: "Estoque (conferência física), ronda de supervisão, entrevistas e treinamentos", horaIni: "09:00", horaFim: "12:00", dias: [6] }
  ],
  assistente: [
    { titulo: "Comissionamento dos médicos, pagamento dos médicos volantes e organização dos pagamentos do dia e da semana", horaIni: "08:00", horaFim: "09:00", dias: SEG_SAB },
    { titulo: "Fazer os pagamentos do dia", horaIni: "09:00", horaFim: "09:30", dias: SEG_SAB },
    { titulo: "Compras e cotações: ver o que está faltando e o que está acabando rápido", horaIni: "09:30", horaFim: "11:00", dias: SEG_SEX, obs: "Horário sugerido." },
    { titulo: "Verificar material em estoque e reposição das salas", horaIni: "11:00", horaFim: "12:00", dias: SEG_SEX, obs: "Horário sugerido." },
    { titulo: "Ver o que não sai do estoque e parar de comprar (marcar 'Não repor')", horaIni: "14:00", horaFim: "15:00", dias: [5], obs: "Horário sugerido." }
  ],
  recepcao: [
    { titulo: "Registrar ponto e preparar a recepção (luzes, ar, computador, balança, maquininhas)", horaIni: "08:00", horaFim: "08:15", dias: SEG_SAB },
    { titulo: "E-mails e WhatsApp; conferir agenda do dia; confirmar volantes; avisar vacinação de amanhã", horaIni: "08:15", horaFim: "09:00", dias: SEG_SAB },
    { titulo: "Conferir se as salas de atendimento estão limpas e organizadas (antes de iniciar)", horaIni: "08:30", horaFim: "09:00", dias: SEG_SAB },
    { titulo: "Conferir salas limpas e organizadas depois do almoço, antes do atendimento", horaIni: "13:30", horaFim: "14:00", dias: SEG_SAB, obs: "Horário sugerido." },
    { titulo: "Anexar exames no sistema e enviar aos tutores e colaboradores", horaIni: "10:00", horaFim: "11:00", dias: SEG_SAB, obs: "Horário sugerido." },
    { titulo: "Recepção e atendimento de tutores e pacientes (cadastro, peso, pagamento antes do atendimento)", horaIni: "09:00", horaFim: "17:00", dias: SEG_SAB },
    { titulo: "Fechar o caixa, relatório ao financeiro, mensagens de fim de expediente e desligar equipamentos", horaIni: "17:30", horaFim: "18:00", dias: SEG_SAB }
  ],
  limpeza: [
    { titulo: "Limpeza geral da clínica", horaIni: "08:00", horaFim: "11:00", dias: SEG_SAB },
    { titulo: "Limpeza de vidros e janelas", horaIni: "08:00", horaFim: "11:00", dias: [1, 4] }
  ]
};
