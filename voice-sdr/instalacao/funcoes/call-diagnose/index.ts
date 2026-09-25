// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/call-diagnose/index.ts. Não edite à mão: rode `npm run pacote`.
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
		tokensDeEntrada: numero$1(uso.prompt_tokens),
		tokensDeSaida: numero$1(uso.completion_tokens),
		motivoDoFim: primeira && typeof primeira === "object" ? textoOuNulo(primeira.finish_reason) : null,
		modelo: textoOuNulo(corpo.model)
	};
}
function numero$1(valor) {
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
		const pedido = normalizar$1(contaId, provedor, chave);
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
		const pedido = normalizar$1(contaId, provedor, chave);
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
function normalizar$1(contaId, provedor, chave) {
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
//#region supabase/functions/_shared/playbook/camada-um.ts
const PROPOSITOS = [
	"discovery",
	"reminder",
	"rescue",
	"followup"
];
const FERRAMENTA_DE_AGENDA = "tool-availability";
FALAS_DE_TODO_PROPOSITO.avisoDeGravacao, [...FALAS_DE_TODO_PROPOSITO.recusaDeAfirmar], [...FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe], [...FALAS_DAS_REGRAS_TRAVADAS.pedidoDeHumano], [...FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada];
[...FALAS_DA_QUALIFICACAO.antesDeEncerrar];
[...FALAS_DE_DESCOBERTA.fechamento.sem_agenda], [...FALAS_DE_DESCOBERTA.fechamento.com_agenda];
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
}
//#endregion
//#region supabase/functions/call-diagnose/formato-do-provedor.ts
function caminhoDaConversa(conversaId) {
	return `convai/conversations/${encodeURIComponent(conversaId)}`;
}
function caminhoDoAgente(agenteId) {
	return `convai/agents/${encodeURIComponent(agenteId)}`;
}
const CAMINHO_DA_CONFIGURACAO_DAS_CONVERSAS = "convai/settings";
function lerConversaDoProvedor(corpo) {
	const raiz = objeto(corpo);
	if (!raiz) return null;
	const metadados = objeto(raiz.metadata) ?? {};
	const turnosCrus = Array.isArray(raiz.transcript) ? raiz.transcript : [];
	const resultados = lerResultados(turnosCrus);
	const turnos = [];
	const invocacoes = [];
	for (const cru of turnosCrus) {
		const turno = objeto(cru);
		if (!turno) continue;
		const segundo = numero(turno.time_in_call_secs) ?? 0;
		const quem = turno.role === "agent" ? "agent" : turno.role === "user" ? "lead" : null;
		const fala = texto$1(turno.message);
		if (quem && fala) turnos.push({
			quem,
			texto: fala,
			segundo
		});
		const chamadas = Array.isArray(turno.tool_calls) ? turno.tool_calls : [];
		for (const chamadaCrua of chamadas) {
			const chamada = objeto(chamadaCrua);
			const nome = texto$1(chamada?.tool_name);
			if (!chamada || !nome) continue;
			const pedido = texto$1(chamada.request_id);
			const resultado = (pedido ? resultados.porPedido.get(pedido) : void 0) ?? resultados.porNome.get(nome);
			invocacoes.push({
				nome,
				segundo,
				parametros: lerParametros(chamada.params_as_json),
				resultado: resultado?.texto ?? null,
				comErro: resultado?.comErro ?? false,
				semResultado: resultado === void 0
			});
		}
	}
	const erroCru = objeto(metadados.error);
	const erro = erroCru && (erroCru.code !== void 0 || erroCru.reason !== void 0) ? {
		codigo: textoOuNumero(erroCru.code),
		razao: texto$1(erroCru.reason)
	} : null;
	const telefoneCru = objeto(metadados.phone_call);
	const inicio = objeto(raiz.conversation_initiation_client_data);
	const sobreposicao = objeto(objeto(inicio?.conversation_config_override)?.agent);
	const analise = objeto(raiz.analysis);
	return {
		status: texto$1(raiz.status),
		agenteId: texto$1(raiz.agent_id),
		turnos,
		invocacoes,
		motivoDoFim: texto$1(metadados.termination_reason),
		erro: erro && (erro.codigo !== null || erro.razao !== null) ? erro : null,
		duracaoSeg: numero(metadados.call_duration_secs),
		telefone: telefoneCru ? {
			direcao: texto$1(telefoneCru.direction),
			numeroExterno: texto$1(telefoneCru.external_number),
			callSid: texto$1(telefoneCru.call_sid)
		} : null,
		variaveis: inicio ? textosDoObjeto(inicio.dynamic_variables) : null,
		primeiraFalaSobreposta: texto$1(sobreposicao?.first_message),
		sucessoSegundoOProvedor: texto$1(analise?.call_successful),
		resumoDoProvedor: texto$1(analise?.transcript_summary)
	};
}
function lerAgenteDoProvedor(corpo) {
	const raiz = objeto(corpo);
	if (!raiz) return null;
	const conversa = objeto(raiz.conversation_config) ?? {};
	const agente = objeto(conversa.agent) ?? {};
	const prompt = objeto(agente.prompt) ?? {};
	const tts = objeto(conversa.tts) ?? {};
	const turno = objeto(conversa.turn) ?? {};
	const duracao = objeto(conversa.conversation) ?? {};
	const variaveis = objeto(agente.dynamic_variables) ?? {};
	const sobreposicoes = objeto((objeto(raiz.platform_settings) ?? {}).overrides);
	const sobreposicaoDoAgente = objeto(objeto(sobreposicoes?.conversation_config_override)?.agent);
	const nomes = new Set();
	if (Array.isArray(prompt.tools)) for (const item of prompt.tools) {
		const nome = texto$1(objeto(item)?.name);
		if (nome) nomes.add(nome);
	}
	const embutidas = objeto(prompt.built_in_tools);
	if (embutidas) for (const [chave, valor] of Object.entries(embutidas)) {
		if (valor === null || valor === void 0 || valor === false) continue;
		nomes.add(texto$1(objeto(valor)?.name) ?? chave);
	}
	const referencias = Array.isArray(prompt.tool_ids) ? prompt.tool_ids.filter((id) => texto$1(id)).length : 0;
	return {
		nome: texto$1(raiz.name),
		primeiraFala: texto$1(agente.first_message),
		prompt: texto$1(prompt.prompt),
		llm: texto$1(prompt.llm),
		idioma: texto$1(agente.language),
		vozId: texto$1(tts.voice_id),
		modeloDeVoz: texto$1(tts.model_id),
		ajustesDeVoz: lerAjustesDaVoz(tts),
		tempoDeTurnoSeg: numero(turno.turn_timeout),
		silencioParaEncerrarSeg: numero(turno.silence_end_call_timeout),
		duracaoMaximaSeg: numero(duracao.max_duration_seconds),
		ferramentas: [...nomes],
		ferramentasPorReferencia: Math.max(0, referencias - (Array.isArray(prompt.tools) ? prompt.tools.length : 0)),
		placeholders: textosDoObjeto(variaveis.dynamic_variable_placeholders) ?? {},
		webhookDeInicioLigado: booleano(sobreposicoes?.enable_conversation_initiation_client_data_from_webhook),
		primeiraFalaSobreponivel: booleano(sobreposicaoDoAgente?.first_message)
	};
}
function lerConfiguracaoDasConversas(corpo) {
	const raiz = objeto(corpo);
	if (!raiz) return null;
	return {
		inicioUrl: texto$1(objeto(raiz.conversation_initiation_client_data_webhook)?.url),
		posChamadaId: texto$1(objeto(raiz.webhooks)?.post_call_webhook_id)
	};
}
const PADROES_DO_MOTIVO = {
	erro_do_modelo: /\b(llm|language model|model (error|failed|timeout)|openai|anthropic|gemini|rate.?limit|quota)\b/i,
	webhook_de_inicio: /(initiation|client.?data|conversation.?init|webhook)/i,
	end_call: /end_call|end call tool/i,
	silencio: /(silence|inactiv|no (user )?(input|response)|turn.?timeout|idle)/i,
	duracao_maxima: /(max(imum)?.?(call.?)?duration|duration (limit|exceeded)|time.?limit)/i,
	desligado_pelo_lead: /(remote party|hung ?up|hangup|client disconnected|user ended|caller ended)/i
};
function sentidoDoMotivo(motivo) {
	if (!motivo) return null;
	for (const [sentido, padrao] of Object.entries(PADROES_DO_MOTIVO)) if (padrao.test(motivo)) return sentido;
	return null;
}
function lerResultados(turnosCrus) {
	const porPedido = new Map();
	const porNome = new Map();
	for (const cru of turnosCrus) {
		const turno = objeto(cru);
		if (!turno || !Array.isArray(turno.tool_results)) continue;
		for (const itemCru of turno.tool_results) {
			const item = objeto(itemCru);
			if (!item) continue;
			const lido = {
				texto: descrever(item.result_value),
				comErro: item.is_error === true
			};
			const pedido = texto$1(item.request_id);
			if (pedido) porPedido.set(pedido, lido);
			const nome = texto$1(item.tool_name);
			if (nome && !porNome.has(nome)) porNome.set(nome, lido);
		}
	}
	return {
		porPedido,
		porNome
	};
}
function descrever(valor) {
	if (valor === void 0 || valor === null) return null;
	const bruto = typeof valor === "string" ? valor.trim() : JSON.stringify(valor);
	return bruto === "" ? null : bruto.slice(0, 300);
}
function lerAjustesDaVoz(tts) {
	const aninhado = objeto(tts.voice_settings) ?? {};
	const lidos = {};
	for (const campo of [
		"stability",
		"similarity_boost",
		"speed"
	]) {
		const valor = numero(tts[campo]) ?? numero(aninhado[campo]);
		if (valor !== null) lidos[campo] = valor;
	}
	return lidos;
}
function lerParametros(valor) {
	if (typeof valor !== "string") return objeto(valor) ?? {};
	try {
		return objeto(JSON.parse(valor)) ?? {};
	} catch {
		return {};
	}
}
function textosDoObjeto(valor) {
	const cru = objeto(valor);
	if (!cru) return null;
	const lidos = {};
	for (const [chave, item] of Object.entries(cru)) if (typeof item === "string") lidos[chave] = item;
	else if (typeof item === "number" || typeof item === "boolean") lidos[chave] = String(item);
	return lidos;
}
function objeto(valor) {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? valor : null;
}
function texto$1(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
function textoOuNumero(valor) {
	if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
	return texto$1(valor);
}
function numero(valor) {
	return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
function booleano(valor) {
	return typeof valor === "boolean" ? valor : null;
}
//#endregion
//#region supabase/functions/voice-catalog/formato-do-provedor.ts
const AJUSTES_DE_VOZ = [
	{
		nome: "estabilidade",
		rotulo: "estabilidade",
		explicacao: "Quanto mais alta, mais igual a voz soa de uma frase para a outra.",
		campoDoProvedor: "stability",
		minimo: 0,
		maximo: 1,
		padrao: .5,
		passo: .05
	},
	{
		nome: "similaridade",
		rotulo: "similaridade",
		explicacao: "Quanto mais alta, mais perto da voz original do catálogo.",
		campoDoProvedor: "similarity_boost",
		minimo: 0,
		maximo: 1,
		padrao: .75,
		passo: .05
	},
	{
		nome: "velocidade",
		rotulo: "velocidade",
		explicacao: "A pressa da fala. Acima de 1 ela fala mais rápido que o normal.",
		campoDoProvedor: "speed",
		minimo: .7,
		maximo: 1.2,
		padrao: 1,
		passo: .05
	}
];
new Map(AJUSTES_DE_VOZ.map((ajuste) => [ajuste.nome, ajuste]));
function lerAjustesGravados(gravados) {
	const lidos = {};
	for (const ajuste of AJUSTES_DE_VOZ) {
		const valor = gravados[ajuste.campoDoProvedor];
		if (typeof valor === "number" && Number.isFinite(valor)) lidos[ajuste.nome] = valor;
	}
	return lidos;
}
function ajustesParaGravar(ajustes) {
	const gravados = {};
	for (const ajuste of AJUSTES_DE_VOZ) {
		const valor = ajustes[ajuste.nome];
		if (typeof valor === "number" && Number.isFinite(valor)) gravados[ajuste.campoDoProvedor] = valor;
	}
	return gravados;
}
//#endregion
//#region supabase/functions/_shared/agente/compilador.ts
const FATIAS = [
	"F2",
	"F3",
	"F4",
	"F5",
	"F6",
	"F7"
];
const CATALOGO_DE_FERRAMENTAS = [
	{
		nome: "tool-transfer",
		entraNa: "F3",
		propositos: [...PROPOSITOS],
		dependeDeAgenda: false
	},
	{
		nome: "tool-dnc",
		entraNa: "F3",
		propositos: [...PROPOSITOS],
		dependeDeAgenda: false
	},
	{
		nome: DESCRITOR_DA_QUALIFICACAO.nome,
		entraNa: "F4",
		propositos: DESCRITOR_DA_QUALIFICACAO.propositos,
		dependeDeAgenda: false
	},
	{
		nome: FERRAMENTA_DE_AGENDA,
		entraNa: "F5",
		propositos: [...PROPOSITOS],
		fatiaPorProposito: {
			reminder: "F6",
			rescue: "F6"
		},
		dependeDeAgenda: true
	},
	{
		nome: "tool-book-meeting",
		entraNa: "F5",
		propositos: ["discovery", "followup"],
		dependeDeAgenda: true
	},
	{
		nome: "tool-confirm-meeting",
		entraNa: "F6",
		propositos: ["reminder"],
		dependeDeAgenda: true
	},
	{
		nome: "tool-reschedule",
		entraNa: "F6",
		propositos: ["reminder", "rescue"],
		dependeDeAgenda: true
	}
];
const FERRAMENTAS_DE_SISTEMA = [
	"end_call",
	"transfer_to_number",
	"voicemail_detection"
];
const FATIA_DA_FERRAMENTA_DE_SISTEMA = {
	end_call: "F2",
	transfer_to_number: "F3",
	voicemail_detection: "F2"
};
function ferramentasDeSistemaDaFatia(fatia = "F3") {
	return FERRAMENTAS_DE_SISTEMA.filter((nome) => indiceDaFatia(FATIA_DA_FERRAMENTA_DE_SISTEMA[nome]) <= indiceDaFatia(fatia));
}
DESCRITOR_DA_QUALIFICACAO.nome, DESCRITOR_DA_QUALIFICACAO.descricao, DESCRITOR_DA_QUALIFICACAO.campos;
function indiceDaFatia(fatia) {
	return FATIAS.indexOf(fatia);
}
function fatiaDaFerramentaNoProposito(ferramenta, proposito) {
	return ferramenta.fatiaPorProposito?.[proposito] ?? ferramenta.entraNa;
}
function ferramentasDoProposito(proposito, fatia = "F3") {
	return CATALOGO_DE_FERRAMENTAS.filter((ferramenta) => ferramenta.propositos.includes(proposito) && indiceDaFatia(fatiaDaFerramentaNoProposito(ferramenta, proposito)) <= indiceDaFatia(fatia)).map((ferramenta) => ferramenta.nome);
}
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
const MARCADOR = /\{([a-z_]+)\}/g;
function marcadoresDe(texto) {
	const achados = new Set();
	for (const casamento of texto.matchAll(MARCADOR)) {
		const chave = casamento[1];
		if (chave !== void 0) achados.add(chave);
	}
	return [...achados];
}
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
//#endregion
//#region supabase/functions/call-diagnose/propostas.ts
const CAMPOS_DA_POLITICA = {
	duracao_maxima: {
		coluna: "max_duration_seconds",
		minimo: 30,
		maximo: 3600
	},
	intervalo_minimo: {
		coluna: "min_interval_minutes",
		minimo: 0,
		maximo: 10080
	},
	tentativas_por_numero: {
		coluna: "daily_attempts_per_number",
		minimo: 1,
		maximo: 20
	},
	teto_diario: {
		coluna: "daily_calls_cap",
		minimo: 1,
		maximo: 1e5
	},
	simultaneidade: {
		coluna: "max_concurrent",
		minimo: 1,
		maximo: 10
	}
};
const LIMITES_DE_TEXTO = {
	"identidade.nome": 60,
	"identidade.primeira_fala": 500,
	"identidade.oferta": 300,
	"identidade.nunca_afirmar": 200,
	roteiro: 2e4,
	jeito_da_casa: 2e4,
	"privacidade.aviso_de_gravacao": 500
};
const ALVOS = [
	"identidade.primeira_fala",
	"identidade.oferta",
	"identidade.nunca_afirmar",
	"identidade.nome",
	...PROPOSITOS.map((proposito) => `roteiro.${proposito}`),
	...PROPOSITOS.map((proposito) => `jeito_da_casa.${proposito}`),
	"voz.ajustes",
	...Object.keys(CAMPOS_DA_POLITICA).map((campo) => `politica.${campo}`),
	"privacidade.aviso_de_gravacao",
	"republicar"
];
function nivelDoAlvo(alvo) {
	const [nivel] = alvo.split(".");
	return nivel;
}
function propositoDoAlvo(alvo) {
	const [nivel, proposito] = alvo.split(".");
	return nivel === "roteiro" || nivel === "jeito_da_casa" ? proposito : null;
}
function eAlvo(valor) {
	return typeof valor === "string" && ALVOS.includes(valor);
}
function valorAtual(alvo, estado) {
	const proposito = propositoDoAlvo(alvo);
	if (proposito) {
		const vigente = estado.roteiros[proposito];
		if (!vigente) return void 0;
		return nivelDoAlvo(alvo) === "roteiro" ? vigente.roteiro : vigente.jeitoDaCasa;
	}
	switch (alvo) {
		case "identidade.nome": return estado.identidade?.nome;
		case "identidade.primeira_fala": return estado.identidade ? estado.identidade.primeiraFala : void 0;
		case "identidade.oferta": return estado.identidade ? estado.identidade.oferta : void 0;
		case "identidade.nunca_afirmar": return estado.identidade?.nuncaAfirmar;
		case "voz.ajustes": return estado.voz;
		case "privacidade.aviso_de_gravacao": return estado.avisoDeGravacao;
		case "republicar": return null;
		default: {
			const campo = alvo.slice(9);
			return estado.politica ? estado.politica[campo] : void 0;
		}
	}
}
const MOTIVOS_DA_RECUSA = {
	alvo_desconhecido: "O alvo proposto não é um nível de configuração que o diagnóstico aplica.",
	sem_titulo: "A proposta veio sem título ou sem razão.",
	nivel_inexistente: "O nível que a proposta muda ainda não está configurado nesta conta.",
	texto_vazio: "A proposta veio sem o texto novo.",
	texto_longo: "O texto proposto passa do tamanho que aquele campo aceita.",
	marcador_desconhecido: "O texto proposto usa um marcador que ninguém preenche na ligação.",
	marcador_do_provedor: "O texto proposto usa marcador com chaves duplas, que a assistente leria em voz alta.",
	promete_horario: "O texto proposto promete horário, e quem marca horário é a ferramenta de agenda.",
	lista_invalida: "A lista proposta veio vazia, longa demais ou com item em branco.",
	numero_fora_da_faixa: "O número proposto está fora da faixa que a configuração aceita.",
	ajuste_invalido: "O ajuste de voz proposto está fora da faixa ou não é um ajuste conhecido.",
	sem_mudanca: "A proposta repete o valor que já está gravado.",
	repetida: "Já existe outra proposta para o mesmo alvo neste diagnóstico."
};
function validarPropostas(brutas, estado) {
	const aceitas = [];
	const recusadas = [];
	if (!Array.isArray(brutas)) return {
		aceitas,
		recusadas
	};
	const vistos = new Set();
	for (const itemCru of brutas) {
		if (aceitas.length >= 6) break;
		const item = typeof itemCru === "object" && itemCru !== null ? itemCru : {};
		const titulo = textoLimpo(item.titulo);
		const razao = textoLimpo(item.razao);
		const alvoDito = typeof item.alvo === "string" ? item.alvo : "";
		const recusar = (motivo) => recusadas.push({
			alvo: alvoDito,
			titulo: titulo ?? "",
			motivo
		});
		if (!eAlvo(item.alvo)) {
			recusar(MOTIVOS_DA_RECUSA.alvo_desconhecido);
			continue;
		}
		const alvo = item.alvo;
		if (!titulo || !razao) {
			recusar(MOTIVOS_DA_RECUSA.sem_titulo);
			continue;
		}
		if (vistos.has(alvo)) {
			recusar(MOTIVOS_DA_RECUSA.repetida);
			continue;
		}
		const antes = valorAtual(alvo, estado);
		if (antes === void 0) {
			recusar(MOTIVOS_DA_RECUSA.nivel_inexistente);
			continue;
		}
		const crivo = crivar(alvo, item, estado);
		if (!crivo.ok) {
			recusar(crivo.motivo);
			continue;
		}
		if (alvo !== "republicar" && igual(antes, crivo.depois)) {
			recusar(MOTIVOS_DA_RECUSA.sem_mudanca);
			continue;
		}
		vistos.add(alvo);
		aceitas.push({
			id: `p${aceitas.length + 1}`,
			alvo,
			titulo: titulo.slice(0, 160),
			razao: razao.slice(0, 1e3),
			antes,
			depois: crivo.depois,
			origem: "modelo"
		});
	}
	return {
		aceitas,
		recusadas
	};
}
function crivar(alvo, item, estado) {
	const nivel = nivelDoAlvo(alvo);
	if (alvo === "republicar") return {
		ok: true,
		depois: null
	};
	if (alvo === "identidade.nunca_afirmar") return crivarLista(item.lista);
	if (alvo === "voz.ajustes") return crivarAjustes(item.ajustes, estado.voz);
	if (nivel === "politica") {
		const campo = CAMPOS_DA_POLITICA[alvo.slice(9)];
		const valor = item.numero;
		if (typeof valor !== "number" || !Number.isInteger(valor) || valor < campo.minimo || valor > campo.maximo) return {
			ok: false,
			motivo: MOTIVOS_DA_RECUSA.numero_fora_da_faixa
		};
		return {
			ok: true,
			depois: valor
		};
	}
	const limite = nivel === "roteiro" ? LIMITES_DE_TEXTO.roteiro : nivel === "jeito_da_casa" ? LIMITES_DE_TEXTO.jeito_da_casa : LIMITES_DE_TEXTO[alvo];
	return crivarTexto(alvo, item.texto, limite);
}
const CHAVES_DUPLAS = /\{\{|\}\}/;
function crivarTexto(alvo, valor, limite) {
	const texto = textoLimpo(valor);
	if (!texto) return {
		ok: false,
		motivo: MOTIVOS_DA_RECUSA.texto_vazio
	};
	if (texto.length > limite) return {
		ok: false,
		motivo: MOTIVOS_DA_RECUSA.texto_longo
	};
	if (CHAVES_DUPLAS.test(texto)) return {
		ok: false,
		motivo: MOTIVOS_DA_RECUSA.marcador_do_provedor
	};
	const marcadores = marcadoresDe(texto);
	const conhecidos = new Set(alvo === "identidade.nome" ? [] : MARCADORES_DA_PRIMEIRA_FALA);
	if (marcadores.some((marcador) => !conhecidos.has(marcador))) return {
		ok: false,
		motivo: MOTIVOS_DA_RECUSA.marcador_desconhecido
	};
	const nivel = nivelDoAlvo(alvo);
	if ((nivel === "roteiro" || nivel === "jeito_da_casa" || alvo === "identidade.primeira_fala") && trechoQuePrometeHorario(texto)) return {
		ok: false,
		motivo: MOTIVOS_DA_RECUSA.promete_horario
	};
	return {
		ok: true,
		depois: texto
	};
}
function crivarLista(valor) {
	if (!Array.isArray(valor) || valor.length === 0 || valor.length > 20) return {
		ok: false,
		motivo: MOTIVOS_DA_RECUSA.lista_invalida
	};
	const itens = [];
	for (const item of valor) {
		const texto = textoLimpo(item);
		if (!texto || texto.length > LIMITES_DE_TEXTO["identidade.nunca_afirmar"] || CHAVES_DUPLAS.test(texto)) return {
			ok: false,
			motivo: MOTIVOS_DA_RECUSA.lista_invalida
		};
		if (marcadoresDe(texto).length > 0) return {
			ok: false,
			motivo: MOTIVOS_DA_RECUSA.marcador_desconhecido
		};
		if (!itens.includes(texto)) itens.push(texto);
	}
	return {
		ok: true,
		depois: itens
	};
}
function crivarAjustes(valor, atual) {
	if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {
		ok: false,
		motivo: MOTIVOS_DA_RECUSA.ajuste_invalido
	};
	const novos = {};
	for (const [nome, numero] of Object.entries(valor)) {
		if (numero === null || numero === void 0) continue;
		const ajuste = AJUSTES_DE_VOZ.find((item) => item.nome === nome);
		if (!ajuste || typeof numero !== "number" || !Number.isFinite(numero) || numero < ajuste.minimo || numero > ajuste.maximo) return {
			ok: false,
			motivo: MOTIVOS_DA_RECUSA.ajuste_invalido
		};
		novos[ajuste.nome] = numero;
	}
	if (Object.keys(novos).length === 0) return {
		ok: false,
		motivo: MOTIVOS_DA_RECUSA.ajuste_invalido
	};
	return {
		ok: true,
		depois: {
			...atual,
			...ajustesParaGravar({
				...lerAjustesGravados(atual),
				...novos
			})
		}
	};
}
function textoLimpo(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
function igual(a, b) {
	return JSON.stringify(normalizar(a)) === JSON.stringify(normalizar(b));
}
function normalizar(valor) {
	if (valor === null || typeof valor !== "object" || Array.isArray(valor)) return valor;
	return Object.fromEntries(Object.entries(valor).sort(([x], [y]) => x.localeCompare(y)));
}
const TAMANHO_DA_FALA = 600;
const TAMANHO_DO_PROMPT = 8e3;
const TAMANHO_DO_ROTEIRO = 4e3;
const SISTEMA = [
	"Você diagnostica ligações de uma assistente virtual de voz em português, que roda na ElevenLabs.",
	"Recebe os fatos coletados de uma ligação: a transcrição, os metadados que a ElevenLabs registrou, a configuração viva do agente, o que está gravado em cada nível de configuração e os achados das verificações automáticas.",
	"Conclua só a partir desses fatos. Não invente evento, campo ou valor que não esteja neles. Se os fatos não bastam para dizer a causa, diga isso.",
	"Escreva em português, frases diretas, para quem administra a conta e não é técnico.",
	"`causa_provavel`: uma frase com a causa mais provável de a ligação ter terminado como terminou.",
	"`diagnostico`: até oito frases explicando o que aconteceu, citando o trecho ou o campo que sustenta cada afirmação.",
	`\`propostas\`: até 6 correções. Cada uma muda um alvo só, da lista fechada, e traz o valor novo inteiro no campo da forma daquele alvo; os outros campos de valor vão nulos.`,
	"Alvos de texto (`identidade.*` menos `nunca_afirmar`, `roteiro.<proposito>`, `jeito_da_casa.<proposito>`, `privacidade.aviso_de_gravacao`) usam `texto`, com o texto novo completo e não um trecho.",
	"`identidade.nunca_afirmar` usa `lista`, com a lista completa.",
	`\`voz.ajustes\` usa \`ajustes\`, com ${AJUSTES_DE_VOZ.map((ajuste) => `${ajuste.nome} de ${ajuste.minimo} a ${ajuste.maximo}`).join(", ")}; nulo no ajuste que não muda.`,
	`\`politica.*\` usa \`numero\`, inteiro: ${Object.entries(CAMPOS_DA_POLITICA).map(([campo, faixa]) => `${campo} de ${faixa.minimo} a ${faixa.maximo}`).join(", ")}. A duração máxima é em segundos.`,
	"`republicar` não leva valor: use quando o que está gravado já está certo e o agente no ar ficou diferente, ou quando o problema some com uma publicação nova.",
	"Marcadores aceitos no texto: {nome_do_lead}, {nome_do_agente}, {empresa}. Nunca use chaves duplas. Nunca prometa horário no roteiro.",
	"Não proponha mudança que os fatos não sustentem. Lista vazia de propostas é resposta válida."
].join("\n");
function montarPedidoDoDiagnostico(fatos, achados, estado) {
	const { conversa, agente } = fatos;
	const dados = {
		chamada: {
			proposito: fatos.chamada.proposito,
			direcao: fatos.chamada.direcao,
			estado: fatos.chamada.status,
			motivo_do_fim_registrado: fatos.chamada.motivoDoFim,
			duracao_seg: fatos.chamada.duracaoSeg
		},
		conversa_na_elevenlabs: conversa ? {
			estado: conversa.status,
			motivo_do_fim: conversa.motivoDoFim,
			erro: conversa.erro,
			duracao_seg: conversa.duracaoSeg,
			variaveis_recebidas_no_inicio: conversa.variaveis,
			primeira_fala_sobreposta: conversa.primeiraFalaSobreposta,
			leitura_do_provedor: {
				sucesso: conversa.sucessoSegundoOProvedor,
				resumo: conversa.resumoDoProvedor
			},
			transcricao: conversa.turnos.slice(0, 80).map((turno) => ({
				quem: turno.quem === "agent" ? "assistente" : "lead",
				segundo: turno.segundo,
				fala: turno.texto.slice(0, TAMANHO_DA_FALA)
			})),
			ferramentas_chamadas: conversa.invocacoes.map((invocacao) => ({
				nome: invocacao.nome,
				segundo: invocacao.segundo,
				parametros: invocacao.parametros,
				resultado: invocacao.resultado,
				com_erro: invocacao.comErro
			}))
		} : { indisponivel: fatos.falhaDaConversa },
		agente_no_ar: agente ? {
			idioma: agente.idioma,
			llm: agente.llm,
			primeira_fala: agente.primeiraFala,
			prompt: agente.prompt?.slice(0, TAMANHO_DO_PROMPT) ?? null,
			voz: {
				id: agente.vozId,
				modelo: agente.modeloDeVoz,
				ajustes: agente.ajustesDeVoz
			},
			turno: {
				espera_seg: agente.tempoDeTurnoSeg,
				silencio_para_encerrar_seg: agente.silencioParaEncerrarSeg
			},
			duracao_maxima_seg: agente.duracaoMaximaSeg,
			ferramentas: agente.ferramentas,
			valores_iniciais_de_variaveis: agente.placeholders,
			aviso_de_inicio_ligado: agente.webhookDeInicioLigado
		} : { indisponivel: fatos.falhaDoAgente },
		avisos_da_conta_na_elevenlabs: fatos.configuracaoDasConversas,
		gravado_aqui: {
			identidade: estado.identidade,
			roteiro_e_jeito_da_casa_do_proposito: estado.roteiros[fatos.chamada.proposito] ? {
				roteiro: estado.roteiros[fatos.chamada.proposito]?.roteiro.slice(0, TAMANHO_DO_ROTEIRO),
				jeito_da_casa: estado.roteiros[fatos.chamada.proposito]?.jeitoDaCasa.slice(0, TAMANHO_DO_ROTEIRO)
			} : null,
			voz: estado.voz,
			politica: estado.politica,
			aviso_de_gravacao: estado.avisoDeGravacao
		},
		achados_das_verificacoes: achados.map((achado) => ({
			codigo: achado.codigo,
			severidade: achado.severidade,
			titulo: achado.titulo,
			evidencia: achado.evidencia
		}))
	};
	return {
		sistema: SISTEMA,
		mensagem: `Fatos da ligação, em JSON:\n${JSON.stringify(dados, null, 2)}`,
		esquema: ESQUEMA
	};
}
const anulavel = (tipo) => ({ type: [tipo, "null"] });
const ESQUEMA = {
	type: "object",
	additionalProperties: false,
	required: [
		"causa_provavel",
		"diagnostico",
		"propostas"
	],
	properties: {
		causa_provavel: { type: "string" },
		diagnostico: { type: "string" },
		propostas: {
			type: "array",
			items: {
				type: "object",
				additionalProperties: false,
				required: [
					"alvo",
					"titulo",
					"razao",
					"texto",
					"lista",
					"numero",
					"ajustes"
				],
				properties: {
					alvo: {
						type: "string",
						enum: [...ALVOS]
					},
					titulo: { type: "string" },
					razao: { type: "string" },
					texto: anulavel("string"),
					lista: {
						type: ["array", "null"],
						items: { type: "string" }
					},
					numero: anulavel("integer"),
					ajustes: {
						type: ["object", "null"],
						additionalProperties: false,
						required: AJUSTES_DE_VOZ.map((ajuste) => ajuste.nome),
						properties: Object.fromEntries(AJUSTES_DE_VOZ.map((ajuste) => [ajuste.nome, anulavel("number")]))
					}
				}
			}
		}
	}
};
function lerRespostaDoModelo(texto) {
	let dado;
	try {
		dado = JSON.parse(texto.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
	} catch {
		return null;
	}
	if (!dado || typeof dado !== "object" || Array.isArray(dado)) return null;
	const { causa_provavel: causa, diagnostico, propostas } = dado;
	if (typeof causa !== "string" || causa.trim() === "") return null;
	if (typeof diagnostico !== "string" || diagnostico.trim() === "") return null;
	return {
		causaProvavel: causa.trim().slice(0, 500),
		diagnostico: diagnostico.trim().slice(0, 4e3),
		propostas: Array.isArray(propostas) ? propostas : []
	};
}
const TAMANHO_DA_CITACAO = 160;
const IDIOMA_ESPERADO = /^pt\b/i;
const MARCADOR_CRU = /\{\{?\s*[A-Za-z_][A-Za-z0-9_]*\s*\}?\}/;
const VARIAVEL_DO_PROVEDOR = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
const PREFIXO_DO_SISTEMA = "system__";
const FALHA_NO_RESULTADO = /\b(401|403|404|408|429|5\d\d|unauthori[sz]ed|forbidden|not found|timed? ?out|timeout|error)\b/i;
const REGRAS = [
	{
		codigo: "sem_publicacao",
		severidade: "erro",
		titulo: "O propósito desta ligação não tem agente publicado.",
		sugestao: "Publique a assistente em Playbooks antes de ligar de novo.",
		alvo: "republicar",
		verificar: (fatos) => fatos.publicacao?.agenteNoProvedor ? null : "Não há identificador do agente do provedor para este propósito."
	},
	{
		codigo: "conversa_indisponivel",
		severidade: "aviso",
		titulo: "Os registros desta ligação não vieram da ElevenLabs.",
		sugestao: "Confira a chave da ElevenLabs em Integrações e peça a análise de novo.",
		alvo: null,
		verificar: (fatos) => fatos.conversa ? null : evidenciaDaFalha("conversa", fatos.falhaDaConversa)
	},
	{
		codigo: "agente_indisponivel",
		severidade: "aviso",
		titulo: "A configuração viva do agente não veio da ElevenLabs.",
		sugestao: "Confira a chave da ElevenLabs em Integrações. Se o agente foi apagado lá, publique a assistente de novo.",
		alvo: "republicar",
		verificar: (fatos) => fatos.agente || !fatos.publicacao?.agenteNoProvedor ? null : evidenciaDaFalha("agente", fatos.falhaDoAgente)
	},
	{
		codigo: "conversa_falhou",
		severidade: "erro",
		titulo: "A ElevenLabs registrou a conversa como falha.",
		sugestao: "Leia o motivo ao lado: ele diz qual parte da configuração parou a conversa.",
		alvo: null,
		verificar: ({ conversa }) => conversa?.status === "failed" ? `Estado da conversa: "failed"${conversa.erro ? `. Erro: ${descreverErro(conversa.erro)}` : ""}.` : null
	},
	{
		codigo: "chamada_sem_fechamento",
		severidade: "erro",
		titulo: "A ElevenLabs encerrou a conversa, e o aviso de fim não chegou aqui.",
		sugestao: "Publique a assistente de novo para recadastrar o aviso de fim. Sem ele a ficha fica sem transcrição e sem desfecho.",
		alvo: "republicar",
		verificar: ({ conversa, chamada }) => conversa && (conversa.status === "done" || conversa.status === "failed") && chamada.status !== "ended" && chamada.status !== "failed" ? `A conversa está "${conversa.status}" na ElevenLabs, e a chamada continua "${chamada.status}" aqui.` : null
	},
	{
		codigo: "conversa_no_ar",
		severidade: "info",
		titulo: "A conversa ainda não terminou na ElevenLabs.",
		sugestao: "Espere a ligação terminar e peça a análise de novo.",
		alvo: null,
		verificar: ({ conversa }) => conversa && (conversa.status === "initiated" || conversa.status === "in-progress" || conversa.status === "processing") ? `Estado da conversa: "${conversa.status}".` : null
	},
	{
		codigo: "encerrada_por_erro_do_modelo",
		severidade: "erro",
		titulo: "A ligação caiu por erro do modelo de linguagem do agente.",
		sugestao: "Confira o modelo escolhido no agente e o saldo da conta que o paga. Depois publique a assistente de novo.",
		alvo: "republicar",
		verificar: ({ conversa }) => {
			if (!conversa) return null;
			const motivo = sentidoDoMotivo(conversa.motivoDoFim);
			const doErro = sentidoDoMotivo(conversa.erro?.razao ?? null);
			if (motivo !== "erro_do_modelo" && doErro !== "erro_do_modelo") return null;
			return evidenciaDoMotivo(conversa);
		}
	},
	{
		codigo: "falha_no_webhook_de_inicio",
		severidade: "erro",
		titulo: "O aviso de início da conversa falhou, e a assistente começou sem o contexto do lead.",
		sugestao: "Publique a assistente de novo para recadastrar o aviso de início. Se persistir, confira o endereço de call-init na ElevenLabs.",
		alvo: "republicar",
		verificar: ({ conversa, agente }) => {
			if (!conversa) return null;
			const motivo = sentidoDoMotivo(conversa.motivoDoFim);
			const doErro = sentidoDoMotivo(conversa.erro?.razao ?? null);
			if (motivo === "webhook_de_inicio" || doErro === "webhook_de_inicio") return evidenciaDoMotivo(conversa);
			if (agente?.webhookDeInicioLigado === true && conversa.variaveis !== null && !("call_id" in conversa.variaveis)) return "O agente pede o contexto ao aviso de início, e a conversa começou sem a variável call_id que ele devolve.";
			return null;
		}
	},
	{
		codigo: "encerrada_por_end_call_cedo",
		severidade: "erro",
		titulo: "A própria assistente desligou com a ferramenta de encerrar logo no começo.",
		sugestao: "Diga no roteiro quando encerrar e quando não encerrar. Resposta curta do lead, como \"pode sim\", é para seguir a conversa.",
		alvo: null,
		verificar: ({ conversa }) => {
			if (!conversa) return null;
			const falasDoLead = contarFalasDoLead(conversa);
			if (falasDoLead > 2) return null;
			const encerrar = conversa.invocacoes.find((invocacao) => invocacao.nome === "end_call");
			const pelaFerramenta = sentidoDoMotivo(conversa.motivoDoFim) === "end_call";
			if (!encerrar && !pelaFerramenta) return null;
			const ultimaDoLead = [...conversa.turnos].reverse().find((turno) => turno.quem === "lead");
			const razao = typeof encerrar?.parametros.reason === "string" ? ` Razão dada pela assistente: "${citar(encerrar.parametros.reason)}".` : "";
			return `A ferramenta end_call foi chamada${encerrar ? ` aos ${encerrar.segundo} s` : ""} depois de ${falasDoLead} ${falasDoLead === 1 ? "fala" : "falas"} do lead${ultimaDoLead ? `, a última: "${citar(ultimaDoLead.texto)}"` : ""}.${razao}${conversa.motivoDoFim ? ` Motivo do provedor: "${conversa.motivoDoFim}".` : ""}`;
		}
	},
	{
		codigo: "encerrada_por_silencio",
		severidade: "aviso",
		titulo: "A ligação foi encerrada por silêncio.",
		sugestao: "Aumente o tempo de silêncio antes de encerrar no agente, ou confira se o áudio do lead chegou.",
		alvo: null,
		verificar: ({ conversa }) => conversa && sentidoDoMotivo(conversa.motivoDoFim) === "silencio" ? evidenciaDoMotivo(conversa) : null
	},
	{
		codigo: "encerrada_por_duracao_maxima",
		severidade: "aviso",
		titulo: "A ligação bateu na duração máxima.",
		sugestao: "Aumente a duração máxima em Discagem se as conversas boas estão sendo cortadas.",
		alvo: "politica.duracao_maxima",
		verificar: ({ conversa, chamada }) => {
			if (chamada.motivoDoFim === "max_duration") return "A chamada foi marcada como encerrada pela duração máxima.";
			return conversa && sentidoDoMotivo(conversa.motivoDoFim) === "duracao_maxima" ? evidenciaDoMotivo(conversa) : null;
		}
	},
	{
		codigo: "desligada_pelo_lead",
		severidade: "info",
		titulo: "Quem desligou foi o lead.",
		sugestao: "Leia as últimas falas: o que a assistente disse antes pode ter afastado o lead.",
		alvo: null,
		verificar: ({ conversa }) => conversa && sentidoDoMotivo(conversa.motivoDoFim) === "desligado_pelo_lead" ? evidenciaDoMotivo(conversa) : null
	},
	{
		codigo: "ferramenta_com_erro",
		severidade: "erro",
		titulo: "Uma ferramenta chamada na ligação devolveu erro.",
		sugestao: "Publique a assistente de novo para renovar o segredo das ferramentas. Se persistir, confira em Integrações.",
		alvo: "republicar",
		verificar: ({ conversa }) => {
			if (!conversa) return null;
			const falhas = conversa.invocacoes.filter((invocacao) => invocacao.comErro || invocacao.resultado !== null && FALHA_NO_RESULTADO.test(invocacao.resultado));
			if (falhas.length === 0) return null;
			return falhas.map((invocacao) => `${invocacao.nome} aos ${invocacao.segundo} s: "${citar(invocacao.resultado ?? "erro sem descrição")}"`).join("; ");
		}
	},
	{
		codigo: "ferramenta_inexistente",
		severidade: "erro",
		titulo: "A assistente chamou uma ferramenta que o agente no ar não tem.",
		sugestao: "Publique a assistente de novo para o agente receber as ferramentas do propósito.",
		alvo: "republicar",
		verificar: ({ conversa, agente }) => {
			if (!conversa || !agente || agente.ferramentasPorReferencia > 0) return null;
			const conhecidas = new Set(agente.ferramentas);
			const estranhas = [...new Set(conversa.invocacoes.map((invocacao) => invocacao.nome))].filter((nome) => !conhecidas.has(nome));
			return estranhas.length === 0 ? null : `Chamadas sem ferramenta no agente: ${estranhas.join(", ")}.`;
		}
	},
	{
		codigo: "marcador_cru_na_primeira_fala",
		severidade: "erro",
		titulo: "A primeira fala tem um marcador que a assistente lê em voz alta.",
		sugestao: "Tire o marcador da primeira fala em Identidade ou use um que a ligação preenche. Depois publique a assistente.",
		alvo: "identidade.primeira_fala",
		verificar: ({ conversa, agente }) => {
			const achados = [];
			const conhecidas = variaveisConhecidas(conversa, agente);
			for (const [onde, fala] of [["primeira fala do agente", agente?.primeiraFala ?? null], ["primeira fala sobreposta no início da conversa", conversa?.primeiraFalaSobreposta ?? null]]) {
				if (!fala) continue;
				const crus = marcadoresCrus(fala, conhecidas);
				if (crus.length > 0) achados.push(`${onde}: "${citar(fala)}" (${crus.join(", ")})`);
			}
			return achados.length === 0 ? null : `Na ${achados.join("; na ")}.`;
		}
	},
	{
		codigo: "marcador_cru_na_fala",
		severidade: "erro",
		titulo: "A assistente falou um marcador em vez do valor dele.",
		sugestao: "Confira o texto de onde a fala veio (primeira fala ou roteiro) e publique a assistente de novo.",
		alvo: null,
		verificar: ({ conversa }) => {
			const fala = conversa?.turnos.find((turno) => turno.quem === "agent" && MARCADOR_CRU.test(turno.texto));
			return fala ? `Aos ${fala.segundo} s a assistente disse: "${citar(fala.texto)}".` : null;
		}
	},
	{
		codigo: "variavel_sem_valor",
		severidade: "erro",
		titulo: "O agente cita uma variável que a conversa não recebeu.",
		sugestao: "Publique a assistente de novo. Se a variável vem do aviso de início, confira que ele está cadastrado.",
		alvo: "republicar",
		verificar: ({ conversa, agente }) => {
			if (!agente) return null;
			const conhecidas = variaveisConhecidas(conversa, agente);
			const faltam = new Set();
			for (const texto of [agente.primeiraFala, agente.prompt]) {
				if (!texto) continue;
				for (const casamento of texto.matchAll(VARIAVEL_DO_PROVEDOR)) {
					const nome = casamento[1];
					if (nome && !nome.startsWith(PREFIXO_DO_SISTEMA) && !conhecidas.has(nome)) faltam.add(nome);
				}
			}
			return faltam.size === 0 ? null : `Sem valor na conversa e sem valor inicial no agente: ${[...faltam].join(", ")}.`;
		}
	},
	{
		codigo: "idioma_diferente_de_pt",
		severidade: "erro",
		titulo: "O agente no ar não está em português.",
		sugestao: "Publique a assistente de novo: a publicação põe o agente em português.",
		alvo: "republicar",
		verificar: ({ agente }) => agente?.idioma && !IDIOMA_ESPERADO.test(agente.idioma) ? `Idioma do agente: "${agente.idioma}".` : null
	},
	{
		codigo: "conversa_curta_encerrada_pela_sarah",
		severidade: "aviso",
		titulo: "A conversa acabou curta, e não foi o lead quem desligou.",
		sugestao: "Leia a transcrição e o diagnóstico abaixo: o roteiro pode estar mandando encerrar cedo.",
		alvo: null,
		verificar: ({ conversa }) => {
			if (!conversa || conversa.turnos.length === 0) return null;
			const falasDoLead = contarFalasDoLead(conversa);
			if (falasDoLead === 0 || falasDoLead > 2) return null;
			if (sentidoDoMotivo(conversa.motivoDoFim) === "desligado_pelo_lead") return null;
			return `${falasDoLead} ${falasDoLead === 1 ? "fala" : "falas"} do lead em ${conversa.duracaoSeg ?? "?"} s${conversa.motivoDoFim ? `. Motivo do provedor: "${conversa.motivoDoFim}"` : ""}.`;
		}
	},
	{
		codigo: "tempo_de_turno_curto",
		severidade: "aviso",
		titulo: "O agente espera pouco pela resposta do lead.",
		sugestao: "Aumente o tempo de espera do turno no agente para pelo menos 3 segundos.",
		alvo: null,
		verificar: ({ agente }) => agente?.tempoDeTurnoSeg !== null && agente?.tempoDeTurnoSeg !== void 0 && agente.tempoDeTurnoSeg > 0 && agente.tempoDeTurnoSeg < 3 ? `Tempo de espera do turno: ${agente.tempoDeTurnoSeg} s.` : null
	},
	{
		codigo: "silencio_encerra_cedo",
		severidade: "aviso",
		titulo: "O agente desliga depois de pouco silêncio.",
		sugestao: "Aumente o silêncio antes de encerrar no agente para pelo menos 10 segundos, ou desligue a opção.",
		alvo: null,
		verificar: ({ agente }) => {
			const silencio = agente?.silencioParaEncerrarSeg;
			return silencio !== null && silencio !== void 0 && silencio >= 0 && silencio < 10 ? `Silêncio antes de encerrar: ${silencio} s.` : null;
		}
	},
	{
		codigo: "configuracao_viva_divergente",
		severidade: "aviso",
		titulo: "O agente no ar está diferente do que está gravado aqui.",
		sugestao: "Publique a assistente de novo para o agente voltar a ser o que está gravado.",
		alvo: "republicar",
		verificar: ({ agente, esperado, chamada }) => {
			if (!agente) return null;
			const diferencas = [];
			if (esperado.vozId && agente.vozId && agente.vozId !== esperado.vozId) diferencas.push(`voz no ar ${agente.vozId}, gravada ${esperado.vozId}`);
			if (esperado.duracaoMaximaSeg !== null && agente.duracaoMaximaSeg !== null && agente.duracaoMaximaSeg !== esperado.duracaoMaximaSeg) diferencas.push(`duração máxima no ar ${agente.duracaoMaximaSeg} s, gravada ${esperado.duracaoMaximaSeg} s`);
			if (agente.ferramentasPorReferencia === 0 && agente.ferramentas.length > 0) {
				const faltam = ferramentasEsperadas(chamada.proposito).filter((nome) => !agente.ferramentas.includes(nome));
				if (faltam.length > 0) diferencas.push(`ferramentas que faltam no ar: ${faltam.join(", ")}`);
			}
			return diferencas.length === 0 ? null : `${primeiraMaiuscula(diferencas.join("; "))}.`;
		}
	},
	{
		codigo: "webhooks_ausentes",
		severidade: "erro",
		titulo: "Os avisos de início e de fim da conversa não estão cadastrados na ElevenLabs da conta.",
		sugestao: "Publique a assistente de novo: a publicação cadastra os dois avisos.",
		alvo: "republicar",
		verificar: ({ configuracaoDasConversas, agente }) => {
			if (!configuracaoDasConversas) return null;
			const faltam = [];
			const inicio = configuracaoDasConversas.inicioUrl;
			if (agente?.webhookDeInicioLigado !== false && (!inicio || !inicio.includes("call-init"))) faltam.push(inicio ? `o aviso de início aponta para outro endereço (${inicio})` : "o aviso de início não está cadastrado");
			if (!configuracaoDasConversas.posChamadaId) faltam.push("o aviso de fim não está cadastrado");
			return faltam.length === 0 ? null : `${primeiraMaiuscula(faltam.join("; "))}.`;
		}
	}
];
function verificar(fatos) {
	const ordem = {
		erro: 0,
		aviso: 1,
		info: 2
	};
	const achados = [];
	for (const regra of REGRAS) {
		let evidencia;
		try {
			evidencia = regra.verificar(fatos);
		} catch {
			evidencia = null;
		}
		if (evidencia === null) continue;
		achados.push({
			codigo: regra.codigo,
			severidade: regra.severidade,
			titulo: regra.titulo,
			evidencia,
			sugestao: regra.sugestao,
			alvo: regra.alvo
		});
	}
	return achados.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
}
function ferramentasEsperadas(proposito) {
	return [...ferramentasDoProposito(proposito), ...ferramentasDeSistemaDaFatia()];
}
function contarFalasDoLead(conversa) {
	return conversa.turnos.filter((turno) => turno.quem === "lead").length;
}
function variaveisConhecidas(conversa, agente) {
	return new Set([...Object.keys(conversa?.variaveis ?? {}), ...Object.keys(agente?.placeholders ?? {})]);
}
function marcadoresCrus(texto, conhecidas) {
	const crus = new Set();
	for (const casamento of texto.matchAll(/\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}|\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}/g)) {
		const [inteiro, duplo, simples] = casamento;
		if (simples) crus.add(inteiro);
		else if (duplo && !duplo.startsWith(PREFIXO_DO_SISTEMA) && !conhecidas.has(duplo)) crus.add(inteiro);
	}
	return [...crus];
}
function evidenciaDoMotivo(conversa) {
	const partes = [];
	if (conversa.motivoDoFim) partes.push(`Motivo do provedor: "${conversa.motivoDoFim}"`);
	if (conversa.erro) partes.push(`Erro: ${descreverErro(conversa.erro)}`);
	if (conversa.duracaoSeg !== null) partes.push(`Duração: ${conversa.duracaoSeg} s`);
	return `${partes.join(". ")}.`;
}
function descreverErro(erro) {
	return [erro.codigo ? `código ${erro.codigo}` : null, erro.razao ? `"${erro.razao}"` : null].filter(Boolean).join(", ");
}
function evidenciaDaFalha(de, falha) {
	return {
		sem_identificador: de === "conversa" ? "A chamada não guardou o identificador da conversa na ElevenLabs." : "Não há identificador do agente para consultar.",
		sem_chave: "A conta não tem a chave da ElevenLabs cadastrada.",
		nao_encontrada: `A ElevenLabs respondeu que ${de === "conversa" ? "a conversa" : "o agente"} não existe na conta.`,
		recusada: "A ElevenLabs recusou a chave da conta.",
		indisponivel: "A ElevenLabs não respondeu a tempo."
	}[falha ?? "indisponivel"];
}
function citar(texto) {
	const limpo = texto.replace(/\s+/g, " ").trim();
	return limpo.length > TAMANHO_DA_CITACAO ? `${limpo.slice(0, 159)}…` : limpo;
}
function primeiraMaiuscula(texto) {
	return texto.charAt(0).toUpperCase() + texto.slice(1);
}
//#endregion
//#region supabase/functions/call-diagnose/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido veio sem a conta da chamada.",
	chamada_ausente: "O pedido veio sem a chamada a analisar.",
	chamada_inexistente: "Esta chamada não existe nesta conta.",
	sem_sessao: "Entre na sua conta para analisar a ligação.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para analisar a ligação.",
	sem_acesso: "Você não tem acesso a esta conta.",
	papel_insuficiente: "Analisar a ligação propõe mudanças na configuração da assistente, e isso é tarefa de quem administra a conta. Peça a análise a quem administra.",
	falha_interna: "Não foi possível analisar a ligação agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_invalido: 405,
	conta_ausente: 400,
	chamada_ausente: 400,
	chamada_inexistente: 404,
	sem_sessao: 401,
	sessao_invalida: 401,
	sem_acesso: 403,
	papel_insuficiente: 403,
	falha_interna: 500
};
const AVISOS_DO_MODELO = {
	nao_conectado: "As verificações abaixo não dependem de modelo. Para ter também a explicação e as sugestões, conecte um provedor de modelo em Integrações.",
	indisponivel: "O modelo da conta não respondeu, e a explicação ficou de fora. As verificações abaixo valem. Peça a análise de novo em alguns minutos.",
	ilegivel: "O modelo respondeu fora do formato esperado, e a explicação ficou de fora. As verificações abaixo valem. Peça a análise de novo."
};
const CAMINHO_DO_AVISO = { nao_conectado: "/config/integracoes" };
const PROPOSTA_DE_REPUBLICAR = {
	titulo: "Publicar a assistente de novo",
	razao: (motivos) => `As verificações acharam o que uma publicação nova corrige: ${motivos.join(" ")}`
};
//#endregion
//#region supabase/functions/call-diagnose/diagnostico.ts
const TAREFA_DO_DIAGNOSTICO = "review";
const PROVEDOR_DO_MODELO = "modelo";
const CREDENCIAL_DA_VOZ = {
	provedor: "voz",
	chave: "api_key"
};
const PAPEIS_QUE_DIAGNOSTICAM = new Set(["owner", "admin"]);
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function atenderDiagnostico(pedido, porta) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const contaId = texto(pedido.contaId);
	if (!contaId) return recusa("conta_ausente");
	const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? "")?.[1]?.trim();
	if (!jwt) return recusa("sem_sessao");
	const chamadaId = texto(pedido.chamadaId);
	if (!chamadaId) return recusa("chamada_ausente");
	const segredos = [];
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sessao_invalida");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (!papel) return recusa("sem_acesso");
		if (!PAPEIS_QUE_DIAGNOSTICAM.has(papel)) return recusa("papel_insuficiente");
		const chamada = await porta.lerChamada(contaId, chamadaId);
		if (!chamada) return recusa("chamada_inexistente");
		const proposito = lerProposito(chamada.purpose);
		if (!proposito) return recusa("falha_interna");
		const [publicacao, gravada] = await Promise.all([porta.lerPublicacao(contaId, proposito), porta.lerConfiguracaoGravada(contaId)]);
		const coleta = await coletarDoProvedor(porta, contaId, chamada, publicacao, segredos);
		const fatos = {
			chamada: {
				id: chamada.id,
				status: chamada.status,
				motivoDoFim: chamada.end_reason,
				direcao: chamada.direction,
				duracaoSeg: chamada.duration_sec,
				proposito
			},
			publicacao: publicacao ? {
				agenteNoProvedor: publicacao.provider_agent_id,
				status: publicacao.status
			} : null,
			...coleta,
			esperado: {
				vozId: gravada.vozId,
				duracaoMaximaSeg: gravada.estado.politica?.duracao_maxima ?? null
			}
		};
		const achados = verificar(fatos);
		const modelo = await consultarModelo(porta, contaId, chamada.id, fatos, achados, gravada.estado);
		const propostas = [...modelo.propostas];
		const recusadas = modelo.recusadas.map((recusada) => ({
			codigo: "proposta_recusada",
			severidade: "info",
			titulo: `Uma sugestão do modelo ficou de fora${recusada.titulo ? `: ${recusada.titulo}` : "."}`,
			evidencia: recusada.motivo,
			sugestao: "Nada a fazer. A sugestão não passou pela conferência e não será aplicada.",
			alvo: null
		}));
		const pedemPublicacao = achados.filter((achado) => achado.alvo === "republicar" && achado.severidade !== "info");
		if (pedemPublicacao.length > 0 && !propostas.some((proposta) => proposta.alvo === "republicar")) propostas.push({
			id: `p${propostas.length + 1}`,
			alvo: "republicar",
			titulo: PROPOSTA_DE_REPUBLICAR.titulo,
			razao: PROPOSTA_DE_REPUBLICAR.razao(pedemPublicacao.map((achado) => achado.titulo)),
			antes: null,
			depois: null,
			origem: "regra"
		});
		const linha = {
			account_id: contaId,
			call_id: chamada.id,
			purpose: proposito,
			findings: [...achados, ...recusadas],
			cause: modelo.leitura?.causaProvavel ?? null,
			diagnosis: modelo.leitura?.diagnostico ?? null,
			model_status: modelo.estado,
			proposals: propostas.map(paraGravar),
			provider_summary: {
				conversa_id: chamada.provider_conversation_id,
				agente_id: coleta.conversa?.agenteId ?? publicacao?.provider_agent_id ?? null,
				estado_da_conversa: coleta.conversa?.status ?? null,
				motivo_do_fim: coleta.conversa?.motivoDoFim ?? null,
				duracao_seg: coleta.conversa?.duracaoSeg ?? null,
				idioma: coleta.agente?.idioma ?? null,
				llm: coleta.agente?.llm ?? null
			},
			created_by: usuario.id
		};
		conferirQueNaoVazou(linha, segredos, "call-diagnose: a chave da conta apareceu no diagnóstico");
		const gravado = await porta.gravarDiagnostico(linha);
		const corpo = {
			ok: true,
			diagnostico: paraTela({
				...linha,
				...gravado
			}),
			semRegistro: !modelo.registrado || coleta.semRegistro
		};
		conferirQueNaoVazou(corpo, segredos, "call-diagnose: a chave da conta apareceu no corpo da resposta");
		return {
			status: 201,
			corpo
		};
	} catch {
		return recusa("falha_interna");
	}
}
async function coletarDoProvedor(porta, contaId, chamada, publicacao, segredos) {
	const credencial = await porta.credencialDaVoz(contaId);
	if (!credencial.ok) return {
		conversa: null,
		falhaDaConversa: chamada.provider_conversation_id ? "sem_chave" : "sem_identificador",
		agente: null,
		falhaDoAgente: "sem_chave",
		configuracaoDasConversas: null,
		semRegistro: false
	};
	const chave = credencial.valor;
	segredos.push(chave);
	let semRegistro = false;
	async function consultar(caminho, etapa) {
		const resposta = await porta.consultarVoz(caminho, chave);
		try {
			await porta.registrarEventoDeIntegracao({
				account_id: contaId,
				direction: "outbound",
				provider: "voz",
				endpoint: caminho,
				request: {
					etapa,
					metodo: "GET"
				},
				response: { ok: resposta.ok },
				status_code: resposta.status,
				latency_ms: resposta.latenciaMs,
				correlation_id: chamada.id
			});
		} catch {
			semRegistro = true;
		}
		return resposta;
	}
	let conversa = null;
	let falhaDaConversa = "sem_identificador";
	if (chamada.provider_conversation_id) {
		const resposta = await consultar(caminhoDaConversa(chamada.provider_conversation_id), "conversa");
		conversa = resposta.ok ? lerConversaDoProvedor(resposta.corpo) : null;
		falhaDaConversa = conversa ? null : falhaDe(resposta);
	}
	const agenteId = conversa?.agenteId ?? publicacao?.provider_agent_id ?? null;
	let agente = null;
	let falhaDoAgente = "sem_identificador";
	if (agenteId) {
		const resposta = await consultar(caminhoDoAgente(agenteId), "agente");
		agente = resposta.ok ? lerAgenteDoProvedor(resposta.corpo) : null;
		falhaDoAgente = agente ? null : falhaDe(resposta);
	}
	const respostaDaConfiguracao = await consultar(CAMINHO_DA_CONFIGURACAO_DAS_CONVERSAS, "configuracao_das_conversas");
	const configuracaoDasConversas = respostaDaConfiguracao.ok ? lerConfiguracaoDasConversas(respostaDaConfiguracao.corpo) : null;
	return {
		conversa,
		falhaDaConversa,
		agente,
		falhaDoAgente,
		configuracaoDasConversas,
		semRegistro
	};
}
function falhaDe(resposta) {
	if (resposta.status === 404) return "nao_encontrada";
	if (resposta.status === 401 || resposta.status === 403) return "recusada";
	return "indisponivel";
}
async function consultarModelo(porta, contaId, chamadaId, fatos, achados, estado) {
	const resolvido = await porta.modeloDaConta(contaId);
	const texto = montarPedidoDoDiagnostico(fatos, achados, estado);
	const pedido = {
		modelo: resolvido.modelo,
		porta: resolvido.porta,
		contaId,
		...texto
	};
	const resposta = await porta.perguntarAoModelo(pedido);
	let registrado = true;
	try {
		await porta.registrarEventoDeIntegracao({
			account_id: contaId,
			direction: "outbound",
			provider: PROVEDOR_DO_MODELO,
			endpoint: resposta.endpoint ?? "api/v1/chat/completions",
			request: {
				model: pedido.modelo,
				porta: resolvido.porta,
				modelo_da_conta: resolvido.escolhidoPelaConta,
				etapa: "diagnostico",
				prompt: pedido.mensagem,
				achados: achados.length
			},
			response: {
				ok: resposta.ok,
				entrada: resposta.tokensDeEntrada ?? null,
				saida: resposta.tokensDeSaida ?? null,
				caracteres_da_resposta: resposta.texto?.length ?? null
			},
			status_code: resposta.status ?? null,
			latency_ms: resposta.latenciaMs ?? null,
			correlation_id: chamadaId
		});
	} catch {
		registrado = false;
	}
	if (!resposta.ok || typeof resposta.texto !== "string") return {
		estado: resposta.codigo === "sem_credencial" ? "nao_conectado" : "indisponivel",
		leitura: null,
		propostas: [],
		recusadas: [],
		registrado
	};
	const leitura = lerRespostaDoModelo(resposta.texto);
	if (!leitura) return {
		estado: "ilegivel",
		leitura: null,
		propostas: [],
		recusadas: [],
		registrado
	};
	const { aceitas, recusadas } = validarPropostas(leitura.propostas, estado);
	return {
		estado: "ok",
		leitura: {
			causaProvavel: leitura.causaProvavel,
			diagnostico: leitura.diagnostico
		},
		propostas: aceitas,
		recusadas,
		registrado
	};
}
function paraGravar(proposta) {
	return {
		id: proposta.id,
		alvo: proposta.alvo,
		titulo: proposta.titulo,
		razao: proposta.razao,
		antes: proposta.antes,
		depois: proposta.depois,
		origem: proposta.origem,
		estado: "pendente"
	};
}
function paraTela(linha) {
	const estado = lerEstadoDoModelo(linha.model_status);
	return {
		id: linha.id,
		chamadaId: linha.call_id,
		proposito: linha.purpose,
		criadoEm: linha.created_at,
		achados: Array.isArray(linha.findings) ? linha.findings : [],
		causaProvavel: linha.cause,
		diagnostico: linha.diagnosis,
		estadoDoModelo: estado,
		avisoDoModelo: estado === "ok" ? null : AVISOS_DO_MODELO[estado],
		caminhoDoAviso: CAMINHO_DO_AVISO[estado] ?? null,
		propostas: Array.isArray(linha.proposals) ? linha.proposals.map((proposta) => ({
			id: proposta.id,
			alvo: proposta.alvo,
			titulo: proposta.titulo,
			razao: proposta.razao,
			antes: proposta.antes ?? null,
			depois: proposta.depois ?? null,
			origem: proposta.origem,
			estado: proposta.estado,
			decididaEm: proposta.decidida_em ?? null,
			versaoId: proposta.versao_id ?? null
		})) : [],
		resumo: lerResumo(linha.provider_summary)
	};
}
function lerEstadoDoModelo(valor) {
	return valor === "ok" || valor === "nao_conectado" || valor === "indisponivel" || valor === "ilegivel" ? valor : "indisponivel";
}
function lerResumo(valor) {
	const cru = typeof valor === "object" && valor !== null ? valor : {};
	const textoOuNulo = (item) => typeof item === "string" ? item : null;
	return {
		conversa_id: textoOuNulo(cru.conversa_id),
		agente_id: textoOuNulo(cru.agente_id),
		estado_da_conversa: textoOuNulo(cru.estado_da_conversa),
		motivo_do_fim: textoOuNulo(cru.motivo_do_fim),
		duracao_seg: typeof cru.duracao_seg === "number" ? cru.duracao_seg : null,
		idioma: textoOuNulo(cru.idioma),
		llm: textoOuNulo(cru.llm)
	};
}
function lerProposito(valor) {
	return typeof valor === "string" && PROPOSITOS.includes(valor) ? valor : null;
}
function texto(valor) {
	const limpo = typeof valor === "string" ? valor.trim() : "";
	return limpo === "" ? null : limpo;
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
//#region supabase/functions/call-diagnose/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const ENDERECO_DO_PROVEDOR_DE_VOZ = "https://api.elevenlabs.io/v1";
const LIMITE_DO_PROVEDOR_MS = 15e3;
const LIMITE_DO_MODELO_MS = 12e4;
const TETO_DE_SAIDA = 8e3;
const APLICACAO = {
	url: Deno.env.get("SARAH_URL_PUBLICA") ?? void 0,
	nome: NOME_DO_PRODUTO
};
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
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
async function versaoVigente(playbookId, versaoPublicadaId) {
	let consulta = servico.from("playbook_versions").select("body_script, body_house").eq("playbook_id", playbookId);
	consulta = versaoPublicadaId ? consulta.eq("id", versaoPublicadaId) : consulta.order("version", { ascending: false }).limit(1);
	const { data, error } = await consulta;
	if (error) throw new Error(error.message);
	const vigente = (data ?? [])[0];
	return vigente ? {
		roteiro: vigente.body_script ?? "",
		jeitoDaCasa: vigente.body_house ?? ""
	} : null;
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
	async lerChamada(contaId, chamadaId) {
		const { data, error } = await servico.from("calls").select("id, status, end_reason, direction, duration_sec, purpose, provider_conversation_id").eq("account_id", contaId).eq("id", chamadaId).maybeSingle();
		if (error) throw new Error(error.message);
		return data ?? null;
	},
	async lerPublicacao(contaId, proposito) {
		const { data, error } = await servico.from("agent_publications").select("provider_agent_id, status").eq("account_id", contaId).eq("purpose", proposito).maybeSingle();
		if (error) throw new Error(error.message);
		return data ?? null;
	},
	async lerConfiguracaoGravada(contaId) {
		const { data: agente, error: erroDoAgente } = await servico.from("agents").select("name, first_message, offer_line, never_claim, voice_id, voice_settings").eq("account_id", contaId).maybeSingle();
		if (erroDoAgente) throw new Error(erroDoAgente.message);
		const { data: politica, error: erroDaPolitica } = await servico.from("account_settings").select("max_duration_seconds, min_interval_minutes, daily_attempts_per_number, daily_calls_cap, max_concurrent, recording_notice_text").eq("account_id", contaId).maybeSingle();
		if (erroDaPolitica) throw new Error(erroDaPolitica.message);
		const { data: playbooks, error: erroDosPlaybooks } = await servico.from("playbooks").select("id, purpose, current_version_id").eq("account_id", contaId);
		if (erroDosPlaybooks) throw new Error(erroDosPlaybooks.message);
		const roteiros = {};
		for (const playbook of playbooks ?? []) {
			const vigente = await versaoVigente(playbook.id, playbook.current_version_id);
			if (vigente) roteiros[playbook.purpose] = vigente;
		}
		const ajustes = agente?.voice_settings ?? {};
		return {
			vozId: agente?.voice_id ?? null,
			estado: {
				identidade: agente ? {
					nome: agente.name,
					primeiraFala: agente.first_message ?? null,
					oferta: agente.offer_line ?? null,
					nuncaAfirmar: agente.never_claim ?? []
				} : null,
				roteiros,
				voz: Object.fromEntries(Object.entries(ajustes).filter((par) => typeof par[1] === "number")),
				politica: politica ? {
					duracao_maxima: politica.max_duration_seconds,
					intervalo_minimo: politica.min_interval_minutes,
					tentativas_por_numero: politica.daily_attempts_per_number,
					teto_diario: politica.daily_calls_cap,
					simultaneidade: politica.max_concurrent
				} : null,
				avisoDeGravacao: politica?.recording_notice_text ?? null
			}
		};
	},
	credencialDaVoz(contaId) {
		return cofre.resolveSecret(contaId, CREDENCIAL_DA_VOZ.provedor, CREDENCIAL_DA_VOZ.chave);
	},
	async consultarVoz(caminho, chave) {
		const inicio = Date.now();
		try {
			const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${caminho}`, {
				headers: { "xi-api-key": chave },
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			const latenciaMs = Date.now() - inicio;
			if (!resposta.ok) {
				await resposta.body?.cancel();
				return {
					ok: false,
					status: resposta.status,
					latenciaMs,
					corpo: null
				};
			}
			return {
				ok: true,
				status: resposta.status,
				latenciaMs,
				corpo: await resposta.json()
			};
		} catch {
			return {
				ok: false,
				status: null,
				latenciaMs: Date.now() - inicio,
				corpo: null
			};
		}
	},
	async modeloDaConta(contaId) {
		const { data, error } = await servico.rpc("resolver_modelo_da_conta", {
			p_account_id: contaId,
			p_tarefa: TAREFA_DO_DIAGNOSTICO
		});
		if (error) throw new Error(error.message);
		return modeloDaTarefa((data ?? [])[0] ?? null, TAREFA_DO_DIAGNOSTICO);
	},
	async perguntarAoModelo(pedido) {
		return await perguntarAoModelo(pedido.contaId, {
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
	async gravarDiagnostico(linha) {
		const { data, error } = await servico.from("call_diagnoses").insert(linha).select("id, created_at").single();
		if (error) throw new Error(error.message);
		return data;
	},
	async registrarEventoDeIntegracao(evento) {
		const { error } = await servico.from("integration_events").insert(evento);
		if (error) throw new Error(error.message);
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
	const resposta = await atenderDiagnostico({
		metodo: requisicao.method,
		autorizacao: requisicao.headers.get("authorization"),
		contaId: corpo?.account_id ?? null,
		chamadaId: corpo?.call_id ?? null
	}, porta);
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
