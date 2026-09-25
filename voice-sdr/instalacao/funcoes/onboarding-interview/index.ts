// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/onboarding-interview/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/_shared/marca.ts
const NOME_DO_PRODUTO = "Voice SDR";
//#endregion
//#region supabase/functions/_shared/modelo/openrouter.ts
const PROVEDOR = "openrouter";
const CHAVE_NO_COFRE = "api_key";
const URL_DA_CONVERSA = "https://openrouter.ai/api/v1/chat/completions";
function corpoDaConversa(pedido) {
	return {
		model: pedido.modelo,
		max_tokens: pedido.maxTokens,
		messages: [{
			role: "system",
			content: pedido.sistema
		}, {
			role: "user",
			content: pedido.mensagem
		}],
		response_format: {
			type: "json_schema",
			json_schema: {
				name: "resposta",
				strict: true,
				schema: pedido.esquema
			}
		}
	};
}
function cabecalhosDaConversa(chave, aplicacao) {
	const cabecalhos = {
		authorization: `Bearer ${chave}`,
		"content-type": "application/json"
	};
	if (aplicacao?.url) cabecalhos["http-referer"] = aplicacao.url;
	if (aplicacao?.nome) cabecalhos["x-title"] = aplicacao.nome;
	return cabecalhos;
}
function lerConversa(dado) {
	const vazia = {
		texto: null,
		tokensDeEntrada: null,
		tokensDeSaida: null,
		motivoDoFim: null,
		modelo: null
	};
	if (!dado || typeof dado !== "object" || Array.isArray(dado)) return vazia;
	const corpo = dado;
	const primeira = (Array.isArray(corpo.choices) ? corpo.choices : [])[0];
	const mensagem = primeira && typeof primeira === "object" ? primeira.message : null;
	const conteudo = mensagem && typeof mensagem === "object" ? mensagem.content : null;
	const uso = corpo.usage && typeof corpo.usage === "object" ? corpo.usage : {};
	return {
		texto: typeof conteudo === "string" && conteudo.trim() !== "" ? conteudo : null,
		tokensDeEntrada: numero(uso.prompt_tokens),
		tokensDeSaida: numero(uso.completion_tokens),
		motivoDoFim: primeira && typeof primeira === "object" ? textoOuNulo(primeira.finish_reason) : null,
		modelo: textoOuNulo(corpo.model)
	};
}
function numero(valor) {
	return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
function textoOuNulo(valor) {
	if (typeof valor !== "string") return null;
	const limpo = valor.trim();
	return limpo === "" ? null : limpo;
}
//#endregion
//#region supabase/functions/_shared/modelo/pergunta.ts
const ENDPOINT = "api/v1/chat/completions";
async function perguntarAoModelo(contaId, resolvido, pergunta, porta, aplicacao = {}, limiteMs = 12e4) {
	const endpoint = ENDPOINT;
	if (resolvido.porta !== "openrouter") return {
		ok: false,
		codigo: "sem_credencial",
		status: null,
		endpoint
	};
	const chave = await porta.chaveDoOpenRouter(contaId);
	if (!chave) return {
		ok: false,
		codigo: "sem_credencial",
		status: null,
		endpoint
	};
	const inicio = Date.now();
	try {
		const resposta = await fetch(URL_DA_CONVERSA, {
			method: "POST",
			headers: cabecalhosDaConversa(chave, aplicacao),
			body: JSON.stringify(corpoDaConversa({
				modelo: pergunta.modelo,
				sistema: pergunta.sistema,
				mensagem: pergunta.mensagem,
				esquema: pergunta.esquema,
				maxTokens: pergunta.maxTokens,
				aplicacao
			})),
			signal: AbortSignal.timeout(limiteMs)
		});
		let corpo = null;
		try {
			corpo = await resposta.json();
		} catch {}
		const lida = lerConversa(corpo);
		return {
			ok: resposta.ok && lida.texto !== null && lida.motivoDoFim !== "length",
			codigo: lida.motivoDoFim ?? (resposta.ok ? null : String(resposta.status)),
			status: resposta.status,
			latenciaMs: Date.now() - inicio,
			endpoint,
			texto: lida.texto,
			tokensDeEntrada: lida.tokensDeEntrada,
			tokensDeSaida: lida.tokensDeSaida
		};
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - inicio,
			endpoint
		};
	}
}
//#endregion
//#region supabase/functions/_shared/modelo/resolucao.ts
const MODELO_PADRAO_DE_MIDIA = "google/gemini-3.1-flash-lite";
const PORTAS = ["platform", "openrouter"];
const MODELOS_PADRAO = {
	platform: {
		draft: "claude-opus-5",
		classify: "claude-sonnet-5",
		review: "claude-opus-5",
		imagem: "gemini-3.1-flash-lite",
		audio: "gemini-3.1-flash-lite"
	},
	openrouter: {
		draft: "anthropic/claude-opus-5",
		classify: "anthropic/claude-sonnet-5",
		review: "anthropic/claude-opus-5",
		imagem: MODELO_PADRAO_DE_MIDIA,
		audio: MODELO_PADRAO_DE_MIDIA
	}
};
function lerPorta(valor) {
	return typeof valor === "string" && PORTAS.includes(valor) ? valor : "platform";
}
function modeloDaTarefa(escolha, tarefa) {
	const porta = lerPorta(escolha?.provider);
	const padrao = MODELOS_PADRAO[porta][tarefa];
	const escolhido = typeof escolha?.model === "string" ? escolha.model.trim() : "";
	if (escolhido === "" || !serveNaPorta(escolhido, porta)) return {
		porta,
		modelo: padrao,
		escolhidoPelaConta: false
	};
	return {
		porta,
		modelo: escolhido,
		escolhidoPelaConta: true
	};
}
function serveNaPorta(modelo, porta) {
	return porta === "openrouter" ? modelo.includes("/") : !modelo.includes("/");
}
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
//#region supabase/functions/_shared/voz/voz-na-conta.ts
const ENDERECO_DA_ELEVENLABS = "https://api.elevenlabs.io/v1";
const LIMITE_MS = 1e4;
async function garantirVozNaConta(pedido, buscar = fetch) {
	const cabecalhos = { "xi-api-key": pedido.chave };
	try {
		const naConta = await buscar(`${ENDERECO_DA_ELEVENLABS}/voices/${encodeURIComponent(pedido.vozId)}`, {
			headers: cabecalhos,
			signal: AbortSignal.timeout(LIMITE_MS)
		});
		if (naConta.ok) return {
			estado: "na_conta",
			vozId: pedido.vozId
		};
		if (naConta.status !== 400 && naConta.status !== 404) return { estado: "indisponivel" };
		const termo = pedido.nome?.trim() || pedido.vozId;
		const busca = new URLSearchParams({
			search: termo,
			page_size: "100"
		});
		const biblioteca = await buscar(`${ENDERECO_DA_ELEVENLABS}/shared-voices?${busca}`, {
			headers: cabecalhos,
			signal: AbortSignal.timeout(LIMITE_MS)
		});
		if (!biblioteca.ok) return { estado: "indisponivel" };
		const achada = (await biblioteca.json().catch(() => null))?.voices?.find((voz) => voz.voice_id === pedido.vozId);
		if (!achada || typeof achada.public_owner_id !== "string") return { estado: "fora_da_biblioteca" };
		const nome = typeof achada.name === "string" && achada.name.trim() ? achada.name : termo;
		const adicao = await buscar(`${ENDERECO_DA_ELEVENLABS}/voices/add/${encodeURIComponent(achada.public_owner_id)}/${encodeURIComponent(pedido.vozId)}`, {
			method: "POST",
			headers: {
				...cabecalhos,
				"content-type": "application/json"
			},
			body: JSON.stringify({ new_name: nome }),
			signal: AbortSignal.timeout(LIMITE_MS)
		});
		if (!adicao.ok) return { estado: "indisponivel" };
		const adicionada = await adicao.json().catch(() => null);
		return {
			estado: "adicionada",
			vozId: typeof adicionada?.voice_id === "string" ? adicionada.voice_id : pedido.vozId
		};
	} catch {
		return { estado: "indisponivel" };
	}
}
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
DESCRITOR_DA_QUALIFICACAO.nome;
Object.freeze({
	key: "qualificacao_registrada",
	rotulo: "Registrou a qualificação antes de encerrar",
	obrigatorio: true,
	como: "registro"
});
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
const MARCADORES_DA_PUBLICACAO = [
	"nome_do_agente",
	"empresa",
	"nunca_afirmar"
];
const MARCADORES_DA_CHAMADA = [
	"nome_do_lead",
	"empresa_do_lead",
	"cidade_do_lead",
	"nome_do_especialista"
];
const VARIAVEIS_DA_CHAMADA = [...MARCADORES_DA_CHAMADA, "contexto_do_lead"];
[
	"# Dados desta ligação",
	"Estes dados chegam no começo de cada ligação. Campo em branco é dado que a conta não tem: não invente, não pergunte só para preencher e nunca diga em voz alta o nome de um campo. Sem o nome de quem atende, fale sem nome.",
	"- Nome de quem atende: {nome_do_lead}",
	"- Empresa de quem atende: {empresa_do_lead}",
	"- Cidade: {cidade_do_lead}",
	"- O que se sabe do lead: {contexto_do_lead}"
].join("\n");
new Set(VARIAVEIS_DA_CHAMADA);
//#endregion
//#region supabase/functions/agent-publish/publicacao.ts
const CHAVE_DO_PROVEDOR_DE_VOZ = "api_key";
//#endregion
//#region supabase/functions/_shared/speech/entrevista.ts
const NOME_SEM_ESCOLHA = "Sarah";
function nomeNaEntrevista(nome) {
	const aparado = nome?.replace(/\s+/g, " ").trim().slice(0, 60) ?? "";
	return aparado === "" ? NOME_SEM_ESCOLHA : aparado;
}
function falasDaEntrevista(nome) {
	return {
		abertura: `Oi! Aqui é a ${nomeNaEntrevista(nome)}. Antes de eu começar a ligar pros seus leads, quero entender o seu negócio. São umas perguntas rápidas, uns três minutos. Pode ser?`,
		encerramento: "Pronto, já tenho o que preciso. Vou preparar as sugestões agora. Pode clicar em encerrar."
	};
}
falasDaEntrevista(null);
function assuntosDaEntrevista(nome) {
	return [
		"o nome da empresa, como o cliente a conhece",
		"o que a empresa vende e para quem",
		"o que você precisa descobrir na ligação para saber se o lead está pronto para a reunião",
		"as objeções mais comuns que o cliente levanta",
		"o que você nunca pode prometer, como preço fechado ou prazo",
		"como é a reunião com o especialista: duração, e se é por vídeo, telefone ou presencial",
		...(nome?.trim() ?? "") !== "" ? [] : ["se prefere que você se apresente com outro nome"]
	];
}
assuntosDaEntrevista(null);
function instrucaoDaEntrevista(nome) {
	const assuntos = assuntosDaEntrevista(nome);
	return [
		`Você é a ${nomeNaEntrevista(nome)}, uma assistente virtual com IA que vai trabalhar como SDR para esta empresa: ligar para leads, qualificar e marcar reunião com um especialista.`,
		"Agora você está conversando com a pessoa que está configurando você. O objetivo é entender o negócio para sugerir a sua configuração.",
		"Fale em português do Brasil, de um jeito simpático e direto. Faça uma pergunta por vez, espere a resposta e siga. Se a resposta vier vaga, peça um exemplo uma vez só e siga em frente.",
		"A pessoa pode responder falando ou digitando. Se ela ficar em silêncio, não cobre resposta: ela pode estar pensando ou escrevendo. Espere.",
		`Cubra estes assuntos, nesta ordem:\n${assuntos.map((assunto, indice) => `${indice + 1}. ${assunto}`).join("\n")}`,
		"Não ofereça nem combine horário de reunião: você ainda não tem acesso à agenda.",
		"A lista de leads é da empresa: ela entrega os contatos já escolhidos, e você só liga para eles. Não pergunte que tipo de empresa ou de pessoa evitar, como escolher para quem ligar, nem de onde vêm os contatos.",
		"Não invente nada sobre a empresa. Não dê opinião sobre o negócio. Não passe de cinco minutos.",
		`Quando tiver coberto os assuntos, faça um resumo de duas frases do que entendeu, pergunte se está certo e, confirmado, diga exatamente: "${falasDaEntrevista(nome).encerramento}"`
	].join("\n\n");
}
instrucaoDaEntrevista(null);
//#endregion
//#region supabase/functions/_shared/agente/primeira-fala.ts
const LEAD_DE_EXEMPLO = {
	nome_do_lead: "Marcos Ferreira",
	empresa_do_lead: "Fluxo Cargo",
	cidade_do_lead: "Joinville",
	nome_do_especialista: "Marina Alcântara"
};
const MARCADORES_DA_PRIMEIRA_FALA = [...new Set([
	...MARCADORES_DA_PUBLICACAO,
	...MARCADORES_DA_CHAMADA,
	...Object.keys(LEAD_DE_EXEMPLO)
])];
//#endregion
//#region supabase/functions/_shared/agente/rascunho-de-roteiro.ts
function palavra(expressao) {
	return new RegExp(`(?<![\\p{L}\\d])(?:${expressao})(?![\\p{L}\\d])`, "iu");
}
const PADROES_DE_PROMESSA_DE_HORARIO = [
	palavra("agend\\p{L}*"),
	palavra("(?:re)?marc(?:ar|amos|ado|ada|ados|adas|ação)"),
	palavra("\\d{1,2}\\s?h(?:\\d{2})?"),
	palavra("\\d{1,2}:\\d{2}"),
	palavra("amanhã|depois de amanhã|segunda-feira|terça(?:-feira)?|quarta-feira|quinta-feira|sexta(?:-feira)?|sábado|domingo"),
	palavra("convite"),
	palavra("horários?\\s+(?:disponíve\\p{L}*|livres?|aqui)"),
	palavra("opç(?:ão|ões)\\s+de\\s+(?:dia|data|horário)"),
	/\{opcao_[a-z_]+\}/i,
	/(?<![\p{L}\d])deix(?:ar|o|amos|ei)(?![\p{L}\d])[^.!?\n]{0,30}(?<![\p{L}\d])combinad[oa]s?(?![\p{L}\d])/iu
];
function trechoQuePrometeHorario(texto) {
	for (const padrao of PADROES_DE_PROMESSA_DE_HORARIO) {
		const achado = padrao.exec(texto);
		if (achado) return achado[0];
	}
	return null;
}
function prometeHorario(texto) {
	return trechoQuePrometeHorario(texto) !== null;
}
//#endregion
//#region supabase/functions/onboarding-suggest/respostas.ts
const MENSAGENS$1 = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido veio sem a conta.",
	contexto_curto: "Conte um pouco mais do negócio: o que vende, para quem e o que faz alguém ser um bom cliente.",
	contexto_longo: "O texto passou do tamanho aceito. Resuma e peça de novo.",
	sem_sessao: "Entre na sua conta para pedir as sugestões.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para pedir as sugestões.",
	sem_acesso: "Você não tem acesso a esta conta.",
	papel_insuficiente: "Configurar a assistente é tarefa de quem administra a conta. Peça a quem administra.",
	modelo_nao_conectado: "Conecte o provedor de modelo no primeiro passo. É ele que escreve as sugestões.",
	modelo_indisponivel: "As sugestões não puderam ser escritas agora. Tente de novo em alguns minutos.",
	resposta_ilegivel: "As sugestões voltaram fora do formato esperado. Peça de novo.",
	falha_interna: "Não foi possível escrever as sugestões agora. Tente de novo em alguns minutos."
};
const STATUS$1 = {
	metodo_invalido: 405,
	conta_ausente: 400,
	contexto_curto: 400,
	contexto_longo: 400,
	sem_sessao: 401,
	sessao_invalida: 401,
	sem_acesso: 403,
	papel_insuficiente: 403,
	modelo_nao_conectado: 428,
	modelo_indisponivel: 503,
	resposta_ilegivel: 502,
	falha_interna: 500
};
//#endregion
//#region supabase/functions/onboarding-suggest/sugestoes.ts
const PROVEDOR_DO_MODELO = "modelo";
const PAPEIS_QUE_CONFIGURAM = new Set(["owner", "admin"]);
const CAMPOS_DAS_ETAPAS = {
	identidade: [
		"empresa",
		"nome_do_agente",
		"oferta",
		"primeira_fala",
		"nunca_afirmar"
	],
	roteiro: ["roteiro_de_descoberta"],
	especialista: ["modalidade", "duracao_em_minutos"],
	leads: ["perfil_do_lead"]
};
const ETAPAS = Object.keys(CAMPOS_DAS_ETAPAS);
const TETO_DO_VALOR = { roteiro_de_descoberta: 6e3 };
const TETO_PADRAO = 600;
const TETO_DA_PERGUNTA = 240;
const PERGUNTAS_POR_ETAPA = 4;
const ESQUEMA_DAS_SUGESTOES = {
	type: "object",
	additionalProperties: false,
	required: ["etapas"],
	properties: { etapas: {
		type: "array",
		items: {
			type: "object",
			additionalProperties: false,
			required: [
				"etapa",
				"campos",
				"perguntas"
			],
			properties: {
				etapa: {
					type: "string",
					enum: ETAPAS
				},
				campos: {
					type: "array",
					items: {
						type: "object",
						additionalProperties: false,
						required: [
							"campo",
							"valor",
							"porque"
						],
						properties: {
							campo: { type: "string" },
							valor: { type: "string" },
							porque: { type: "string" }
						}
					}
				},
				perguntas: {
					type: "array",
					items: {
						type: "object",
						additionalProperties: false,
						required: ["pergunta", "exemplo"],
						properties: {
							pergunta: { type: "string" },
							exemplo: { type: "string" }
						}
					}
				}
			}
		}
	} }
};
function nomeParaOPedido(nome) {
	const limpo = nome?.replace(/\s+/g, " ").trim().slice(0, 60) ?? "";
	return limpo === "" ? null : limpo;
}
function camposPedidos(etapa, nomeDoAgente) {
	const campos = CAMPOS_DAS_ETAPAS[etapa];
	return nomeParaOPedido(nomeDoAgente) ? campos.filter((campo) => campo !== "nome_do_agente") : campos;
}
function sistemaDasSugestoes(nomeDoAgente = null) {
	const nome = nomeParaOPedido(nomeDoAgente);
	const campos = ETAPAS.map((etapa) => `- ${etapa}: ${camposPedidos(etapa, nome).join(", ")}`).join("\n");
	return [
		nome ? `Você ajuda a configurar a assistente virtual com IA que liga para leads, qualifica e marca reunião com um especialista humano. O nome dela já foi escolhido pela empresa: ${nome}. Não sugira outro nome.` : "Você ajuda a configurar a assistente virtual com IA que liga para leads, qualifica e marca reunião com um especialista humano.",
		"Escreva em português do Brasil, com acentuação correta.",
		"Para cada etapa abaixo, sugira o valor de cada campo e escreva de duas a quatro perguntas curtas que a pessoa precisa responder para a etapa ficar boa, cada uma com um exemplo de resposta.",
		`Etapas e campos:\n${campos}`,
		`Na primeira_fala, a assistente se apresenta como assistente virtual da empresa e pode usar só estes marcadores entre chaves: ${MARCADORES_DA_PRIMEIRA_FALA.map((m) => `{${m}}`).join(", ")}. O nome dela entra por {nome_do_agente}, nunca escrito por extenso.`,
		"O roteiro_de_descoberta é o que a assistente segue na ligação: perguntas de qualificação em ordem, como tratar objeções comuns e quando encerrar. Ele não pode oferecer nem combinar horário de reunião: a assistente ainda não tem acesso à agenda.",
		"empresa é o nome da empresa como o cliente a conhece, e é obrigatório: se ninguém disse, use o nome que aparecer no texto e transforme a dúvida numa pergunta.",
		"nunca_afirmar lista, separado por vírgula, o que a assistente não pode prometer.",
		"Em cada campo, porque diz em uma frase por que aquele valor serve a este negócio.",
		"Não invente fato sobre a empresa que o texto não diga; quando faltar informação, transforme a lacuna numa pergunta.",
		"A lista de leads é entregue pela empresa, já escolhida: a assistente não seleciona nem filtra contatos. Nenhuma pergunta pode ser sobre que tipo de empresa ou de pessoa evitar, como escolher para quem ligar ou de onde vêm os contatos. Em leads, pergunte só o que ajuda a assistente a conversar com eles, como o cargo de quem atende ou o momento em que o contato chega."
	].join("\n\n");
}
async function sugerirAPartirDe(contaId, texto, porta, resumo, nomeDoAgente = null) {
	const resolvido = await porta.modeloDaConta(contaId);
	const pedido = {
		modelo: resolvido.modelo,
		porta: resolvido.porta,
		contaId,
		...texto,
		esquema: ESQUEMA_DAS_SUGESTOES
	};
	const resposta = await porta.perguntarAoModelo(pedido);
	const lidas = resposta.ok && typeof resposta.texto === "string" ? lerSugestoes(resposta.texto) : null;
	const etapas = lidas && nomeParaOPedido(nomeDoAgente) ? semNomeDoAgente(lidas) : lidas;
	const registrado = await rastrear(porta, {
		account_id: contaId,
		direction: "outbound",
		provider: PROVEDOR_DO_MODELO,
		endpoint: resposta.endpoint ?? "v1/messages",
		request: {
			model: pedido.modelo,
			porta: resolvido.porta,
			modelo_da_conta: resolvido.escolhidoPelaConta,
			...resumo,
			prompt: pedido.mensagem
		},
		response: {
			ok: resposta.ok,
			entrada: resposta.tokensDeEntrada ?? null,
			saida: resposta.tokensDeSaida ?? null,
			etapas: etapas?.length ?? null
		},
		status_code: resposta.status ?? null,
		latency_ms: resposta.latenciaMs ?? null,
		correlation_id: null
	});
	if (!resposta.ok || typeof resposta.texto !== "string") return recusa$1(resposta.codigo === "sem_credencial" ? "modelo_nao_conectado" : "modelo_indisponivel");
	if (!etapas || etapas.length === 0) return recusa$1("resposta_ilegivel");
	return {
		status: 200,
		corpo: {
			ok: true,
			etapas,
			semRegistro: !registrado
		}
	};
}
function lerSugestoes(texto) {
	let dado;
	try {
		dado = JSON.parse(texto);
	} catch {
		return null;
	}
	const lista = dado?.etapas;
	if (!Array.isArray(lista)) return null;
	const porEtapa = new Map();
	for (const item of lista) {
		const lida = lerEtapa(item);
		if (lida && !porEtapa.has(lida.etapa)) porEtapa.set(lida.etapa, lida);
	}
	return ETAPAS.flatMap((etapa) => porEtapa.get(etapa) ?? []);
}
function lerEtapa(item) {
	if (!item || typeof item !== "object") return null;
	const { etapa, campos, perguntas } = item;
	if (typeof etapa !== "string" || !(etapa in CAMPOS_DAS_ETAPAS)) return null;
	const chave = etapa;
	const aceitos = CAMPOS_DAS_ETAPAS[chave];
	const camposLidos = [];
	for (const campo of Array.isArray(campos) ? campos : []) {
		const lido = lerCampo(campo, aceitos);
		if (lido && !camposLidos.some((outro) => outro.campo === lido.campo)) camposLidos.push(lido);
	}
	const perguntasLidas = [];
	for (const pergunta of Array.isArray(perguntas) ? perguntas : []) {
		if (perguntasLidas.length === PERGUNTAS_POR_ETAPA) break;
		const lida = lerPergunta(pergunta);
		if (lida) perguntasLidas.push(lida);
	}
	if (camposLidos.length === 0 && perguntasLidas.length === 0) return null;
	return {
		etapa: chave,
		campos: camposLidos,
		perguntas: perguntasLidas
	};
}
function lerCampo(item, aceitos) {
	if (!item || typeof item !== "object") return null;
	const { campo, valor, porque } = item;
	if (typeof campo !== "string" || !aceitos.includes(campo)) return null;
	if (typeof valor !== "string") return null;
	const limpo = valor.trim();
	if (limpo === "" || limpo.length > (TETO_DO_VALOR[campo] ?? TETO_PADRAO)) return null;
	if (campo === "primeira_fala" && !marcadoresConhecidos(limpo)) return null;
	if (campo === "roteiro_de_descoberta" && prometeHorario(limpo)) return null;
	return {
		campo,
		valor: limpo,
		porque: typeof porque === "string" ? porque.trim().slice(0, TETO_PADRAO) : ""
	};
}
function lerPergunta(item) {
	if (!item || typeof item !== "object") return null;
	const { pergunta, exemplo } = item;
	if (typeof pergunta !== "string") return null;
	const limpa = pergunta.trim();
	if (limpa === "" || limpa.length > TETO_DA_PERGUNTA) return null;
	return {
		pergunta: limpa,
		exemplo: typeof exemplo === "string" ? exemplo.trim().slice(0, TETO_DA_PERGUNTA) : ""
	};
}
function semNomeDoAgente(etapas) {
	return etapas.flatMap((etapa) => {
		const campos = etapa.campos.filter((campo) => campo.campo !== "nome_do_agente");
		return campos.length === 0 && etapa.perguntas.length === 0 ? [] : [{
			...etapa,
			campos
		}];
	});
}
function marcadoresConhecidos(texto) {
	return [...texto.matchAll(/\{([^{}]*)\}/g)].every((casada) => MARCADORES_DA_PRIMEIRA_FALA.includes(casada[1] ?? ""));
}
async function rastrear(porta, evento) {
	try {
		await porta.registrarEventoDeIntegracao(evento);
		return true;
	} catch {
		return false;
	}
}
function recusa$1(motivo) {
	return {
		status: STATUS$1[motivo],
		corpo: {
			ok: false,
			motivo,
			mensagem: MENSAGENS$1[motivo]
		}
	};
}
//#endregion
//#region supabase/functions/onboarding-interview/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido veio sem a conta.",
	acao_invalida: "Ação desconhecida. Use abrir ou encerrar.",
	conversa_ausente: "O pedido veio sem a conversa.",
	agente_ausente: "O pedido veio sem o agente da entrevista.",
	sem_sessao: "Entre na sua conta para conversar com a assistente.",
	sessao_invalida: "Sua sessão expirou. Entre de novo.",
	sem_acesso: "Você não tem acesso a esta conta.",
	papel_insuficiente: "Configurar a assistente é tarefa de quem administra a conta. Peça a quem administra.",
	voz_nao_conectada: "Conecte a ElevenLabs no passo da voz. É por ela que a assistente fala.",
	voz_indisponivel: "A ElevenLabs não respondeu agora. Tente de novo em alguns minutos.",
	voz_fora_da_conta: "A voz escolhida não está na sua conta da ElevenLabs e não foi possível adicioná-la. Volte ao passo da voz e escolha outra.",
	transcricao_pendente: "A conversa ainda está sendo processada pela ElevenLabs. Tente de novo em alguns segundos.",
	conversa_curta: "A conversa foi curta demais para sugerir alguma coisa. Converse mais um pouco ou escreva o negócio.",
	falha_interna: "Não foi possível concluir agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_invalido: 405,
	conta_ausente: 400,
	acao_invalida: 400,
	conversa_ausente: 400,
	agente_ausente: 400,
	sem_sessao: 401,
	sessao_invalida: 401,
	sem_acesso: 403,
	papel_insuficiente: 403,
	voz_nao_conectada: 428,
	voz_indisponivel: 503,
	voz_fora_da_conta: 409,
	transcricao_pendente: 409,
	conversa_curta: 422,
	falha_interna: 500
};
//#endregion
//#region supabase/functions/onboarding-interview/entrevista.ts
const ACOES = ["abrir", "encerrar"];
const NOME_DO_AGENTE_DA_ENTREVISTA = `${NOME_DO_PRODUTO} · entrevista de configuração`;
const ESPERA_ENTRE_TENTATIVAS_MS = 2500;
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function atenderEntrevista(pedido, porta) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const contaId = typeof pedido.contaId === "string" ? pedido.contaId.trim() : "";
	if (!contaId) return recusa("conta_ausente");
	const acao = typeof pedido.acao === "string" && ACOES.includes(pedido.acao) ? pedido.acao : null;
	if (!acao) return recusa("acao_invalida");
	const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? "")?.[1]?.trim();
	if (!jwt) return recusa("sem_sessao");
	const agenteId = typeof pedido.agenteId === "string" ? pedido.agenteId.trim() : "";
	const conversaId = typeof pedido.conversaId === "string" ? pedido.conversaId.trim() : "";
	if (acao === "encerrar" && !agenteId) return recusa("agente_ausente");
	if (acao === "encerrar" && !conversaId) return recusa("conversa_ausente");
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sessao_invalida");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (!papel) return recusa("sem_acesso");
		if (!PAPEIS_QUE_CONFIGURAM.has(papel)) return recusa("papel_insuficiente");
		const vozId = typeof pedido.vozId === "string" && FORMA_DO_ID_DE_VOZ.test(pedido.vozId) ? pedido.vozId : null;
		const vozNome = typeof pedido.vozNome === "string" ? pedido.vozNome.trim().slice(0, 120) || null : null;
		return acao === "abrir" ? await abrir(contaId, porta, vozId, vozNome) : await encerrar(contaId, agenteId, conversaId, porta);
	} catch {
		return recusa("falha_interna");
	}
}
const FORMA_DO_ID_DE_VOZ = /^[A-Za-z0-9]{10,40}$/;
function agenteDaEntrevista(vozId = null, nomeDaAssistente = null) {
	return {
		vozId,
		nome: NOME_DO_AGENTE_DA_ENTREVISTA,
		primeiraFala: falasDaEntrevista(nomeDaAssistente).abertura,
		instrucao: instrucaoDaEntrevista(nomeDaAssistente),
		duracaoMaximaSeg: 480,
		esperaPorRespostaSeg: 25
	};
}
async function abrir(contaId, porta, escolhida, vozNome) {
	let vozId = escolhida;
	if (escolhida) {
		const voz = await porta.garantirVoz(contaId, escolhida, vozNome);
		if (voz?.estado === "fora_da_biblioteca") return recusa("voz_fora_da_conta");
		if (voz?.estado === "indisponivel") return recusa("voz_indisponivel");
		if (voz?.estado === "na_conta" || voz?.estado === "adicionada") vozId = voz.vozId;
	}
	const nome = await lerNome(porta, contaId);
	const criado = await porta.criarAgente(contaId, agenteDaEntrevista(vozId, nome));
	if (!criado.ok) return recusa(criado.semCredencial ? "voz_nao_conectada" : "voz_indisponivel");
	const sessao = await porta.pedirSessaoAssinada(contaId, criado.valor);
	if (!sessao.ok) {
		await apagarSemFalhar(porta, contaId, criado.valor);
		return recusa(sessao.semCredencial ? "voz_nao_conectada" : "voz_indisponivel");
	}
	return {
		status: 201,
		corpo: {
			ok: true,
			agenteId: criado.valor,
			urlAssinada: sessao.valor
		}
	};
}
async function encerrar(contaId, agenteId, conversaId, porta) {
	let conversa = null;
	for (let tentativa = 0; tentativa < 4; tentativa += 1) {
		if (tentativa > 0) await porta.esperar(ESPERA_ENTRE_TENTATIVAS_MS);
		conversa = await porta.lerConversa(contaId, conversaId);
		if (conversa?.pronta) break;
	}
	if (!conversa) return recusa("voz_indisponivel");
	if (!conversa.pronta) return recusa("transcricao_pendente");
	const conduzidaPor = conversa.agenteId?.trim();
	if (conduzidaPor && conduzidaPor !== agenteId) return recusa("conversa_ausente");
	await apagarSemFalhar(porta, contaId, agenteId);
	if (conversa.turnos.filter((turno) => turno.quem === "lead").length < 2) return recusa("conversa_curta");
	const nome = await lerNome(porta, contaId);
	return await sugerirAPartirDe(contaId, montarPedidoDaEntrevista(conversa.turnos, nome), porta, {
		finalidade: "sugestoes_da_entrevista",
		turnos: conversa.turnos.length
	}, nome);
}
async function lerNome(porta, contaId) {
	try {
		const nome = (await porta.nomeDoAgente(contaId))?.trim() ?? "";
		return nome === "" ? null : nome;
	} catch {
		return null;
	}
}
function montarPedidoDaEntrevista(turnos, nomeDaAssistente = null) {
	const quemFala = nomeNaEntrevista(nomeDaAssistente);
	const conversa = turnos.map((turno) => `${turno.quem === "agent" ? quemFala : "Cliente"}: ${turno.texto}`).join("\n");
	return {
		sistema: `${sistemaDasSugestoes(nomeDaAssistente)}\n\nO contexto vem de uma conversa entre a assistente (${quemFala}) e a pessoa que configura a conta. Use só o que o Cliente disse.`,
		mensagem: `Conversa de configuração:\n${conversa}`
	};
}
async function apagarSemFalhar(porta, contaId, agenteId) {
	try {
		await porta.apagarAgente(contaId, agenteId);
	} catch {}
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
//#endregion
//#region supabase/functions/onboarding-interview/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const ENDERECO_DO_PROVEDOR = "https://api.elevenlabs.io/v1/convai";
const LIMITE_DO_PROVEDOR_MS = 2e4;
const LIMITE_DO_MODELO_MS = 9e4;
const IDIOMA = "pt";
const MODELO_DE_VOZ = "eleven_flash_v2_5";
const VOZ_PADRAO = "EXAVITQu4vr4xnSDxMaL";
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
	"access-control-allow-methods": "POST, OPTIONS"
};
const TAREFA = "draft";
const TETO_DE_SAIDA = 8e3;
const APLICACAO = {
	url: Deno.env.get("SARAH_URL_PUBLICA") ?? void 0,
	nome: NOME_DO_PRODUTO
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
async function chaveDaVoz(contaId) {
	const resolvida = await cofre.resolveSecret(contaId, "voz", CHAVE_DO_PROVEDOR_DE_VOZ);
	return resolvida.ok ? resolvida.valor : null;
}
async function vozDaConta(contaId) {
	const { data } = await servico.from("agents").select("voice_id").eq("account_id", contaId).maybeSingle();
	const escolhida = data?.voice_id;
	return typeof escolhida === "string" && escolhida.trim() !== "" ? escolhida : VOZ_PADRAO;
}
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
	async modeloDaConta(contaId) {
		const { data, error } = await servico.rpc("resolver_modelo_da_conta", {
			p_account_id: contaId,
			p_tarefa: TAREFA
		});
		if (error) throw new Error(error.message);
		return modeloDaTarefa((data ?? [])[0] ?? null, TAREFA);
	},
	async perguntarAoModelo(pedido) {
		return await perguntarAoModelo(pedido.contaId ?? "", {
			porta: pedido.porta === "openrouter" ? "openrouter" : "platform",
			modelo: pedido.modelo,
			escolhidoPelaConta: false
		}, {
			...pedido,
			maxTokens: TETO_DE_SAIDA
		}, { async chaveDoOpenRouter(contaId) {
			const { data, error } = await servico.rpc("get_account_secret", {
				p_account_id: contaId,
				p_provider: PROVEDOR,
				p_key_name: CHAVE_NO_COFRE
			});
			if (error) throw new Error(error.message);
			return typeof data === "string" && data.trim() !== "" ? data : null;
		} }, APLICACAO, LIMITE_DO_MODELO_MS);
	},
	async registrarEventoDeIntegracao(evento) {
		const { error } = await servico.from("integration_events").insert(evento);
		if (error) throw new Error(error.message);
	},
	async nomeDoAgente(contaId) {
		const { data, error } = await servico.from("agents").select("name").eq("account_id", contaId).maybeSingle();
		if (error) return null;
		const nome = data?.name;
		return typeof nome === "string" && nome.trim() !== "" ? nome : null;
	},
	async garantirVoz(contaId, vozId, nome) {
		const chave = await chaveDaVoz(contaId);
		if (!chave) return null;
		return garantirVozNaConta({
			chave,
			vozId,
			nome
		});
	},
	async criarAgente(contaId, agente) {
		const chave = await chaveDaVoz(contaId);
		if (!chave) return {
			ok: false,
			semCredencial: true
		};
		try {
			const resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/agents/create`, {
				method: "POST",
				headers: {
					"xi-api-key": chave,
					"content-type": "application/json"
				},
				body: JSON.stringify({
					name: agente.nome,
					conversation_config: {
						agent: {
							language: IDIOMA,
							first_message: agente.primeiraFala,
							prompt: { prompt: agente.instrucao }
						},
						tts: {
							voice_id: agente.vozId ?? await vozDaConta(contaId),
							model_id: MODELO_DE_VOZ
						},
						conversation: { max_duration_seconds: agente.duracaoMaximaSeg },
						turn: { turn_timeout: agente.esperaPorRespostaSeg }
					}
				}),
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			const corpo = await resposta.json().catch(() => null);
			if (!resposta.ok || typeof corpo?.agent_id !== "string") return {
				ok: false,
				semCredencial: resposta.status === 401
			};
			return {
				ok: true,
				valor: corpo.agent_id
			};
		} catch {
			return {
				ok: false,
				semCredencial: false
			};
		}
	},
	async pedirSessaoAssinada(contaId, agenteId) {
		const chave = await chaveDaVoz(contaId);
		if (!chave) return {
			ok: false,
			semCredencial: true
		};
		try {
			const resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/conversation/get_signed_url?agent_id=${encodeURIComponent(agenteId)}`, {
				headers: { "xi-api-key": chave },
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			const corpo = await resposta.json().catch(() => null);
			if (!resposta.ok || typeof corpo?.signed_url !== "string") return {
				ok: false,
				semCredencial: resposta.status === 401
			};
			return {
				ok: true,
				valor: corpo.signed_url
			};
		} catch {
			return {
				ok: false,
				semCredencial: false
			};
		}
	},
	async lerConversa(contaId, conversaId) {
		const chave = await chaveDaVoz(contaId);
		if (!chave) return null;
		try {
			const resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/conversations/${encodeURIComponent(conversaId)}`, {
				headers: { "xi-api-key": chave },
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			if (!resposta.ok) return null;
			const corpo = await resposta.json();
			if (corpo.status !== "done" && corpo.status !== "failed") return { pronta: false };
			const turnos = [];
			for (const item of Array.isArray(corpo.transcript) ? corpo.transcript : []) {
				if (!item || typeof item !== "object") continue;
				const { role, message } = item;
				if (typeof message !== "string" || message.trim() === "") continue;
				turnos.push({
					quem: role === "agent" ? "agent" : "lead",
					texto: message.trim()
				});
			}
			return {
				pronta: true,
				turnos,
				agenteId: typeof corpo.agent_id === "string" ? corpo.agent_id : null
			};
		} catch {
			return null;
		}
	},
	async apagarAgente(contaId, agenteId) {
		const chave = await chaveDaVoz(contaId);
		if (!chave) return;
		await fetch(`${ENDERECO_DO_PROVEDOR}/agents/${encodeURIComponent(agenteId)}`, {
			method: "DELETE",
			headers: { "xi-api-key": chave },
			signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
		});
	},
	esperar(ms) {
		return new Promise((resolver) => setTimeout(resolver, ms));
	}
};
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	let corpo = null;
	try {
		corpo = await requisicao.json();
	} catch {}
	const resposta = await atenderEntrevista({
		metodo: requisicao.method,
		autorizacao: requisicao.headers.get("authorization"),
		contaId: corpo?.account_id ?? null,
		acao: corpo?.action ?? null,
		agenteId: corpo?.agent_id ?? null,
		conversaId: corpo?.conversation_id ?? null,
		vozId: corpo?.voice_id ?? null,
		vozNome: corpo?.voice_name ?? null
	}, porta);
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
