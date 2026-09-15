// Leads fictícios e sequências prontas, usados enquanto o Prospect Halo não está conectado (leads)
// e quando não há chave de IA (sequências). Todos os leads saem rotulados com origem "demo".
import { LIMITE_CONEXAO, SINAIS_INTENCAO, type Lead, type Perfil, type Sequencia, type SinalIntencao } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

// Pessoas fictícias. O gênero serve só para flexionar o cargo ("Diretor" -> "Diretora").
const PESSOAS: { nome: string; genero: "f" | "m"; empresa: string; pontuacao: number }[] = [
  { nome: "Helena Vasconcelos", genero: "f", empresa: "Nortevale", pontuacao: 92 },
  { nome: "Bruno Sarmento", genero: "m", empresa: "Serra Azul", pontuacao: 88 },
  { nome: "Larissa Figueiredo", genero: "f", empresa: "Horizonte Ativo", pontuacao: 85 },
  { nome: "Otávio Brandão", genero: "m", empresa: "Jequitibá", pontuacao: 81 },
  { nome: "Cristiane Rezende", genero: "f", empresa: "Braúna", pontuacao: 76 },
  { nome: "Fábio Lacerda", genero: "m", empresa: "Cambará", pontuacao: 72 },
  { nome: "Daniela Moraes", genero: "f", empresa: "Vale do Ipê", pontuacao: 68 },
  { nome: "Leandro Pimentel", genero: "m", empresa: "Pindorama", pontuacao: 63 },
  { nome: "Simone Tavares", genero: "f", empresa: "Quaresmeira", pontuacao: 57 },
  { nome: "Henrique Dutra", genero: "m", empresa: "Sabiá", pontuacao: 51 },
  // Daqui para baixo só a rotina "leads novos toda semana" usa (lib/leads-vistos.ts): cada semana entrega
  // quem ainda não foi entregue, então o pool precisa ser maior do que uma única busca.
  { nome: "Patrícia Amorim", genero: "f", empresa: "Araucária", pontuacao: 90 },
  { nome: "Rodrigo Valente", genero: "m", empresa: "Mangueiral", pontuacao: 86 },
  { nome: "Camila Estrela", genero: "f", empresa: "Pau-Brasil", pontuacao: 83 },
  { nome: "Marcelo Fontoura", genero: "m", empresa: "Guaporé", pontuacao: 79 },
  { nome: "Renata Sobral", genero: "f", empresa: "Aroeira", pontuacao: 74 },
  { nome: "Thiago Peixoto", genero: "m", empresa: "Ipanema Norte", pontuacao: 70 },
  { nome: "Juliana Castelo", genero: "f", empresa: "Tamboril", pontuacao: 66 },
  { nome: "André Siqueira", genero: "m", empresa: "Cerrado Vivo", pontuacao: 61 },
  { nome: "Vanessa Prado", genero: "f", empresa: "Imbuia", pontuacao: 55 },
  { nome: "Gustavo Meireles", genero: "m", empresa: "Buriti", pontuacao: 50 },
  { nome: "Fernanda Quintana", genero: "f", empresa: "Palmeira Real", pontuacao: 89 },
  { nome: "Ricardo Albuquerque", genero: "m", empresa: "Canela Preta", pontuacao: 84 },
  { nome: "Tatiana Werneck", genero: "f", empresa: "Jatobá", pontuacao: 80 },
  { nome: "Paulo Bittencourt", genero: "m", empresa: "Pequi", pontuacao: 77 },
  { nome: "Aline Godoy", genero: "f", empresa: "Ingá", pontuacao: 71 },
  { nome: "Eduardo Marinho", genero: "m", empresa: "Copaíba", pontuacao: 67 },
  { nome: "Beatriz Lemos", genero: "f", empresa: "Guabiroba", pontuacao: 62 },
  { nome: "Felipe Nogueira", genero: "m", empresa: "Angico", pontuacao: 58 },
  { nome: "Mariana Cordeiro", genero: "f", empresa: "Cajueiro", pontuacao: 53 },
  { nome: "Sérgio Paiva", genero: "m", empresa: "Umbuzeiro", pontuacao: 49 },
];

/** Quantos leads fictícios uma busca comum devolve (os primeiros do pool). */
export const LEADS_POR_BUSCA = 10;

// Um texto de sinal por tipo. {empresa}, {cargo} e {setor} são substituídos.
const TEXTOS_SINAL: Record<SinalIntencao, string[]> = {
  mudou_de_cargo: [
    "Assumiu o cargo de {cargo} há 2 meses, vindo de uma concorrente maior.",
    "Foi promovido(a) a {cargo} em agosto, depois de 4 anos na empresa.",
  ],
  empresa_contratando: [
    "A {empresa} abriu 8 vagas na área nas últimas 3 semanas.",
    "A {empresa} está contratando analistas e coordenadores para a operação.",
  ],
  publicou_sobre_tema: [
    "Publicou sobre os gargalos de {setor} e a publicação passou de 200 reações.",
    "Comentou em um artigo sobre eficiência em {setor} citando a própria operação.",
  ],
  levantou_investimento: [
    "A {empresa} anunciou uma rodada de investimento para expandir a operação.",
    "A {empresa} recebeu aporte de um fundo regional no último trimestre.",
  ],
};

function slug(s: string) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function capitalizar(s: string) {
  const t = String(s || "").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

function flexionarCargo(cargo: string, genero: string) {
  if (genero !== "f") return cargo.replace(/\(a\)/g, "");
  return cargo.replace(/\b(Diret|Coordenad|Supervis|Administrad|Gest)or\b/g, "$1ora").replace(/\(a\)/g, "a");
}

/** "Indústria de alimentos" -> "Alimentos"; "Varejo" -> "Varejo": a última palavra significativa do setor vira sobrenome da empresa fictícia. */
function sufixoEmpresa(setor: string) {
  const palavras = setor.split(/\s+/).filter((w) => w.length > 3);
  return capitalizar(palavras[palavras.length - 1] || setor);
}

/** Divide "Diretor de Operações, Gerente de Logística" em itens limpos. */
export function separar(lista: string): string[] {
  return String(lista || "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

function leadDemo(perfil: Perfil, i: number): Lead {
  const p = PESSOAS[i];
  const cargos = separar(perfil.cargos);
  const setores = separar(perfil.setores);
  const tipos: SinalIntencao[] = perfil.sinais.length > 0 ? perfil.sinais : SINAIS_INTENCAO.map((s) => s.valor);
  const cargoBase = cargos[i % Math.max(1, cargos.length)] || "Diretor de Operações";
  const setor = capitalizar(setores[i % Math.max(1, setores.length)] || "Indústria");
  const tipo = tipos[i % tipos.length];
  const textos = TEXTOS_SINAL[tipo];
  const cargo = flexionarCargo(cargoBase, p.genero);
  const empresa = `${p.empresa} ${sufixoEmpresa(setor)}`;
  const sinal = textos[Math.floor(i / tipos.length) % textos.length]
    .replace("{empresa}", empresa)
    .replace("{cargo}", cargo)
    .replace("{setor}", setor.toLowerCase())
    .replace("(a)", p.genero === "f" ? "a" : "");
  return {
    id: `demo-${i + 1}`,
    nome: p.nome,
    cargo,
    empresa,
    setor,
    linkedinUrl: `https://www.linkedin.com/in/${slug(p.nome)}-exemplo`,
    sinal,
    pontuacao: p.pontuacao,
    origem: "demo",
  };
}

/** 10 leads fictícios que combinam com o perfil: cargos e setores vêm do que o usuário digitou, os sinais dos tipos marcados. */
export function leadsDemo(perfil: Perfil): Lead[] {
  return PESSOAS.slice(0, LEADS_POR_BUSCA).map((_, i) => leadDemo(perfil, i));
}

/**
 * Leads fictícios para a rotina semanal: percorre o pool inteiro (30 pessoas) e devolve os que ainda não foram
 * entregues (`vistos` guarda a chave de cada lead já entregue, ver lib/leads-vistos.ts). Esgotado o pool, devolve vazio.
 */
export function leadsDemoNovos(perfil: Perfil, vistos: Set<string>, chave: (lead: Lead) => string): Lead[] {
  return PESSOAS.map((_, i) => leadDemo(perfil, i)).filter((l) => !vistos.has(chave(l)));
}

/** Primeira frase da proposta, sem ponto final e com a inicial minúscula, para entrar no meio de uma frase. */
function primeiraFrase(proposta: string) {
  const primeira = String(proposta || "").split(/(?<=[.!?])\s+/)[0].trim().replace(/[.!?]$/, "");
  const curta = primeira.length > 140 ? primeira.slice(0, 137).replace(/\s+\S*$/, "") + "..." : primeira;
  return curta ? curta[0].toLowerCase() + curta.slice(1) : "ajudamos a operação a ganhar previsibilidade";
}

/**
 * A proposta como uma frase completa dita pelo remetente, sem depender de como o usuário a escreveu:
 * "Reduzimos o custo de frete..." vira "Na Rota Certa, reduzimos o custo de frete...";
 * "Software de roteirização para indústrias" vira "Na Rota Certa, trabalhamos com software de roteirização...".
 */
function propostaComoFrase(proposta: string, empresaRemetente: string) {
  const frase = primeiraFrase(proposta);
  const primeiraPalavra = frase.split(/\s+/)[0] || "";
  const comecaComVerbo = /^[a-záéíóúâêôãõç]+mos$/i.test(primeiraPalavra);
  const corpo = comecaComVerbo ? frase : `trabalhamos com ${frase}`;
  // Sem empresa do remetente, a frase começa pelo verbo e precisa de inicial maiúscula.
  return empresaRemetente ? `Na ${empresaRemetente}, ${corpo}.` : `${capitalizar(corpo)}.`;
}

function sinalComoFrase(sinal: string) {
  const s = String(sinal || "").trim().replace(/\.$/, "");
  return s ? s[0].toLowerCase() + s.slice(1) : "está em um momento de mudança";
}

/** Recorta no limite do LinkedIn sem cortar palavra no meio. */
export function limitarConexao(texto: string) {
  const t = String(texto || "").trim();
  if (t.length <= LIMITE_CONEXAO) return t;
  return t.slice(0, LIMITE_CONEXAO - 1).replace(/\s+\S*$/, "") + "…";
}

export function sequenciaDemo(lead: Lead, perfil: Perfil): Sequencia {
  const primeiro = lead.nome.split(" ")[0];
  const sinal = sinalComoFrase(lead.sinal);
  const setor = (lead.setor || "seu setor").toLowerCase();
  const nome = perfil.remetente.nome.trim();
  const empresaRemetente = perfil.remetente.empresa.trim();
  const proposta = propostaComoFrase(perfil.proposta, empresaRemetente);
  const saudacao = perfil.tom === "informal" ? `Oi, ${primeiro}!` : perfil.tom === "direto" ? `${primeiro},` : `Olá, ${primeiro}.`;
  // Sem nome nem empresa do remetente, a apresentação é omitida (nunca aparece um marcador tipo "[seu nome]").
  const apresentacao = nome && empresaRemetente ? `Aqui é ${nome}, da ${empresaRemetente}. ` : nome ? `Aqui é ${nome}. ` : empresaRemetente ? `Aqui é da ${empresaRemetente}. ` : "";
  const assinatura = [nome, empresaRemetente].filter(Boolean).join("\n") || "Equipe comercial";

  // Um gancho diferente por mensagem: a mesma informação (o sinal) contada de três jeitos.
  const conexao = limitarConexao(`${saudacao} Vi que ${sinal} e acompanho de perto o que gente de ${setor} enfrenta nesse momento. ${proposta} Vamos nos conectar?`);
  const acompanhamento1 = `Obrigado por aceitar, ${primeiro}. ${apresentacao}Quando ${sinal}, a operação costuma sentir primeiro a falta de previsibilidade. ${proposta} Empresas como a ${lead.empresa} costumam ver o resultado nas primeiras semanas. Faz sentido trocar 15 minutos na próxima semana?`;
  const acompanhamento2 = `Passando para não deixar cair, ${primeiro}. Se esse tema não é prioridade agora, sem problema. Se for, posso te mandar um resumo de 2 minutos de como resolvemos isso em ${setor}, sem compromisso.`;
  const email = {
    assunto: `${lead.empresa}: uma ideia sobre ${setor}`,
    corpo: `${saudacao}

Reparei que ${sinal}. Em ${setor}, esse costuma ser o momento em que decisões rápidas valem mais do que planos longos.

${proposta} Em empresas como a ${lead.empresa}, o resultado aparece nas primeiras semanas: menos retrabalho e o time focado no que gera receita.

Posso te mostrar em 20 minutos como fizemos isso em uma empresa parecida? Você avalia se vale seguir.

Abraço,
${assinatura}`,
  };
  return { leadId: lead.id, conexao, acompanhamento1, acompanhamento2, email };
}
