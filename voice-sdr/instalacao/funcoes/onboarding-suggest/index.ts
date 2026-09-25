// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/onboarding-suggest/index.ts. Não edite à mão: rode `npm run pacote`.
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
const MENSAGENS = {
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
const STATUS = {
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
const LIMITES_DO_CONTEXTO = {
	empresa: {
		minimo: 2,
		maximo: 120
	},
	descricao: {
		minimo: 40,
		maximo: 2e3
	},
	bomCliente: {
		minimo: 0,
		maximo: 1e3
	}
};
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
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function atenderSugestao(pedido, porta) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const contaId = typeof pedido.contaId === "string" ? pedido.contaId.trim() : "";
	if (!contaId) return recusa("conta_ausente");
	const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? "")?.[1]?.trim();
	if (!jwt) return recusa("sem_sessao");
	const contexto = lerContexto(pedido.contexto);
	if (typeof contexto === "string") return recusa(contexto);
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sessao_invalida");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (!papel) return recusa("sem_acesso");
		if (!PAPEIS_QUE_CONFIGURAM.has(papel)) return recusa("papel_insuficiente");
		return await sugerir(contaId, contexto, porta);
	} catch {
		return recusa("falha_interna");
	}
}
function lerContexto(valor) {
	const dado = valor && typeof valor === "object" ? valor : {};
	const texto = (chave) => typeof dado[chave] === "string" ? dado[chave].trim() : "";
	const contexto = {
		empresa: texto("empresa"),
		descricao: texto("descricao"),
		bomCliente: texto("bomCliente")
	};
	for (const [chave, limite] of Object.entries(LIMITES_DO_CONTEXTO)) {
		const tamanho = contexto[chave].length;
		if (tamanho < limite.minimo) return "contexto_curto";
		if (tamanho > limite.maximo) return "contexto_longo";
	}
	return contexto;
}
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
function montarPedido(contexto, nomeDoAgente = null) {
	const mensagem = [
		`Empresa: ${contexto.empresa}`,
		`O que vende e para quem: ${contexto.descricao}`,
		contexto.bomCliente ? `O que faz alguém ser um bom cliente: ${contexto.bomCliente}` : ""
	].filter(Boolean).join("\n");
	return {
		sistema: sistemaDasSugestoes(nomeDoAgente),
		mensagem
	};
}
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
async function sugerir(contaId, contexto, porta) {
	const nome = nomeParaOPedido(await porta.nomeDoAgente(contaId));
	return await sugerirAPartirDe(contaId, montarPedido(contexto, nome), porta, {
		finalidade: "sugestoes_iniciais",
		caracteres_do_contexto: contexto.descricao.length + contexto.bomCliente.length
	}, nome);
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
	if (!resposta.ok || typeof resposta.texto !== "string") return recusa(resposta.codigo === "sem_credencial" ? "modelo_nao_conectado" : "modelo_indisponivel");
	if (!etapas || etapas.length === 0) return recusa("resposta_ilegivel");
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
//#region supabase/functions/onboarding-suggest/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const LIMITE_DO_MODELO_MS = 9e4;
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
	const resposta = await atenderSugestao({
		metodo: requisicao.method,
		autorizacao: requisicao.headers.get("authorization"),
		contaId: corpo?.account_id ?? null,
		contexto: corpo?.contexto ?? null
	}, porta);
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
