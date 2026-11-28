// ⚙️ COLE AQUI a configuração do seu projeto Firebase
// (Console Firebase > Configurações do projeto > Seus apps > App da Web)
export const firebaseConfig = {
  apiKey: "AIzaSyCR0jOcUBkGHK6MLKiLc4mmTHzG8WtmkEc",
  authDomain: "vetcontrol-2026.firebaseapp.com",
  projectId: "vetcontrol-2026",
  storageBucket: "vetcontrol-2026.firebasestorage.app",
  messagingSenderId: "47779635314",
  appId: "1:47779635314:web:4980d1370c6a8dd200e2eb"
};

// E-mail do usuário MASTER (você). O primeiro login com este e-mail vira master.
// Use o MESMO e-mail no arquivo firestore.rules.
export const MASTER_EMAIL = "vetplusespecialidades@gmail.com";

// Listas editáveis
// Categorias = abas da planilha da clínica
export const DISTRIBUIDORAS = [
  "Hospitalar Humano",
  "Veterinário",
  "Distribuidora Odontológica",
  "Especiais e Oncológicos",
  "Distribuidora de Medicamentos Especiais",
  "Insumos Especiais (Medwell)",
  "Limpeza e Escritório",
  "Outros Custos"
];
export const MEDIDAS = ["Unidade", "Caixa", "Saco", "Pacote", "Frasco", "Frasco-ampola", "Ampola", "Flaconete", "Bolsa", "Rolo", "Galão", "Litro", "Kit"];
export const SALAS = [
  { id: "coleta", nome: "Sala de Coleta" },
  { id: "imagem", nome: "Sala de Imagem" },
  { id: "internamento", nome: "Internamento" },
  { id: "centro_cirurgico", nome: "Centro Cirúrgico" },
  { id: "instrumental", nome: "Sala de Instrumental Cirúrgico" },
  { id: "limpeza_material", nome: "Sala de Limpeza de Material" },
  { id: "geladeira_vacina", nome: "Geladeira de Vacina" },
  { id: "geladeira_especiais", nome: "Geladeira de Medicamentos Especiais (quimioterápicos)" }
];
export const DIAS_ALERTA_VALIDADE = 30;

// Sugestão automática de estoque mínimo/ideal (análise das saídas dos últimos 90 dias, sem IA: conta simples e conferível)
// Mínimo sugerido = consumo médio por dia × DIAS_COBERTURA_MINIMO (prazo de entrega + folga). Ideal = × DIAS_COBERTURA_IDEAL.
export const DIAS_ANALISE = 90;
export const DIAS_COBERTURA_MINIMO = 15;
export const DIAS_COBERTURA_IDEAL = 30;

// Busca automática de foto dos produtos (Google Programmable Search, busca de imagens: 100 buscas grátis por dia).
// Chave: https://console.cloud.google.com/apis/library/customsearch.googleapis.com · Mecanismo (cx): https://programmablesearchengine.google.com (ative "Pesquisa de imagens" e "Pesquisar na web toda").
export const GOOGLE_CSE_KEY = "";
export const GOOGLE_CSE_CX = "";

// Catálogo de exames (edite à vontade)
// Grupo "Imagem": pede quem realizou e quem vai laudar. Demais grupos: pede o laboratório.
export const EXAMES = {
  "Imagem": ["Ultrassonografia abdominal", "Raio-X", "Eletrocardiograma", "Ecocardiograma", "Tomografia"],
  "Sangue": ["Hemograma completo", "Bioquímico", "Perfil renal", "Perfil hepático", "Glicemia", "Coagulograma", "Hemogasometria", "Teste rápido (FIV/FeLV)", "Teste rápido (Cinomose/Parvovirose)", "Teste rápido (Erliquiose/Leishmaniose)"],
  "Fezes e urina": ["Coproparasitológico", "Urinálise"],
  "Citologia / outros": ["Citologia", "Histopatológico", "Cultura e antibiograma"]
};
export const LABORATORIOS = ["VETER", "VETEX", "LIAN", "LAFORVET", "IFVET", "TECSA", "LAB VETPLUS", "CDV", "LABMIL"];
export const CONVENIOS = ["Pet Love", "Dog Life", "A Pet", "Top Pet", "Plamev"];
// Sugestão inicial do catálogo (botão "Importar sugestão" na aba Catálogo). Depois tudo é editado pelo sistema.
export const CATALOGO_INICIAL = [
  ["Perfil renal", "Laboratorial", "VETER"], ["Hemograma completo", "Laboratorial", "TECSA"], ["Bioquímico", "Laboratorial", "TECSA"],
  ["Perfil hepático", "Laboratorial", "VETER"], ["Urinálise", "Laboratorial", "TECSA"], ["Coproparasitológico", "Laboratorial", "LAB VETPLUS"],
  ["Citologia", "Laboratorial", "LAFORVET"], ["Histopatológico", "Laboratorial", "LAFORVET"], ["Cultura e antibiograma", "Laboratorial", "CDV"],
  ["Ultrassonografia abdominal", "Imagem", ""], ["Raio-X", "Imagem", ""], ["Eletrocardiograma", "Imagem", ""], ["Ecocardiograma", "Imagem", ""]
];
// "Origem" das planilhas (pode digitar outras na hora)
export const ORIGENS = ["PARTICULAR", "PETLOVE", "PETTOP", "A.PET", "DOGLIFE", "PETLOVE/PARTICULAR", "PETLOVE/LOC. SALA"];
// Cabeçalho dos documentos impressos
// Dados que saem no cabeçalho dos laudos. Logo: arquivo logo-vetplus.png na pasta do sistema.
export const CLINICA = { nome: "VetPlus Especialidades", cnpj: "55.756.520/0001-10", endereco: "Rua José Cândido, 810, Monte Castelo – Fortaleza/CE – CEP 60325-490", telefone: "(85) 98171-5342", whatsapp: "(85) 98171-5342", logoLaudo: "logo-vetplus.png" };
export const DIAS_SEM_USO = 60; // alerta de produto parado
export const STATUS_EXAME = ["Solicitado", "Coletado", "Enviado ao laboratório", "Resultado disponível", "Entregue ao tutor", "Cancelado"];
export const STATUS_REPOSICAO = ["Pendente", "Em andamento", "Atendida", "Recusada"];

// Inventário / patrimônio
export const INV_CATEGORIAS = ["Móveis", "Equipamento médico-veterinário", "Eletrônicos / informática", "Eletrodomésticos", "Instrumental cirúrgico", "Utensílios", "Decoração", "Outros"];
export const INV_LOCAIS = ["Consultório 1", "Consultório 2", "Consultório 3", "Sala de Imagem", "Almoxarifado", "Gerência", "Banheiro", "Sala de Estoque", "Internamento", "Centro Cirúrgico", "Sala de Esterilização", "Sala de Instrumentais", "Copa", "Lavanderia", "Recepção", "Área Externa"];
export const INV_ESTADO = ["Novo", "Bom", "Regular", "Precisa de manutenção", "Em manutenção"];

// IA para ler as quantidades das notas ("CX C/ 100 SERINGA 1ML" -> 100 unidades)
// Chave gratuita em https://aistudio.google.com/apikey . Restrinja a chave ao domínio do seu site (veja o README).
export const GEMINI_API_KEY = "";
export const GEMINI_MODEL = "gemini-2.5-flash";

// Orçamentos: tabelas de preço. Um preço vazio numa tabela de plano = serviço NÃO coberto -> cobrado como PARTICULAR.
export const TABELAS_PRECO = ["PARTICULAR", "SOCIAL", "PETLOVE", "PETTOP", "A.PET", "DOGLIFE"];
export const CATEGORIAS_SERVICO = ["Consulta", "Cirurgia", "Anestesia", "Exames", "Internação", "Medicação", "Materiais", "Vacinas", "Outros"];
export const VALIDADE_ORCAMENTO_DIAS = 7;

// Vacinas: reforço padrão em dias (pode mudar na hora de lançar, ex.: filhote 21 dias)
// Tipos de vacina (cor da etiqueta no cartão e reforço padrão em dias)
export const VACINAS = [
  { nome: "V10 (virose de cães)", especie: "Canina", reforcoDias: 365, cor: "#1565c0" },
  { nome: "V3 (virose de gatos)", especie: "Felina", reforcoDias: 365, cor: "#00897b" },
  { nome: "V4 (virose de gatos)", especie: "Felina", reforcoDias: 365, cor: "#00796b" },
  { nome: "V5 (virose de gatos)", especie: "Felina", reforcoDias: 365, cor: "#00695c" },
  { nome: "FeLV (leucemia felina)", especie: "Felina", reforcoDias: 365, cor: "#6a1b9a" },
  { nome: "Antirrábica", especie: "Ambas", reforcoDias: 365, cor: "#c62828" },
  { nome: "Tosse dos canis (gripe canina)", especie: "Canina", reforcoDias: 365, cor: "#ef6c00" },
  { nome: "Giárdia", especie: "Canina", reforcoDias: 365, cor: "#2e7d32" },
  { nome: "Leishmaniose", especie: "Canina", reforcoDias: 365, cor: "#6d4c41" }
];
// Nomes comerciais (aparecem na etiqueta do cartão). tipo = nome do tipo acima.
const V = (tipo, lista) => lista.map(([produto, fabricante]) => ({ tipo, produto, fabricante }));
export const VACINAS_COMERCIAIS = [
  ...V("V10 (virose de cães)", [["Vanguard Plus", "Zoetis"], ["Recombitek V10", "Boehringer Ingelheim"], ["Providean Viratec V10", "Agener União / Tecnovax"], ["Nobivac V10", "MSD Saúde Animal"], ["Canigen V10", "Virbac"], ["Duramune Max 10", "Elanco"]]),
  ...V("V3 (virose de gatos)", [["Felocell 3", "Zoetis"], ["Purevax RCP", "Boehringer Ingelheim"], ["Nobivac Tricat Trio", "MSD Saúde Animal"], ["Feligen CRP", "Virbac"]]),
  ...V("V4 (virose de gatos)", [["Felocell 4", "Zoetis"], ["Felocell CVR-C", "Zoetis"], ["Purevax RCPCh", "Boehringer Ingelheim"], ["Nobivac Feline 4", "MSD Saúde Animal"]]),
  ...V("V5 (virose de gatos)", [["Purevax RCPCh FeLV", "Boehringer Ingelheim"]]),
  ...V("FeLV (leucemia felina)", [["Purevax FeLV", "Boehringer Ingelheim"], ["Felocell FeLV", "Zoetis"], ["Leucogen", "Virbac"]]),
  ...V("Antirrábica", [["Defensor", "Zoetis"], ["Rabisin", "Boehringer Ingelheim"], ["Nobivac Rabies", "MSD Saúde Animal"], ["Rabigen", "Virbac"], ["Canigen Raiva", "Virbac"]]),
  ...V("Tosse dos canis (gripe canina)", [["Bronchi-Shield III", "Zoetis"], ["Vanguard i III", "Zoetis"], ["Vanguard B Oral", "Zoetis"], ["Bronchiguard", "Zoetis"], ["Nobivac KC", "MSD Saúde Animal"], ["Nobivac RESPIRA Bb", "MSD Saúde Animal"], ["Pneumodog", "Boehringer Ingelheim"], ["Defense Bronch", "Dechra"]]),
  ...V("Giárdia", [["GiardiaVax", "Zoetis"]])
];

export const DIAS_A_VENCER = 15;
// Portal do tutor (login por CPF). Não precisa existir: é só o formato interno do login.
export const DOMINIO_TUTOR = "tutor.vetcontrol.app";
export const TIPOS_AMBULATORIO = ["Check-up", "Exame", "Consulta", "Medicação", "Curativo", "Retorno"];

// Critérios da avaliação do time (notas de 1 a 5). A confirmar/editar pela gestão.
export const CRITERIOS_AVALIACAO = ["Cumprimento da rotina", "Qualidade do trabalho", "Pontualidade e presença", "Trabalho em equipe", "Comunicação e atendimento", "Iniciativa e organização"];

// Cargos. "clt: true" = entra na presença (ponto) e nas avaliações do time. Médicos veterinários são sempre PJ: ficam de fora.
export const CARGOS = [
  { id: "medico", nome: "Médico(a) veterinário(a) (PJ)", clt: false },
  { id: "auxiliar", nome: "Auxiliar", clt: true },
  { id: "gerente", nome: "Gerente", clt: true },
  { id: "recepcao", nome: "Recepção", clt: true },
  { id: "assistente", nome: "Assistente operacional", clt: true },
  { id: "limpeza", nome: "Limpeza geral", clt: true }
];

// Quem pode aparecer como "Realizado por" nos exames de imagem (médicos ou empresas). Edite à vontade.
export const EXECUTORES_IMAGEM = ["João Paulo", "Alisson", "Dhyego", "Rodrigo Noronha", "Martiniano Edwirgns", "Hernani Bezerra", "Inpulse"];
// Exames de imagem disponíveis no início (a lista pode crescer depois no Catálogo de exames)
// Exames de imagem detalhados que aparecem na lista da Requisição (um para cada profissional). Edite à vontade.
export const EXAMES_IMAGEM_DETALHE = ["Ultrassom abdominal", "Ultrassom gestacional", "Raio-X tórax", "Raio-X laringe", "Raio-X abdome", "Raio-X coluna", "Raio-X membros", "Elastografia"];
export const EXAMES_IMAGEM = ["Raio-X", "Ultrassom", "Eletrocardiograma", "Ecocardiograma", "Pressão arterial"];

// E-mail do atendimento VetPlus: o botão "Enviar por e-mail" do laudo abre o e-mail já endereçado para ele. Preencha aqui.
export const EMAIL_ATENDIMENTO = "atendimentovetplus@gmail.com";

// Laboratórios aceitos para exames de PLANO DE SAÚDE (lançados um por um). Vazio = qualquer laboratório. Ex.: ["VETEX", "VETER"]
export const LABS_PLANO = [];
