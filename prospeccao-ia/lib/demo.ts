// Leads e abordagens de exemplo usados quando não há APOLLO_API_KEY (leads) ou OPENROUTER_API_KEY (abordagem).
import { getConfig, setConfig } from "./store";
import { criarAbordagem, criarConta, criarICP, criarLead, criarProduto, criarProspeccao, obterProspeccao } from "./workspace";
import type { Abordagem, Lead, Papel, StatusLead } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

// Pessoas fictícias. O gênero serve só para flexionar o cargo ("Diretor" -> "Diretora").
const PESSOAS = [
  { nome: "Ana Paula Ferreira", genero: "f" },
  { nome: "Ricardo Nogueira", genero: "m" },
  { nome: "Camila Torres", genero: "f" },
  { nome: "Fernando Albuquerque", genero: "m" },
  { nome: "Juliana Prado", genero: "f" },
  { nome: "Marcelo Bastos", genero: "m" },
  { nome: "Renata Oliveira", genero: "f" },
  { nome: "Thiago Menezes", genero: "m" },
  { nome: "Patrícia Lemos", genero: "f" },
  { nome: "Eduardo Sampaio", genero: "m" },
  { nome: "Luciana Carvalho", genero: "f" },
  { nome: "Gustavo Ribeiro", genero: "m" },
  { nome: "Beatriz Andrade", genero: "f" },
  { nome: "Rodrigo Furtado", genero: "m" },
  { nome: "Vanessa Quintela", genero: "f" },
];

// Raízes de nomes de empresas claramente fictícias.
const EMPRESAS = [
  "Alvorada", "Nortevale", "Serra Azul", "Tessitura", "Horizonte Ativo", "Braúna", "Pindorama",
  "Marépia", "Vale do Ipê", "Quaresmeira", "Jequitibá", "Cambará", "Lunardi & Filhos", "Sabiá", "Itaquera Norte",
];

// Sufixo do nome da empresa de acordo com o segmento informado.
const SUFIXOS: [RegExp, string][] = [
  [/aliment|bebida|frigor|latic/i, "Alimentos"],
  [/tecnolog|software|saas|ti\b|digital/i, "Sistemas"],
  [/sa[uú]de|hospital|cl[ií]nic|farm/i, "Saúde"],
  [/log[ií]st|transport|frete/i, "Logística"],
  [/varejo|com[eé]rcio|loja|e-?commerce/i, "Comércio"],
  [/constru|engenhar|incorpor|imobili/i, "Engenharia"],
  [/financ|banco|cr[eé]dito|seguro/i, "Capital"],
  [/educa|escola|ensino|univers/i, "Educação"],
  [/agro|rural|fazenda|gr[aã]o/i, "Agro"],
  [/qu[ií]mic|pl[aá]stic|embalag/i, "Embalagens"],
  [/metal|m[aá]quina|autom|autope[cç]/i, "Metalúrgica"],
  [/energ|solar|el[eé]tric/i, "Energia"],
  [/moda|t[eê]xtil|confec|vestu/i, "Têxtil"],
];

// Cidades por região informada, para a lista não sair toda na mesma cidade.
const CIDADES: [RegExp, string[]][] = [
  [/s[aã]o paulo|\bsp\b/i, ["São Paulo", "Campinas", "Jundiaí", "Sorocaba", "Ribeirão Preto", "São José dos Campos", "Barueri", "Guarulhos"]],
  [/rio de janeiro|\brj\b/i, ["Rio de Janeiro", "Niterói", "Duque de Caxias", "Macaé", "Petrópolis"]],
  [/minas|belo horizonte|\bmg\b/i, ["Belo Horizonte", "Uberlândia", "Contagem", "Juiz de Fora", "Betim"]],
  [/paran[aá]|curitiba|\bpr\b/i, ["Curitiba", "Londrina", "Maringá", "Ponta Grossa"]],
  [/santa catarina|\bsc\b/i, ["Joinville", "Florianópolis", "Blumenau", "Chapecó"]],
  [/rio grande do sul|porto alegre|\brs\b/i, ["Porto Alegre", "Caxias do Sul", "Novo Hamburgo", "Pelotas"]],
  [/bahia|salvador|\bba\b/i, ["Salvador", "Feira de Santana", "Camaçari"]],
  [/pernambuco|recife|\bpe\b/i, ["Recife", "Jaboatão dos Guararapes", "Caruaru"]],
  [/goi[aá]s|goi[aâ]nia|\bgo\b/i, ["Goiânia", "Anápolis", "Rio Verde"]],
  [/brasil|nacional|todo o pa[ií]s/i, ["São Paulo", "Curitiba", "Belo Horizonte", "Porto Alegre", "Recife", "Goiânia", "Campinas", "Joinville"]],
];

// Sinais: um fato ou hipótese plausível sobre a empresa. {cidade} e {segmento} são substituídos.
const SINAIS = [
  "Abriu 12 vagas na área operacional nos últimos 60 dias.",
  "Anunciou a expansão da unidade de {cidade} para o próximo ano.",
  "Trocou o sistema de gestão no último ano, segundo publicações de funcionários.",
  "Contratou um novo diretor comercial vindo de uma concorrente maior.",
  "Recebeu aporte de um fundo regional para acelerar a operação.",
  "Publicou meta de reduzir custos logísticos em 15% no relatório anual.",
  "Está migrando a operação para um novo centro de distribuição.",
  "Lançou uma linha de produtos voltada ao mercado de {segmento} premium.",
  "Cresceu acima de 20% em faturamento pelo segundo ano seguido.",
  "Iniciou processo de certificação de qualidade, com prazo até dezembro.",
  "Reestruturou a área de operações após a fusão com uma empresa da região.",
  "Passou a exportar para a América Latina no último trimestre.",
  "Divulgou plano de digitalização do chão de fábrica em evento do setor.",
  "Está contratando analistas de dados e automação, sinal de investimento em eficiência.",
  "Assumiu novo contrato com uma grande rede varejista, com volume dobrado.",
];

function slug(s: string) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "e").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function capitalizar(s: string) {
  const t = String(s || "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function sufixoPara(segmento: string) {
  for (const [re, sufixo] of SUFIXOS) if (re.test(segmento)) return sufixo;
  const palavra = String(segmento).split(/\s+/).filter((p) => p.length > 3).pop();
  return palavra ? capitalizar(palavra) : "Indústria";
}

function cidadesPara(localizacao: string) {
  for (const [re, lista] of CIDADES) if (re.test(localizacao)) return lista;
  const principal = String(localizacao).split(",")[0].trim();
  return [principal || "São Paulo"];
}

function flexionarCargo(cargo: string, genero: string) {
  if (genero !== "f") return cargo;
  return cargo.replace(/\b(Diret|Coordenad|Supervis|Administrad|Gest)or\b/g, "$1ora");
}

// Intervalo "51,200" -> número plausível de funcionários dentro do intervalo.
function funcionarios(porte: string, i: number) {
  const [min, max] = String(porte || "51,200").split(",").map((n) => parseInt(n, 10));
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "";
  const passo = Math.max(1, Math.floor((max - min) / 15));
  const n = Math.min(max, min + passo * ((i * 7) % 15) + Math.floor(passo / 2));
  return `${n} funcionários`;
}

export function leadsDemo({
  segmento = "indústria de alimentos",
  cargo = "Diretor de Operações",
  porte = "51,200",
  localizacao = "São Paulo, Brasil",
  quantidade = 10,
}: { segmento?: string; cargo?: string; porte?: string; localizacao?: string; quantidade?: number } = {}): Lead[] {
  const total = Math.max(5, Math.min(15, Number(quantidade) || 10));
  const sufixo = sufixoPara(segmento);
  const cidades = cidadesPara(localizacao);
  const setor = capitalizar(segmento);
  return PESSOAS.slice(0, total).map((p, i) => {
    const empresa = `${EMPRESAS[i]} ${sufixo}`;
    const cidade = cidades[i % cidades.length];
    const dominio = `${slug(empresa)}.exemplo.com.br`;
    return {
      id: `demo-${i + 1}`,
      nome: p.nome,
      cargo: flexionarCargo(cargo.trim(), p.genero),
      empresa,
      setor,
      porte: funcionarios(porte, i),
      cidade,
      linkedin: `https://www.linkedin.com/in/${slug(p.nome)}-exemplo`,
      site: `https://${dominio}`,
      sinal: SINAIS[i % SINAIS.length].replace("{cidade}", cidade).replace("{segmento}", segmento.toLowerCase()),
    };
  });
}

// Primeira frase da proposta, sem o verbo comercial de abertura ("Vendemos", "Oferecemos"...) e sem citar o texto
// original na íntegra: é uma reescrita curta em tom de benefício, não uma cópia literal da proposta do usuário.
function reescreverProposta(proposta: string) {
  const primeira = String(proposta || "").split(/(?<=[.!?])\s+/)[0].trim().replace(/[.!?]$/, "");
  const semAbertura = primeira.replace(/^(vendemos|oferecemos|temos|somos|fazemos|criamos|desenvolvemos|ajudamos)\s+/i, "");
  const curta = semAbertura.length > 130 ? semAbertura.slice(0, 127).replace(/\s+\S*$/, "") + "..." : semAbertura;
  return curta ? curta[0].toLowerCase() + curta.slice(1) : "ganhar mais eficiência na operação";
}

function sinalComoFrase(sinal?: string) {
  const s = String(sinal || "").trim().replace(/\.$/, "");
  return s ? s[0].toLowerCase() + s.slice(1) : "está em um momento de crescimento";
}

// Como o remetente se apresenta (WhatsApp/LinkedIn), a partir do que foi preenchido em "Seu nome"/"Sua empresa".
// Sem nenhum dos dois preenchidos, a apresentação é omitida (nunca aparece um marcador tipo "[seu nome]").
function aberturaRemetente(remetenteNome: string, remetenteEmpresa: string) {
  if (remetenteNome && remetenteEmpresa) return `Aqui é ${remetenteNome}, da ${remetenteEmpresa}. `;
  if (remetenteNome) return `Aqui é ${remetenteNome}. `;
  if (remetenteEmpresa) return `Aqui é da ${remetenteEmpresa}. `;
  return "";
}

export function abordagemDemo({
  lead = {} as Partial<Lead>,
  proposta = "",
  segmento = "",
  remetenteNome = "",
  remetenteEmpresa = "",
}: { lead?: Partial<Lead>; proposta?: string; segmento?: string; remetenteNome?: string; remetenteEmpresa?: string } = {}): Abordagem {
  const primeiro = String(lead.nome || "Ana").split(" ")[0];
  const empresa = lead.empresa || "sua empresa";
  const oferta = reescreverProposta(proposta);
  const sinal = sinalComoFrase(lead.sinal);
  const setor = (lead.setor || segmento || "seu setor").toLowerCase();
  const nome = String(remetenteNome || "").trim();
  const empresaRemetente = String(remetenteEmpresa || "").trim();
  const assinatura = [nome, empresaRemetente].filter(Boolean).join("\n") || "Equipe comercial";

  // Um gancho de abertura por canal: mesma informação (o sinal do lead), texto diferente em cada um.
  const ganchoEmail = `${primeiro}, vi que a ${empresa} ${sinal}. Em ${setor}, esse costuma ser o momento em que a operação sente mais a falta de previsibilidade.`;
  const ganchoLinkedin = `Reparei que a ${empresa} ${sinal} — um sinal comum em ${setor} de que vale rever a operação.`;
  const ganchoWhatsapp = `Vi que a ${empresa} ${sinal} e lembrei de um caso parecido em ${setor}.`;

  const email = {
    assunto: `${empresa}: uma ideia sobre ${setor}`,
    corpo: `Olá, ${primeiro}.

${ganchoEmail}

Ajudamos empresas como a ${empresa} a contar com ${oferta}. O resultado costuma aparecer nas primeiras semanas: menos retrabalho, decisões mais rápidas e o time focado no que gera receita.

Faz sentido uma conversa de 20 minutos na próxima semana? Posso mostrar como fizemos isso em uma empresa parecida com a sua e você avalia se vale seguir.

Abraço,
${assinatura}`,
  };

  let linkedin = `${ganchoLinkedin} Posso te enviar uma ideia rápida sobre isso?`;
  if (linkedin.length > 300) linkedin = linkedin.slice(0, 297).replace(/\s+\S*$/, "") + "...";

  const whatsapp = `Oi, ${primeiro}! ${aberturaRemetente(nome, empresaRemetente)}${ganchoWhatsapp} Posso te mandar um resumo de 2 minutos por aqui?`;

  return {
    gancho: ganchoEmail,
    email,
    linkedin,
    whatsapp,
    proximo_passo: `Envie o e-mail hoje. Se ${primeiro} não responder em 3 dias úteis, mande o convite no LinkedIn com a mensagem acima. Sem resposta em uma semana, use o WhatsApp ou ligue citando o mesmo sinal, e registre o contato no CRM.`,
  };
}

// --- Prospecção de exemplo do workspace (US-003/US-008) ---------------------
// "Ver uma prospecção de exemplo" precisa de dados reais nas tabelas do workspace (lib/workspace.ts) para o
// Início ter o que mostrar sem nenhuma chave configurada. Esta é uma versão inicial (1 produto, 1 ICP, 3
// contas, 6 pessoas, 1 abordagem) com o mesmo exemplo do CMMS da Zetta Manutenção Industrial já usado pela
// busca de leads antiga; a US-008 (Demonstração completa do workspace) deve ampliá-la e marcar `demo: true`.
const CHAVE_PROSPECCAO_EXEMPLO = "PROSPECCAO_EXEMPLO_ID";

function diasAtras(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

const CONTAS_EXEMPLO = [
  { nome: "Alvorada Alimentos", cidade: "Campinas", porte: "140 funcionários" },
  { nome: "Serra Azul Alimentos", cidade: "Sorocaba", porte: "95 funcionários" },
  { nome: "Vale do Ipê Alimentos", cidade: "Ribeirão Preto", porte: "180 funcionários" },
];

const PESSOAS_EXEMPLO: { nome: string; cargo: string; papel: Papel; status: StatusLead; contaIndice: number }[] = [
  { nome: "Ana Paula Ferreira", cargo: "Diretora de Operações", papel: "decisor", status: "qualificado", contaIndice: 0 },
  { nome: "Ricardo Nogueira", cargo: "Gerente de Manutenção", papel: "influenciador", status: "novo", contaIndice: 0 },
  { nome: "Camila Torres", cargo: "Diretora de Operações", papel: "decisor", status: "respondeu", contaIndice: 1 },
  { nome: "Fernando Albuquerque", cargo: "Gerente de Manutenção", papel: "influenciador", status: "qualificado", contaIndice: 1 },
  { nome: "Juliana Prado", cargo: "Diretora de Operações", papel: "decisor", status: "pesquisado", contaIndice: 2 },
  { nome: "Marcelo Bastos", cargo: "Gerente de Manutenção", papel: "influenciador", status: "novo", contaIndice: 2 },
];

const QUALIFICADOS_OU_DEPOIS: StatusLead[] = ["qualificado", "selecionado", "abordado", "respondeu"];

/** Cria, uma única vez, a prospecção de demonstração (produto, ICP, contas, leads e uma abordagem) e devolve
 * o id; chamadas seguintes só devolvem o id já criado, sem duplicar (chave PROSPECCAO_EXEMPLO_ID). */
export function criarProspeccaoExemplo(): string {
  const existenteId = getConfig(CHAVE_PROSPECCAO_EXEMPLO);
  if (existenteId && obterProspeccao(existenteId)) return existenteId;

  const produto = criarProduto({
    nome: "CMMS da Zetta Manutenção Industrial",
    descricao: "Sistema de gestão de manutenção industrial (CMMS) que reduz parada não programada de máquinas.",
    site: "https://zettamanutencao.com.br",
    propostaValor:
      "Reduz parada não programada de máquinas em indústrias de médio porte que hoje controlam a manutenção em planilha, com implantação em 3 semanas e sem precisar trocar o ERP.",
  });

  const icp = criarICP({
    produtoId: produto.id,
    nome: "Diretores de Operações em indústrias de médio porte",
    jornada: "b2b",
    criterios: { setor: "Indústria de alimentos", porte: "51-200 funcionários", localizacao: "São Paulo, Brasil" },
    personas: ["Diretor de Operações", "Gerente de Manutenção"],
    dores: ["Parada não programada de máquinas", "Manutenção controlada em planilha", "Falta de previsibilidade na produção"],
    sinais: ["Abriu vaga para Gerente de Manutenção", "Comentou sobre parada de linha em post público"],
  });

  const prospeccao = criarProspeccao(
    { produtoId: produto.id, icpId: icp.id, modo: "pessoas", criterios: {}, estado: "pronta", etapa: null, erro: null, concluidoEm: new Date().toISOString() },
    diasAtras(2),
  );

  const contas = CONTAS_EXEMPLO.map((c, i) => {
    const dominio = `${slug(c.nome)}.exemplo.com.br`;
    return criarConta(
      {
        prospeccaoId: prospeccao.id,
        nome: c.nome,
        site: `https://${dominio}`,
        setor: "Indústria de alimentos",
        porte: c.porte,
        cidade: c.cidade,
        fit: i === 2 ? "media" : "alta",
        evidencias: [
          { criterio: "Setor", valor: "Indústria de alimentos", resultado: "atende" },
          { criterio: "Porte", valor: c.porte, resultado: "atende" },
        ],
        sinais: [{ descricao: "Abriu vaga para Gerente de Manutenção", data: diasAtras(12 + i * 5).toISOString(), tipo: "vaga", origem: `https://${dominio}/carreiras` }],
        resumo: `Indústria de alimentos em ${c.cidade}, controla a manutenção em planilha.`,
      },
      diasAtras(2),
    );
  });

  const leads = PESSOAS_EXEMPLO.map((p, i) => {
    const conta = contas[p.contaIndice];
    const pesquisado = p.status !== "novo";
    const qualificado = QUALIFICADOS_OU_DEPOIS.includes(p.status);
    return criarLead(
      {
        prospeccaoId: prospeccao.id,
        contaId: conta.id,
        nome: p.nome,
        cargo: p.cargo,
        empresa: conta.nome,
        cidade: CONTAS_EXEMPLO[p.contaIndice].cidade,
        linkedin: `https://www.linkedin.com/in/${slug(p.nome)}-exemplo`,
        fonte: "site público",
        papel: p.papel,
        fit: qualificado ? (i % 3 === 0 ? "alta" : "media") : null,
        evidencias: pesquisado ? [{ criterio: "Cargo", valor: p.cargo, resultado: "atende" }] : [],
        sinais: qualificado ? [{ descricao: "A empresa abriu vaga para Gerente de Manutenção", data: diasAtras(12 + p.contaIndice * 5).toISOString(), tipo: "vaga", origem: `https://${slug(conta.nome)}.exemplo.com.br/carreiras` }] : [],
        hipotese: qualificado ? `A vaga aberta para Gerente de Manutenção sugere dificuldade em manter a operação hoje, controlada em planilha.` : null,
        status: p.status,
        noCRM: false,
      },
      diasAtras(6 - i),
    );
  });

  const camila = leads[2];
  criarAbordagem(
    {
      leadId: camila.id,
      estrategia: {
        objetivo: "Agendar uma conversa de 20 minutos",
        gancho: "Vaga aberta para Gerente de Manutenção",
        dorProvavel: "Parada não programada de máquinas",
        tom: "consultivo",
        cta: "Convite para uma conversa de 20 minutos",
      },
      email: {
        assunto: "Serra Azul Alimentos: uma ideia sobre manutenção",
        corpo: "Olá, Camila.\n\nVi que a Serra Azul Alimentos abriu vaga para Gerente de Manutenção. Em indústria de alimentos, esse costuma ser o momento em que a operação sente mais a falta de previsibilidade.\n\nAjudamos empresas como a Serra Azul a reduzir parada não programada de máquinas, com implantação em 3 semanas. Faz sentido uma conversa de 20 minutos na próxima semana?\n\nAbraço,\nEquipe comercial",
      },
      linkedin: "Reparei que a Serra Azul Alimentos abriu vaga para Gerente de Manutenção — um sinal comum de que vale rever a manutenção. Posso te enviar uma ideia rápida sobre isso?",
      whatsapp: "Oi, Camila! Vi que a Serra Azul Alimentos abriu vaga para Gerente de Manutenção e lembrei de um caso parecido. Posso te mandar um resumo de 2 minutos por aqui?",
      variacao: null,
    },
    diasAtras(1),
  );

  setConfig(CHAVE_PROSPECCAO_EXEMPLO, prospeccao.id);
  return prospeccao.id;
}
