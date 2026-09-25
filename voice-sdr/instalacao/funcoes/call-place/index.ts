// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/call-place/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
function criarCofreDeCredenciais(opcoes) {
	const { porta, ambiente } = opcoes;
	const agora = opcoes.agora ?? Date.now;
	const ttlMs = opcoes.ttlMs ?? 6e4;
	const cache = new Map();
	function resolveSecret(contaId, provedor, chave, detalhes = {}) {
		const pedido = normalizar(contaId, provedor, chave);
		if (!pedido) return Promise.resolve(AUSENTE);
		const identidade = chaveDeCache(pedido, detalhes.recurso);
		const guardada = cache.get(identidade);
		if (guardada && guardada.expiraEm > agora()) return guardada.resolucao;
		const resolucao = descerCascata(pedido, detalhes.recurso);
		cache.set(identidade, {
			resolucao,
			expiraEm: agora() + ttlMs
		});
		resolucao.catch(() => {
			if (cache.get(identidade)?.resolucao === resolucao) cache.delete(identidade);
		});
		return resolucao;
	}
	async function descerCascata(pedido, recurso) {
		const { contaId, provedor, chave } = pedido;
		const daConta = valorOuNulo(await porta.segredoDaConta(contaId, provedor, chave));
		if (daConta) return {
			ok: true,
			valor: daConta,
			origem: "conta"
		};
		if (recurso) {
			const doRecurso = valorOuNulo(await porta.segredoDoRecurso(recurso, provedor, chave));
			if (doRecurso) return {
				ok: true,
				valor: doRecurso,
				origem: "recurso"
			};
		}
		const daPlataforma = valorOuNulo(porta.segredoDaPlataforma(provedor, chave));
		if (!daPlataforma) return AUSENTE;
		if (ambiente !== "producao") return {
			ok: true,
			valor: daPlataforma,
			origem: "plataforma"
		};
		if (await porta.modoDeCredencial(contaId) !== "platform") return {
			ok: false,
			motivo: "plataforma_bloqueada"
		};
		return {
			ok: true,
			valor: daPlataforma,
			origem: "plataforma"
		};
	}
	function invalidar(contaId, provedor, chave) {
		const pedido = normalizar(contaId, provedor, chave);
		if (!pedido) return;
		const prefixo = prefixoDaTripla(pedido);
		for (const identidade of cache.keys()) if (identidade.startsWith(prefixo)) cache.delete(identidade);
	}
	function invalidarConta(contaId) {
		const prefixo = `${parte(contaId.trim())}|`;
		for (const identidade of cache.keys()) if (identidade.startsWith(prefixo)) cache.delete(identidade);
	}
	return {
		resolveSecret,
		invalidar,
		invalidarConta,
		limpar: () => cache.clear()
	};
}
const AUSENTE = {
	ok: false,
	motivo: "ausente"
};
function normalizar(contaId, provedor, chave) {
	const pedido = {
		contaId: contaId.trim(),
		provedor: provedor.trim().toLowerCase(),
		chave: chave.trim().toLowerCase()
	};
	if (!pedido.contaId || !pedido.provedor || !pedido.chave) return null;
	return pedido;
}
function chaveDeCache(pedido, recurso) {
	const alvo = recurso ? `${parte(recurso.tipo)}:${parte(recurso.id)}` : "";
	return `${prefixoDaTripla(pedido)}${alvo}`;
}
function prefixoDaTripla(pedido) {
	return `${parte(pedido.contaId)}|${parte(pedido.provedor)}|${parte(pedido.chave)}|`;
}
function parte(valor) {
	return encodeURIComponent(valor);
}
function valorOuNulo(valor) {
	return (valor?.trim() ?? "") || null;
}
function lerAmbiente(valor) {
	switch (valor?.trim().toLowerCase()) {
		case "local":
		case "development":
		case "desenvolvimento": return "local";
		case "homologacao":
		case "homologação":
		case "staging": return "homologacao";
		default: return "producao";
	}
}
function nomeDaVariavelDaPlataforma(provedor, chave) {
	return [
		"SARAH",
		normalizarNome(provedor),
		normalizarNome(chave)
	].filter((pedaco) => pedaco !== "").join("_");
}
function normalizarNome(valor) {
	return valor.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}
function criarLeitorDaPlataforma(ambienteDoProcesso) {
	return (provedor, chave) => valorOuNulo(ambienteDoProcesso[nomeDaVariavelDaPlataforma(provedor, chave)]);
}
//#endregion
//#region supabase/functions/_shared/segredo-interno.ts
const RPC_DO_SEGREDO_INTERNO = "segredo_interno_da_instalacao";
function leitorDoSegredoInterno(opcoes) {
	const definido = opcoes.definido?.trim() ?? "";
	const agora = opcoes.agora ?? Date.now;
	let guardado = null;
	let emCurso = null;
	return async () => {
		if (definido !== "") return definido;
		if (guardado && agora() - guardado.lidoEm < 3e5) return guardado.valor;
		if (emCurso) return emCurso;
		emCurso = (async () => {
			try {
				const valor = (await opcoes.lerDoCofre())?.trim() ?? "";
				if (valor !== "") guardado = {
					valor,
					lidoEm: agora()
				};
				return valor;
			} catch {
				return "";
			} finally {
				emCurso = null;
			}
		})();
		return emCurso;
	};
}
async function lerSegredoDoCofre(cliente) {
	const { data, error } = await cliente.rpc(RPC_DO_SEGREDO_INTERNO);
	if (error) throw new Error(error.message);
	return typeof data === "string" ? data : null;
}
//#endregion
//#region supabase/functions/_shared/speech/todos-os-propositos.ts
const FALAS_DE_TODO_PROPOSITO = {
	avisoDeGravacao: "Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Antes da gente começar: essa ligação é gravada, tudo bem?",
	avisoDeGravacaoSemNome: "Oi! Aqui é a {nome_do_agente}, da {empresa}. Antes da gente começar: essa ligação é gravada, tudo bem?",
	aberturaSemGravacao: "Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Tudo bem?",
	aberturaSemGravacaoESemNome: "Oi! Aqui é a {nome_do_agente}, da {empresa}. Tudo bem?",
	recusaDeAfirmar: ["Isso eu não arrisco te falar, pra não te passar informação errada.", "Quem fecha esse número é o especialista, e ele te fala certinho."]
};
//#endregion
//#region supabase/functions/_shared/qualificacao/etapa.ts
const CHAVES_CANONICAS = [
	"new",
	"contacted",
	"qualified",
	"meeting_booked",
	"won",
	"lost"
];
Object.freeze({
	atendeu_sem_qualificar: "contacted",
	qualificado: "qualified",
	reuniao_marcada: "meeting_booked",
	ganho: "won",
	sem_fit: "lost",
	sem_interesse: "lost",
	perdido: "lost"
});
//#endregion
//#region supabase/functions/_shared/qualificacao/pontuacao.ts
const TEMPERATURAS = [
	"frio",
	"morno",
	"quente"
];
const REGUA_DE_EXEMPLO = Object.freeze({
	criterios: Object.freeze([
		{
			key: "dor_confirmada",
			peso: 30
		},
		{
			key: "orcamento",
			peso: 25
		},
		{
			key: "decisor",
			peso: 25
		},
		{
			key: "prazo",
			peso: 20
		}
	]),
	cortes: Object.freeze({
		morno: 40,
		quente: 70
	})
});
const DESCRITOR_DA_QUALIFICACAO = {
	nome: "tool-qualify",
	propositos: [
		"discovery",
		"rescue",
		"followup"
	],
	prazoDeRespostaSegundos: 5,
	descricao: "Chame antes de encerrar, quando já souber em que pé a pessoa está. Registra a etapa do funil, os critérios confirmados e o resumo da conversa. Mande só o que a pessoa confirmou; o que ela não disse fica de fora. Leia a frase devolvida.",
	campos: [
		{
			chave: "stage_key",
			descricao: "A etapa em que a conversa deixou a pessoa.",
			obrigatorio: true,
			valores: CHAVES_CANONICAS.filter((chave) => chave !== "new")
		},
		{
			chave: "criterios",
			descricao: `Objeto com true quando a pessoa confirmou, false quando a resposta desqualifica e null quando não foi perguntado, para cada critério: ${REGUA_DE_EXEMPLO.criterios.map((criterio) => criterio.key).join(", ")}.`,
			obrigatorio: false,
			tipo: "object"
		},
		{
			chave: "temperature",
			descricao: "Sua impressão do quanto a pessoa serve. A pontuação final sai dos critérios.",
			obrigatorio: false,
			valores: TEMPERATURAS
		},
		{
			chave: "sentiment",
			descricao: "Como a conversa correu, de -1 (muito mal) a 1 (muito bem).",
			obrigatorio: false,
			tipo: "number"
		},
		{
			chave: "pain",
			descricao: "A dor que a pessoa descreveu, nas palavras dela.",
			obrigatorio: false
		},
		{
			chave: "fit",
			descricao: "Por que a oferta serve ou não serve, em uma frase.",
			obrigatorio: false
		},
		{
			chave: "objections",
			descricao: "As objeções que a pessoa levantou.",
			obrigatorio: false
		},
		{
			chave: "next_action",
			descricao: "O próximo passo combinado com a pessoa.",
			obrigatorio: false
		},
		{
			chave: "meeting_outcome",
			descricao: "Só em ligação depois de reunião: se a pessoa compareceu.",
			obrigatorio: false,
			valores: [
				"attended",
				"no_show",
				"unknown"
			]
		}
	]
};
//#endregion
//#region supabase/functions/_shared/hash-de-segredo.ts
async function hashEmHexadecimal(segredo) {
	const bytes = new TextEncoder().encode(segredo.trim());
	const resumo = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(resumo)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function hashesIguais(a, b) {
	if (a.length !== b.length) return false;
	let diferenca = 0;
	for (let posicao = 0; posicao < a.length; posicao += 1) diferenca |= a.charCodeAt(posicao) ^ b.charCodeAt(posicao);
	return diferenca === 0;
}
DESCRITOR_DA_QUALIFICACAO.nome;
Object.freeze({
	key: "qualificacao_registrada",
	rotulo: "Registrou a qualificação antes de encerrar",
	obrigatorio: true,
	como: "registro"
});
//#endregion
//#region supabase/functions/_shared/speech/discovery.ts
const FALAS_DE_DESCOBERTA = {
	abertura: ["Fecho em dois. {oferta}", "E como vocês fazem isso aí no dia a dia?"],
	levantamentoDaDor: ["E isso trava vocês em quê? Tempo, custo, retrabalho?", "Quanto isso pesa no mês de vocês, mais ou menos?"],
	fechamento: {
		sem_agenda: [
			"Pelo que você me contou, acho que vale mesmo você falar com um especialista nosso.",
			"Prefere que ele te ligue ou que ele te chame no WhatsApp?",
			"E qual período do dia costuma ser mais tranquilo pra você atender?",
			"Fechado. Passo o seu contato pra ele e ele te procura. Obrigada pelo papo, {nome_do_lead}!"
		],
		com_agenda: [
			"Pelo que você me contou, acho que vale mesmo você falar com um especialista nosso.",
			"Tenho dois horários aqui: {opcao_um} ou {opcao_dois}. Qual fica melhor pra você?",
			"Fechado, deixei marcado. Você recebe a confirmação da reunião no seu e-mail."
		]
	}
};
//#endregion
//#region supabase/functions/_shared/speech/regras-travadas.ts
const FALAS_DAS_REGRAS_TRAVADAS = {
	naoPerturbe: ["Entendi, sem problema nenhum. Já tô tirando o seu número da nossa lista.", "Não te ligo mais. Obrigada, e desculpa o incômodo."],
	pedidoDeHumano: ["Claro, deixa eu ver aqui quem pode falar com você."],
	pessoaErrada: ["Ah, então eu falei com a pessoa errada. Me desculpa o incômodo!", "Vou corrigir aqui pra não te ligar de novo. Obrigada pela paciência, viu? Até mais."]
};
//#endregion
//#region supabase/functions/_shared/speech/qualificacao.ts
const FALAS_DA_QUALIFICACAO = {
	registrada: "Anotado, obrigada por me contar.",
	antesDeEncerrar: ["Deixa eu só anotar aqui o que você me contou, pra passar certinho pro especialista."]
};
//#endregion
//#region supabase/functions/_shared/playbook/camada-um.ts
const PROPOSITOS = [
	"discovery",
	"reminder",
	"rescue",
	"followup"
];
FALAS_DE_TODO_PROPOSITO.avisoDeGravacao, [...FALAS_DE_TODO_PROPOSITO.recusaDeAfirmar], [...FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe], [...FALAS_DAS_REGRAS_TRAVADAS.pedidoDeHumano], [...FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada];
[...FALAS_DA_QUALIFICACAO.antesDeEncerrar];
[...FALAS_DE_DESCOBERTA.fechamento.sem_agenda], [...FALAS_DE_DESCOBERTA.fechamento.com_agenda];
[...PROPOSITOS], [...PROPOSITOS], DESCRITOR_DA_QUALIFICACAO.nome, DESCRITOR_DA_QUALIFICACAO.propositos, [...PROPOSITOS];
DESCRITOR_DA_QUALIFICACAO.nome, DESCRITOR_DA_QUALIFICACAO.descricao, DESCRITOR_DA_QUALIFICACAO.campos;
const VARIAVEIS_DA_CHAMADA = [...[
	"nome_do_lead",
	"empresa_do_lead",
	"cidade_do_lead",
	"nome_do_especialista"
], "contexto_do_lead"];
const VALOR_INICIAL_DA_VARIAVEL = {
	nome_do_lead: "",
	empresa_do_lead: "",
	cidade_do_lead: "",
	nome_do_especialista: "",
	contexto_do_lead: ""
};
[
	"# Dados desta ligação",
	"Estes dados chegam no começo de cada ligação. Campo em branco é dado que a conta não tem: não invente, não pergunte só para preencher e nunca diga em voz alta o nome de um campo. Sem o nome de quem atende, fale sem nome.",
	"- Nome de quem atende: {nome_do_lead}",
	"- Empresa de quem atende: {empresa_do_lead}",
	"- Cidade: {cidade_do_lead}",
	"- O que se sabe do lead: {contexto_do_lead}"
].join("\n");
const MARCADOR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}|\{([A-Za-z0-9_]+)\}/g;
new Set(VARIAVEIS_DA_CHAMADA);
function trocarMarcadores(texto, resolver) {
	return texto.replace(MARCADOR, (original, dupla, simples) => resolver((dupla ?? simples ?? "").toLowerCase(), original));
}
function interpolarFala(texto, valores) {
	return limparEspacos(trocarMarcadores(texto.replace(new RegExp(`\\s(?:${PREPOSICOES})\\s+(${MARCADOR.source})`, "gi"), (trecho, marcador) => valorDoMarcador(marcador, valores) === "" ? "" : trecho), (chave) => valores[chave] ?? ""));
}
const PREPOSICOES = "da|do|de|das|dos|em|no|na|nos|nas|para|pra|com";
function valorDoMarcador(marcador, valores) {
	return valores[marcador.replace(/[{}\s]/g, "").toLowerCase()]?.trim() ?? "";
}
function limparEspacos(texto) {
	return texto.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/,+\s*([,.;:!?])/g, "$1").replace(/([([])\s+/g, "$1").trim();
}
//#endregion
//#region supabase/functions/_shared/agente/abertura-da-chamada.ts
function limpo(valor) {
	return valor?.trim() ?? "";
}
function variaveisDaChamada(lead, contextoDoLead = "") {
	const doLead = {
		nome_do_lead: limpo(lead?.nome),
		empresa_do_lead: limpo(lead?.empresa),
		cidade_do_lead: limpo(lead?.cidade),
		nome_do_especialista: "",
		contexto_do_lead: limpo(contextoDoLead)
	};
	const variaveis = {};
	for (const chave of VARIAVEIS_DA_CHAMADA) variaveis[chave] = doLead[chave] !== "" ? doLead[chave] : VALOR_INICIAL_DA_VARIAVEL[chave];
	return variaveis;
}
function falaDeAbertura(gravacaoLigada, temNome) {
	if (gravacaoLigada) return temNome ? FALAS_DE_TODO_PROPOSITO.avisoDeGravacao : FALAS_DE_TODO_PROPOSITO.avisoDeGravacaoSemNome;
	return temNome ? FALAS_DE_TODO_PROPOSITO.aberturaSemGravacao : FALAS_DE_TODO_PROPOSITO.aberturaSemGravacaoESemNome;
}
function montarAbertura(pedido) {
	const { identidade, politica } = pedido;
	const daChamada = variaveisDaChamada(pedido.lead, pedido.contextoDoLead);
	const temNome = limpo(pedido.lead?.nome) !== "";
	const variaveis = {
		...daChamada,
		nome_do_agente: identidade.nome,
		empresa: identidade.empresa
	};
	const avisoDeGravacao = politica.gravacaoLigada ? interpolarFala(politica.avisoDeGravacao ?? falaDeAbertura(true, temNome), variaveis) : null;
	return {
		primeiraFala: interpolarFala(identidade.primeiraFala ?? falaDeAbertura(politica.gravacaoLigada, temNome), variaveis),
		avisoDeGravacao,
		variaveis
	};
}
//#endregion
//#region supabase/functions/_shared/ddd.ts
const SAO_PAULO = "America/Sao_Paulo";
const MANAUS = "America/Manaus";
const RIO_BRANCO = "America/Rio_Branco";
const CAMPO_GRANDE = "America/Campo_Grande";
const CUIABA = "America/Cuiaba";
const DDDS_VALIDOS = new Set(new Map([
	["11", {
		cidade: "São Paulo",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["12", {
		cidade: "São José dos Campos",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["13", {
		cidade: "Santos",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["14", {
		cidade: "Bauru",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["15", {
		cidade: "Sorocaba",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["16", {
		cidade: "Ribeirão Preto",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["17", {
		cidade: "São José do Rio Preto",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["18", {
		cidade: "Presidente Prudente",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["19", {
		cidade: "Campinas",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["21", {
		cidade: "Rio de Janeiro",
		estado: "RJ",
		fuso: SAO_PAULO
	}],
	["22", {
		cidade: "Campos dos Goytacazes",
		estado: "RJ",
		fuso: SAO_PAULO
	}],
	["24", {
		cidade: "Volta Redonda",
		estado: "RJ",
		fuso: SAO_PAULO
	}],
	["27", {
		cidade: "Vitória",
		estado: "ES",
		fuso: SAO_PAULO
	}],
	["28", {
		cidade: "Cachoeiro de Itapemirim",
		estado: "ES",
		fuso: SAO_PAULO
	}],
	["31", {
		cidade: "Belo Horizonte",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["32", {
		cidade: "Juiz de Fora",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["33", {
		cidade: "Governador Valadares",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["34", {
		cidade: "Uberlândia",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["35", {
		cidade: "Poços de Caldas",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["37", {
		cidade: "Divinópolis",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["38", {
		cidade: "Montes Claros",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["41", {
		cidade: "Curitiba",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["42", {
		cidade: "Ponta Grossa",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["43", {
		cidade: "Londrina",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["44", {
		cidade: "Maringá",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["45", {
		cidade: "Foz do Iguaçu",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["46", {
		cidade: "Francisco Beltrão",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["47", {
		cidade: "Joinville",
		estado: "SC",
		fuso: SAO_PAULO
	}],
	["48", {
		cidade: "Florianópolis",
		estado: "SC",
		fuso: SAO_PAULO
	}],
	["49", {
		cidade: "Chapecó",
		estado: "SC",
		fuso: SAO_PAULO
	}],
	["51", {
		cidade: "Porto Alegre",
		estado: "RS",
		fuso: SAO_PAULO
	}],
	["53", {
		cidade: "Pelotas",
		estado: "RS",
		fuso: SAO_PAULO
	}],
	["54", {
		cidade: "Caxias do Sul",
		estado: "RS",
		fuso: SAO_PAULO
	}],
	["55", {
		cidade: "Santa Maria",
		estado: "RS",
		fuso: SAO_PAULO
	}],
	["61", {
		cidade: "Brasília",
		estado: "DF",
		fuso: SAO_PAULO
	}],
	["62", {
		cidade: "Goiânia",
		estado: "GO",
		fuso: SAO_PAULO
	}],
	["63", {
		cidade: "Palmas",
		estado: "TO",
		fuso: SAO_PAULO
	}],
	["64", {
		cidade: "Rio Verde",
		estado: "GO",
		fuso: SAO_PAULO
	}],
	["65", {
		cidade: "Cuiabá",
		estado: "MT",
		fuso: CUIABA
	}],
	["66", {
		cidade: "Rondonópolis",
		estado: "MT",
		fuso: CUIABA
	}],
	["67", {
		cidade: "Campo Grande",
		estado: "MS",
		fuso: CAMPO_GRANDE
	}],
	["68", {
		cidade: "Rio Branco",
		estado: "AC",
		fuso: RIO_BRANCO
	}],
	["69", {
		cidade: "Porto Velho",
		estado: "RO",
		fuso: MANAUS
	}],
	["71", {
		cidade: "Salvador",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["73", {
		cidade: "Itabuna",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["74", {
		cidade: "Juazeiro",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["75", {
		cidade: "Feira de Santana",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["77", {
		cidade: "Vitória da Conquista",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["79", {
		cidade: "Aracaju",
		estado: "SE",
		fuso: SAO_PAULO
	}],
	["81", {
		cidade: "Recife",
		estado: "PE",
		fuso: SAO_PAULO
	}],
	["82", {
		cidade: "Maceió",
		estado: "AL",
		fuso: SAO_PAULO
	}],
	["83", {
		cidade: "João Pessoa",
		estado: "PB",
		fuso: SAO_PAULO
	}],
	["84", {
		cidade: "Natal",
		estado: "RN",
		fuso: SAO_PAULO
	}],
	["85", {
		cidade: "Fortaleza",
		estado: "CE",
		fuso: SAO_PAULO
	}],
	["86", {
		cidade: "Teresina",
		estado: "PI",
		fuso: SAO_PAULO
	}],
	["87", {
		cidade: "Petrolina",
		estado: "PE",
		fuso: SAO_PAULO
	}],
	["88", {
		cidade: "Juazeiro do Norte",
		estado: "CE",
		fuso: SAO_PAULO
	}],
	["89", {
		cidade: "Picos",
		estado: "PI",
		fuso: SAO_PAULO
	}],
	["91", {
		cidade: "Belém",
		estado: "PA",
		fuso: SAO_PAULO
	}],
	["92", {
		cidade: "Manaus",
		estado: "AM",
		fuso: MANAUS
	}],
	["93", {
		cidade: "Santarém",
		estado: "PA",
		fuso: SAO_PAULO
	}],
	["94", {
		cidade: "Marabá",
		estado: "PA",
		fuso: SAO_PAULO
	}],
	["95", {
		cidade: "Boa Vista",
		estado: "RR",
		fuso: MANAUS
	}],
	["96", {
		cidade: "Macapá",
		estado: "AP",
		fuso: SAO_PAULO
	}],
	["97", {
		cidade: "Tefé",
		estado: "AM",
		fuso: MANAUS
	}],
	["98", {
		cidade: "São Luís",
		estado: "MA",
		fuso: SAO_PAULO
	}],
	["99", {
		cidade: "Imperatriz",
		estado: "MA",
		fuso: SAO_PAULO
	}]
]).keys());
function dddEhValido(ddd) {
	return DDDS_VALIDOS.has(ddd);
}
//#endregion
//#region supabase/functions/_shared/telefone.ts
const BRASIL = "55";
const NAO_DIGITO = /\D/g;
function normalizarTelefone(entrada, opcoes = {}) {
	const bruto = (entrada ?? "").trim();
	if (bruto === "") return {
		ok: false,
		motivo: "vazio"
	};
	const digitos = bruto.replace(NAO_DIGITO, "");
	if (digitos === "") return {
		ok: false,
		motivo: "sem_digitos"
	};
	const nacional = extrairNumeroNacional(bruto.startsWith("+"), digitos, opcoes);
	if (nacional === null) return {
		ok: false,
		motivo: "pais_nao_suportado"
	};
	if (nacional.length !== 10 && nacional.length !== 11) return {
		ok: false,
		motivo: "comprimento_invalido"
	};
	const ddd = nacional.slice(0, 2);
	if (!dddEhValido(ddd)) return {
		ok: false,
		motivo: "ddd_invalido"
	};
	if (!assinanteTemONonoDigito(nacional.slice(2))) return {
		ok: false,
		motivo: "celular_sem_nono_digito"
	};
	return {
		ok: true,
		e164: `+${BRASIL}${nacional}`,
		ddd
	};
}
function extrairNumeroNacional(temMaisNaFrente, digitos, opcoes) {
	if (temMaisNaFrente) return digitos.startsWith(BRASIL) ? digitos.slice(2) : null;
	if (digitos.startsWith("00")) {
		const semPrefixo = digitos.slice(2);
		return semPrefixo.startsWith(BRASIL) ? semPrefixo.slice(2) : null;
	}
	if ((opcoes.paisPadrao ?? "BR") !== "BR") return null;
	const semOperadora = digitos.startsWith("0") ? digitos.slice(1) : digitos;
	if ((semOperadora.length === 12 || semOperadora.length === 13) && semOperadora.startsWith(BRASIL)) return semOperadora.slice(2);
	return semOperadora;
}
function assinanteTemONonoDigito(assinante) {
	const primeiro = assinante[0];
	if (primeiro === void 0) return false;
	return assinante.length === 9 ? primeiro === "9" : primeiro < "6";
}
//#endregion
//#region supabase/functions/_shared/discagem/janela.ts
function dentroDaJanela(janela, instante, fusoDoLead) {
	const lida = lerJanela(janela);
	if (!lida.ok) return {
		dentro: false,
		motivo: "janela_invalida",
		erro: lida.erro
	};
	const partes = partesEm(fusoDoLead, instanteDe(instante, "instante"));
	const faixa = lida.dias.get(diaDaSemanaDe(partes));
	if (!faixa) return {
		dentro: false,
		motivo: "dia_sem_faixa"
	};
	const segundos = partes.hora * 3600 + partes.minuto * 60 + partes.segundo;
	return segundos >= faixa.inicio && segundos < faixa.fim ? {
		dentro: true,
		faixa: faixa.bruta
	} : {
		dentro: false,
		motivo: "fora_da_faixa",
		faixa: faixa.bruta
	};
}
function proximaAbertura(janela, instante, fusoDoLead) {
	const lida = lerJanela(janela);
	if (!lida.ok) return null;
	const ts = instanteDe(instante, "instante");
	if (dentroDaJanela(janela, instante, fusoDoLead).dentro) return instante;
	let dia = dataLocalDe(fusoDoLead, ts);
	for (let volta = 0; volta <= 7; volta += 1) {
		const faixa = lida.dias.get(diaDaSemanaDe(dia));
		if (faixa) {
			const abre = instanteDeHoraLocal(fusoDoLead, dia, faixa.inicio);
			if (abre >= ts) return paraIso(abre);
		}
		dia = diaSeguinte(dia);
	}
	return null;
}
function fraseDaJanela(entrada) {
	const lida = lerJanela(entrada.janela);
	if (!lida.ok) return "a janela de discagem desta conta está com a configuração inválida";
	const ts = instanteDe(entrada.instante, "instante");
	const dia = dataLocalDe(entrada.fusoDoLead, ts);
	const faixa = lida.dias.get(diaDaSemanaDe(dia));
	if (!faixa) return `esta conta não disca ${DIAS_NO_PLURAL[diaDaSemanaDe(dia)]}`;
	const noFusoDoLead = `das ${horaFalada(faixa.inicio)} às ${horaFalada(faixa.fim)}`;
	if (entrada.fusoDaConta === entrada.fusoDoLead) return noFusoDoLead;
	const abre = instanteDeHoraLocal(entrada.fusoDoLead, dia, faixa.inicio);
	const fecha = instanteDeHoraLocal(entrada.fusoDoLead, dia, faixa.fim);
	const aqui = `${horaLocal(entrada.fusoDaConta, abre)} às ${horaLocal(entrada.fusoDaConta, fecha)}`;
	return `${noFusoDoLead} no horário de ${nomeDoFuso(entrada.fusoDoLead)}, que é ${aqui} aqui`;
}
function fraseDaProximaAbertura(entrada) {
	const abertura = proximaAbertura(entrada.janela, entrada.instante, entrada.fusoDoLead);
	if (!abertura) return null;
	const ts = instanteDe(abertura, "abertura");
	const partes = partesEm(entrada.fusoDoLead, ts);
	const dia = DIAS_DA_SEMANA[diaDaSemanaDe(partes)];
	if (!dia) throw new Error(`instante fora do calendário: ${abertura}`);
	const noFusoDoLead = `${dia} às ${horaLocal(entrada.fusoDoLead, ts)}`;
	if (entrada.fusoDaConta === entrada.fusoDoLead) return noFusoDoLead;
	const aqui = horaLocal(entrada.fusoDaConta, ts);
	return `${noFusoDoLead} no horário de ${nomeDoFuso(entrada.fusoDoLead)}, que é ${aqui} aqui`;
}
function horaNoFuso(fuso, instante) {
	return horaLocal(fuso, instanteDe(instante, "instante"));
}
const HORA_DO_RELOGIO = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
const FIM_DO_DIA = "24:00";
const DIA_DA_SEMANA = /^[0-6]$/;
function lerJanela(janela) {
	if (typeof janela !== "object" || janela === null || Array.isArray(janela)) return {
		ok: false,
		erro: `a janela precisa ser um objeto, e veio ${tipoDe(janela)}`
	};
	const dias = new Map();
	for (const [dia, valor] of Object.entries(janela)) {
		if (!DIA_DA_SEMANA.test(dia)) return {
			ok: false,
			erro: `a janela traz o dia "${dia}", e o dia vai de 0 a 6`
		};
		if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {
			ok: false,
			erro: `a faixa do dia ${dia} precisa ser um objeto, e veio ${tipoDe(valor)}`
		};
		const chaves = Object.keys(valor).sort();
		if (chaves.length !== 2 || chaves[0] !== "end" || chaves[1] !== "start") return {
			ok: false,
			erro: `a faixa do dia ${dia} aceita exatamente start e end, e veio: ${chaves.join(", ")}`
		};
		const { start, end } = valor;
		if (typeof start !== "string" || !HORA_DO_RELOGIO.test(start)) return {
			ok: false,
			erro: `o início do dia ${dia} precisa ser HH:MM, e veio ${tipoDe(start)}`
		};
		if (typeof end !== "string" || !HORA_DO_RELOGIO.test(end) && end !== FIM_DO_DIA) return {
			ok: false,
			erro: `o fim do dia ${dia} precisa ser HH:MM até 24:00, e veio ${tipoDe(end)}`
		};
		if (end <= start) return {
			ok: false,
			erro: `a faixa do dia ${dia} vai de ${start} a ${end} e não tem duração`
		};
		dias.set(Number(dia), {
			inicio: segundosDoDia(start),
			fim: segundosDoDia(end),
			bruta: {
				start,
				end
			}
		});
	}
	return {
		ok: true,
		dias
	};
}
function tipoDe(valor) {
	if (valor === null) return "null";
	if (Array.isArray(valor)) return "array";
	if (typeof valor === "string") return `"${valor}"`;
	return typeof valor;
}
function segundosDoDia(hora) {
	const h = Number(hora.slice(0, 2));
	const m = Number(hora.slice(3, 5));
	return h * 3600 + m * 60;
}
const DIAS_DA_SEMANA = [
	"domingo",
	"segunda-feira",
	"terça-feira",
	"quarta-feira",
	"quinta-feira",
	"sexta-feira",
	"sábado"
];
const DIAS_NO_PLURAL = [
	"aos domingos",
	"às segundas-feiras",
	"às terças-feiras",
	"às quartas-feiras",
	"às quintas-feiras",
	"às sextas-feiras",
	"aos sábados"
];
const NOMES_DE_FUSO = {
	"America/Sao_Paulo": "São Paulo",
	"America/Manaus": "Manaus",
	"America/Rio_Branco": "Rio Branco",
	"America/Campo_Grande": "Campo Grande",
	"America/Cuiaba": "Cuiabá",
	"America/Noronha": "Fernando de Noronha",
	"America/Belem": "Belém",
	"America/Fortaleza": "Fortaleza",
	"America/Recife": "Recife",
	"America/Bahia": "Salvador"
};
function nomeDoFuso(fuso) {
	const conhecido = NOMES_DE_FUSO[fuso];
	if (conhecido) return conhecido;
	return (fuso.split("/").pop() ?? fuso).replace(/_/g, " ");
}
function horaFalada(segundos) {
	const minutos = Math.floor(segundos / 60);
	const h = Math.floor(minutos / 60);
	const m = minutos % 60;
	return m === 0 ? `${h}h` : `${h}h${dois(m)}`;
}
function horaLocal(fuso, instante) {
	const partes = partesEm(fuso, instante);
	return horaFalada(partes.hora * 3600 + partes.minuto * 60);
}
const DIA_EM_MS = 864e5;
const FORMATADORES = new Map();
function formatador(fuso) {
	const guardado = FORMATADORES.get(fuso);
	if (guardado) return guardado;
	const novo = new Intl.DateTimeFormat("en-US", {
		timeZone: fuso,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
	FORMATADORES.set(fuso, novo);
	return novo;
}
function partesEm(fuso, instante) {
	const partes = formatador(fuso).formatToParts(instante);
	const valor = (tipo) => {
		const parte = partes.find((p) => p.type === tipo);
		if (!parte) throw new Error(`o fuso ${fuso} não devolveu ${tipo}`);
		return Number(parte.value);
	};
	return {
		ano: valor("year"),
		mes: valor("month"),
		dia: valor("day"),
		hora: valor("hour") % 24,
		minuto: valor("minute"),
		segundo: valor("second")
	};
}
function relogioLocal(fuso, instante) {
	const p = partesEm(fuso, instante);
	return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
}
function dataLocalDe(fuso, instante) {
	const { ano, mes, dia } = partesEm(fuso, instante);
	return {
		ano,
		mes,
		dia
	};
}
function instanteDeHoraLocal(fuso, data, segundos) {
	const alvo = Date.UTC(data.ano, data.mes - 1, data.dia, Math.floor(segundos / 3600), Math.floor(segundos % 3600 / 60));
	const primeiro = alvo - (relogioLocal(fuso, alvo) - alvo);
	const segundo = alvo - (relogioLocal(fuso, primeiro) - primeiro);
	if (relogioLocal(fuso, segundo) === alvo) return segundo;
	return Math.max(primeiro, segundo);
}
function diaDaSemanaDe(data) {
	return ((Math.floor(Date.UTC(data.ano, data.mes - 1, data.dia) / DIA_EM_MS) + 4) % 7 + 7) % 7;
}
function diaSeguinte(data) {
	return dataLocalDe("UTC", Date.UTC(data.ano, data.mes - 1, data.dia + 1));
}
function instanteDe(iso, campo) {
	const ts = Date.parse(iso);
	if (Number.isNaN(ts)) throw new Error(`${campo} não é instante ISO-8601: ${iso}`);
	return ts;
}
function paraIso(instante) {
	const p = partesEm("UTC", instante);
	return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}:${dois(p.segundo)}Z`;
}
function dois(valor) {
	return String(valor).padStart(2, "0");
}
//#endregion
//#region supabase/functions/_shared/discagem/portao.ts
function faltaParaAbrir(estado) {
	const falta = [];
	if (estado.realDialing !== true) falta.push("liberacao_da_fase");
	if (!estado.primeiraChamadaDeTesteEm) falta.push("primeira_chamada_de_teste");
	return falta;
}
//#endregion
//#region supabase/functions/_shared/discagem/guarda.ts
const PASSOS_PULAVEIS = ["min_interval", "daily_per_number"];
const MOTIVO_POR_CODIGO = {
	dialing_paused: "freio_puxado",
	real_dialing_gate: "portao_de_lead_real",
	dnc_active: "numero_bloqueado",
	outside_window: "fora_da_janela",
	min_interval: "intervalo_minimo",
	daily_per_number: "teto_por_numero",
	daily_per_account: "teto_da_conta",
	daily_spend_cap: "teto_de_gasto",
	no_phone_line: "sem_linha_disponivel"
};
const LIBERADO = "placed";
async function guardarDiscagem(pedido, porta) {
	const numero = normalizarTelefone(pedido.telefone);
	if (!numero.ok) return recusar("telefone_invalido", null, null, pedido);
	let resposta;
	try {
		resposta = await porta.guardDial({
			p_account_id: pedido.contaId,
			p_phone_e164: numero.e164,
			p_lead_id: pedido.leadId ?? null,
			p_actor: pedido.ator,
			p_actor_id: pedido.atorId ?? null,
			p_source: pedido.fonte,
			p_campaign_id: pedido.campanhaId ?? null,
			p_bypass: pedido.pular ?? [],
			p_instante: pedido.instante
		});
	} catch {
		return recusar("guarda_indisponivel", null, numero.e164, pedido);
	}
	const dados = lerDados(resposta.dados);
	if (resposta.allowed && resposta.reason === LIBERADO && resposta.phone_line_id) return {
		ok: true,
		telefone: numero.e164,
		linhaTelefonicaId: resposta.phone_line_id,
		numeroDeOrigem: texto$1(dados, "from_number")
	};
	return recusar(MOTIVO_POR_CODIGO[resposta.reason] ?? "guarda_indisponivel", dados, numero.e164, pedido);
}
function recusar(motivo, dados, telefone, pedido) {
	const { mensagem, alternativa } = frasesDe(motivo, dados, pedido);
	return {
		ok: false,
		motivo,
		mensagem,
		alternativa,
		telefone
	};
}
function frasesDe(motivo, dados, pedido) {
	switch (motivo) {
		case "portao_de_lead_real": return frasesDoPortao(dados);
		case "fora_da_janela": return frasesDaJanela(dados, pedido);
		case "intervalo_minimo": return frasesDoIntervalo(dados, pedido);
		case "teto_por_numero": return {
			mensagem: comTeto(dados, "cap", (teto) => `Este número já recebeu as ${teto} ligações que a conta permite por dia.`, "Este número já recebeu todas as ligações que a conta permite por dia."),
			alternativa: "A contagem por número zera à meia-noite, no fuso da conta. Para falar ainda hoje, aumente o teto por número em Discagem, na administração da conta."
		};
		case "teto_da_conta": return {
			mensagem: comTeto(dados, "cap", (teto) => `A conta já fez as ${teto} ligações do teto diário.`, "A conta já fez todas as ligações do teto diário."),
			alternativa: "O teto zera à meia-noite, no fuso da conta. Para ligar ainda hoje, aumente o teto diário em Discagem, na administração da conta."
		};
		case "teto_de_gasto": return {
			mensagem: comTeto(dados, "cap_cents", (teto) => `A conta já chegou ao teto de gasto do dia, de ${emReais(teto)}.`, "A conta já chegou ao teto de gasto do dia."),
			alternativa: "O gasto do dia zera à meia-noite, no fuso da conta. Para continuar hoje, aumente o teto de gasto em Discagem, na administração da conta."
		};
		default: return FRASES_DA_RECUSA[motivo];
	}
}
const FRASES_DA_RECUSA = {
	telefone_invalido: {
		mensagem: "O número informado não é um telefone válido no Brasil.",
		alternativa: "Confira o DDD e os dígitos do número. Celular tem nove dígitos e começa em 9; fixo tem oito e começa entre 2 e 5."
	},
	freio_puxado: {
		mensagem: "A discagem desta conta está parada pelo freio de emergência.",
		alternativa: "Nenhuma ligação sai enquanto o freio estiver puxado. Solte o freio em Discagem, na administração da conta, quando a operação puder voltar."
	},
	portao_de_lead_real: {
		mensagem: "Por enquanto a assistente só liga para os números de teste da conta.",
		alternativa: "Cadastre este número na lista de teste em Discagem, na administração da conta, ou escolha um número que já esteja na lista."
	},
	numero_bloqueado: {
		mensagem: "Este número está na lista de não perturbe desta conta.",
		alternativa: "A ligação só volta a sair se o contato pedir. Nesse caso, tire o número da lista em Bloqueios, na administração da conta."
	},
	sem_linha_disponivel: {
		mensagem: "Nenhuma linha telefônica desta conta pode ligar agora.",
		alternativa: "Confira em Números se há linha habilitada, no rodízio e dentro do teto do dia."
	},
	guarda_indisponivel: {
		mensagem: "A guarda de discagem não respondeu, e nenhuma ligação sai sem a resposta dela.",
		alternativa: "Tente de novo em alguns instantes. Se continuar assim, avise quem cuida da operação."
	},
	fora_da_janela: {
		mensagem: "Agora está fora da janela de discagem deste lead.",
		alternativa: "Espere a janela abrir, ou ajuste a janela em Discagem, na administração da conta."
	},
	intervalo_minimo: {
		mensagem: "Este número foi discado há pouco, e ainda não passou o intervalo mínimo entre duas ligações para o mesmo número.",
		alternativa: "Espere o intervalo fechar, ou ajuste o intervalo mínimo em Discagem, na administração da conta."
	},
	teto_por_numero: {
		mensagem: "Este número já recebeu todas as ligações que a conta permite por dia.",
		alternativa: "A contagem por número zera à meia-noite, no fuso da conta. Para falar ainda hoje, aumente o teto por número em Discagem, na administração da conta."
	},
	teto_da_conta: {
		mensagem: "A conta já fez todas as ligações do teto diário.",
		alternativa: "O teto zera à meia-noite, no fuso da conta. Para ligar ainda hoje, aumente o teto diário em Discagem, na administração da conta."
	},
	teto_de_gasto: {
		mensagem: "A conta já chegou ao teto de gasto do dia.",
		alternativa: "O gasto do dia zera à meia-noite, no fuso da conta. Para continuar hoje, aumente o teto de gasto em Discagem, na administração da conta."
	}
};
const FRASE_DA_FALTA = {
	liberacao_da_fase: "a liberação da discagem para lead real, que quem instalou o produto faz uma vez nesta instalação",
	primeira_chamada_de_teste: "uma ligação de teste desta conta que termine com transcrição"
};
function frasesDoPortao(dados) {
	const padrao = FRASES_DA_RECUSA.portao_de_lead_real;
	const bandeira = dados?.["real_dialing"];
	if (typeof bandeira !== "boolean") return padrao;
	const [primeira, segunda] = faltaParaAbrir({
		realDialing: bandeira,
		primeiraChamadaDeTesteEm: texto$1(dados, "first_test_call_ok_at")
	});
	if (!primeira) return padrao;
	const falta = segunda ? `${FRASE_DA_FALTA[primeira]} e ${FRASE_DA_FALTA[segunda]}` : FRASE_DA_FALTA[primeira];
	return {
		mensagem: `${padrao.mensagem} Para ligar para lead real falta ${falta}.`,
		alternativa: primeira === "primeira_chamada_de_teste" && !segunda ? ALTERNATIVA_SEM_LIGACAO_DE_TESTE : padrao.alternativa
	};
}
const ALTERNATIVA_SEM_LIGACAO_DE_TESTE = "Cadastre este número na lista de teste em Discagem, na administração da conta, ou faça uma ligação de teste para um número da lista que termine com transcrição. Depois dela, a conta liga para lead real.";
function frasesDaJanela(dados, pedido) {
	const fusoDoLead = texto$1(dados, "timezone");
	const janela = dados?.["window"];
	if (!fusoDoLead || janela === void 0) return FRASES_DA_RECUSA.fora_da_janela;
	const entrada = {
		janela,
		instante: pedido.instante,
		fusoDoLead,
		fusoDaConta: pedido.fusoDaConta
	};
	const abertura = fraseDaProximaAbertura(entrada);
	return {
		mensagem: `Agora está fora da janela de discagem deste lead: ${fraseDaJanela(entrada)}.`,
		alternativa: abertura ? `A janela abre de novo ${abertura}.` : "Nenhum dia da semana está aberto para discagem nesta conta. Ajuste a janela em Discagem, na administração da conta."
	};
}
function frasesDoIntervalo(dados, pedido) {
	const padrao = FRASES_DA_RECUSA.intervalo_minimo;
	const minutos = numero(dados, "min_interval_minutes");
	const libera = texto$1(dados, "next_allowed_at");
	return {
		mensagem: minutos ? `Este número foi discado há pouco, e a conta espera ${minutos} minutos entre duas ligações para o mesmo número.` : padrao.mensagem,
		alternativa: libera ? `Este número libera às ${horaNoFuso(pedido.fusoDaConta, libera)}. Para encurtar a espera, ajuste o intervalo mínimo em Discagem, na administração da conta.` : padrao.alternativa
	};
}
function comTeto(dados, chave, comValor, semValor) {
	const teto = numero(dados, chave);
	return teto === null ? semValor : comValor(teto);
}
const REAIS = new Intl.NumberFormat("pt-BR", {
	style: "currency",
	currency: "BRL"
});
function emReais(centavos) {
	return REAIS.format(centavos / 100);
}
function lerDados(dados) {
	if (typeof dados !== "object" || dados === null || Array.isArray(dados)) return null;
	return dados;
}
function texto$1(dados, chave) {
	const valor = dados?.[chave];
	return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}
function numero(dados, chave) {
	const valor = dados?.[chave];
	return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
//#endregion
//#region supabase/functions/_shared/chamada/idempotencia.ts
const FONTES_DE_DISCAGEM = [
	"manual",
	"stl",
	"rem",
	"rescue",
	"cad",
	"camp"
];
const SEPARADOR = ":";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function chaveDeDiscagem(pedido) {
	switch (pedido.fonte) {
		case "manual": return juntar("manual", uuid(pedido.uuidDoCliente, "uuidDoCliente"));
		case "stl": return juntar("stl", uuid(pedido.leadId, "leadId"));
		case "rem": return juntar("rem", uuid(pedido.meetingId, "meetingId"));
		case "rescue": return juntar("rescue", uuid(pedido.meetingId, "meetingId"), ordinal(pedido.ordinal, "ordinal"));
		case "cad": return juntar("cad", uuid(pedido.enrollmentId, "enrollmentId"), ordinal(pedido.passo, "passo"));
		case "camp": return juntar("camp", uuid(pedido.targetId, "targetId"), ordinal(pedido.tentativa, "tentativa"));
	}
}
function ehFonte(valor) {
	return FONTES_DE_DISCAGEM.includes(valor);
}
function juntar(...partes) {
	return partes.join(SEPARADOR);
}
function uuid(valor, campo) {
	if (!UUID.test(valor)) throw new Error(`${campo} não é uuid em forma canônica: ${valor}`);
	return valor;
}
function ordinal(valor, campo) {
	if (!Number.isInteger(valor) || valor < 1) throw new Error(`${campo} precisa ser inteiro a partir de 1: ${valor}`);
	return String(valor);
}
function chaveDaTentativa(chave, tentativa) {
	if (!Number.isInteger(tentativa) || tentativa < 1) throw new Error(`tentativa precisa ser inteiro a partir de 1: ${tentativa}`);
	return tentativa === 1 ? chave : `${chave}#${tentativa}`;
}
//#endregion
//#region supabase/functions/_shared/provedor/erros.ts
const MENSAGENS_DO_PROVEDOR = {
	chave_invalida: "A chave cadastrada foi recusada pelo provedor. Gere uma nova no painel dele e substitua aqui.",
	sem_permissao: "A chave é válida, mas não tem permissão para esta operação. Confira o escopo dela no painel do provedor.",
	sem_credito: "A conta no provedor está sem saldo. Recarregue no painel dele para voltar a operar.",
	limite_de_taxa: "O provedor recusou por excesso de chamadas. Aguarde alguns minutos e teste de novo.",
	provedor_indisponivel: "O provedor está fora do ar. A chave continua cadastrada, e o teste pode ser repetido depois.",
	sem_resposta: "O provedor não respondeu no tempo esperado. A chave continua cadastrada, e o teste pode ser repetido depois.",
	falha_do_provedor: "O provedor recusou a verificação e não informou o motivo. Confira a chave no painel dele e teste de novo.",
	sessao_desconectada: "A instância do WhatsApp está sem sessão com o celular. Leia o QR code no painel da Z-API e teste de novo."
};
const DO_PROVEDOR = new Set(["provedor_indisponivel", "sem_resposta"]);
function eFalhaDoProvedor(motivo) {
	return DO_PROVEDOR.has(motivo);
}
const POR_CODIGO = [
	[/whatsapp[_\-\s]?not[_\-\s]?connected|not[_\-\s]?connected|disconnected/i, "sessao_desconectada"],
	[/client[_\-\s]?token/i, "chave_invalida"],
	[/invalid[_\-\s]?api[_\-\s]?key/i, "chave_invalida"],
	[/authentication|unauthenticated|unauthorized|invalid[_\-\s]?token|invalid[_\-\s]?credential/i, "chave_invalida"],
	[/invalid[_\-\s]?grant|expired[_\-\s]?token/i, "chave_invalida"],
	[/forbidden|permission[_\-\s]?denied|insufficient[_\-\s]?scope|missing[_\-\s]?scope/i, "sem_permissao"],
	[/quota[_\-\s]?exceeded|insufficient[_\-\s]?credit|payment[_\-\s]?required|out[_\-\s]?of[_\-\s]?credit|billing/i, "sem_credito"],
	[/rate[_\-\s]?limit|too[_\-\s]?many[_\-\s]?requests|throttl/i, "limite_de_taxa"],
	[/timeout|timed[_\-\s]?out|network|econn|fetch[_\-\s]?failed/i, "sem_resposta"],
	[/unavailable|bad[_\-\s]?gateway|internal[_\-\s]?server|server[_\-\s]?error/i, "provedor_indisponivel"]
];
function porStatus(status) {
	if (status === 401) return "chave_invalida";
	if (status === 403) return "sem_permissao";
	if (status === 402) return "sem_credito";
	if (status === 429) return "limite_de_taxa";
	if (status >= 500) return "provedor_indisponivel";
	return null;
}
function traduzirErroDoProvedor(codigo, status) {
	const motivo = motivoDe(codigo, status);
	return {
		motivo,
		mensagem: MENSAGENS_DO_PROVEDOR[motivo]
	};
}
function motivoDe(codigo, status) {
	const texto = codigo?.trim() ?? "";
	if (texto) {
		for (const [padrao, motivo] of POR_CODIGO) if (padrao.test(texto)) return motivo;
	}
	if (typeof status === "number" && Number.isFinite(status)) {
		const doStatus = porStatus(status);
		if (doStatus) return doStatus;
	}
	return "falha_do_provedor";
}
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
}
//#endregion
//#region supabase/functions/call-place/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido veio sem a conta que vai ligar.",
	proposito_invalido: "O pedido veio sem um propósito válido. A ligação sai por descoberta, lembrete, resgate ou acompanhamento.",
	fonte_invalida: "O pedido veio sem uma fonte de discagem conhecida.",
	referencia_invalida: "O pedido veio sem a referência que forma a chave desta discagem, ou com ela fora de forma.",
	destino_ausente: "O pedido veio sem o número a discar e sem o lead de onde tirá-lo.",
	pulo_invalido: "O pedido pediu para pular um passo da guarda que não existe.",
	pulo_sem_rotina: "Pular passo da guarda é da rotina que a conta configurou, e não de quem disca da tela.",
	sem_sessao: "Entre na sua conta para ligar.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para ligar.",
	segredo_interno_invalido: "Credencial interna inválida.",
	fonte_de_rotina: "Esta fonte de discagem é das rotinas do servidor. Da tela, a ligação sai como discagem manual.",
	fonte_de_gente: "A discagem manual é de quem clica, e precisa de sessão. Rotina disca pela própria fonte.",
	sem_acesso: "Você não tem acesso a esta conta.",
	papel_insuficiente: "Ligar é trabalho de quem opera o funil. Peça a quem administra a conta o papel de operador.",
	conta_desconhecida: "Esta conta não existe.",
	lead_desconhecido: "Este lead não existe nesta conta.",
	sem_publicacao: "A assistente ainda não foi publicada para este propósito. Publique o agente antes de ligar.",
	sem_playbook: "Este propósito ainda não tem roteiro publicado. Publique uma versão do roteiro antes de ligar.",
	linha_sem_registro: "A linha telefônica escolhida ainda não está registrada no provedor de voz. Registre o número em Números antes de ligar.",
	sem_credencial_de_voz: "Falta a chave do provedor de voz desta conta. Cadastre a chave em Integrações para a assistente ligar.",
	voz_bloqueada: "Existe uma chave do provedor de voz da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações.",
	falha_ao_gravar: "Não foi possível registrar a ligação agora. Tente de novo em alguns minutos.",
	falha_interna: "Não foi possível ligar agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_invalido: 405,
	conta_ausente: 400,
	proposito_invalido: 400,
	fonte_invalida: 400,
	referencia_invalida: 400,
	destino_ausente: 400,
	pulo_invalido: 400,
	pulo_sem_rotina: 403,
	sem_sessao: 401,
	sessao_invalida: 401,
	segredo_interno_invalido: 401,
	fonte_de_rotina: 403,
	fonte_de_gente: 403,
	sem_acesso: 403,
	papel_insuficiente: 403,
	conta_desconhecida: 404,
	lead_desconhecido: 404,
	sem_publicacao: 409,
	sem_playbook: 409,
	linha_sem_registro: 409,
	sem_credencial_de_voz: 409,
	voz_bloqueada: 409,
	falha_ao_gravar: 500,
	falha_interna: 500
};
const STATUS_DA_FALHA_DO_PROVEDOR = {
	recusou: 502,
	indisponivel: 503
};
const MENSAGENS_DO_ESTADO = {
	discando: "A ligação foi para a linha e está discando.",
	ja_existia: "Esta ligação já tinha sido pedida. Nenhuma ligação nova saiu."
};
const CHAVE_DO_PROVEDOR_DE_VOZ = "api_key";
const PAPEIS_QUE_DISCAM = new Set([
	"owner",
	"admin",
	"operator"
]);
const VARIAVEIS_DINAMICAS = ["call_id"];
const CABECALHO_INTERNO = "x-internal-secret";
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
var RecusaDoPedido = class extends Error {
	motivo;
	constructor(motivo) {
		super(motivo);
		this.motivo = motivo;
	}
};
var RecusaDoProvedor = class extends Error {
	motivo;
	frase;
	chamadaId;
	constructor(codigo, status, chamadaId) {
		const traduzido = traduzirErroDoProvedor(codigo, status);
		super(traduzido.motivo);
		this.motivo = traduzido.motivo;
		this.frase = traduzido.mensagem;
		this.chamadaId = chamadaId;
	}
};
async function atenderDiscagem(pedido, porta, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const contaId = texto(pedido.contaId);
	if (!contaId) return recusa("conta_ausente");
	const proposito = texto(pedido.proposito);
	if (!proposito || !ehProposito(proposito)) return recusa("proposito_invalido");
	const fonte = texto(pedido.fonte);
	if (!fonte || !ehFonte(fonte)) return recusa("fonte_invalida");
	const pular = lerPular(pedido.pular);
	if (pular === null) return recusa("pulo_invalido");
	const daFonte = montarChave(fonte, pedido.referencia, pedido.ordinal);
	if (!daFonte) return recusa("referencia_invalida");
	const tentativa = pedido.tentativa === void 0 || pedido.tentativa === null ? 1 : lerOrdinal(pedido.tentativa);
	if (tentativa === null) return recusa("referencia_invalida");
	const chave = chaveDaTentativa(daFonte, tentativa);
	try {
		const autor = await autenticar(pedido, fonte, porta, opcoes);
		if (autor.ator === "user" && pular.length > 0) return recusa("pulo_sem_rotina");
		return await conduzir({
			contaId,
			proposito,
			fonte,
			chave,
			pular,
			autor,
			pedido
		}, porta, opcoes);
	} catch (erro) {
		if (erro instanceof RecusaDoPedido) return recusa(erro.motivo);
		if (erro instanceof RecusaDoProvedor) return {
			status: eFalhaDoProvedor(erro.motivo) ? STATUS_DA_FALHA_DO_PROVEDOR.indisponivel : STATUS_DA_FALHA_DO_PROVEDOR.recusou,
			corpo: {
				ok: false,
				motivo: erro.motivo,
				mensagem: erro.frase,
				chamadaId: erro.chamadaId
			}
		};
		return recusa("falha_interna");
	}
}
async function colocarChamada(pedido, porta, opcoes) {
	const vistos = [];
	const resposta = await atenderDiscagem(pedido, {
		...porta,
		async credencial(contaId, provedor, chave) {
			const resolucao = await porta.credencial(contaId, provedor, chave);
			if (resolucao.ok) vistos.push(resolucao.valor);
			return resolucao;
		}
	}, opcoes);
	try {
		conferirQueNaoVazou(resposta.corpo, vistos, "credencial no corpo de call-place");
	} catch {
		return recusa("falha_interna");
	}
	return resposta;
}
async function autenticar(pedido, fonte, porta, opcoes) {
	const interno = pedido.segredoInterno?.trim() ?? "";
	if (interno !== "") {
		const esperado = opcoes.segredoInterno.trim();
		if (esperado === "") throw new RecusaDoPedido("segredo_interno_invalido");
		const [recebido, referencia] = await Promise.all([hashEmHexadecimal(interno), hashEmHexadecimal(esperado)]);
		if (!hashesIguais(recebido, referencia)) throw new RecusaDoPedido("segredo_interno_invalido");
		if (fonte === "manual") throw new RecusaDoPedido("fonte_de_gente");
		return {
			ator: "system",
			atorId: null
		};
	}
	const jwt = extrairJwt(pedido.autorizacao);
	if (!jwt) throw new RecusaDoPedido("sem_sessao");
	const usuario = await porta.usuarioDaSessao(jwt);
	if (!usuario) throw new RecusaDoPedido("sessao_invalida");
	const contaId = texto(pedido.contaId) ?? "";
	const papel = await porta.papelNaConta(contaId, usuario.id);
	if (!papel) throw new RecusaDoPedido("sem_acesso");
	if (!PAPEIS_QUE_DISCAM.has(papel)) throw new RecusaDoPedido("papel_insuficiente");
	if (fonte !== "manual") throw new RecusaDoPedido("fonte_de_rotina");
	return {
		ator: "user",
		atorId: usuario.id
	};
}
async function conduzir(contexto, porta, opcoes) {
	const { contaId, proposito, fonte, chave, pular, autor, pedido } = contexto;
	const conta = await porta.contaDaDiscagem(contaId);
	if (!conta) throw new RecusaDoPedido("conta_desconhecida");
	const leadId = texto(pedido.leadId);
	const lead = leadId ? await porta.leadDaConta(contaId, leadId) : null;
	if (leadId && !lead) throw new RecusaDoPedido("lead_desconhecido");
	const telefone = texto(pedido.telefone) ?? lead?.phone_e164?.trim() ?? null;
	if (!telefone) throw new RecusaDoPedido("destino_ausente");
	const publicacao = await porta.publicacaoDoProposito(contaId, proposito);
	if (!publicacao) throw new RecusaDoPedido("sem_publicacao");
	const versao = await porta.versaoPublicadaDoPlaybook(contaId, proposito);
	if (!versao) throw new RecusaDoPedido("sem_playbook");
	const normalizado = normalizarTelefone(telefone);
	const deTeste = autor.ator === "user" && fonte === "manual" && normalizado.ok && await porta.ehNumeroDeTeste?.(contaId, normalizado.e164) === true;
	const decisao = await guardarDiscagem({
		contaId,
		telefone,
		leadId: lead?.id ?? null,
		ator: autor.ator,
		atorId: autor.atorId,
		fonte,
		campanhaId: texto(pedido.campanhaId),
		pular: deTeste ? PASSOS_PULAVEIS : pular,
		instante: opcoes.agora,
		fusoDaConta: conta.timezone
	}, porta);
	if (!decisao.ok) return recusaDaGuarda(decisao);
	const linha = await porta.linhaTelefonica(contaId, decisao.linhaTelefonicaId);
	if (!linha?.provider_voice_id) throw new RecusaDoPedido("linha_sem_registro");
	const gravacao = await porta.gravarChamada({
		account_id: contaId,
		lead_id: lead?.id ?? null,
		phone_line_id: decisao.linhaTelefonicaId,
		agent_publication_id: publicacao.id,
		playbook_version_id: versao.id,
		purpose: proposito,
		direction: "outbound",
		status: "queued",
		from_number: decisao.numeroDeOrigem ?? linha.e164,
		to_number: decisao.telefone,
		campaign_id: texto(pedido.campanhaId),
		idempotency_key: chave
	});
	if (!gravacao.criada) return {
		status: 200,
		corpo: {
			ok: true,
			contaId,
			chamadaId: gravacao.chamada.id,
			proposito,
			fonte,
			estado: "ja_existia",
			mensagem: MENSAGENS_DO_ESTADO.ja_existia,
			telefone: decisao.telefone,
			numeroDeOrigem: decisao.numeroDeOrigem ?? linha.e164,
			providerCallSid: gravacao.chamada.provider_call_sid,
			semRegistro: false
		}
	};
	await registrarNaTrilha(contexto, gravacao.chamada.id, decisao.telefone, porta);
	const credencial = await exigirCredencial(porta, contaId);
	const abertura = await aberturaDaDiscagem(contaId, lead, porta);
	const pedidoDeDisparo = {
		contaId,
		chamadaId: gravacao.chamada.id,
		providerAgentId: publicacao.provider_agent_id,
		providerPhoneNumberId: linha.provider_voice_id,
		paraNumero: decisao.telefone,
		variaveis: variaveisDinamicas(gravacao.chamada.id, abertura.variaveis),
		primeiraFala: abertura.primeiraFala,
		credencialDeVoz: credencial
	};
	const disparo = await porta.dispararNoProvedor(pedidoDeDisparo);
	const semRegistro = !await registrarIntegracao(contaId, gravacao.chamada.id, pedidoDeDisparo, disparo, porta);
	if (!disparo.ok) throw new RecusaDoProvedor(disparo.codigo, disparo.status, gravacao.chamada.id);
	const sid = disparo.providerCallSid?.trim() ?? "";
	if (sid) await porta.gravarDisparo({
		contaId,
		chamadaId: gravacao.chamada.id,
		providerCallSid: sid,
		providerConversationId: disparo.providerConversationId?.trim() || null
	});
	return {
		status: 200,
		corpo: {
			ok: true,
			contaId,
			chamadaId: gravacao.chamada.id,
			proposito,
			fonte,
			estado: "discando",
			mensagem: MENSAGENS_DO_ESTADO.discando,
			telefone: decisao.telefone,
			numeroDeOrigem: decisao.numeroDeOrigem ?? linha.e164,
			providerCallSid: sid || null,
			semRegistro
		}
	};
}
async function registrarNaTrilha(contexto, chamadaId, telefone, porta) {
	await porta.registrarAuditoria({
		account_id: contexto.contaId,
		actor: contexto.autor.ator,
		actor_id: contexto.autor.atorId,
		source: "edge:call-place",
		action: "call_placed",
		target_type: "calls",
		target_id: chamadaId,
		reason: texto(contexto.pedido.motivo),
		payload: {
			purpose: contexto.proposito,
			dial_source: contexto.fonte,
			phone_e164: telefone,
			lead_id: texto(contexto.pedido.leadId),
			campaign_id: texto(contexto.pedido.campanhaId),
			idempotency_key: contexto.chave,
			bypass: contexto.pular
		}
	});
}
async function registrarIntegracao(contaId, chamadaId, pedido, disparo, porta) {
	try {
		await porta.registrarEventoDeIntegracao({
			account_id: contaId,
			direction: "outbound",
			provider: "voz",
			endpoint: disparo.endpoint ?? "chamada",
			request: {
				agent_id: pedido.providerAgentId,
				agent_phone_number_id: pedido.providerPhoneNumberId,
				to_number: pedido.paraNumero,
				dynamic_variables: rastroDasVariaveis(pedido.variaveis),
				first_message_override: pedido.primeiraFala !== null
			},
			response: disparo.corpo ?? {},
			status_code: disparo.status ?? null,
			latency_ms: disparo.latenciaMs ?? null,
			correlation_id: chamadaId
		});
		return true;
	} catch {
		return false;
	}
}
function variaveisDinamicas(chamadaId, doPrompt = variaveisDaChamada(null)) {
	const variaveis = { ...doPrompt };
	for (const nome of VARIAVEIS_DINAMICAS) variaveis[nome] = chamadaId;
	return variaveis;
}
function rastroDasVariaveis(variaveis) {
	const ids = new Set(VARIAVEIS_DINAMICAS);
	return Object.fromEntries(Object.entries(variaveis).map(([nome, valor]) => [nome, ids.has(nome) ? valor : "[lead]"]));
}
async function aberturaDaDiscagem(contaId, lead, porta) {
	const doLead = lead ? {
		nome: lead.name,
		empresa: lead.company ?? null,
		cidade: lead.city ?? null
	} : null;
	const identidade = await porta.identidadeDaConta(contaId);
	if (!identidade) return {
		variaveis: variaveisDaChamada(doLead),
		primeiraFala: null
	};
	const abertura = montarAbertura({
		identidade,
		politica: await porta.politicaDaConta(contaId),
		lead: doLead
	});
	return {
		variaveis: abertura.variaveis,
		primeiraFala: abertura.primeiraFala
	};
}
function montarChave(fonte, referencia, ordinal) {
	const id = texto(referencia);
	if (!id) return null;
	const n = lerOrdinal(ordinal);
	let pedido;
	switch (fonte) {
		case "manual":
			pedido = {
				fonte,
				uuidDoCliente: id
			};
			break;
		case "stl":
			pedido = {
				fonte,
				leadId: id
			};
			break;
		case "rem":
			pedido = {
				fonte,
				meetingId: id
			};
			break;
		case "rescue":
			if (n === null) return null;
			pedido = {
				fonte,
				meetingId: id,
				ordinal: n
			};
			break;
		case "cad":
			if (n === null) return null;
			pedido = {
				fonte,
				enrollmentId: id,
				passo: n
			};
			break;
		case "camp":
			if (n === null) return null;
			pedido = {
				fonte,
				targetId: id,
				tentativa: n
			};
	}
	try {
		return chaveDeDiscagem(pedido);
	} catch {
		return null;
	}
}
function lerPular(valor) {
	if (valor === void 0 || valor === null) return [];
	if (!Array.isArray(valor)) return null;
	const passos = [];
	for (const item of valor) {
		if (typeof item !== "string") return null;
		const passo = PASSOS_PULAVEIS.includes(item) ? item : null;
		if (passo === null) return null;
		passos.push(passo);
	}
	return passos;
}
function extrairJwt(autorizacao) {
	const cabecalho = autorizacao?.trim() ?? "";
	if (cabecalho === "") return null;
	return PREFIXO_BEARER.exec(cabecalho)?.[1]?.trim() || null;
}
async function exigirCredencial(porta, contaId) {
	const resolucao = await porta.credencial(contaId, "voz", CHAVE_DO_PROVEDOR_DE_VOZ);
	if (resolucao.ok) return resolucao.valor;
	throw new RecusaDoPedido(resolucao.motivo === "plataforma_bloqueada" ? "voz_bloqueada" : "sem_credencial_de_voz");
}
function ehProposito(valor) {
	return PROPOSITOS.includes(valor);
}
function texto(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
function lerOrdinal(valor) {
	if (typeof valor === "number" && Number.isInteger(valor) && valor >= 1) return valor;
	if (typeof valor === "string" && /^[1-9][0-9]*$/.test(valor.trim())) return Number(valor.trim());
	return null;
}
function recusa(motivo) {
	return {
		status: STATUS[motivo],
		corpo: {
			ok: false,
			motivo,
			mensagem: MENSAGENS[motivo]
		}
	};
}
function recusaDaGuarda(decisao) {
	return {
		status: 409,
		corpo: {
			ok: false,
			motivo: decisao.motivo,
			mensagem: decisao.mensagem,
			alternativa: decisao.alternativa
		}
	};
}
//#endregion
//#region supabase/functions/call-place/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
const ENDERECO_DO_PROVEDOR_DE_VOZ = "https://api.elevenlabs.io/v1";
const LIMITE_DO_PROVEDOR_MS = 1e4;
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": `authorization, apikey, content-type, x-client-info, ${CABECALHO_INTERNO}`,
	"access-control-allow-methods": "POST, OPTIONS"
};
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const lerPlataforma = criarLeitorDaPlataforma(Deno.env.toObject());
const cofre = criarCofreDeCredenciais({
	porta: {
		async segredoDaConta(contaId, provedor, chave) {
			const { data, error } = await servico.rpc("get_account_secret", {
				p_account_id: contaId,
				p_provider: provedor,
				p_key_name: chave
			});
			if (error) throw new Error(error.message);
			return typeof data === "string" ? data : null;
		},
		async segredoDoRecurso() {
			return null;
		},
		segredoDaPlataforma(provedor, chave) {
			return lerPlataforma(provedor, chave);
		},
		async modoDeCredencial(contaId) {
			const { data, error } = await servico.from("accounts").select("credentials_mode").eq("id", contaId).maybeSingle();
			if (error) return "account";
			return data?.credentials_mode === "platform" ? "platform" : "account";
		}
	},
	ambiente: AMBIENTE
});
const UNICO_VIOLADO = "23505";
const porta = {
	async usuarioDaSessao(jwt) {
		const { data, error } = await servico.auth.getUser(jwt);
		if (error || !data.user) return null;
		return { id: data.user.id };
	},
	async papelNaConta(contaId, usuarioId) {
		const { data, error } = await servico.from("account_members").select("role").eq("account_id", contaId).eq("user_id", usuarioId).maybeSingle();
		if (error) throw new Error(error.message);
		return data?.role ?? null;
	},
	async contaDaDiscagem(contaId) {
		const { data, error } = await servico.from("accounts").select("id, timezone").eq("id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const conta = data;
		return {
			id: conta.id,
			timezone: conta.timezone ?? "America/Sao_Paulo"
		};
	},
	async leadDaConta(contaId, leadId) {
		const { data, error } = await servico.from("leads").select("id, phone_e164, name, company, city").eq("account_id", contaId).eq("id", leadId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const lead = data;
		return {
			id: lead.id,
			phone_e164: lead.phone_e164 ?? null,
			name: lead.name ?? null,
			company: lead.company ?? null,
			city: lead.city ?? null
		};
	},
	async identidadeDaConta(contaId) {
		const { data, error } = await servico.from("agents").select("name, company_name, first_message").eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const agente = data;
		return {
			nome: String(agente.name ?? ""),
			empresa: String(agente.company_name ?? ""),
			primeiraFala: agente.first_message ?? null
		};
	},
	async politicaDaConta(contaId) {
		const { data, error } = await servico.from("account_settings").select("recording_enabled, recording_notice_text").eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		const politica = data ?? {};
		return {
			gravacaoLigada: politica.recording_enabled !== false,
			avisoDeGravacao: politica.recording_notice_text ?? null
		};
	},
	async publicacaoDoProposito(contaId, proposito) {
		const { data, error } = await servico.from("agent_publications").select("id, provider_agent_id").eq("account_id", contaId).eq("purpose", proposito).eq("status", "publicado").maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const publicacao = data;
		if (!publicacao.provider_agent_id) return null;
		return {
			id: publicacao.id,
			provider_agent_id: publicacao.provider_agent_id
		};
	},
	async versaoPublicadaDoPlaybook(contaId, proposito) {
		const { data, error } = await servico.from("playbook_versions").select("id, playbooks!playbook_versions_do_playbook_da_conta!inner(purpose)").eq("account_id", contaId).eq("status", "published").eq("playbooks.purpose", proposito).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		return { id: data.id };
	},
	async ehNumeroDeTeste(contaId, telefoneE164) {
		const { data, error } = await servico.from("account_test_numbers").select("id").eq("account_id", contaId).eq("phone_e164", telefoneE164).limit(1);
		if (error) throw new Error(error.message);
		return (data ?? []).length > 0;
	},
	async linhaTelefonica(contaId, linhaId) {
		const { data, error } = await servico.from("phone_lines").select("id, e164, provider_voice_id").eq("account_id", contaId).eq("id", linhaId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const linha = data;
		return {
			id: linha.id,
			e164: linha.e164,
			provider_voice_id: linha.provider_voice_id ?? null
		};
	},
	async guardDial(chamada) {
		const { data, error } = await servico.rpc("guard_dial", chamada);
		if (error) throw new Error(error.message);
		const linha = Array.isArray(data) ? data[0] : data;
		if (!linha) throw new Error("guard_dial não devolveu linha");
		return {
			allowed: linha.allowed === true,
			reason: String(linha.reason ?? ""),
			dados: linha.dados ?? null,
			phone_line_id: linha.phone_line_id ?? null
		};
	},
	async gravarChamada(linha) {
		const { data, error } = await servico.from("calls").insert(linha).select("id, status, provider_call_sid").maybeSingle();
		if (!error && data) {
			const chamada = data;
			return {
				criada: true,
				chamada: {
					id: chamada.id,
					status: chamada.status,
					provider_call_sid: chamada.provider_call_sid ?? null
				}
			};
		}
		if (error?.code !== UNICO_VIOLADO) throw new Error(error?.message ?? "insert em calls falhou");
		const { data: existente, error: erroDaBusca } = await servico.from("calls").select("id, status, provider_call_sid").eq("account_id", linha.account_id).eq("idempotency_key", linha.idempotency_key).maybeSingle();
		if (erroDaBusca || !existente) throw new Error(erroDaBusca?.message ?? "chamada não encontrada");
		const chamada = existente;
		return {
			criada: false,
			chamada: {
				id: chamada.id,
				status: chamada.status,
				provider_call_sid: chamada.provider_call_sid ?? null
			}
		};
	},
	async registrarAuditoria(linha) {
		const { error } = await servico.from("audit_log").insert(linha);
		if (error) throw new Error(error.message);
	},
	credencial(contaId, provedor, chave) {
		return cofre.resolveSecret(contaId, provedor, chave);
	},
	dispararNoProvedor,
	async gravarDisparo(disparo) {
		const { error } = await servico.from("calls").update({
			provider_call_sid: disparo.providerCallSid,
			provider_conversation_id: disparo.providerConversationId,
			status: "ringing"
		}).eq("account_id", disparo.contaId).eq("id", disparo.chamadaId);
		if (error) throw new Error(error.message);
	},
	async registrarEventoDeIntegracao(evento) {
		const { error } = await servico.from("integration_events").insert(evento);
		if (error) throw new Error(error.message);
	}
};
async function dispararNoProvedor(pedido) {
	const endpoint = "convai/twilio/outbound-call";
	const inicio = Date.now();
	let resposta;
	try {
		resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
			method: "POST",
			headers: {
				"xi-api-key": pedido.credencialDeVoz,
				"content-type": "application/json"
			},
			body: JSON.stringify({
				agent_id: pedido.providerAgentId,
				agent_phone_number_id: pedido.providerPhoneNumberId,
				to_number: pedido.paraNumero,
				conversation_initiation_client_data: {
					dynamic_variables: pedido.variaveis,
					...pedido.primeiraFala ? { conversation_config_override: { agent: { first_message: pedido.primeiraFala } } } : {}
				}
			}),
			signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
		});
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - inicio,
			endpoint
		};
	}
	const corpo = await corpoJson(resposta);
	const latenciaMs = Date.now() - inicio;
	if (!resposta.ok) return {
		ok: false,
		codigo: codigoDoErro(corpo),
		status: resposta.status,
		latenciaMs,
		endpoint
	};
	return {
		ok: true,
		providerCallSid: typeof corpo.callSid === "string" ? corpo.callSid : null,
		providerConversationId: typeof corpo.conversation_id === "string" ? corpo.conversation_id : null,
		status: resposta.status,
		latenciaMs,
		corpo: { success: corpo.success === true },
		endpoint
	};
}
async function corpoJson(resposta) {
	try {
		return await resposta.json();
	} catch {
		return {};
	}
}
function codigoDoErro(corpo) {
	const detalhe = corpo.detail ?? corpo.error ?? corpo;
	const codigo = typeof detalhe === "string" ? detalhe : detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null;
	return codigo === null ? null : String(codigo);
}
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	let corpo = null;
	try {
		corpo = await requisicao.json();
	} catch {}
	const resposta = await colocarChamada({
		metodo: requisicao.method,
		contaId: corpo?.contaId ?? corpo?.conta_id ?? null,
		proposito: corpo?.proposito ?? corpo?.purpose ?? null,
		fonte: corpo?.fonte ?? corpo?.source ?? null,
		referencia: corpo?.referencia ?? corpo?.reference ?? null,
		ordinal: corpo?.ordinal ?? null,
		tentativa: corpo?.tentativa ?? corpo?.attempt ?? null,
		telefone: corpo?.telefone ?? corpo?.phone ?? null,
		leadId: corpo?.leadId ?? corpo?.lead_id ?? null,
		campanhaId: corpo?.campanhaId ?? corpo?.campaign_id ?? null,
		pular: corpo?.pular ?? corpo?.bypass ?? null,
		motivo: corpo?.motivo ?? corpo?.reason ?? null,
		autorizacao: requisicao.headers.get("authorization"),
		segredoInterno: requisicao.headers.get(CABECALHO_INTERNO)
	}, porta, {
		segredoInterno: await segredoInterno(),
		agora: new Date().toISOString()
	});
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
