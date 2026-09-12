// Leads e abordagens de exemplo usados quando não há APOLLO_API_KEY (leads) ou OPENROUTER_API_KEY (abordagem).
import type { Abordagem, Lead } from "./types";

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

// Primeira frase da proposta, curta, para caber nas mensagens.
function resumirProposta(proposta: string) {
  const primeira = String(proposta || "").split(/(?<=[.!?])\s+/)[0].trim().replace(/[.!?]$/, "");
  const curta = primeira.length > 140 ? primeira.slice(0, 137).replace(/\s+\S*$/, "") + "..." : primeira;
  return curta || "ajudar empresas como a sua a ganhar eficiência na operação";
}

function sinalComoFrase(sinal?: string) {
  const s = String(sinal || "").trim().replace(/\.$/, "");
  return s ? s[0].toLowerCase() + s.slice(1) : "está em um momento de crescimento";
}

export function abordagemDemo({ lead = {} as Partial<Lead>, proposta = "", segmento = "" }: { lead?: Partial<Lead>; proposta?: string; segmento?: string } = {}): Abordagem {
  const primeiro = String(lead.nome || "Ana").split(" ")[0];
  const empresa = lead.empresa || "sua empresa";
  const oferta = resumirProposta(proposta);
  const sinal = sinalComoFrase(lead.sinal);
  const setor = (lead.setor || segmento || "seu setor").toLowerCase();
  const gancho = `${primeiro}, vi que a ${empresa} ${sinal}. Em ${setor}, esse costuma ser o momento em que a operação sente mais a falta de previsibilidade.`;

  const email = {
    assunto: `${empresa}: uma ideia sobre ${setor}`,
    corpo: `Olá, ${primeiro}.

${gancho}

Sobre nós: ${oferta} Em empresas do porte da ${empresa}, o resultado costuma aparecer nas primeiras semanas: menos retrabalho, decisões mais rápidas e o time focado no que gera receita.

Faz sentido uma conversa de 20 minutos na próxima semana? Posso mostrar como fizemos isso em uma empresa parecida com a sua e você avalia se vale seguir.

Abraço,
[seu nome]
[sua empresa]`,
  };

  let linkedin = `Olá, ${primeiro}. Vi que a ${empresa} ${sinal}. Acompanho empresas de ${setor} nesse momento e gostaria de trocar ideias sobre como reduzir esse tipo de dor. Podemos nos conectar?`;
  if (linkedin.length > 300) linkedin = linkedin.slice(0, 297).replace(/\s+\S*$/, "") + "...";

  const whatsapp = `Oi, ${primeiro}! Aqui é [seu nome], da [sua empresa]. Vi que a ${empresa} ${sinal} e lembrei de um caso parecido em ${setor}. Posso te mandar um resumo de 2 minutos por aqui?`;

  return {
    gancho,
    email,
    linkedin,
    whatsapp,
    proximo_passo: `Envie o e-mail hoje. Se ${primeiro} não responder em 3 dias úteis, mande o convite no LinkedIn com a mensagem acima. Sem resposta em uma semana, use o WhatsApp ou ligue citando o mesmo sinal, e registre o contato no CRM.`,
  };
}
