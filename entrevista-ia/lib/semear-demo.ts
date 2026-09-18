// A semeadura do modo demonstração (US-004): o app nasce cheio.
//
// Quem abre este app pela primeira vez para decidir se vale a pena é uma pessoa de RH ou um
// executivo, não um desenvolvedor: ela precisa ver uma vaga aberta, candidatos com ficha e pareceres
// com recomendações diferentes **antes** de conectar qualquer chave de IA. Uma instalação vazia mostra
// quatro estados vazios e não prova nada.
//
// Por que não em `lib/demo.ts` (onde mora o resto do conteúdo de demonstração): aquele arquivo está no
// fundo do grafo de imports e é justamente o que este módulo consome. `lib/demo.ts` continua sendo o
// conteúdo; aqui mora a gravação; quem tira o exemplo de cena depois é `lib/exemplos.ts`, que não
// importa nenhum dos dois.
//
// Três regras que valem para tudo aqui:
//
//  1. **Só semeia em banco virgem e sem IA conectada.** Com a IA ligada, quem instalou já decidiu usar
//     o app de verdade, e ficha de pessoa inventada na lista dele seria pior que uma tela vazia.
//  2. **Uma vez por instalação**, marcado em `config`: quem apagar os dados de exemplo em
//     Configurações não os vê voltar na próxima leitura de lista.
//  3. **Idempotente por construção**, como a migração de `lib/banco.ts`: todo id é fixo, nunca
//     sorteado, e todo INSERT é `OR IGNORE`.
//
// Não importa `lib/vagas.ts`, `lib/candidatos.ts` nem `lib/entrevistas.ts` de propósito: são eles que
// chamam este módulo (na leitura de lista) e `lib/exemplos.ts` (na criação do primeiro dado real).
import { aiEnabled, meta, modelName } from "./ai";
import { agora, banco } from "./banco";
import { culturaDemo, parecerDemo } from "./demo";
import { salvar as salvarResultado } from "./historico";
import { getConfig, setConfig } from "./store";
import type { Parecer, Troca } from "./types";

/** Marca em `config` de que a demonstração já foi semeada nesta instalação. */
const CHAVE_SEMEADURA = "DEMO_SEMEADA_V1";

const INSUMO = "a conversa da entrevista, o currículo do candidato, a vaga e a cultura da empresa";

// ---------------------------------------------------------------------------------------------
// O conteúdo: uma vaga, quatro pessoas, três pareceres e um convite em aberto
// ---------------------------------------------------------------------------------------------

const VAGA_ID = "exemplo-vaga-cs";

/** Os mesmos requisitos que o formulário da tela inicial já oferece como exemplo desde a fundação do
 * app: quem vier de lá reconhece a vaga. */
const REQUISITOS = [
  "2 anos de experiência em atendimento B2B",
  "Comunicação escrita clara e objetiva",
  "Experiência com CRM (HubSpot ou similar)",
  "Disponibilidade para viagens ocasionais a clientes",
].join("\n");

const DESAFIOS = [
  "Assumir uma carteira de 40 contas de médio porte que hoje está sem dono fixo.",
  "Reduzir o cancelamento no primeiro ano, que fechou o último trimestre em 14%.",
  "Deixar registrado no CRM o que hoje só existe na cabeça de quem atende.",
].join(" ");

type CandidatoDeExemplo = {
  id: string;
  nome: string;
  email: string;
  telefone: string;
  cidade: string;
  linkedinUrl: string;
  termoBusca: string;
  /** Há quantos dias a pessoa foi cadastrada. */
  diasAtras: number;
  cvNome: string;
  cvTexto: string;
  fontes: { id: string; tipo: "cv" | "linkedin" | "busca"; url?: string; titulo: string; resumo: string }[];
  ficha: Record<string, unknown>;
};

/** Um campo da ficha com a origem dele (US-009): tudo que a tela mostra sabe de onde veio. */
function campo(valor: unknown, origem: "cv" | "web" | "gestor", fonteId?: string) {
  return fonteId ? { valor, origem, fonteId } : { valor, origem };
}

const CANDIDATOS: CandidatoDeExemplo[] = [
  {
    id: "exemplo-cand-bruno",
    nome: "Bruno Alves",
    email: "bruno.alves@exemplo.com",
    telefone: "(11) 98888-1020",
    cidade: "São Paulo (SP)",
    linkedinUrl: "https://exemplo.com/perfil/bruno-alves",
    termoBusca: "Customer Success · Órbita Software",
    diasAtras: 12,
    cvNome: "bruno-alves-cv.pdf",
    cvTexto:
      "Bruno Alves — Analista de Customer Success. Órbita Software (2021 até hoje): carteira de 38 contas B2B, renovação de 92%. Grupo Vela (2019-2021): suporte e implantação. Formação: Administração, 2019. Ferramentas: HubSpot, Zendesk, Metabase.",
    fontes: [
      { id: "exemplo-cand-bruno-cv", tipo: "cv", titulo: "Currículo enviado", resumo: "PDF de uma página enviado no cadastro." },
      {
        id: "exemplo-cand-bruno-linkedin",
        tipo: "linkedin",
        url: "https://exemplo.com/perfil/bruno-alves",
        titulo: "Perfil público de Bruno Alves",
        resumo: "Analista de Customer Success na Órbita Software desde 2021, em São Paulo.",
      },
      {
        id: "exemplo-cand-bruno-busca",
        tipo: "busca",
        url: "https://exemplo.com/blog/orbita-customer-success",
        titulo: "Como a Órbita organizou a carteira de clientes",
        resumo: "Texto no blog da empresa em que Bruno descreve a rotina de acompanhamento das contas.",
      },
    ],
    ficha: {
      resumo: campo(
        "Analista de Customer Success com quatro anos em contas B2B de médio porte, vindo de suporte e implantação.",
        "cv",
        "exemplo-cand-bruno-cv",
      ),
      cargoAtual: campo("Analista de Customer Success", "cv", "exemplo-cand-bruno-cv"),
      empresaAtual: campo("Órbita Software", "cv", "exemplo-cand-bruno-cv"),
      cidade: campo("São Paulo (SP)", "web", "exemplo-cand-bruno-linkedin"),
      anosExperiencia: campo(4, "cv", "exemplo-cand-bruno-cv"),
      experiencias: [
        campo({ empresa: "Órbita Software", cargo: "Analista de Customer Success", inicio: "2021", fim: "atual", descricao: "Carteira de 38 contas B2B, renovação de 92%." }, "cv", "exemplo-cand-bruno-cv"),
        campo({ empresa: "Grupo Vela", cargo: "Analista de suporte", inicio: "2019", fim: "2021", descricao: "Suporte e implantação de novos clientes." }, "cv", "exemplo-cand-bruno-cv"),
      ],
      formacao: [campo({ curso: "Administração", instituicao: "Universidade de exemplo", fim: "2019" }, "cv", "exemplo-cand-bruno-cv")],
      competencias: [
        campo("HubSpot", "cv", "exemplo-cand-bruno-cv"),
        campo("Zendesk", "cv", "exemplo-cand-bruno-cv"),
        campo("Metabase", "cv", "exemplo-cand-bruno-cv"),
        campo("Acompanhamento de carteira", "web", "exemplo-cand-bruno-busca"),
      ],
      idiomas: [campo("Inglês intermediário", "cv", "exemplo-cand-bruno-cv")],
      links: [campo("https://exemplo.com/perfil/bruno-alves", "web", "exemplo-cand-bruno-linkedin")],
      disponibilidade: campo("30 dias", "cv", "exemplo-cand-bruno-cv"),
      divergencias: [],
    },
  },
  {
    id: "exemplo-cand-camila",
    nome: "Camila Rocha",
    email: "camila.rocha@exemplo.com",
    telefone: "(11) 97777-3344",
    cidade: "Campinas (SP)",
    linkedinUrl: "https://exemplo.com/perfil/camila-rocha",
    termoBusca: "Customer Success · Nexo Serviços",
    diasAtras: 11,
    cvNome: "camila-rocha-cv.pdf",
    cvTexto:
      "Camila Rocha — Coordenadora de Customer Success. Nexo Serviços (2021 até hoje): coordenação de um time de três pessoas e carteira de 60 contas. Antes: Casa Nove (2018-2021), analista de relacionamento. Ferramentas: Salesforce, Intercom.",
    fontes: [
      { id: "exemplo-cand-camila-cv", tipo: "cv", titulo: "Currículo enviado", resumo: "PDF de duas páginas enviado no cadastro." },
      {
        id: "exemplo-cand-camila-linkedin",
        tipo: "linkedin",
        url: "https://exemplo.com/perfil/camila-rocha",
        titulo: "Perfil público de Camila Rocha",
        resumo: "Analista sênior de Customer Success na Nexo Serviços entre 2021 e março deste ano.",
      },
    ],
    ficha: {
      resumo: campo(
        "Sete anos em relacionamento e Customer Success, com passagem por coordenação de time pequeno.",
        "cv",
        "exemplo-cand-camila-cv",
      ),
      cargoAtual: campo("Coordenadora de Customer Success", "cv", "exemplo-cand-camila-cv"),
      empresaAtual: campo("Nexo Serviços", "cv", "exemplo-cand-camila-cv"),
      cidade: campo("Campinas (SP)", "cv", "exemplo-cand-camila-cv"),
      anosExperiencia: campo(7, "cv", "exemplo-cand-camila-cv"),
      experiencias: [
        campo({ empresa: "Nexo Serviços", cargo: "Coordenadora de Customer Success", inicio: "2021", fim: "atual", descricao: "Time de três pessoas e carteira de 60 contas." }, "cv", "exemplo-cand-camila-cv"),
        campo({ empresa: "Casa Nove", cargo: "Analista de relacionamento", inicio: "2018", fim: "2021", descricao: "Atendimento e renovação de contratos." }, "cv", "exemplo-cand-camila-cv"),
      ],
      formacao: [campo({ curso: "Comunicação Social", instituicao: "Universidade de exemplo", fim: "2017" }, "cv", "exemplo-cand-camila-cv")],
      competencias: [campo("Salesforce", "cv", "exemplo-cand-camila-cv"), campo("Intercom", "cv", "exemplo-cand-camila-cv")],
      idiomas: [campo("Inglês avançado", "cv", "exemplo-cand-camila-cv"), campo("Espanhol básico", "web", "exemplo-cand-camila-linkedin")],
      links: [campo("https://exemplo.com/perfil/camila-rocha", "web", "exemplo-cand-camila-linkedin")],
      disponibilidade: campo("Imediata", "cv", "exemplo-cand-camila-cv"),
      // A divergência que a US-012 vai gravar sozinha: o currículo diz coordenação até hoje, o perfil
      // público diz analista sênior e saída em março. Nenhum dos dois é apagado — a tela mostra os dois
      // e quem decide é o gestor.
      divergencias: [
        {
          campo: "cargoAtual",
          cv: "Coordenadora de Customer Success na Nexo Serviços, até hoje",
          web: "Analista sênior de Customer Success na Nexo Serviços, até março deste ano",
          fonteId: "exemplo-cand-camila-linkedin",
        },
      ],
    },
  },
  {
    id: "exemplo-cand-diego",
    nome: "Diego Martins",
    email: "diego.martins@exemplo.com",
    telefone: "(21) 96666-7788",
    cidade: "Rio de Janeiro (RJ)",
    linkedinUrl: "https://exemplo.com/perfil/diego-martins",
    termoBusca: "Atendimento · Ponte Digital",
    diasAtras: 9,
    cvNome: "diego-martins-cv.pdf",
    cvTexto:
      "Diego Martins — Analista de atendimento. Ponte Digital (2023 até hoje): atendimento a consumidor final por chat e telefone. Antes: estágio em marketing. Ferramentas: Zendesk.",
    fontes: [
      { id: "exemplo-cand-diego-cv", tipo: "cv", titulo: "Currículo enviado", resumo: "PDF de uma página enviado no cadastro." },
      {
        id: "exemplo-cand-diego-busca",
        tipo: "busca",
        url: "https://exemplo.com/perfil/diego-martins",
        titulo: "Perfil público de Diego Martins",
        resumo: "Analista de atendimento na Ponte Digital, no Rio de Janeiro.",
      },
    ],
    ficha: {
      resumo: campo("Dois anos em atendimento a consumidor final, buscando a primeira posição em contas B2B.", "cv", "exemplo-cand-diego-cv"),
      cargoAtual: campo("Analista de atendimento", "cv", "exemplo-cand-diego-cv"),
      empresaAtual: campo("Ponte Digital", "cv", "exemplo-cand-diego-cv"),
      cidade: campo("Rio de Janeiro (RJ)", "web", "exemplo-cand-diego-busca"),
      anosExperiencia: campo(2, "cv", "exemplo-cand-diego-cv"),
      experiencias: [
        campo({ empresa: "Ponte Digital", cargo: "Analista de atendimento", inicio: "2023", fim: "atual", descricao: "Chat e telefone para consumidor final." }, "cv", "exemplo-cand-diego-cv"),
      ],
      formacao: [campo({ curso: "Publicidade", instituicao: "Universidade de exemplo", fim: "2022" }, "cv", "exemplo-cand-diego-cv")],
      competencias: [campo("Zendesk", "cv", "exemplo-cand-diego-cv")],
      idiomas: [campo("Inglês básico", "cv", "exemplo-cand-diego-cv")],
      links: [campo("https://exemplo.com/perfil/diego-martins", "web", "exemplo-cand-diego-busca")],
      disponibilidade: campo("15 dias", "cv", "exemplo-cand-diego-cv"),
      divergencias: [],
    },
  },
  {
    id: "exemplo-cand-fernanda",
    nome: "Fernanda Lima",
    email: "fernanda.lima@exemplo.com",
    telefone: "(11) 95555-2211",
    cidade: "São Paulo (SP)",
    linkedinUrl: "https://exemplo.com/perfil/fernanda-lima",
    termoBusca: "Customer Success · Ampla Tecnologia",
    diasAtras: 2,
    cvNome: "fernanda-lima-cv.pdf",
    cvTexto:
      "Fernanda Lima — Analista de Customer Success pleno. Ampla Tecnologia (2022 até hoje): carteira de 25 contas B2B e implantação de novos clientes. Ferramentas: HubSpot, Looker.",
    fontes: [
      { id: "exemplo-cand-fernanda-cv", tipo: "cv", titulo: "Currículo enviado", resumo: "PDF de uma página enviado no cadastro." },
      {
        id: "exemplo-cand-fernanda-linkedin",
        tipo: "linkedin",
        url: "https://exemplo.com/perfil/fernanda-lima",
        titulo: "Perfil público de Fernanda Lima",
        resumo: "Analista de Customer Success na Ampla Tecnologia desde 2022, em São Paulo.",
      },
    ],
    ficha: {
      resumo: campo("Três anos em Customer Success B2B, com implantação de novos clientes.", "cv", "exemplo-cand-fernanda-cv"),
      cargoAtual: campo("Analista de Customer Success", "cv", "exemplo-cand-fernanda-cv"),
      empresaAtual: campo("Ampla Tecnologia", "cv", "exemplo-cand-fernanda-cv"),
      cidade: campo("São Paulo (SP)", "web", "exemplo-cand-fernanda-linkedin"),
      anosExperiencia: campo(3, "cv", "exemplo-cand-fernanda-cv"),
      experiencias: [
        campo({ empresa: "Ampla Tecnologia", cargo: "Analista de Customer Success", inicio: "2022", fim: "atual", descricao: "Carteira de 25 contas B2B e implantação." }, "cv", "exemplo-cand-fernanda-cv"),
      ],
      formacao: [campo({ curso: "Sistemas de Informação", instituicao: "Universidade de exemplo", fim: "2021" }, "cv", "exemplo-cand-fernanda-cv")],
      competencias: [campo("HubSpot", "cv", "exemplo-cand-fernanda-cv"), campo("Looker", "cv", "exemplo-cand-fernanda-cv")],
      idiomas: [campo("Inglês avançado", "cv", "exemplo-cand-fernanda-cv")],
      links: [campo("https://exemplo.com/perfil/fernanda-lima", "web", "exemplo-cand-fernanda-linkedin")],
      disponibilidade: campo("30 dias", "cv", "exemplo-cand-fernanda-cv"),
      divergencias: [],
    },
  },
];

/**
 * As três conversas avaliadas, uma por candidato.
 *
 * As perguntas seguem os requisitos da vaga, na ordem em que a vaga os lista: é assim que a
 * entrevistadora de verdade monta o roteiro, e é o que faz a evidência de cada critério do parecer
 * cair na pergunta certa. As respostas é que separam as três pessoas.
 */
const CONVERSAS: Record<string, Troca[]> = {
  "exemplo-cand-bruno": [
    { papel: "entrevistadora", texto: "Para começar, me conta rapidamente sobre sua trajetória e o que te chamou atenção na vaga de Analista de Customer Success." },
    { papel: "candidato", texto: "Estou há quatro anos em atendimento, sendo três em Customer Success B2B. Hoje cuido de 38 contas na Órbita. O que me chamou atenção aqui foi a carteira sem dono fixo: é exatamente o problema que eu peguei quando entrei na Órbita." },
    { papel: "entrevistadora", texto: "Me conta sobre uma experiência real em que você usou 2 anos de experiência em atendimento B2B." },
    { papel: "candidato", texto: "Quando entrei, a renovação da minha carteira estava em 78%. Dividi as contas em três grupos por risco e passei a falar com o grupo de maior risco toda semana, não só na renovação. Em um ano a renovação foi para 92%." },
    { papel: "entrevistadora", texto: "Qual foi um desafio que você enfrentou envolvendo Comunicação escrita clara e objetiva e como você resolveu?" },
    { papel: "candidato", texto: "A gente mandava relatório mensal que ninguém lia. Cortei para três linhas: o que mudou, o que precisa da atenção do cliente e o que eu vou fazer. A taxa de resposta do relatório subiu de duas contas para quinze." },
    { papel: "entrevistadora", texto: "Como você avalia o seu nível hoje em Experiência com CRM (HubSpot ou similar)? Me dê um exemplo concreto que sustente isso." },
    { papel: "candidato", texto: "Uso HubSpot todo dia e montei lá os alertas de conta sem contato há 30 dias. Antes disso a gente descobria o problema na hora do cancelamento." },
    { papel: "entrevistadora", texto: "Fale sobre um resultado do qual você se orgulha relacionado a Disponibilidade para viagens ocasionais a clientes." },
    { papel: "candidato", texto: "Viajo umas duas vezes por mês para clientes fora de São Paulo e não tenho restrição. A visita que mais rendeu foi numa conta que ia cancelar: saí de lá com um plano de uso escrito junto com o time deles." },
    { papel: "entrevistadora", texto: "Me dá um exemplo de uma vez em que você levou um problema até o fim, mesmo dependendo de outra área?" },
    { papel: "candidato", texto: "Um cliente estava com uma falha que era do time de produto. Eu levantei o impacto em número de horas do time dele, levei para a reunião de priorização e acompanhei até entrar. Avisei o cliente toda semana, mesmo nas semanas sem novidade." },
  ],
  "exemplo-cand-camila": [
    { papel: "entrevistadora", texto: "Para começar, me conta rapidamente sobre sua trajetória e o que te chamou atenção na vaga de Analista de Customer Success." },
    { papel: "candidato", texto: "São sete anos em relacionamento com cliente. Nos últimos anos eu estava na Nexo, cuidando de uma carteira grande e ajudando a coordenar o time. Procuro uma posição em que eu volte a ficar mais perto das contas." },
    { papel: "entrevistadora", texto: "Me conta sobre uma experiência real em que você usou 2 anos de experiência em atendimento B2B." },
    { papel: "candidato", texto: "Na Nexo eu atendia 60 contas, quase todas de serviço recorrente. O que mais deu resultado foi mudar a reunião trimestral de apresentação para uma conversa sobre o que o cliente queria resolver no trimestre seguinte." },
    { papel: "entrevistadora", texto: "Qual foi um desafio que você enfrentou envolvendo Comunicação escrita clara e objetiva e como você resolveu?" },
    { papel: "candidato", texto: "Escrevo bem, mas escrevo demais. Comecei a pedir para uma colega ler antes de enviar as mensagens difíceis e isso encurtou bastante." },
    { papel: "entrevistadora", texto: "Como você avalia o seu nível hoje em Experiência com CRM (HubSpot ou similar)? Me dê um exemplo concreto que sustente isso." },
    { papel: "candidato", texto: "Usei Salesforce nos últimos quatro anos. HubSpot eu vi por cima, mas acredito que a lógica seja parecida." },
    { papel: "entrevistadora", texto: "Fale sobre um resultado do qual você se orgulha relacionado a Disponibilidade para viagens ocasionais a clientes." },
    { papel: "candidato", texto: "Já viajei bastante e não tenho problema com viagem ocasional. Moro em Campinas, então preciso combinar com antecedência." },
    { papel: "entrevistadora", texto: "Me dá um exemplo de uma vez em que você combinou por escrito o que se esperava antes de sair executando?" },
    { papel: "candidato", texto: "Toda implantação nova começava com um documento de duas páginas assinado pelos dois lados. Foi o que mais reduziu discussão no meio do caminho." },
  ],
  "exemplo-cand-diego": [
    { papel: "entrevistadora", texto: "Para começar, me conta rapidamente sobre sua trajetória e o que te chamou atenção na vaga de Analista de Customer Success." },
    { papel: "candidato", texto: "Estou há dois anos na Ponte Digital, atendendo consumidor final por chat e telefone. Quero migrar para atendimento a empresas, que é o que essa vaga oferece." },
    { papel: "entrevistadora", texto: "Me conta sobre uma experiência real em que você usou 2 anos de experiência em atendimento B2B." },
    { papel: "candidato", texto: "B2B mesmo eu não tive ainda. O atendimento que eu faço é para pessoa física, mas acho que a base é a mesma: ouvir e resolver." },
    { papel: "entrevistadora", texto: "Qual foi um desafio que você enfrentou envolvendo Comunicação escrita clara e objetiva e como você resolveu?" },
    { papel: "candidato", texto: "A gente tem modelos de resposta prontos e eu sigo bastante. Quando o caso foge do modelo, eu escrevo do meu jeito e peço revisão do coordenador." },
    { papel: "entrevistadora", texto: "Como você avalia o seu nível hoje em Experiência com CRM (HubSpot ou similar)? Me dê um exemplo concreto que sustente isso." },
    { papel: "candidato", texto: "Uso o Zendesk para registrar os chamados. HubSpot eu nunca usei." },
    { papel: "entrevistadora", texto: "Fale sobre um resultado do qual você se orgulha relacionado a Disponibilidade para viagens ocasionais a clientes." },
    { papel: "candidato", texto: "Tenho disponibilidade para viajar, sim. Nunca precisei até hoje porque o atendimento é todo remoto." },
    { papel: "entrevistadora", texto: "Que número do seu trabalho você acompanhava toda semana?" },
    { papel: "candidato", texto: "A gente tinha meta de tempo de resposta, mas quem olhava isso era o coordenador. Eu focava em fechar os chamados do dia." },
  ],
};

type EntrevistaDeExemplo = {
  id: string;
  candidatoId: string;
  /** Há quantos dias a conversa aconteceu. Tudo dentro dos últimos 14 dias, para o Início e os
   * Relatórios terem forma sem parecer um histórico antigo. */
  diasAtras: number;
  status: "avaliada" | "convidada";
  duracaoSeg?: number;
  parecer?: {
    notaGeral: number;
    requisitosFracos?: string[];
    semEvidenciaCultural?: string[];
    pretensao?: { valor?: number; dentroDaFaixa?: boolean };
    consistencia?: Parecer["consistencia"];
  };
};

const ENTREVISTAS: EntrevistaDeExemplo[] = [
  {
    id: "exemplo-entr-bruno",
    candidatoId: "exemplo-cand-bruno",
    diasAtras: 10,
    status: "avaliada",
    duracaoSeg: 842,
    parecer: {
      notaGeral: 8.6,
      pretensao: { valor: 6800, dentroDaFaixa: true },
      consistencia: [
        { afirmacao: "Renovação da carteira saiu de 78% para 92% em um ano", fonte: "cv", situacao: "confirmado", detalhe: "O currículo registra renovação de 92% na Órbita Software." },
        { afirmacao: "Está na Órbita Software desde 2021", fonte: "web", situacao: "confirmado", detalhe: "O perfil público mostra a mesma empresa e o mesmo início." },
        { afirmacao: "Viaja duas vezes por mês para clientes", fonte: "cv", situacao: "nao_verificavel", detalhe: "Nem o currículo nem o perfil público falam de viagens." },
      ],
    },
  },
  {
    id: "exemplo-entr-camila",
    candidatoId: "exemplo-cand-camila",
    diasAtras: 6,
    status: "avaliada",
    duracaoSeg: 771,
    parecer: {
      notaGeral: 7.1,
      requisitosFracos: ["Experiência com CRM (HubSpot ou similar)"],
      pretensao: { valor: 8200, dentroDaFaixa: false },
      consistencia: [
        { afirmacao: "Coordena um time de três pessoas na Nexo Serviços, até hoje", fonte: "web", situacao: "divergente", detalhe: "o perfil público registra analista sênior e saída em março, e o currículo diz coordenadora até hoje." },
        { afirmacao: "Carteira de 60 contas de serviço recorrente", fonte: "cv", situacao: "confirmado", detalhe: "O currículo traz o mesmo número de contas." },
        { afirmacao: "Usou Salesforce nos últimos quatro anos", fonte: "cv", situacao: "confirmado", detalhe: "Salesforce está listado entre as ferramentas do currículo." },
      ],
    },
  },
  {
    id: "exemplo-entr-diego",
    candidatoId: "exemplo-cand-diego",
    diasAtras: 3,
    status: "avaliada",
    duracaoSeg: 628,
    parecer: {
      notaGeral: 5.4,
      requisitosFracos: ["2 anos de experiência em atendimento B2B", "Experiência com CRM (HubSpot ou similar)"],
      semEvidenciaCultural: ["Melhora contínua"],
      consistencia: [
        { afirmacao: "Atende consumidor final por chat e telefone há dois anos", fonte: "cv", situacao: "confirmado", detalhe: "O currículo registra a mesma função na Ponte Digital." },
        { afirmacao: "Nunca usou HubSpot", fonte: "cv", situacao: "confirmado", detalhe: "O currículo lista apenas Zendesk entre as ferramentas." },
      ],
    },
  },
  { id: "exemplo-entr-fernanda", candidatoId: "exemplo-cand-fernanda", diasAtras: 1, status: "convidada" },
];

// ---------------------------------------------------------------------------------------------
// A semeadura
// ---------------------------------------------------------------------------------------------

function emISO(diasAtras: number, segundosDepois = 0): string {
  return new Date(Date.now() - diasAtras * 86400000 + segundosDepois * 1000).toISOString();
}

/** Uma data no futuro, para o prazo do convite que ainda está em aberto. */
function daquiADias(dias: number): string {
  return emISO(-dias);
}

/** As competências culturais da vaga de exemplo saem da cultura da empresa (US-003): é o mesmo
 * caminho de uma vaga de verdade, e os ids dos valores já servem de id da competência. */
function competenciasDaVaga() {
  return culturaDemo().valores.map((v) => ({ id: v.id, nome: v.nome, descricao: v.descricao, origem: "empresa" as const }));
}

/**
 * O banco está virgem?
 *
 * Nenhuma vaga, nenhum candidato e nenhuma entrevista. Qualquer um deles significa que alguém já usou
 * esta instalação — ou que a migração dos scorecards antigos trouxe histórico de verdade —, e dado de
 * exemplo entrando no meio disso é pior que estado vazio.
 */
function bancoVirgem(): boolean {
  const d = banco();
  const conta = (consulta: string) => Number((d.prepare(consulta).get() as { total: number }).total);
  if (conta("SELECT COUNT(*) AS total FROM vagas")) return false;
  if (conta("SELECT COUNT(*) AS total FROM candidatos")) return false;
  if (conta("SELECT COUNT(*) AS total FROM entrevistas")) return false;
  return true;
}

function semearEstrutura(): void {
  const d = banco();

  d.prepare(
    `INSERT OR IGNORE INTO vagas (id, cargo, area, senioridade, modelo, local, salarioMin, salarioMax, salarioACombinar,
                                  desafios, requisitos, competenciasCulturais, tom, numeroPerguntas, duracaoMin,
                                  perguntaPretensao, status, exemplo, criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'acolhedor', 8, 15, 1, 'aberta', 1, ?, ?)`,
  ).run(
    VAGA_ID,
    "Analista de Customer Success",
    "Customer Success",
    "pleno",
    "hibrido",
    "São Paulo (SP)",
    5500,
    7000,
    DESAFIOS,
    REQUISITOS,
    JSON.stringify(competenciasDaVaga()),
    emISO(14),
    emISO(14),
  );

  const inserirCandidato = d.prepare(
    `INSERT OR IGNORE INTO candidatos (id, nome, email, telefone, cidade, linkedinUrl, termoBusca, ficha, cvNome,
                                       cvTipo, cvTexto, pesquisaStatus, pesquisaEm, identidadeConfirmada, exemplo,
                                       criadoEm, atualizadoEm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'application/pdf', ?, 'concluida', ?, 1, 1, ?, ?)`,
  );
  const inserirFonte = d.prepare(
    "INSERT OR IGNORE INTO fontes_candidato (id, candidatoId, tipo, url, titulo, resumo, conteudo, coletadoEm) VALUES (?, ?, ?, ?, ?, ?, '', ?)",
  );
  for (const c of CANDIDATOS) {
    const quando = emISO(c.diasAtras);
    inserirCandidato.run(c.id, c.nome, c.email, c.telefone, c.cidade, c.linkedinUrl, c.termoBusca, JSON.stringify(c.ficha), c.cvNome, c.cvTexto, quando, quando, quando);
    for (const f of c.fontes) inserirFonte.run(f.id, c.id, f.tipo, f.url ?? null, f.titulo, f.resumo, quando);
  }

  const inserirEntrevista = d.prepare(
    `INSERT OR IGNORE INTO entrevistas (id, vagaId, candidatoId, codigo, status, nivelVoz, convidadaEm, abertaEm,
                                        iniciadaEm, concluidaEm, expiraEm, exemplo, criadoEm)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  const inserirMensagem = d.prepare(
    "INSERT OR IGNORE INTO mensagens_entrevista (id, entrevistaId, papel, texto, segundo, criadoEm) VALUES (?, ?, ?, ?, ?, ?)",
  );

  for (const e of ENTREVISTAS) {
    const convite = emISO(e.diasAtras + 1);
    if (e.status === "convidada") {
      // O convite em aberto vence daqui a uma semana: é o que mostra a contagem de prazo na lista sem
      // que ele expire no meio da demonstração.
      inserirEntrevista.run(e.id, VAGA_ID, e.candidatoId, "convidada", null, convite, null, null, null, daquiADias(7), convite);
      continue;
    }
    const inicio = emISO(e.diasAtras);
    const fim = emISO(e.diasAtras, e.duracaoSeg ?? 600);
    inserirEntrevista.run(e.id, VAGA_ID, e.candidatoId, "avaliada", "navegador", convite, inicio, inicio, fim, null, convite);

    const falas = CONVERSAS[e.candidatoId] ?? [];
    falas.forEach((f, i) => {
      // Id derivado da entrevista e da posição, nunca sorteado: rodar de novo cai na mesma linha e o
      // `INSERT OR IGNORE` a ignora, como toda a semeadura daqui.
      inserirMensagem.run(`${e.id}-m${i + 1}`, e.id, f.papel, f.texto, i * 45, emISO(e.diasAtras, i * 45));
    });
  }
}

/** Gera e grava o parecer de uma entrevista semeada, pelo mesmo caminho de uma de verdade: o parecer
 * mora em `resultados` (lib/historico.ts) e a entrevista guarda só o id dele. */
function avaliarEntrevistaSemeada(e: EntrevistaDeExemplo): void {
  if (!e.parecer) return;
  const candidato = CANDIDATOS.find((c) => c.id === e.candidatoId);
  if (!candidato) return;

  const parecer = parecerDemo({
    cargo: "Analista de Customer Success",
    candidato: candidato.nome,
    requisitos: REQUISITOS,
    competencias: competenciasDaVaga().map((c) => c.nome),
    transcricao: CONVERSAS[e.candidatoId] ?? [],
    notaGeral: e.parecer.notaGeral,
    requisitosFracos: e.parecer.requisitosFracos,
    semEvidenciaCultural: e.parecer.semEvidenciaCultural,
    consistencia: e.parecer.consistencia,
    pretensao: e.parecer.pretensao,
  });

  const quando = emISO(e.diasAtras, e.duracaoSeg ?? 600);
  const id = salvarResultado({
    tipo: "parecer",
    titulo: `${candidato.nome} · Analista de Customer Success`,
    resumo: parecer.resumo,
    entrada: { entrevistaId: e.id, vagaId: VAGA_ID, candidatoId: candidato.id },
    saida: parecer,
    // `geradoEm` é o fim da conversa, não o instante da semeadura: a proveniência que a tela mostra
    // tem de bater com a data da entrevista que ela está exibindo.
    meta: { ...meta({ demo: true, insumo: INSUMO, model: modelName("avaliacao") }), geradoEm: quando },
  });

  // O histórico grava com a data de hoje; a entrevista é de dias atrás e a demonstração não pode
  // vencer sozinha (quem a apaga é o primeiro dado real, em lib/exemplos.ts).
  banco().prepare("UPDATE resultados SET criadoEm = ?, expiraEm = NULL WHERE id = ?").run(quando, id);
  banco().prepare("UPDATE entrevistas SET resultadoId = ?, parecerStatus = 'pronto' WHERE id = ?").run(id, e.id);
}

/** O id da vaga de exemplo, para quem precisa abrir a tela dela (o atalho `?exemplo=1`). */
export const ID_VAGA_EXEMPLO = VAGA_ID;

/**
 * Semeia a demonstração, uma vez por instalação. Não lança: um app que não abre a lista porque o
 * exemplo falhou é pior que uma lista vazia.
 *
 * Chamada na primeira leitura de qualquer lista (`lib/vagas.ts`, `lib/candidatos.ts`,
 * `lib/entrevistas.ts`), e não na subida do servidor: assim quem apagou os dados de exemplo não os vê
 * voltar, e quem nunca abre as telas novas não paga nada por elas.
 *
 * `forcar` é o atalho `?exemplo=1` da suíte (o botão "Testar com um exemplo" de Configurações e a
 * captura do catálogo): aí quem pediu o exemplo foi uma PESSOA, então nem a marca de "já semeei" nem
 * a IA conectada valem como recusa. O banco virgem continua valendo para todo mundo — exemplo nunca
 * entra numa instalação que já tem vaga, candidato ou entrevista de verdade.
 */
export function semearDemonstracao(forcar = false): void {
  try {
    if (!forcar && getConfig(CHAVE_SEMEADURA)) return;
    if (!forcar && aiEnabled()) {
      // Com a IA conectada não há demonstração a fazer, e a marca evita reconsiderar isso a cada
      // leitura de lista pelo resto da vida da instalação.
      setConfig(CHAVE_SEMEADURA, agora());
      return;
    }
    if (!bancoVirgem()) {
      setConfig(CHAVE_SEMEADURA, agora());
      return;
    }

    // A estrutura vai numa transação só, e os pareceres ficam fora: `salvarResultado` escreve pela
    // conexão própria de lib/historico.ts, para o mesmo arquivo, e encontraria o banco ocupado se uma
    // transação nossa estivesse aberta.
    const d = banco();
    try {
      d.exec("BEGIN");
      semearEstrutura();
      d.exec("COMMIT");
    } catch (err) {
      try {
        d.exec("ROLLBACK");
      } catch {
        // nada em curso para desfazer
      }
      throw err;
    }

    for (const e of ENTREVISTAS) avaliarEntrevistaSemeada(e);
    setConfig(CHAVE_SEMEADURA, agora());
    console.info("Dados de exemplo criados: 1 vaga, 4 candidatos e 4 entrevistas. Some assim que a primeira vaga ou o primeiro candidato de verdade for criado.");
  } catch (err) {
    console.error("Não foi possível criar os dados de exemplo; o app segue com as listas vazias.", err);
  }
}
