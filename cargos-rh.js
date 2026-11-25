// Fichas de avaliação de desempenho (uma por cargo) e descrições de cargo da VetPlus.
// Base: "FICHA DE AVALIAÇÃO DE DESEMPENHO" da clínica (A Acima da média, B Bom, C Regular, D Insatisfatório).
// Para mudar um texto, edite aqui. Itens jurídicos (CBO, jornada, insalubridade) devem ser conferidos com contador/advogado trabalhista.

export const NOTAS = { A: 4, B: 3, C: 2, D: 1 };
export const LEGENDA = [["A", "Acima da Média", "Raramente comete erros. Trabalhando com bastante exatidão"], ["B", "Bom", "Atinge o exigido. Possui satisfatório grau de exatidão e cuidados no trabalho"], ["C", "Regular", "Toma decisão baseada na rotina diária"], ["D", "Insatisfatório", "Não atingiu os objetivos da função."]];
export const FAIXAS = [
  { min: 84, nome: "ACIMA DA MÉDIA (84% - 100%)", texto: "Seu trabalho supera as expectativas em praticamente todos os aspectos. Você é um profissional que contribui para o crescimento e resultado da organização. Nós reconhecemos e apreciamos sua contribuição exemplar." },
  { min: 67, nome: "BOM (67% - 83%)", texto: "Seu trabalho tem sido consistente e positivo, superando a média na maioria dos aspectos. Mesmo tendo alguns pontos a melhorar, nós apreciamos seu comprometimento e contribuição, e esperamos que você continue evoluindo." },
  { min: 50, nome: "REGULAR (50% - 66%)", texto: "Seu trabalho atendeu os padrões na maioria dos aspectos, além dos requisitos básicos para o seu trabalho. Continue seus esforços e trabalharemos juntos para ajudar você a aumentar seu potencial e superar algumas dificuldades." },
  { min: 0, nome: "INSATISFATÓRIA (até 49%)", texto: "Seu desempenho está abaixo do padrão necessário nos aspectos críticos para seu trabalho. Embora você tenha atendido alguns requisitos, seu desempenho precisa de evolução quanto a outros; com comprometimento e mudança de atitude, acreditamos que você pode melhorar." }
];
export const faixaDe = (pct) => FAIXAS.find((f) => pct >= f.min);
export const pctDe = (itens) => { const v = itens.filter((i) => NOTAS[i.nota]); if (!v.length) return 0; return Math.round((v.reduce((s, i) => s + NOTAS[i.nota], 0) / (v.length * 4)) * 100); };

const ORG = [
  ["QUALIDADE DO TRABALHO", "Considere a ausência de erros constantes e repetitivos, a apresentação geral do trabalho e a não necessidade de repetição de tarefas."],
  ["INICIATIVA", "Considere a pró-atividade e a capacidade de assumir para si a resolução de problemas."],
  ["INOVAÇÃO", "Considere inovador(a) com necessidade de criar caminhos ou estratégias diferentes, aos habituais meios, para atingir determinado objetivo."],
  ["CRIATIVIDADE", "Considere utilizar a informação existente para conceber novas formas de trabalhar e enfrentar desafios imprevistos usando recursos existentes."],
  ["COMPROMISSO COM A EXCELÊNCIA DO CLIENTE", "Resolução rápida e eficaz de problemas e reclamações de clientes."],
  ["ALFABETIZAÇÃO DIGITAL", "Considere capacitado(a) de aprender novos sistemas."],
  ["ASSIDUIDADE", "Considere se presente no local de trabalho dentro do horário estabelecido para o expediente."],
  ["FLEXIBILIDADE", "Considere se capacitado(a) para as mudanças e as exigências do meio, sendo capaz de rever sua postura frente a novas realidades e cenários organizacionais."]
];
const ESS = [
  ["TOMADA DE DECISÃO", "Considere as condições que o colaborador promove antes e durante o processo decisório, como está habitualmente a pensar e agir sobre rotinas de trabalho e sob pressão."],
  ["INDEPENDÊNCIA", "Considerar quanto o colaborador é capaz de trabalhar sem a necessidade constante de supervisão, sua pontualidade no trabalho e disciplina."],
  ["COOPERAÇÃO / TRABALHO EM EQUIPE", "Considerar a boa vontade e a disposição em trabalhar e ajudar os demais colegas e, se o colaborador está disposto a dividir o trabalho e as responsabilidades com os demais."],
  ["COMPROMETIMENTO / RESPONSABILIDADE", "Considere a seriedade com que assume seus encargos e a confiança que inspira quando de posse de documentos de valor e/ou confidenciais."],
  ["RELACIONAMENTO INTERPESSOAL", "Considere o tratamento com seus subordinados, superiores, colegas e outros, bem como sua capacidade em lidar com problemas de relacionamento."],
  ["PLANEJAMENTO E ORGANIZAÇÃO", "Considere a habilidade em dispor ordenadamente suas atividades atuais, bem como a programação futura das etapas de trabalho."],
  ["COMUNICAÇÃO VERBAL", "Considere a habilidade de ouvir e responder, a facilidade de expressão verbal, a forma lógica, sintética e compreensível de comunicar-se."],
  ["COMUNICAÇÃO ESCRITA", "Considere usar linguagem concisa, clara e apropriada, estruturar ideias claramente e utilizar a gramática de forma correta."],
  ["DISCIPLINA", "Considere capacidade em manter-se focado(a) nas tarefas necessárias para concretização de uma meta sem desviar e sem perder a motivação."],
  ["ADAPTABILIDADE", "Considere se apto(a) a trabalhar em ambientes diferentes daqueles aos quais está naturalmente acostumado(a)."]
];
// Competências técnicas: no lugar de "Conhecimento técnico" genérico, cada cargo tem as suas.
const ESPECIFICAS = {
  auxiliar: [
    ["CONTENÇÃO E MANEJO DOS PACIENTES", "Considere segurança, calma e técnica na contenção e no cuidado com cães, gatos e outros animais, protegendo o paciente, o tutor e a equipe."],
    ["MEDICAÇÕES, INTERNAMENTO E PRONTUÁRIO", "Considere horários, doses e vias corretos, monitoramento e registro fiel no prontuário, e o acionamento do médico diante de qualquer alteração."],
    ["COLETA DE AMOSTRAS E EXAMES", "Considere a coleta na ordem correta de tubos, a identificação completa das amostras e a requisição correta (plano de saúde x particular)."],
    ["BIOSSEGURANÇA, LIMPEZA E ESTERILIZAÇÃO", "Considere o cumprimento dos protocolos de limpeza, autoclave, registro no caderno de esterilização e segregação de resíduos."],
    ["ATENDIMENTO AO CLIENTE NA RECEPÇÃO", "Considere cordialidade, clareza e empatia ao receber tutores e pacientes, e ao atender telefone e mensagens."],
    ["AGENDA, MARCAÇÕES E CONFIRMAÇÕES", "Considere a marcação correta de consultas, exames e cirurgias, a confirmação com os tutores e a organização da agenda."],
    ["RECEBIMENTO, PAGAMENTOS E COBRANÇAS", "Considere o recebimento correto (dinheiro, Pix, cartão), a conferência do caixa, o lançamento no sistema e a cobrança feita de forma educada e dentro da política da clínica."],
    ["REGISTROS NO SISTEMA E SIGILO", "Considere o lançamento correto de serviços e produtos (particular e planos) e o sigilo dos dados de tutores e pacientes (LGPD)."]
  ],
  recepcao: [
    ["ATENDIMENTO PRESENCIAL E TELEFÔNICO", "Considere cordialidade, clareza, paciência e postura profissional com tutores, em pessoa, por telefone e WhatsApp."],
    ["AGENDA, MARCAÇÕES E CONFIRMAÇÕES", "Considere a organização da agenda, a marcação correta, as confirmações e o controle de faltas e remarcações."],
    ["CADASTRO DE TUTORES E PACIENTES", "Considere dados completos e corretos de tutor e pet, e a documentação e os termos assinados."],
    ["RECEBIMENTO, CAIXA E COBRANÇAS", "Considere o recebimento correto, o fechamento do caixa sem diferenças, o lançamento de pagamentos e a cobrança educada e eficaz."],
    ["ORÇAMENTOS E COMUNICAÇÃO DE VALORES", "Considere clareza ao apresentar orçamentos, tabelas e condições de pagamento, sempre nos valores autorizados pela clínica."],
    ["REQUISIÇÕES DE EXAMES E PLANOS DE SAÚDE", "Considere o preenchimento correto das requisições e a separação correta entre plano de saúde e particular."],
    ["COMUNICAÇÃO COM A EQUIPE", "Considere repassar recados e informações ao time clínico de forma completa e no momento certo."],
    ["SIGILO E LGPD", "Considere o cuidado com informações de clientes, pacientes e da clínica."]
  ],
  gerente: [
    ["GESTÃO DE EQUIPE E ESCALAS", "Considere a organização das escalas, a distribuição de tarefas, o acompanhamento das atividades e a liderança pelo exemplo."],
    ["FEEDBACK E DESENVOLVIMENTO DO TIME", "Considere a capacidade de dar feedback claro, conduzir avaliações e desenvolver as pessoas."],
    ["CONTROLE FINANCEIRO E COBRANÇAS", "Considere o acompanhamento de caixa, contas a pagar e a receber, inadimplência e cobranças."],
    ["ESTOQUE E COMPRAS", "Considere o controle de estoque, validade e reposição, a cotação e a negociação com fornecedores."],
    ["PROTOCOLOS E QUALIDADE", "Considere o cumprimento e a atualização de protocolos, biossegurança e padrões de atendimento da clínica."],
    ["RESOLUÇÃO DE CONFLITOS E RECLAMAÇÕES", "Considere a condução de conflitos internos e reclamações de clientes de forma justa, rápida e eficaz."],
    ["RELATÓRIOS E INDICADORES", "Considere o uso de relatórios e indicadores para tomar decisões e prestar contas à direção."],
    ["ASPECTOS LEGAIS E DOCUMENTAÇÃO", "Considere o cuidado com ponto, contratos, documentos, LGPD e obrigações da clínica."]
  ],
  assistente: [
    ["LIMPEZA E DESINFECÇÃO DE AMBIENTES", "Considere a qualidade e a regularidade da limpeza de consultórios, internamento, centro cirúrgico, sala de coleta e áreas comuns."],
    ["RESÍDUOS E BIOSSEGURANÇA", "Considere a segregação correta de resíduos (comum, infectante, perfurocortante) e o cumprimento dos protocolos."],
    ["LAVANDERIA E MATERIAIS", "Considere a lavagem e a organização de mantas, vasilhas, roupas e materiais."],
    ["REPOSIÇÃO E ORGANIZAÇÃO", "Considere a reposição de materiais de limpeza e das salas, e a organização dos locais de guarda."],
    ["USO DE EPIs E PRODUTOS QUÍMICOS", "Considere o uso correto dos EPIs, a diluição e o manuseio seguro de hipoclorito, detergentes e demais produtos."],
    ["ROTINA, PONTUALIDADE E CAPRICHO", "Considere o cumprimento das rotinas e dos horários, e o cuidado com o patrimônio da clínica."]
  ]
};
export const NOME_FICHA = { auxiliar: "Auxiliar Veterinário", recepcao: "Recepção", gerente: "Gerência", assistente: "Auxiliar Operacional" };
export const PERGUNTAS_AVALIADO = ["Você concorda com o modelo de avaliação do gestor?", "O modelo atual da gestão dá abertura para reconhecimento do trabalho feito?", "Você acredita que seu desempenho seria melhor se tivesse algum tipo de curso de especialização, comportamental ou técnico?", "Sente-se motivado(a) a continuar trabalhando nesta organização?", "O tempo foi adequado para o processo de avaliação?"];
export function fichaDoCargo(cargo) {
  const esp = ESPECIFICAS[cargo] || ESPECIFICAS.auxiliar;
  return [...ORG.map(([nome, desc]) => ({ grupo: "Competências organizacionais", nome, desc })), ...ESS.map(([nome, desc]) => ({ grupo: "Competências essenciais", nome, desc })), ...esp.map(([nome, desc]) => ({ grupo: "Competências do cargo — " + (NOME_FICHA[cargo] || ""), nome, desc }))];
}

// ===== Descrições de cargo =====
const COMUM_LIMITES = ["Alterações nas condições deste cargo só valem por mútuo consentimento e sem prejuízo ao empregado (art. 468 da CLT).", "Esta descrição integra o contrato de trabalho e deve ser revisada sempre que a rotina mudar.", "Dados de tutores e pacientes são confidenciais e tratados conforme a LGPD (Lei nº 13.709/2018)."];
const REGIME = "CLT — contrato de trabalho por prazo indeterminado, podendo ser precedido de contrato de experiência de até 90 dias";
const RECEPCAO_NO_AUX = { titulo: "3.10 Recepção, atendimento ao cliente e pagamentos", itens: [
  "Permanecer na recepção nos períodos definidos pela gerência, desempenhando as atividades de recepção sempre que escalado(a).",
  "Receber tutores e pacientes com cordialidade, identificar o motivo da visita, cadastrar ou atualizar tutor e paciente e encaminhar ao atendimento.",
  "Atender o telefone e o WhatsApp da clínica, prestar informações corretas e registrar recados e solicitações.",
  "Marcar, confirmar, remarcar e cancelar consultas, exames, retornos e cirurgias na agenda, conferindo data, horário, profissional e preparo do paciente (jejum etc.).",
  "Orientar o tutor sobre documentos, termos e preparos, e conferir assinaturas antes do atendimento.",
  "Receber pagamentos (dinheiro, Pix, cartão e planos de saúde), emitir recibo ou nota, lançar no sistema e conferir o caixa ao final do turno.",
  "Realizar cobranças de forma educada, clara e dentro da política da clínica; registrar pendências e informar a gerência sobre inadimplência.",
  "Apresentar ao tutor somente os valores e orçamentos autorizados pela clínica e pelo médico veterinário responsável.",
  "Separar corretamente atendimentos particulares e de planos de saúde, e lançar serviços e produtos no sistema.",
  "Zelar pela organização e limpeza da recepção e tratar clientes e pacientes com empatia, sigilo e respeito."] };

export const DESCRICOES = {
  auxiliar: { nome: "Auxiliar Veterinário", cbo: "5193-05 – Auxiliar de veterinário", setor: "Clínica, internamento, centro cirúrgico, sala de coleta e recepção", superior: "Médico(a) Veterinário(a) Responsável Técnico(a) e Gerência", regime: REGIME + " (arts. 2º, 3º, 443 e 445 da CLT)",
    jornada: "44 horas semanais: segunda a sexta, 08h às 12h e 14h às 18h, com 2h de intervalo; sábado, 08h às 12h. Controle de ponto pelo próprio empregado (art. 74, § 2º, da CLT).", remuneracao: "Conforme contrato e piso da Convenção Coletiva da categoria aplicável. Adicional de insalubridade conforme laudo técnico.",
    missao: "Apoiar o médico veterinário no atendimento, internação, cirurgia e coleta de exames e, também, na recepção da clínica, garantindo o bem-estar dos pacientes, a biossegurança, a boa experiência dos tutores e a correta documentação e cobrança dos procedimentos. Todas as atividades clínicas são executadas sob orientação e supervisão do médico veterinário, a quem cabem os atos privativos da profissão (Lei nº 5.517/1968).",
    atribuicoes: [
      { titulo: "3.1 Rotinas diárias e controles", itens: ["Registrar pessoalmente o ponto de entrada e saída.", "Verificar e registrar as temperaturas máxima e mínima das geladeiras de vacinas e medicações (seg. a sex. às 08h e 17h; sábado às 08h e 11h50), comunicando desvios ao médico responsável.", "Montar prontuários, TCLEs e documentos de internação e procedimentos, conferindo com a recepção os termos específicos de cada caso."] },
      { titulo: "3.2 Internação e cuidados com o paciente", itens: ["Conferir as assinaturas do tutor na documentação de admissão.", "Aferir e anotar parâmetros iniciais (temperatura, temperamento, FR e FC) e preparar a baia.", "Realizar tricotomia de acesso, montar o soro conforme prescrição e identificar alimentos e pertences do paciente.", "Garantir o jejum pré-anestésico e só liberar água e comida mediante autorização do médico.", "Administrar medicações prescritas no prontuário, respeitando horários, doses e vias (SC, IM, IV).", "Oferecer água, alimentação, passeios e caixa de areia; trocar tapetes, mantas e curativos; manter o paciente limpo.", "Monitorar pacientes em recuperação anestésica a cada 10 minutos e acionar imediatamente o médico diante de qualquer alteração.", "Executar o checklist de alta: estado geral, higiene, medicações, curativo, retirada do acesso venoso, vestimenta pós-cirúrgica, orientação ao tutor e assinatura do Termo de Alta."] },
      { titulo: "3.3 Suporte cirúrgico", itens: ["Realizar tricotomia cirúrgica, transportar o paciente sedado e auxiliar na contenção para intubação.", "Posicionar o paciente e fazer a antissepsia da área conforme orientação do cirurgião.", "Separar e organizar o instrumental estéril indicado para cada cirurgia."] },
      { titulo: "3.4 Sala de coleta e procedimentos ambulatoriais", itens: ["Sob supervisão médica: retirar pontos, fazer curativos e bandagens, administrar vacinas e medicações exclusivamente mediante prescrição.", "Coletar sangue na ordem correta de tubos e inspecionar a amostra, recoletando antes da saída do paciente em caso de coágulos ou fibrina.", "Apoiar aferição de pressão arterial, eletrocardiograma e microchipagem.", "Registrar vacinas na carteira (data aplicada e próxima dose) e fotografá-la para o sistema.", "Auxiliar na contenção de pacientes para médicos internos e volantes e orientar o tutor na contenção ambulatorial, priorizando a rotina interna. Não participar de contenção em exames de raio-X."] },
      { titulo: "3.5 Amostras biológicas e exames", itens: ["Identificar amostras com nome do pet e do tutor, data, material e presença ou não de formol.", "Armazenar amostras conforme o tipo e preencher requisições completas, separando exames de plano de saúde e particulares.", "Conferir amostras e laboratórios de destino antes do envio e acionar o motorista somente com tudo pronto.", "Entregar materiais biológicos ao tutor mediante assinatura do TCLE de Entrega."] },
      { titulo: "3.6 Esterilização de materiais", itens: ["Lavar instrumental, sondas, lâminas de laringoscópio e acessórios de monitoramento conforme protocolo.", "Empacotar materiais, operar a autoclave e datar os pacotes somente após a esterilização.", "Realizar teste físico-químico (1 a cada 5 aventais) e teste biológico quinzenal, registrando tudo no Caderno de Esterilização.", "Controlar a validade dos pacotes e reprocessar os vencidos."] },
      { titulo: "3.7 Resíduos, limpeza e biossegurança", itens: ["Segregar resíduos em comum, infectante e perfurocortante, e destiná-los aos locais e horários definidos.", "Acompanhar a coleta de resíduos especiais e entregar o recibo à gerência.", "Limpar centro cirúrgico, internamento, sala de coleta, baias e copa antes e depois do uso.", "Executar a limpeza profunda semanal (sextas-feiras) com hipoclorito e registrar no checklist.", "Lavar mantas, vasilhas e comedouros; limpar, lubrificar e carregar máquinas de tosa."] },
      { titulo: "3.8 Organização e estoque", itens: ["Guardar materiais, equipamentos e roupas nos locais designados, identificando frascos abertos com a data de abertura.", "Manter trancados os armários de medicamentos controlados, sem deixar a chave exposta.", "Conferir semanalmente estoques de materiais cirúrgicos e vacinas (método PEPS), comunicando faltas ao setor de Compras.", "Separar produtos vencidos e entregá-los ao setor responsável."] },
      { titulo: "3.9 Atividades administrativas e de relacionamento", itens: ["Lançar serviços e produtos no sistema, para clientes particulares e planos de saúde.", "Enviar mensagens padronizadas aos tutores: lembretes de vacina (segundas), vacinas atrasadas (quartas), véspera de cirurgia e exames de manutenção.", "Registrar fotos e vídeos de pacientes quando solicitado, respeitando as autorizações de uso de imagem."] },
      RECEPCAO_NO_AUX],
    requisitos: [["Escolaridade", "Ensino médio completo"], ["Formação complementar", "Curso de auxiliar veterinário ou equivalente (desejável)"], ["Experiência", "Mínimo de 6 meses em clínica ou hospital veterinário (desejável)"], ["Conhecimentos técnicos", "Parâmetros vitais, vias de administração, contenção animal, coleta de sangue, biossegurança, esterilização e segregação de resíduos"], ["Atendimento e administrativo", "Atendimento ao público e telefone, agenda, recebimento de pagamentos, cobrança educada e noções de caixa"], ["Informática", "Uso de sistema de gestão, planilhas e aplicativos de mensagem"], ["Competências comportamentais", "Atenção a detalhes, organização, comunicação clara, empatia com animais e tutores, trabalho em equipe e cumprimento rigoroso de protocolos"], ["Saúde ocupacional", "Aptidão no exame admissional (art. 168 da CLT e NR-7); vacinação antirrábica pré-exposição recomendada"]],
    riscos: "O cargo tem exposição habitual a agentes biológicos, o que pode caracterizar insalubridade (arts. 189 a 192 da CLT e NR-15, Anexo 14). O grau (10%, 20% ou 40% do salário mínimo) deve ser definido por laudo técnico de médico ou engenheiro do trabalho. Riscos: biológico (sangue, secreções, amostras, resíduos infectantes, zoonoses); acidentes (mordidas, arranhões, perfurocortantes, autoclave); químico (hipoclorito, detergente enzimático, álcool 70%, clorexidina, formol); ergonômico (contenção e transporte de animais, trabalho em pé). A empresa fornecerá gratuitamente os EPIs adequados, com Certificado de Aprovação (art. 166 da CLT e NR-6): luvas de procedimento, máscara, avental ou jaleco, óculos de proteção e calçado fechado. O uso é obrigatório. O manejo de resíduos segue a RDC ANVISA nº 222/2018.",
    limites: ["É vedado ao auxiliar diagnosticar, prescrever, anestesiar, operar ou dar alta clínica, atos privativos do médico veterinário (Lei nº 5.517/1968).", "Nenhuma vacina ou medicação será aplicada sem prescrição ou recomendação expressa do médico.", "Em dúvida ou diante de qualquer alteração no paciente, o médico deve ser chamado imediatamente.", "Valores, descontos e condições de pagamento só podem ser informados ou concedidos conforme autorização da gerência.", ...COMUM_LIMITES] },
  recepcao: { nome: "Recepcionista", cbo: "4221-05 – Recepcionista, em geral (confirmar com o contador)", setor: "Recepção e atendimento", superior: "Gerência", regime: REGIME, jornada: "Conforme contrato (registrar ponto pessoalmente).", remuneracao: "Conforme contrato e piso da Convenção Coletiva da categoria aplicável.",
    missao: "Ser o primeiro e o último contato do tutor com a clínica: receber, orientar, agendar, cadastrar, receber pagamentos e manter a comunicação entre tutores e equipe clínica, com cordialidade, organização e sigilo.",
    atribuicoes: [
      { titulo: "3.1 Atendimento", itens: ["Receber tutores e pacientes com cordialidade, identificar o motivo da visita e encaminhar ao atendimento.", "Atender telefone, WhatsApp e redes da clínica, prestando informações corretas e registrando recados.", "Tratar reclamações com calma e acionar a gerência quando necessário.", "Manter a recepção organizada, limpa e com materiais de apoio disponíveis."] },
      { titulo: "3.2 Agenda e cadastros", itens: ["Marcar, confirmar, remarcar e cancelar consultas, exames, retornos e cirurgias, conferindo data, horário, profissional e preparo do paciente.", "Cadastrar e manter atualizados os dados de tutores e pacientes no sistema.", "Providenciar termos e documentos para assinatura e conferir as assinaturas.", "Enviar lembretes e mensagens padronizadas aos tutores (vacinas, retornos, véspera de cirurgia)."] },
      { titulo: "3.3 Pagamentos, cobranças e orçamentos", itens: ["Apresentar orçamentos e tabelas somente nos valores autorizados e explicar condições de pagamento.", "Receber pagamentos (dinheiro, Pix, cartão e planos de saúde), emitir recibo ou nota, lançar no sistema e fechar o caixa sem diferenças.", "Realizar cobranças de forma educada, clara e dentro da política da clínica; registrar pendências e informar a gerência sobre inadimplência.", "Separar corretamente atendimentos particulares e de planos de saúde."] },
      { titulo: "3.5 Exames e comunicação com a equipe", itens: ["Conferir as requisições de exames (dados do paciente e do tutor, exames, laboratório, plano ou particular).", "Repassar à equipe clínica recados, chegadas de pacientes e resultados, no momento certo.", "Entregar laudos e resultados ao tutor conforme o protocolo da clínica."] }],
    requisitos: [["Escolaridade", "Ensino médio completo"], ["Experiência", "Atendimento ao público e telefone (desejável); clínica ou hospital veterinário (diferencial)"], ["Informática", "Sistema de gestão, planilhas, WhatsApp e e-mail"], ["Competências comportamentais", "Cordialidade, paciência, organização, comunicação clara, empatia com tutores e animais, sigilo e trabalho em equipe"], ["Saúde ocupacional", "Aptidão no exame admissional (art. 168 da CLT e NR-7)"]],
    riscos: "Exposição eventual a zoonoses e a acidentes por contato com animais na recepção; ergonômico (trabalho sentado e em pé, uso de computador). Cabe ao PGR/PCMSO da clínica definir medidas e EPIs.",
    limites: ["É vedado à recepção dar orientação clínica, diagnóstico ou prescrição; dúvidas clínicas devem ser encaminhadas ao médico veterinário.", "Descontos e condições especiais só com autorização da gerência.", ...COMUM_LIMITES] },
  gerente: { nome: "Gerente", cbo: "A confirmar com o contador (ex.: Gerente administrativo)", setor: "Gerência administrativa e operacional", superior: "Direção / Sócios", regime: REGIME, jornada: "Conforme contrato.", remuneracao: "Conforme contrato.",
    missao: "Garantir o funcionamento organizado, seguro e rentável da clínica: pessoas, atendimento, estoque, finanças e qualidade, cumprindo os protocolos e a legislação.",
    atribuicoes: [
      { titulo: "3.1 Gestão de pessoas", itens: ["Organizar escalas, tarefas e a agenda de atividades da equipe, acompanhando a execução e o ponto.", "Conduzir avaliações de desempenho e entrevistas, dar feedback e acompanhar o desenvolvimento do time.", "Admitir, orientar e integrar novos colaboradores, repassando descrições de cargo e rotinas.", "Mediar conflitos internos e reclamações de clientes."] },
      { titulo: "3.2 Financeiro e cobranças", itens: ["Acompanhar caixa, contas a pagar e a receber, conciliações e fechamentos.", "Controlar inadimplência e cobranças, definindo condições especiais quando autorizado.", "Conferir repasses, comissões e honorários de profissionais e laboratórios.", "Analisar relatórios e indicadores e reportar à direção."] },
      { titulo: "3.3 Estoque, compras e patrimônio", itens: ["Acompanhar estoque, validades, mínimos e máximos, e reposição dos setores.", "Cotar, negociar e aprovar compras com fornecedores e acompanhar entregas.", "Controlar empréstimos e vendas de produtos e o patrimônio da clínica."] },
      { titulo: "3.4 Qualidade, exames e protocolos", itens: ["Garantir o cumprimento de protocolos de biossegurança, esterilização, resíduos e limpeza.", "Acompanhar o fluxo de requisições de exames, laboratórios parceiros e liberação de laudos.", "Manter documentos, termos e registros em ordem (LGPD, ANVISA, vigilância sanitária, PGR e PCMSO)."] },
      { titulo: "3.5 Relacionamento", itens: ["Atender tutores em situações de maior complexidade e preservar a imagem da clínica.", "Alinhar rotinas com médicos veterinários responsáveis e parceiros."] }],
    requisitos: [["Escolaridade", "Ensino superior ou experiência equivalente em gestão"], ["Experiência", "Gestão de equipe e rotinas administrativas (desejável em clínica ou hospital veterinário)"], ["Informática", "Sistema de gestão, planilhas, relatórios e comunicação digital"], ["Competências comportamentais", "Liderança, organização, comunicação, resolução de problemas, sigilo e visão de negócio"]],
    riscos: "Predominantemente ergonômicos e psicossociais (trabalho sentado, uso de computador, pressão por resultados). Eventual exposição a zoonoses ao circular nos setores clínicos.",
    limites: ["A gerência não pratica atos privativos do médico veterinário (Lei nº 5.517/1968).", "Decisões financeiras acima da alçada definida devem ser aprovadas pela direção.", ...COMUM_LIMITES] },
  assistente: { nome: "Auxiliar Operacional", cbo: "A confirmar com o contador", setor: "Limpeza, lavanderia e apoio operacional", superior: "Gerência", regime: REGIME, jornada: "Conforme contrato (registrar ponto pessoalmente).", remuneracao: "Conforme contrato e piso da Convenção Coletiva da categoria aplicável. Adicional de insalubridade conforme laudo técnico.",
    missao: "Manter a clínica limpa, organizada e abastecida, garantindo a biossegurança e as condições de trabalho da equipe e o bem-estar dos pacientes.",
    atribuicoes: [
      { titulo: "3.1 Limpeza e desinfecção", itens: ["Limpar e desinfetar consultórios, internamento, centro cirúrgico, sala de coleta, baias, recepção, banheiros e copa conforme protocolo e horários.", "Executar a limpeza profunda semanal com hipoclorito e registrar no checklist.", "Limpar baias e áreas de internamento após alta ou óbito de pacientes, seguindo o protocolo de desinfecção."] },
      { titulo: "3.2 Resíduos", itens: ["Segregar resíduos em comum, infectante e perfurocortante e levá-los aos locais definidos.", "Acompanhar a coleta de resíduos especiais e entregar o recibo à gerência."] },
      { titulo: "3.3 Lavanderia e materiais", itens: ["Lavar, secar e guardar mantas, tapetes, roupas, vasilhas e comedouros.", "Apoiar a lavagem inicial de instrumental e materiais, conforme orientação do auxiliar veterinário."] },
      { titulo: "3.4 Reposição e organização", itens: ["Repor materiais de limpeza e de consumo nos setores e comunicar faltas à gerência.", "Manter depósito e áreas de guarda organizados, com produtos identificados e armazenados com segurança.", "Comunicar reparos e problemas de estrutura."] },
      { titulo: "3.5 Apoio geral", itens: ["Apoiar a equipe em tarefas operacionais definidas pela gerência.", "Cumprir horários e registrar o ponto pessoalmente."] }],
    requisitos: [["Escolaridade", "Ensino fundamental completo (ensino médio desejável)"], ["Experiência", "Limpeza hospitalar ou clínica (desejável)"], ["Competências comportamentais", "Organização, atenção, responsabilidade, pontualidade e trabalho em equipe"], ["Saúde ocupacional", "Aptidão no exame admissional (art. 168 da CLT e NR-7)"]],
    riscos: "Exposição a agentes biológicos (secreções, resíduos infectantes), químicos (hipoclorito, detergentes, desinfetantes), acidentes (perfurocortantes, piso molhado) e ergonômicos. O adicional de insalubridade depende de laudo técnico. A empresa fornece gratuitamente EPIs com CA (art. 166 da CLT e NR-6): luvas, máscara, avental, botas e óculos quando necessário; o uso é obrigatório.",
    limites: ["É vedado manusear medicamentos controlados e realizar procedimentos clínicos.", "Produtos químicos nunca devem ser misturados; seguir a diluição definida.", ...COMUM_LIMITES] }
};

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[m]);
export const htmlDescricao = (d, clinica, nome = "") => `<div class="cab"><b>Descrição de Cargo – ${esc(d.nome)}</b><br><small>${esc(clinica)} · Rubrica ____________</small></div>
      <h3>1. Identificação do cargo</h3><table class="fa">${[["Empregador", CLINICA_NOME], ["Cargo", d.nome], ["CBO", d.cbo], ["Setor", d.setor], ["Superior imediato", d.superior], ["Regime de contratação", d.regime], ["Jornada e ponto", d.jornada], ["Remuneração", d.remuneracao]].map(([k, x]) => `<tr><td style="width:30%"><b>${k}</b></td><td>${esc(x)}</td></tr>`).join("")}</table>
      <h3>2. Missão do cargo</h3><p>${esc(d.missao)}</p>
      <h3>3. Atribuições e responsabilidades</h3><p class="peq">O empregado se obriga a todo e qualquer serviço compatível com sua condição pessoal e com as atribuições abaixo (art. 456, parágrafo único, da CLT). Os procedimentos detalhados constam do Manual de Rotinas da clínica, que integra esta descrição.</p>
      ${d.atribuicoes.map((s) => `<h4>${esc(s.titulo)}</h4><ul>${s.itens.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`).join("")}
      <h3>4. Requisitos do cargo</h3><table class="fa">${d.requisitos.map(([k, x]) => `<tr><td style="width:30%"><b>${esc(k)}</b></td><td>${esc(x)}</td></tr>`).join("")}</table>
      <h3>5. Condições de trabalho, riscos e EPIs</h3><p>${esc(d.riscos)}</p>
      <h3>6. Limites de atuação e disposições gerais</h3><ul>${d.limites.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
      <h3>Ciência e concordância</h3><p>Declaro ter recebido, lido e compreendido esta descrição de cargo e o Manual de Rotinas.</p><p>Fortaleza/CE, ____ de ______________ de ______.</p>
      <table class="fa"><tr><td>Empregado(a)<br>Nome: ${nome ? "<b>" + esc(nome) + "</b>" : "__________________"}<br>CPF: __________________<br>Assinatura: __________________</td><td>Empregador — ${esc(clinica)}<br>Responsável: __________________<br><br>Assinatura: __________________</td></tr></table>`;
export const CSS_DESCRICAO = `.fa{width:100%;border-collapse:collapse;margin:6px 0;font-size:11.5px}.fa td{border:1px solid #666;padding:4px 6px}h3{background:#e8f0fb;padding:4px 6px;font-size:13px;margin:12px 0 4px}h4{margin:8px 0 2px;font-size:12px}ul{margin:2px 0 4px 18px;padding:0}li{margin:1px 0}.peq{font-size:11px}`;
export const CARGO_DA_VAGA = { aux_vet: "auxiliar", recepcao: "recepcao", aux_oper: "assistente", gerente: "gerente" };
