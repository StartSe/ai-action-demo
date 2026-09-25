// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/call-finalize/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
const CRITERIOS_MINIMOS = Object.freeze([
	{
		key: "aviso_gravacao",
		rotulo: "Avisou que a ligação é gravada",
		obrigatorio: true,
		como: "trecho",
		trechos: [
			"ligacao e gravada",
			"ligacao esta sendo gravada",
			"estou gravando",
			"vou gravar"
		]
	},
	{
		key: "identificacao_honesta",
		rotulo: "Disse quem é e de onde fala na abertura",
		obrigatorio: true,
		como: "trecho",
		trechos: [
			"aqui e a",
			"sou a",
			"meu nome e"
		]
	},
	{
		key: "nada_fora_da_base",
		rotulo: "Não afirmou nada fora da base de conhecimento",
		obrigatorio: false,
		como: "modelo"
	}
]);
const COLUNAS_DO_CRITERIO = "key, label, obrigatorio, como, trechos, position";
function lerLinhaDeCriterio(linha) {
	return {
		key: String(linha.key),
		label: String(linha.label),
		obrigatorio: linha.obrigatorio === true,
		como: linha.como === "trecho" ? "trecho" : "modelo",
		trechos: Array.isArray(linha.trechos) ? linha.trechos.map(String) : [],
		position: Number(linha.position)
	};
}
Object.freeze(CRITERIOS_MINIMOS.map((criterio, posicao) => ({
	key: criterio.key,
	label: criterio.rotulo,
	obrigatorio: criterio.obrigatorio,
	como: criterio.como === "trecho" ? "trecho" : "modelo",
	trechos: [...criterio.trechos ?? []],
	position: posicao
})));
function portaDoJuizoGravado(evaluation) {
	return { julgar(_transcricao, criterios) {
		const gravados = juizoGravado(evaluation);
		if (!gravados) return Promise.resolve("");
		const resposta = {};
		for (const criterio of criterios) {
			const item = gravados[criterio.key];
			if (!item || typeof item !== "object" || Array.isArray(item)) continue;
			const { aprovado, justificativa } = item;
			if (typeof aprovado !== "boolean") continue;
			resposta[criterio.key] = {
				aprovado,
				evidencia: typeof justificativa === "string" ? justificativa : null
			};
		}
		return Promise.resolve(JSON.stringify({ criterios: resposta }));
	} };
}
function juizoGravado(evaluation) {
	if (!evaluation || typeof evaluation !== "object" || Array.isArray(evaluation)) return null;
	const criterios = evaluation.criterios;
	if (!criterios || typeof criterios !== "object" || Array.isArray(criterios)) return null;
	return criterios;
}
function normalizar$1(texto) {
	return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}
function porTrecho(criterio, transcricao) {
	const trechos = (criterio.trechos ?? []).map(normalizar$1).filter((t) => t !== "");
	for (const turno of transcricao) {
		if (turno.papel !== "sarah") continue;
		const texto = normalizar$1(turno.texto);
		if (trechos.find((t) => texto.includes(t))) return {
			item: {
				criterio: criterio.key,
				aprovado: true,
				evidencia: turno.texto
			},
			instante: turno.instante ?? null
		};
	}
	return {
		item: {
			criterio: criterio.key,
			aprovado: false,
			evidencia: null
		},
		instante: null
	};
}
function lerJulgamento(texto, criterios) {
	let dado;
	try {
		dado = JSON.parse(texto);
	} catch {
		dado = void 0;
	}
	const objeto = dado && typeof dado === "object" && !Array.isArray(dado) ? dado.criterios ?? dado : void 0;
	if (!objeto || typeof objeto !== "object" || Array.isArray(objeto)) return criterios.map((c) => ({
		criterio: c.key,
		aprovado: null,
		evidencia: null,
		motivo: "resposta_ilegivel"
	}));
	const bruto = objeto;
	return criterios.map((c) => {
		const valor = Object.prototype.hasOwnProperty.call(bruto, c.key) ? bruto[c.key] : void 0;
		if (valor === void 0 || valor === null) return {
			criterio: c.key,
			aprovado: null,
			evidencia: null,
			motivo: "nao_informado"
		};
		if (typeof valor !== "object" || Array.isArray(valor)) return {
			criterio: c.key,
			aprovado: null,
			evidencia: null,
			motivo: "tipo_invalido"
		};
		const registro = valor;
		if (typeof registro.aprovado !== "boolean") return {
			criterio: c.key,
			aprovado: null,
			evidencia: null,
			motivo: "tipo_invalido"
		};
		const evidencia = typeof registro.evidencia === "string" && registro.evidencia.trim() !== "" ? registro.evidencia : null;
		return {
			criterio: c.key,
			aprovado: registro.aprovado,
			evidencia
		};
	});
}
function notaDosItens(itens, criterios) {
	const obrigatorios = new Set(criterios.filter((c) => c.obrigatorio).map((c) => c.key));
	if (itens.some((i) => i.aprovado === false && obrigatorios.has(i.criterio))) return 0;
	const decididos = itens.filter((i) => i.aprovado !== null);
	if (decididos.length === 0) return 0;
	const aprovados = decididos.filter((i) => i.aprovado === true).length;
	return Math.round(100 * aprovados / decididos.length) / 10;
}
async function avaliarChamada(transcricao, criterios, porta, registrados = []) {
	const porItem = new Map();
	let avisoDeGravacaoEm = null;
	for (const criterio of criterios) {
		if (criterio.como !== "registro") continue;
		const item = registrados.find((i) => i.criterio === criterio.key);
		porItem.set(criterio.key, item ?? {
			criterio: criterio.key,
			aprovado: null,
			evidencia: null,
			motivo: "nao_informado"
		});
	}
	for (const criterio of criterios) {
		if (criterio.como !== "trecho") continue;
		const { item, instante } = porTrecho(criterio, transcricao);
		porItem.set(criterio.key, item);
		if (criterio.key === "aviso_gravacao" && item.aprovado) avisoDeGravacaoEm = instante;
	}
	const deModelo = criterios.filter((c) => c.como === "modelo");
	if (deModelo.length > 0) {
		let texto;
		try {
			texto = await porta.julgar(transcricao, deModelo);
		} catch {
			texto = "";
		}
		for (const item of lerJulgamento(texto, deModelo)) porItem.set(item.criterio, item);
	}
	const itens = criterios.map((c) => porItem.get(c.key));
	return {
		nota: notaDosItens(itens, criterios),
		itens,
		avisoDeGravacaoEm,
		reprovados: () => itens.filter((i) => i.aprovado === false).map((i) => i.criterio)
	};
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
//#region supabase/functions/_shared/automacao/politica-de-retentativa.ts
function resultadoDoFim(endReason) {
	switch (endReason) {
		case "no_answer": return "sem_atendimento";
		case "busy": return "ocupado";
		case "voicemail": return "caixa_postal";
		case "invalid_number": return "numero_invalido";
		default: return null;
	}
}
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
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
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
//#endregion
//#region supabase/functions/_shared/qualificacao/obrigatoriedade.ts
const FERRAMENTA_DE_QUALIFICACAO = DESCRITOR_DA_QUALIFICACAO.nome;
const PROPOSITOS_QUE_EXIGEM_QUALIFICACAO = ["discovery"];
const ENCERRAMENTO_POR_REGRA_TRAVADA = ["tool-dnc"];
const CHAVE_DA_QUALIFICACAO_REGISTRADA = "qualificacao_registrada";
const CRITERIO_QUALIFICACAO_REGISTRADA = Object.freeze({
	key: CHAVE_DA_QUALIFICACAO_REGISTRADA,
	rotulo: "Registrou a qualificação antes de encerrar",
	obrigatorio: true,
	como: "registro"
});
function exigeQualificacao(proposito, ferramentasDoProposito) {
	return PROPOSITOS_QUE_EXIGEM_QUALIFICACAO.includes(proposito) && ferramentasDoProposito.includes(FERRAMENTA_DE_QUALIFICACAO);
}
function qualificou(invocacoes) {
	return invocacoes.some((i) => i.tool === FERRAMENTA_DE_QUALIFICACAO && i.error === null);
}
function seAplica(chamada) {
	return PROPOSITOS_QUE_EXIGEM_QUALIFICACAO.includes(chamada.purpose) && chamada.direction !== "rehearsal" && chamada.answered_at !== null;
}
function faltouQualificar(chamada, invocacoes) {
	return seAplica(chamada) && !qualificou(invocacoes);
}
function avaliarQualificacao(chamada, invocacoes) {
	if (!seAplica(chamada)) return null;
	if (qualificou(invocacoes)) return {
		criterio: CHAVE_DA_QUALIFICACAO_REGISTRADA,
		aprovado: true,
		evidencia: FERRAMENTA_DE_QUALIFICACAO
	};
	if (invocacoes.some((i) => ENCERRAMENTO_POR_REGRA_TRAVADA.includes(i.tool))) return {
		criterio: CHAVE_DA_QUALIFICACAO_REGISTRADA,
		aprovado: null,
		evidencia: null,
		motivo: "nao_se_aplica"
	};
	return {
		criterio: CHAVE_DA_QUALIFICACAO_REGISTRADA,
		aprovado: false,
		evidencia: null
	};
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
//#region supabase/functions/_shared/playbook/camada-um.ts
const PROPOSITOS = [
	"discovery",
	"reminder",
	"rescue",
	"followup"
];
const FERRAMENTA_DE_AGENDA = "tool-availability";
function escolherVariante(ferramentasDoProposito) {
	return ferramentasDoProposito.includes("tool-availability") ? "com_agenda" : "sem_agenda";
}
FALAS_DE_TODO_PROPOSITO.avisoDeGravacao, [...FALAS_DE_TODO_PROPOSITO.recusaDeAfirmar], [...FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe], [...FALAS_DAS_REGRAS_TRAVADAS.pedidoDeHumano], [...FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada];
[...FALAS_DA_QUALIFICACAO.antesDeEncerrar];
[...FALAS_DE_DESCOBERTA.fechamento.sem_agenda], [...FALAS_DE_DESCOBERTA.fechamento.com_agenda];
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
const CRITERIOS_DE_TODO_PROPOSITO = [
	{
		chave: "aviso_gravacao",
		requisitos: ["RF-420", "RF-810"],
		pergunta: "A assistente avisou que a ligação é gravada na primeira fala, antes de fazer qualquer pergunta?"
	},
	{
		chave: "nunca_afirmar",
		requisitos: ["RF-301"],
		pergunta: "A assistente evitou afirmar qualquer item da lista da conta, sem estimar, arredondar nem dar faixa de valores?"
	},
	{
		chave: "bloqueio_atendido",
		requisitos: ["RF-805", "R-02"],
		pergunta: "Se alguém pediu para não ser mais procurado, a assistente prometeu o bloqueio em voz alta e encerrou, sem insistir e sem oferecer alternativa?"
	},
	{
		chave: "humano_atendido",
		requisitos: ["RF-909"],
		pergunta: "Se alguém pediu para falar com uma pessoa ou trouxe tema sensível, a assistente encaminhou para o time sem responder ela mesma ao tema e sem prometer prazo de retorno?"
	},
	{
		chave: "pessoa_errada",
		requisitos: ["RF-422", "T-02"],
		pergunta: "Se ficou claro que a assistente não falava com a pessoa certa, ela encerrou cordialmente em no máximo duas falas, sem explicar o produto e sem pedir o número certo?"
	}
];
const CRITERIO_DE_FECHAMENTO = {
	sem_agenda: {
		chave: "fechamento_sem_promessa",
		requisitos: ["O-06"],
		pergunta: "A assistente encerrou perguntando o melhor canal e o melhor período para o especialista procurar, sem oferecer dia ou hora e sem prometer convite, confirmação ou e-mail com data?"
	},
	com_agenda: {
		chave: "fechamento_com_horario",
		requisitos: ["RF-306"],
		pergunta: "A assistente ofereceu os horários disponíveis pelo número da opção e confirmou a escolha, sem ler nenhum identificador em voz alta?"
	}
};
const CRITERIO_DA_QUALIFICACAO = {
	chave: CHAVE_DA_QUALIFICACAO_REGISTRADA,
	requisitos: ["RF-306", "RF-314"],
	pergunta: "Numa conversa que não terminou por pedido de bloqueio nem por pessoa errada, a Sarah registrou a qualificação com tool-qualify antes de se despedir?"
};
const REQUISITO_DO_CRITERIO_DA_CONTA = "RF-314";
function criteriosDaChamada(proposito, variante, qualifica, daConta = []) {
	const qualificacao = proposito === "discovery" && qualifica ? [CRITERIO_DA_QUALIFICACAO] : [];
	const fechamento = proposito === "discovery" ? [CRITERIO_DE_FECHAMENTO[variante]] : [];
	const daCamadaUm = [
		...CRITERIOS_DE_TODO_PROPOSITO,
		...qualificacao,
		...fechamento
	].map((criterio) => criterio.chave === "qualificacao_registrada" ? {
		...criterio,
		rotulo: CRITERIO_QUALIFICACAO_REGISTRADA.rotulo,
		obrigatorio: CRITERIO_QUALIFICACAO_REGISTRADA.obrigatorio,
		como: CRITERIO_QUALIFICACAO_REGISTRADA.como,
		trechos: []
	} : {
		...criterio,
		rotulo: criterio.pergunta,
		obrigatorio: false,
		como: "modelo",
		trechos: []
	});
	const ordenadas = [...daConta].sort((a, b) => a.position - b.position);
	const porChave = new Map(ordenadas.map((linha) => [linha.key, linha]));
	const aplicados = daCamadaUm.map((criterio) => {
		const linha = porChave.get(criterio.chave);
		if (!linha || criterio.como === "registro") return criterio;
		return {
			...criterio,
			rotulo: linha.label,
			obrigatorio: linha.obrigatorio,
			como: linha.como,
			trechos: [...linha.trechos]
		};
	});
	const jaAplicadas = new Set(aplicados.map((criterio) => criterio.chave));
	for (const linha of ordenadas) {
		if (jaAplicadas.has(linha.key)) continue;
		jaAplicadas.add(linha.key);
		aplicados.push({
			chave: linha.key,
			requisitos: [REQUISITO_DO_CRITERIO_DA_CONTA],
			pergunta: linha.label,
			rotulo: linha.label,
			obrigatorio: linha.obrigatorio,
			como: linha.como,
			trechos: [...linha.trechos]
		});
	}
	return aplicados;
}
function criteriosDoPropositoGravado(proposito, daConta = [], fatia = "F3") {
	if (!PROPOSITOS.includes(proposito)) return [];
	const conhecido = proposito;
	const ferramentas = ferramentasDoProposito(conhecido, fatia);
	return criteriosDaChamada(conhecido, escolherVariante(ferramentas), exigeQualificacao(conhecido, ferramentas), daConta);
}
function paraAvaliacaoAutomatica(criterio) {
	return {
		key: criterio.chave,
		rotulo: criterio.rotulo,
		obrigatorio: criterio.obrigatorio,
		como: criterio.como,
		...criterio.trechos.length > 0 ? { trechos: criterio.trechos } : {}
	};
}
const VARIAVEIS_DA_CHAMADA = [...[
	"nome_do_lead",
	"empresa_do_lead",
	"cidade_do_lead",
	"nome_do_especialista"
], "contexto_do_lead"];
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
//#region supabase/functions/call-finalize/consentimento.ts
const MARCADOR = /\{[a-z_]+\}/g;
function normalizarFala(texto) {
	return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function trechoDoAviso(modelo) {
	let maior = "";
	for (const pedaco of modelo.split(MARCADOR)) {
		const normalizado = normalizarFala(pedaco);
		if (normalizado.length > maior.length) maior = normalizado;
	}
	return maior;
}
function modeloDoAviso(textoDaConta) {
	const proprio = textoDaConta?.trim();
	return proprio ? proprio : FALAS_DE_TODO_PROPOSITO.avisoDeGravacao;
}
function trechosDoAviso(textoDaConta, trechosDoCriterio = []) {
	const todos = [trechoDoAviso(modeloDoAviso(textoDaConta)), ...trechosDoCriterio.map(normalizarFala)].filter((trecho) => trecho !== "");
	return [...new Set(todos)];
}
function lerAvisoDeGravacao(turnos, textoDaConta, trechosDoCriterio = []) {
	const trechos = trechosDoAviso(textoDaConta, trechosDoCriterio);
	const indice = turnos.findIndex((turno) => turno.quem === "agent" && trechos.some((trecho) => normalizarFala(turno.texto).includes(trecho)));
	const turno = indice >= 0 ? turnos[indice] : void 0;
	if (!turno) return {
		segundo: null,
		concedido: false,
		evidencia: { aviso: "ausente" }
	};
	const resposta = turnos.slice(indice + 1).find((seguinte) => seguinte.quem === "lead");
	return {
		segundo: turno.segundo,
		concedido: resposta !== void 0,
		evidencia: {
			aviso: "encontrado",
			turno: indice,
			segundo: turno.segundo,
			fala: turno.texto,
			resposta_do_lead: resposta?.texto ?? null
		}
	};
}
//#endregion
//#region supabase/functions/call-finalize/avaliacao-automatica.ts
const SEM_MODELO = { julgar: () => Promise.resolve("") };
function criteriosAplicados(proposito, daConta, gravacao) {
	return criteriosDoPropositoGravado(proposito, daConta).map((criterio) => {
		const objetivo = paraAvaliacaoAutomatica(criterio);
		if (objetivo.key !== "aviso_gravacao") return objetivo;
		if (!gravacao.ligada) return {
			key: objetivo.key,
			rotulo: objetivo.rotulo,
			obrigatorio: objetivo.obrigatorio,
			como: "registro"
		};
		return {
			...objetivo,
			como: "trecho",
			trechos: trechosDoAviso(gravacao.aviso, objetivo.trechos ?? [])
		};
	});
}
function itensRegistrados(criterios, chamada, invocacoes) {
	const itens = [];
	for (const criterio of criterios) {
		if (criterio.como !== "registro") continue;
		if (criterio.key === "aviso_gravacao") {
			itens.push({
				criterio: criterio.key,
				aprovado: null,
				evidencia: null,
				motivo: "nao_se_aplica"
			});
			continue;
		}
		const item = avaliarQualificacao(chamada, invocacoes);
		if (item && item.criterio === criterio.key) itens.push(item);
	}
	return itens;
}
function turnosParaAvaliacao(turnos, instante) {
	return turnos.map((turno) => ({
		papel: turno.quem === "agent" ? "sarah" : "interlocutor",
		texto: turno.texto,
		instante: instante(turno.segundo)
	}));
}
async function avisoDeGravacaoEm(turnos, criterios) {
	const doAviso = criterios.filter((c) => c.key === "aviso_gravacao" && c.como === "trecho");
	if (doAviso.length === 0) return null;
	return (await avaliarChamada(turnos, doAviso, SEM_MODELO)).avisoDeGravacaoEm;
}
async function aplicarAvaliacao(chamada, contexto, porta) {
	if (!contexto.aplica) return { situacao: "nao_se_aplica" };
	try {
		const resultado = await porta.lerResultadoDaChamada(chamada.id);
		const avaliacao = await avaliarChamada(contexto.turnos, contexto.criterios, portaDoJuizoGravado(resultado.evaluation), contexto.registrados);
		if (!avaliacao.itens.some((item) => item.aprovado !== null)) return { situacao: "sem_decisao" };
		const nota = juizoGravado(resultado.evaluation) === null && contexto.criterios.some((c) => c.como === "modelo") ? null : avaliacao.nota;
		await porta.registrarAvaliacaoAutomatica(chamada.account_id, chamada.id, avaliacao.itens, nota);
		return {
			situacao: "avaliada",
			nota,
			reprovados: avaliacao.reprovados()
		};
	} catch {
		return { situacao: "falhou" };
	}
}
const MOTIVO_GRAVADO = {
	lead_request: "Pediu durante a ligação para não ser mais chamado.",
	wrong_number: "Número errado: quem atendeu não era a pessoa procurada."
};
function texto$1(valor) {
	return typeof valor === "string" ? valor.trim() : "";
}
function origemDoMotivo(reason) {
	return texto$1(reason).toLowerCase() === "wrong_number" ? "wrong_number" : "lead_request";
}
function notasDoPedido(entrada) {
	const reason = texto$1(entrada.reason);
	const partes = [["lead_request", "wrong_number"].includes(reason.toLowerCase()) ? "" : reason, texto$1(entrada.notes)].filter((parte) => parte !== "");
	return partes.length === 0 ? null : [...new Set(partes)].join(" | ");
}
function numeroDoInterlocutor(chamada, numeros) {
	const numero = texto$1(chamada.direction === "inbound" ? numeros.de : numeros.para) || texto$1(numeros.doLead);
	return numero === "" ? null : numero;
}
const REQUISITO_DO_ENCERRAMENTO = "RF-422";
const FALA_DA_SARAH = (turno) => turno.quem === "agent";
function medirEncerramentoDaPessoaErrada(conversa, ehFalaDaSarah) {
	const identificacoes = conversa.invocacoes.filter((invocacao) => invocacao.nome === "tool-dnc" && origemDoMotivo(invocacao.parametros.reason) === "wrong_number").map((invocacao) => invocacao.segundo);
	if (identificacoes.length === 0) return { aplica: false };
	const inicio = Math.min(...identificacoes);
	const encerramentos = conversa.invocacoes.filter((invocacao) => invocacao.nome === "end_call" && invocacao.erro === null && invocacao.segundo >= inicio).map((invocacao) => invocacao.segundo);
	const encerrouComEndCall = encerramentos.length > 0;
	const fim = encerrouComEndCall ? Math.min(...encerramentos) : Number.POSITIVE_INFINITY;
	const falas = conversa.turnos.filter((turno) => ehFalaDaSarah(turno) && turno.segundo >= inicio && turno.segundo <= fim).length;
	return {
		aplica: true,
		falas,
		conforme: falas <= 2,
		encerrouComEndCall
	};
}
function divergenciaGravada(medicao) {
	return {
		conforme: false,
		falas: medicao.falas,
		limite: 2,
		encerrou_com_end_call: medicao.encerrouComEndCall,
		requisito: REQUISITO_DO_ENCERRAMENTO
	};
}
//#endregion
//#region supabase/functions/call-finalize/formato-do-provedor.ts
const FERRAMENTAS_DE_SISTEMA = {
	end_call: "system:end_call",
	transfer_to_number: "system:transfer_to_number",
	voicemail_detection: "system:voicemail_detection"
};
const FORMATO_DA_CONVERSA = "elevenlabs.convai.conversation.v1";
const ADAPTADORES_DE_CONVERSA = new Map([[FORMATO_DA_CONVERSA, (corpo) => lerConversaDoProvedor(corpo)]]);
function lerConversa(corpo, formato = FORMATO_DA_CONVERSA) {
	const adaptador = ADAPTADORES_DE_CONVERSA.get(formato);
	if (!adaptador) throw new Error(`formato de conversa sem adaptador: ${formato}`);
	return adaptador(corpo);
}
function caminhoDaConversa(conversaId) {
	return `convai/conversations/${encodeURIComponent(conversaId)}`;
}
function caminhoDoAudio(conversaId) {
	return `${caminhoDaConversa(conversaId)}/audio`;
}
function lerConversaDoProvedor(corpo) {
	const raiz = objeto(corpo);
	if (!raiz) return null;
	const situacao = texto(raiz.status);
	const metadados = objeto(raiz.metadata) ?? {};
	const turnosCrus = Array.isArray(raiz.transcript) ? raiz.transcript : [];
	const turnos = [];
	const invocacoes = [];
	const resultados = lerResultados(turnosCrus);
	for (const cru of turnosCrus) {
		const turno = objeto(cru);
		if (!turno) continue;
		const segundo = numero(turno.time_in_call_secs) ?? 0;
		const quem = lerQuemFalou(turno.role);
		const fala = texto(turno.message)?.trim();
		if (quem && fala) turnos.push({
			quem,
			texto: fala,
			segundo
		});
		const chamadas = Array.isArray(turno.tool_calls) ? turno.tool_calls : [];
		for (const chamadaCrua of chamadas) {
			const chamada = objeto(chamadaCrua);
			if (!chamada) continue;
			const nome = texto(chamada.tool_name)?.trim();
			if (!nome) continue;
			const pedido = texto(chamada.request_id);
			const resultado = (pedido ? resultados.porPedido.get(pedido) : void 0) ?? resultados.porTurno.get(turno)?.get(nome);
			invocacoes.push({
				nome,
				segundo,
				parametros: lerParametros(chamada.params_as_json),
				erro: resultado?.erro ?? null
			});
		}
	}
	return {
		pronta: situacao === "done" || situacao === "failed",
		falhou: situacao === "failed",
		turnos,
		invocacoes,
		inicioEmSegundos: numero(metadados.start_time_unix_secs),
		duracaoEmSegundos: numero(metadados.call_duration_secs),
		motivoDoProvedor: texto(metadados.termination_reason),
		temAudio: raiz.has_audio === true,
		custos: lerCustos(objeto(metadados.charging))
	};
}
function lerResultados(turnosCrus) {
	const porPedido = new Map();
	const porTurno = new Map();
	for (const cru of turnosCrus) {
		const turno = objeto(cru);
		if (!turno || !Array.isArray(turno.tool_results)) continue;
		const doTurno = new Map();
		for (const resultadoCru of turno.tool_results) {
			const resultado = objeto(resultadoCru);
			if (!resultado) continue;
			const lido = { erro: resultado.is_error === true ? descreverErro(resultado.result_value) : null };
			const pedido = texto(resultado.request_id);
			if (pedido) porPedido.set(pedido, lido);
			const nome = texto(resultado.tool_name)?.trim();
			if (nome) doTurno.set(nome, lido);
		}
		porTurno.set(turno, doTurno);
	}
	return {
		porPedido,
		porTurno
	};
}
function descreverErro(valor) {
	const bruto = typeof valor === "string" ? valor.trim() : valor === void 0 || valor === null ? "" : JSON.stringify(valor);
	return (bruto === "" ? "o provedor registrou erro sem descrição" : bruto).slice(0, 500);
}
function lerCustos(cobranca) {
	if (!cobranca) return [];
	const custos = [];
	const modelo = numero(cobranca.llm_price);
	if (modelo !== null && modelo >= 0) custos.push({
		componente: "model",
		valorEmDolares: modelo
	});
	return custos;
}
function lerQuemFalou(valor) {
	if (valor === "agent") return "agent";
	if (valor === "user") return "lead";
	return null;
}
function lerParametros(valor) {
	if (typeof valor !== "string") return objeto(valor) ?? {};
	try {
		return objeto(JSON.parse(valor)) ?? {};
	} catch {
		return {};
	}
}
function objeto(valor) {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? valor : null;
}
function texto(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}
function numero(valor) {
	return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
//#endregion
//#region supabase/functions/call-finalize/leitura-da-transcricao.ts
const NOSSAS_FERRAMENTAS = new Set(CATALOGO_DE_FERRAMENTAS.map((f) => f.nome));
const NOME_DE_SISTEMA = /^[A-Za-z0-9_.]{1,100}$/;
function instantesDasInvocacoes(lidas, inicioMs) {
	const ordenadas = lidas.map((invocacao, indice) => ({
		invocacao,
		indice,
		base: inicioMs + Math.round(invocacao.segundo * 1e3)
	})).sort((a, b) => a.base - b.base || a.indice - b.indice);
	let anterior = Number.NEGATIVE_INFINITY;
	return ordenadas.map(({ invocacao, base }) => {
		const ms = base > anterior ? base : anterior + 1;
		anterior = ms;
		return {
			invocacao,
			ms
		};
	});
}
function linhasDeInvocacao(chamada, lidas, inicioMs) {
	const linhas = [];
	for (const { invocacao, ms } of instantesDasInvocacoes(lidas, inicioMs)) {
		const nossa = NOSSAS_FERRAMENTAS.has(invocacao.nome);
		if (nossa && invocacao.erro === null) continue;
		const nome = nossa ? {
			tool: invocacao.nome,
			ajustado: false
		} : nomeDeSistema(invocacao.nome);
		linhas.push({
			account_id: chamada.account_id,
			call_id: chamada.id,
			tool: nome.tool,
			request: invocacao.parametros,
			response: nome.ajustado ? { nome_recebido: invocacao.nome } : {},
			latency_ms: null,
			error: invocacao.erro,
			at: new Date(ms).toISOString()
		});
	}
	return linhas;
}
function nomeDeSistema(nome) {
	if (Object.hasOwn(FERRAMENTAS_DE_SISTEMA, nome)) return {
		tool: FERRAMENTAS_DE_SISTEMA[nome],
		ajustado: false
	};
	if (NOME_DE_SISTEMA.test(nome)) return {
		tool: `system:${nome}`,
		ajustado: false
	};
	return {
		tool: `system:${nome.replace(/[^A-Za-z0-9_.]/g, "_").slice(0, 100)}`,
		ajustado: true
	};
}
function lerFim(conversa, duracaoMaximaEmSegundos) {
	const usadas = new Set(conversa.invocacoes.filter((invocacao) => invocacao.erro === null).map((invocacao) => invocacao.nome));
	const leadFalou = conversa.turnos.some((turno) => turno.quem === "lead");
	if (usadas.has("voicemail_detection")) return {
		motivo: "voicemail",
		atendidaPor: "machine"
	};
	const atendidaPor = leadFalou ? "human" : "unknown";
	if (usadas.has("transfer_to_number")) return {
		motivo: "transferred",
		atendidaPor
	};
	if (usadas.has("end_call")) return {
		motivo: "completed",
		atendidaPor
	};
	if (conversa.duracaoEmSegundos !== null && conversa.duracaoEmSegundos >= duracaoMaximaEmSegundos) return {
		motivo: "max_duration",
		atendidaPor
	};
	if (conversa.turnos.length === 0) return {
		motivo: "no_answer",
		atendidaPor: "unknown"
	};
	return {
		motivo: "completed",
		atendidaPor
	};
}
//#endregion
//#region supabase/functions/call-finalize/reaplicacao.ts
const REAPLICADORES = new Map();
async function reaplicarFalhas(comErro, inseridas, registro) {
	const novas = new Set(inseridas.map((chave) => chaveDe(chave.tool, chave.at)));
	let feitas = 0;
	let falharam = 0;
	for (const invocacao of comErro) {
		const reaplicador = registro.get(invocacao.tool);
		if (!reaplicador || !novas.has(chaveDe(invocacao.tool, invocacao.at))) continue;
		try {
			await reaplicador(invocacao);
			feitas += 1;
		} catch {
			falharam += 1;
		}
	}
	return {
		feitas,
		falharam
	};
}
function chaveDe(ferramenta, instante) {
	return `${ferramenta}\u0000${Date.parse(instante)}`;
}
//#endregion
//#region supabase/functions/call-finalize/reaplicacao-do-bloqueio.ts
const FERRAMENTA_DE_BLOQUEIO = "tool-dnc";
const NOTA_DA_REAPLICACAO = "Reaplicado na finalização: a ferramenta não gravou o bloqueio durante a ligação.";
function pedidosDeBloqueio(lidas, inicioMs) {
	return instantesDasInvocacoes(lidas, inicioMs).filter(({ invocacao }) => invocacao.nome === FERRAMENTA_DE_BLOQUEIO).map(({ invocacao, ms }) => ({
		origem: origemDoMotivo(invocacao.parametros.reason),
		notas: notasDoPedido(invocacao.parametros),
		instante: new Date(ms).toISOString()
	}));
}
function notasDaReaplicacao(notas) {
	return notas === null ? NOTA_DA_REAPLICACAO : `${NOTA_DA_REAPLICACAO} | ${notas}`;
}
async function reaplicarBloqueios(chamada, pedidos, porta) {
	const resultado = {
		ensaio: false,
		pedidos: pedidos.length,
		criados: 0,
		existentes: 0,
		semNumero: 0,
		itensQueFalharam: 0
	};
	if (chamada.direction === "rehearsal") return {
		...resultado,
		ensaio: true
	};
	if (pedidos.length === 0) return resultado;
	const telefone = numeroDoInterlocutor(chamada, await porta.numerosDaChamada(chamada.account_id, chamada.id));
	if (telefone === null) return {
		...resultado,
		semNumero: pedidos.length
	};
	for (const pedido of pedidos) {
		const gravado = await porta.bloquearNumero({
			contaId: chamada.account_id,
			telefone,
			origem: pedido.origem,
			motivo: MOTIVO_GRAVADO[pedido.origem],
			notas: notasDaReaplicacao(pedido.notas),
			instante: pedido.instante
		});
		if (!gravado.criado) {
			resultado.existentes += 1;
			continue;
		}
		resultado.criados += 1;
		try {
			await porta.abrirItemDeBloqueio({
				contaId: chamada.account_id,
				chamadaId: chamada.id,
				leadId: chamada.lead_id,
				contexto: {
					call_id: chamada.id,
					origem: pedido.origem,
					recorte: pedido.notas,
					blocked_at: gravado.blockedAt,
					reaplicado: true
				}
			});
		} catch {
			resultado.itensQueFalharam += 1;
		}
	}
	return resultado;
}
//#endregion
//#region supabase/functions/call-finalize/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	segredo_interno_invalido: "Segredo interno ausente ou inválido.",
	chamada_invalida: "O corpo precisa trazer call_id com o identificador da chamada.",
	ja_reivindicada: "Esta chamada já está sendo finalizada por outra passagem, ou já foi finalizada.",
	sem_conversa: "Esta chamada não tem conversa no provedor de voz. Quem a fecha é a varredura de recuperação.",
	credencial_indisponivel: "A credencial do provedor de voz desta conta não está disponível. A finalização será tentada de novo.",
	transcricao_indisponivel: "O provedor de voz não devolveu a conversa agora. A finalização será tentada de novo.",
	transcricao_pendente: "O provedor de voz ainda está processando a conversa. A finalização será tentada de novo.",
	falha_interna: "Não foi possível finalizar esta chamada agora. A finalização será tentada de novo."
};
const STATUS = {
	metodo_invalido: 405,
	segredo_interno_invalido: 401,
	chamada_invalida: 400,
	ja_reivindicada: 409,
	sem_conversa: 422,
	credencial_indisponivel: 503,
	transcricao_indisponivel: 503,
	transcricao_pendente: 503,
	falha_interna: 503
};
//#endregion
//#region supabase/functions/call-finalize/retaguarda.ts
function decidirRetaguarda(chamada, conversa, invocacoes) {
	if (!conversa.atendidaPorGente) return "dispensada";
	if (invocacoes.some((i) => i.tool === FERRAMENTA_DE_QUALIFICACAO && i.error === null) || chamada.classification_source !== null) return "qualificada";
	if (faltouQualificar(chamada, invocacoes)) return "faltou_qualificar";
	return conversa.leadFalou ? "sem_classificacao" : "dispensada";
}
function acionaRetaguarda(motivo) {
	return motivo === "faltou_qualificar" || motivo === "sem_classificacao";
}
//#endregion
//#region supabase/functions/_shared/fila/gatilhos.ts
function itensDaChamada(chamada, limiares, historico) {
	if (chamada.direction === "rehearsal") return [];
	const itens = [];
	const base = {
		leadId: chamada.leadId,
		callId: chamada.id
	};
	const trecho = chamada.trecho ?? null;
	if (chamada.atendida && chamada.sentimento !== null && chamada.sentimento <= limiares.sentiment_floor) itens.push({
		...base,
		kind: "sentimento_negativo",
		severity: "alta",
		deduplicacaoKey: `sentimento:${chamada.id}`,
		context: {
			call_id: chamada.id,
			sentimento: chamada.sentimento,
			trecho
		},
		thresholdSnapshot: { sentiment_floor: limiares.sentiment_floor }
	});
	if (chamada.atendida && chamada.criteriosReprovados.length >= limiares.failed_criteria_cap) itens.push({
		...base,
		kind: "avaliacao_reprovada",
		severity: "media",
		deduplicacaoKey: `avaliacao:${chamada.id}`,
		context: {
			call_id: chamada.id,
			criterios: [...chamada.criteriosReprovados],
			trecho
		},
		thresholdSnapshot: { failed_criteria_cap: limiares.failed_criteria_cap }
	});
	if (!chamada.atendida && historico.falhasConsecutivas >= limiares.consecutive_failures_cap) itens.push({
		...base,
		kind: "falha_repetida",
		severity: "media",
		deduplicacaoKey: `falha:${chamada.telefone}:${chamada.dia}`,
		context: {
			call_id: chamada.id,
			phone_e164: chamada.telefone,
			falhas: historico.falhasConsecutivas
		},
		thresholdSnapshot: { consecutive_failures_cap: limiares.consecutive_failures_cap }
	});
	const credito = historico.credito;
	if (limiares.credit_alert_cents !== null && credito && credito.saldoCents < limiares.credit_alert_cents) itens.push({
		...base,
		kind: "credito_baixo",
		severity: "alta",
		deduplicacaoKey: `credito:${credito.provedor}:${chamada.dia}`,
		context: {
			provedor: credito.provedor,
			saldo_cents: credito.saldoCents
		},
		thresholdSnapshot: { credit_alert_cents: limiares.credit_alert_cents }
	});
	return itens;
}
//#endregion
//#region supabase/functions/_shared/qualificacao/resultado.ts
function sentimentoNaFaixa(valor) {
	return typeof valor === "number" && Number.isFinite(valor) && valor >= -1 && valor <= 1 ? valor : null;
}
//#endregion
//#region supabase/functions/call-finalize/sentimento-e-fila.ts
function sentimentoDaChamada(resultado) {
	if (resultado.classification_source === "tool") {
		const classificacao = resultado.classification;
		const valor = sentimentoNaFaixa(classificacao && typeof classificacao === "object" && !Array.isArray(classificacao) ? classificacao.sentiment : null);
		return valor === null ? null : {
			valor,
			fonte: "tool"
		};
	}
	if (resultado.classification_source === "backfill") {
		const valor = sentimentoNaFaixa(resultado.sentiment);
		return valor === null ? null : {
			valor,
			fonte: "backfill"
		};
	}
	return null;
}
function criteriosReprovados(evaluation) {
	if (!evaluation || typeof evaluation !== "object" || Array.isArray(evaluation)) return [];
	const avaliacao = evaluation;
	const reprovados = new Set();
	const criterios = avaliacao.criterios;
	if (criterios && typeof criterios === "object" && !Array.isArray(criterios)) {
		for (const [chave, item] of Object.entries(criterios)) if (item && typeof item === "object" && item.aprovado === false) reprovados.add(chave);
	}
	const itens = avaliacao.itens;
	if (Array.isArray(itens)) for (const item of itens) {
		if (!item || typeof item !== "object") continue;
		const { criterio, aprovado } = item;
		if (typeof criterio === "string" && aprovado === false) reprovados.add(criterio);
	}
	const medicoes = avaliacao.medicoes;
	if (medicoes && typeof medicoes === "object" && !Array.isArray(medicoes)) for (const chave of Object.keys(medicoes)) reprovados.add(chave);
	return [...reprovados];
}
function diaNoFuso(instante, fuso) {
	const data = new Date(instante);
	let formato;
	try {
		formato = new Intl.DateTimeFormat("en-CA", {
			timeZone: fuso,
			year: "numeric",
			month: "2-digit",
			day: "2-digit"
		});
	} catch {
		formato = new Intl.DateTimeFormat("en-CA", {
			timeZone: "UTC",
			year: "numeric",
			month: "2-digit",
			day: "2-digit"
		});
	}
	return formato.format(data);
}
async function aplicarSentimentoEFila(chamada, fim, porta) {
	if (chamada.direction === "rehearsal") return {
		sentimento: "nao_se_aplica",
		fila: { situacao: "nao_se_aplica" }
	};
	let resultado;
	try {
		resultado = await porta.lerResultadoDaChamada(chamada.id);
	} catch {
		return {
			sentimento: "falhou",
			fila: { situacao: "falhou" }
		};
	}
	const sentimento = await gravarSentimento(chamada, resultado, porta);
	let fila;
	try {
		const [{ limiares, fuso }, sequencia] = await Promise.all([porta.limiaresDaFila(chamada.account_id), porta.falhasConsecutivas(chamada.account_id, chamada.id)]);
		const valor = resultado.classification_source === "human" ? sentimentoNaFaixa(resultado.sentiment) : sentimentoDaChamada(resultado)?.valor ?? null;
		const itens = itensDaChamada({
			id: chamada.id,
			direction: chamada.direction,
			atendida: fim.atendidaPor === "human",
			sentimento: valor,
			criteriosReprovados: criteriosReprovados(resultado.evaluation),
			telefone: sequencia?.telefone ?? "",
			dia: diaNoFuso(fim.instante, fuso),
			leadId: chamada.lead_id
		}, limiares, {
			falhasConsecutivas: sequencia?.falhas ?? 0,
			credito: null
		});
		const criados = [];
		const jaAbertos = [];
		for (const item of itens) if (await porta.registrarItemDeFila(chamada.account_id, item) === "criado") criados.push(item.kind);
		else jaAbertos.push(item.kind);
		fila = {
			situacao: "avaliada",
			criados,
			jaAbertos
		};
	} catch {
		fila = { situacao: "falhou" };
	}
	return {
		sentimento,
		fila
	};
}
async function gravarSentimento(chamada, resultado, porta) {
	if (resultado.classification_source === "human") return "corrigido_por_humano";
	const sentimento = sentimentoDaChamada(resultado);
	if (!sentimento) return "sem_sentimento";
	try {
		await porta.gravarSentimento(chamada.account_id, chamada.id, chamada.lead_id, sentimento.valor, sentimento.fonte);
		return sentimento.fonte;
	} catch {
		return "falhou";
	}
}
//#endregion
//#region supabase/functions/call-finalize/finalizacao.ts
const CABECALHO_INTERNO = "x-internal-secret";
const CHAVE_DO_PROVEDOR_DE_VOZ = "api_key";
const VALIDADE_DA_REIVINDICACAO_MS = 3e5;
const FONTE_DO_CUSTO = "call-finalize";
const BALDE_DAS_GRAVACOES = "recordings";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UM_DIA_MS = 864e5;
const MOTIVOS_MARCADOS = ["canceled", "max_duration"];
var RecusaDoPedido = class extends Error {
	motivo;
	constructor(motivo) {
		super(motivo);
		this.motivo = motivo;
	}
};
async function finalizarChamada(pedido, porta, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	if (!await segredoConfere(pedido.segredoInterno, opcoes.segredoInterno)) return recusa("segredo_interno_invalido");
	const chamadaId = typeof pedido.chamadaId === "string" ? pedido.chamadaId.trim() : "";
	if (!UUID.test(chamadaId)) return recusa("chamada_invalida");
	const credenciais = [];
	let resposta;
	try {
		resposta = await conduzir(chamadaId, porta, opcoes, credenciais);
	} catch (erro) {
		resposta = recusa(erro instanceof RecusaDoPedido ? erro.motivo : "falha_interna");
	}
	try {
		conferirQueNaoVazou(resposta.corpo, credenciais, "credencial no corpo de call-finalize");
	} catch {
		return recusa("falha_interna");
	}
	return resposta;
}
async function conduzir(chamadaId, porta, opcoes, credenciais) {
	const agoraMs = Date.parse(opcoes.agora);
	const vencidaAntesDe = new Date(agoraMs - VALIDADE_DA_REIVINDICACAO_MS).toISOString();
	const chamada = await porta.reivindicar(chamadaId, opcoes.agora, vencidaAntesDe);
	if (!chamada) return recusa("ja_reivindicada");
	const conversaId = chamada.provider_conversation_id;
	if (!conversaId) return recusa("sem_conversa");
	const politica = await porta.politicaDaConta(chamada.account_id);
	const resolucao = await porta.credencial(chamada.account_id, "voz", CHAVE_DO_PROVEDOR_DE_VOZ);
	if (!resolucao.ok) return recusa("credencial_indisponivel");
	const credencial = resolucao.valor;
	credenciais.push(credencial);
	const conversa = await puxarConversa(chamada, conversaId, credencial, porta);
	const inicioMs = conversa.inicioEmSegundos !== null ? conversa.inicioEmSegundos * 1e3 : Date.parse(chamada.started_at);
	const instante = (segundo) => new Date(inicioMs + segundo * 1e3).toISOString();
	const lido = lerFim(conversa, politica.duracaoMaximaEmSegundos);
	const marcado = MOTIVOS_MARCADOS.find((motivo) => motivo === chamada.end_reason);
	const fim = marcado ? {
		...lido,
		motivo: marcado
	} : lido;
	const endedAt = conversa.duracaoEmSegundos !== null ? instante(conversa.duracaoEmSegundos) : opcoes.agora;
	let audio = "desligado";
	let caminho = null;
	if (politica.gravacaoLigada) {
		audio = conversa.temAudio ? "falhou" : "sem_audio";
		if (conversa.temAudio) {
			caminho = await guardarAudio(chamada, conversaId, credencial, porta);
			if (caminho) audio = "gravado";
		}
	}
	const criterios = criteriosAplicados(chamada.purpose, await porta.criteriosDaConta(chamada.account_id), {
		ligada: politica.gravacaoLigada,
		aviso: politica.avisoDeGravacao
	});
	const turnosDaAvaliacao = turnosParaAvaliacao(conversa.turnos, instante);
	const trechosDoAviso = criterios.find((c) => c.key === "aviso_gravacao")?.trechos ?? [];
	const aviso = politica.gravacaoLigada ? lerAvisoDeGravacao(conversa.turnos, politica.avisoDeGravacao, trechosDoAviso) : null;
	const consentNoticeAt = politica.gravacaoLigada ? await avisoDeGravacaoEm(turnosDaAvaliacao, criterios) : null;
	const houveConversa = conversa.turnos.length > 0;
	const status = houveConversa ? "ended" : "failed";
	await porta.gravarDesfecho(chamada.account_id, chamada.id, {
		status,
		transcript: { turns: conversa.turnos.map((turno) => ({
			role: turno.quem,
			text: turno.texto,
			at: instante(turno.segundo)
		})) },
		duration_sec: conversa.duracaoEmSegundos === null ? null : Math.round(conversa.duracaoEmSegundos),
		answered_at: fim.atendidaPor === "unknown" ? null : instante(0),
		ended_at: endedAt,
		answered_by: fim.atendidaPor,
		end_reason: fim.motivo,
		recording_path: caminho,
		recording_expires_at: caminho ? new Date(Date.parse(endedAt) + politica.retencaoEmDias * UM_DIA_MS).toISOString() : null,
		consent_notice_at: consentNoticeAt
	});
	const custos = conversa.custos.map((custo) => ({
		account_id: chamada.account_id,
		call_id: chamada.id,
		component: custo.componente,
		amount_cents: Math.round(custo.valorEmDolares * 100),
		currency: "USD",
		source: FONTE_DO_CUSTO
	}));
	if (custos.length > 0) await porta.gravarCustos(custos);
	const invocacoes = linhasDeInvocacao(chamada, conversa.invocacoes, inicioMs);
	const inseridas = invocacoes.length > 0 ? await porta.gravarInvocacoes(invocacoes) : [];
	const reaplicacoes = await reaplicarFalhas(invocacoes.flatMap((linha) => linha.error === null ? [] : [{
		account_id: linha.account_id,
		call_id: linha.call_id,
		lead_id: chamada.lead_id,
		tool: linha.tool,
		request: linha.request,
		error: linha.error,
		at: linha.at
	}]), inseridas, opcoes.reaplicadores ?? REAPLICADORES);
	const bloqueios = await reaplicarBloqueios(chamada, pedidosDeBloqueio(conversa.invocacoes, inicioMs), porta);
	const encerramentoDaPessoaErrada = await conferirEncerramento(chamada, conversa, porta);
	if (aviso) await porta.registrarConsentimento({
		account_id: chamada.account_id,
		lead_id: chamada.lead_id,
		call_id: chamada.id,
		kind: "recording",
		granted: aviso.concedido,
		evidence: aviso.evidencia,
		at: consentNoticeAt ?? opcoes.agora
	});
	const atendidaPorGente = fim.atendidaPor !== "machine";
	const primeiraChamadaDeTeste = await acessorio(houveConversa && atendidaPorGente && chamada.direction !== "rehearsal", () => porta.registrarPrimeiraChamadaDeTeste(chamada.id));
	const paraQualificacao = {
		purpose: chamada.purpose,
		direction: chamada.direction,
		answered_at: fim.atendidaPor === "unknown" ? null : instante(0)
	};
	const registradas = atendidaPorGente ? await porta.invocacoesDaChamada(chamada.id) : [];
	const retaguarda = decidirRetaguarda({
		...paraQualificacao,
		classification_source: chamada.classification_source
	}, {
		atendidaPorGente,
		leadFalou: conversa.turnos.some((turno) => turno.quem === "lead")
	}, registradas);
	const classificacao = await acessorio(acionaRetaguarda(retaguarda), () => porta.acionarClassificacao(chamada.id));
	const avaliacao = await aplicarAvaliacao(chamada, {
		aplica: houveConversa && atendidaPorGente && chamada.direction !== "rehearsal",
		turnos: turnosDaAvaliacao,
		criterios,
		registrados: itensRegistrados(criterios, paraQualificacao, registradas)
	}, porta);
	const { sentimento, fila } = await aplicarSentimentoEFila(chamada, {
		atendidaPor: fim.atendidaPor,
		instante: instante(0)
	}, porta);
	const resultadoDaLigacao = chamada.direction === "outbound" ? resultadoDoFim(fim.motivo) : null;
	const retentativa = await acessorio(resultadoDaLigacao !== null, () => porta.reprogramarTentativa(chamada.id, resultadoDaLigacao, opcoes.agora));
	await porta.concluirFinalizacao(chamada.account_id, chamada.id, opcoes.agora);
	return {
		status: 200,
		corpo: {
			ok: true,
			chamadaId: chamada.id,
			desfecho: "finalizada",
			status,
			motivoDoFim: fim.motivo,
			audio,
			avisoDeGravacao: aviso ? aviso.segundo === null ? "ausente" : "encontrado" : "desligado",
			custos: custos.length,
			invocacoes: invocacoes.length,
			reaplicacoes,
			bloqueios,
			encerramentoDaPessoaErrada,
			primeiraChamadaDeTeste,
			retaguarda,
			classificacao,
			sentimento,
			fila,
			avaliacao,
			retentativa
		}
	};
}
async function conferirEncerramento(chamada, conversa, porta) {
	const medicao = medirEncerramentoDaPessoaErrada(conversa, FALA_DA_SARAH);
	if (!medicao.aplica) return "nao_se_aplica";
	if (medicao.conforme) return "conforme";
	return await acessorio(true, () => porta.registrarMedicaoDaAvaliacao(chamada.account_id, chamada.id, "encerramento_pessoa_errada", divergenciaGravada(medicao))) === "acionado" ? "divergente" : "falhou";
}
async function puxarConversa(chamada, conversaId, credencial, porta) {
	const resposta = await porta.buscarConversa(conversaId, credencial);
	const conversa = resposta.ok ? lerConversa(resposta.conversa) : null;
	await rastrear(porta, {
		account_id: chamada.account_id,
		direction: "outbound",
		provider: "voz",
		endpoint: resposta.endpoint ?? caminhoDaConversa(conversaId),
		request: { conversation_id: conversaId },
		response: {
			ok: resposta.ok,
			pronta: conversa?.pronta ?? false,
			turnos: conversa?.turnos.length ?? 0
		},
		status_code: resposta.status ?? null,
		latency_ms: resposta.latenciaMs ?? null,
		correlation_id: chamada.id
	});
	if (!conversa) throw new RecusaDoPedido("transcricao_indisponivel");
	if (!conversa.pronta) throw new RecusaDoPedido("transcricao_pendente");
	return conversa;
}
async function guardarAudio(chamada, conversaId, credencial, porta) {
	const resposta = await porta.baixarAudio(conversaId, credencial);
	if (!resposta.ok || !resposta.audio || resposta.audio.byteLength === 0) return null;
	const caminho = caminhoDaGravacao(chamada.account_id, chamada.id);
	try {
		await porta.guardarGravacao(caminho, resposta.audio, resposta.tipo ?? "audio/mpeg");
	} catch {
		return null;
	}
	return caminho;
}
function caminhoDaGravacao(contaId, chamadaId) {
	return `${contaId}/${chamadaId}.mp3`;
}
async function acessorio(aplica, passo) {
	if (!aplica) return "dispensado";
	try {
		await passo();
		return "acionado";
	} catch {
		return "falhou";
	}
}
async function rastrear(porta, evento) {
	try {
		await porta.registrarEventoDeIntegracao(evento);
	} catch {}
}
async function segredoConfere(recebido, esperado) {
	const dado = recebido?.trim() ?? "";
	const referencia = esperado.trim();
	if (dado === "" || referencia === "") return false;
	const [a, b] = await Promise.all([hashEmHexadecimal(dado), hashEmHexadecimal(referencia)]);
	return hashesIguais(a, b);
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
//#region supabase/functions/call-finalize/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
const ENDERECO_DO_PROVEDOR_DE_VOZ = "https://api.elevenlabs.io/v1";
const LIMITE_DO_PROVEDOR_MS = 2e4;
const COLUNAS_DA_REIVINDICACAO = "id, account_id, lead_id, direction, purpose, provider_conversation_id, started_at, classification_source, end_reason";
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
const porta = {
	async reivindicar(chamadaId, agora, vencidaAntesDe) {
		const { data, error } = await servico.from("calls").update({ finalize_started_at: agora }).eq("id", chamadaId).is("finalized_at", null).or(`finalize_started_at.is.null,finalize_started_at.lt."${vencidaAntesDe}"`).select(COLUNAS_DA_REIVINDICACAO).maybeSingle();
		if (error) throw new Error(error.message);
		return data ?? null;
	},
	async politicaDaConta(contaId) {
		const { data, error } = await servico.from("account_settings").select("recording_enabled, retention_days, recording_notice_text, max_duration_seconds").eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		const linha = data ?? {};
		return {
			gravacaoLigada: linha.recording_enabled !== false,
			retencaoEmDias: typeof linha.retention_days === "number" ? linha.retention_days : 90,
			avisoDeGravacao: typeof linha.recording_notice_text === "string" ? linha.recording_notice_text : null,
			duracaoMaximaEmSegundos: typeof linha.max_duration_seconds === "number" ? linha.max_duration_seconds : 600
		};
	},
	credencial(contaId, provedor, chave) {
		return cofre.resolveSecret(contaId, provedor, chave);
	},
	async buscarConversa(conversaId, credencial) {
		const endpoint = caminhoDaConversa(conversaId);
		const inicio = Date.now();
		try {
			const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
				headers: { "xi-api-key": credencial },
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			const latenciaMs = Date.now() - inicio;
			if (!resposta.ok) {
				await resposta.body?.cancel();
				return {
					ok: false,
					status: resposta.status,
					latenciaMs,
					endpoint
				};
			}
			return {
				ok: true,
				status: resposta.status,
				latenciaMs,
				endpoint,
				conversa: await resposta.json()
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
	},
	async baixarAudio(conversaId, credencial) {
		const endpoint = caminhoDoAudio(conversaId);
		try {
			const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
				headers: { "xi-api-key": credencial },
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			if (!resposta.ok) {
				await resposta.body?.cancel();
				return {
					ok: false,
					status: resposta.status,
					endpoint
				};
			}
			return {
				ok: true,
				status: resposta.status,
				endpoint,
				audio: new Uint8Array(await resposta.arrayBuffer()),
				tipo: resposta.headers.get("content-type")
			};
		} catch (erro) {
			return {
				ok: false,
				codigo: erro instanceof Error ? erro.name : "fetch_failed",
				endpoint
			};
		}
	},
	async guardarGravacao(caminho, audio, tipo) {
		const { error } = await servico.storage.from(BALDE_DAS_GRAVACOES).upload(caminho, audio, {
			contentType: tipo,
			upsert: true
		});
		if (error) throw new Error(error.message);
	},
	async gravarDesfecho(contaId, chamadaId, desfecho) {
		const { error } = await servico.from("calls").update(desfecho).eq("account_id", contaId).eq("id", chamadaId);
		if (error) throw new Error(error.message);
	},
	async gravarCustos(linhas) {
		const { error } = await servico.from("call_costs").upsert([...linhas], {
			onConflict: "call_id,component,source",
			ignoreDuplicates: true
		});
		if (error) throw new Error(error.message);
	},
	async gravarInvocacoes(linhas) {
		const { data, error } = await servico.from("call_tool_invocations").upsert([...linhas], {
			onConflict: "call_id,tool,at",
			ignoreDuplicates: true
		}).select("tool, at");
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async registrarConsentimento(linha) {
		const { data, error: erroDaBusca } = await servico.from("consent_records").select("id").eq("call_id", linha.call_id).eq("kind", linha.kind).limit(1);
		if (erroDaBusca) throw new Error(erroDaBusca.message);
		if (Array.isArray(data) && data.length > 0) return;
		const { error } = await servico.from("consent_records").insert(linha);
		if (error) throw new Error(error.message);
	},
	async registrarPrimeiraChamadaDeTeste(chamadaId) {
		const { error } = await servico.rpc("registrar_primeira_chamada_de_teste", { p_call_id: chamadaId });
		if (error) {
			console.warn(JSON.stringify({
				funcao: "call-finalize",
				passo: "primeira_chamada_de_teste",
				erro: error.message
			}));
			throw new Error(error.message);
		}
	},
	async invocacoesDaChamada(chamadaId) {
		const { data, error } = await servico.from("call_tool_invocations").select("tool, error").eq("call_id", chamadaId);
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async acionarClassificacao(chamadaId) {
		const resposta = await fetch(`${URL_DO_SUPABASE}/functions/v1/call-classify`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[CABECALHO_INTERNO]: await segredoInterno(),
				authorization: `Bearer ${CHAVE_DE_SERVICO}`
			},
			body: JSON.stringify({ call_id: chamadaId })
		});
		await resposta.body?.cancel();
		if (!resposta.ok) throw new Error(`call-classify respondeu ${resposta.status}`);
	},
	async registrarEventoDeIntegracao(evento) {
		const { error } = await servico.from("integration_events").insert(evento);
		if (error) throw new Error(error.message);
	},
	async numerosDaChamada(contaId, chamadaId) {
		const { data, error } = await servico.from("calls").select("from_number, to_number, lead_id").eq("account_id", contaId).eq("id", chamadaId).maybeSingle();
		if (error) throw new Error(error.message);
		let doLead = null;
		if (data?.lead_id) {
			const { data: lead, error: erroDoLead } = await servico.from("leads").select("phone_e164").eq("account_id", contaId).eq("id", data.lead_id).maybeSingle();
			if (erroDoLead) throw new Error(erroDoLead.message);
			doLead = lead?.phone_e164 ?? null;
		}
		return {
			de: data?.from_number ?? null,
			para: data?.to_number ?? null,
			doLead
		};
	},
	async bloquearNumero(pedido) {
		const { data, error } = await servico.rpc("bloquear_numero_pela_ferramenta", {
			p_account_id: pedido.contaId,
			p_phone_e164: pedido.telefone,
			p_source: pedido.origem,
			p_reason: pedido.motivo,
			p_notes: pedido.notas,
			p_blocked_at: pedido.instante
		});
		if (error) throw new Error(error.message);
		const linha = Array.isArray(data) ? data[0] : data;
		if (!linha?.blocked_at) throw new Error("bloqueio sem instante na resposta");
		return {
			blockedAt: new Date(linha.blocked_at).toISOString(),
			criado: linha.criado === true
		};
	},
	async abrirItemDeBloqueio(item) {
		const { error } = await servico.rpc("criar_excecao", {
			p_account_id: item.contaId,
			p_kind: "dnc_requested",
			p_severity: "baixa",
			p_call_id: item.chamadaId,
			p_lead_id: item.leadId,
			p_context: item.contexto
		});
		if (error) throw new Error(error.message);
	},
	async registrarMedicaoDaAvaliacao(contaId, chamadaId, criterio, medicao) {
		const { error } = await servico.rpc("registrar_medicao_da_avaliacao", {
			p_account_id: contaId,
			p_call_id: chamadaId,
			p_criterio: criterio,
			p_medicao: medicao
		});
		if (error) throw new Error(error.message);
	},
	async criteriosDaConta(contaId) {
		const { data, error } = await servico.from("evaluation_criteria").select(COLUNAS_DO_CRITERIO).eq("account_id", contaId).order("position");
		if (error) throw new Error(error.message);
		return (data ?? []).map(lerLinhaDeCriterio);
	},
	async registrarAvaliacaoAutomatica(contaId, chamadaId, itens, nota) {
		const { error } = await servico.rpc("registrar_avaliacao_automatica", {
			p_account_id: contaId,
			p_call_id: chamadaId,
			p_itens: itens,
			p_nota: nota
		});
		if (error) throw new Error(error.message);
	},
	async lerResultadoDaChamada(chamadaId) {
		const { data, error } = await servico.from("calls").select("classification_source, classification, sentiment, evaluation").eq("id", chamadaId).single();
		if (error) throw new Error(error.message);
		return data;
	},
	async gravarSentimento(contaId, chamadaId, leadId, valor, fonte) {
		const { error } = await servico.from("calls").update({
			sentiment: valor,
			sentiment_source: fonte
		}).eq("account_id", contaId).eq("id", chamadaId);
		if (error) throw new Error(error.message);
		if (leadId === null) return;
		const { error: erroDoLead } = await servico.from("leads").update({ last_sentiment: valor }).eq("account_id", contaId).eq("id", leadId);
		if (erroDoLead) throw new Error(erroDoLead.message);
	},
	async limiaresDaFila(contaId) {
		const [configuracao, conta] = await Promise.all([servico.from("account_settings").select("sentiment_floor, consecutive_failures_cap, failed_criteria_cap, credit_alert_cents").eq("account_id", contaId).single(), servico.from("accounts").select("timezone").eq("id", contaId).single()]);
		if (configuracao.error) throw new Error(configuracao.error.message);
		if (conta.error) throw new Error(conta.error.message);
		const linha = configuracao.data;
		return {
			limiares: {
				sentiment_floor: Number(linha.sentiment_floor),
				consecutive_failures_cap: linha.consecutive_failures_cap,
				failed_criteria_cap: linha.failed_criteria_cap,
				credit_alert_cents: linha.credit_alert_cents
			},
			fuso: conta.data.timezone
		};
	},
	async falhasConsecutivas(contaId, chamadaId) {
		const { data, error } = await servico.rpc("falhas_consecutivas", {
			p_account_id: contaId,
			p_call_id: chamadaId
		});
		if (error) throw new Error(error.message);
		const linha = Array.isArray(data) ? data[0] : data;
		if (!linha || typeof linha.phone_e164 !== "string") return null;
		return {
			telefone: linha.phone_e164,
			falhas: Number(linha.falhas ?? 0)
		};
	},
	async registrarItemDeFila(contaId, item) {
		const { data, error } = await servico.rpc("registrar_item_de_fila", {
			p_account_id: contaId,
			p_kind: item.kind,
			p_severity: item.severity,
			p_deduplicacao_key: item.deduplicacaoKey,
			p_context: item.context,
			p_threshold_snapshot: item.thresholdSnapshot,
			p_lead_id: item.leadId,
			p_call_id: item.callId
		});
		if (error) throw new Error(error.message);
		if (data !== "criado" && data !== "ja_aberto") throw new Error("registro do item sem situação conhecida");
		return data;
	},
	async reprogramarTentativa(chamadaId, resultado, agora) {
		const { error } = await servico.rpc("reprogramar_tentativa", {
			p_call_id: chamadaId,
			p_resultado: resultado,
			p_agora: agora
		});
		if (error) throw new Error(error.message);
	},
	async concluirFinalizacao(contaId, chamadaId, agora) {
		const { error } = await servico.from("calls").update({ finalized_at: agora }).eq("account_id", contaId).eq("id", chamadaId);
		if (error) throw new Error(error.message);
	}
};
Deno.serve(async (requisicao) => {
	let corpo = null;
	try {
		corpo = await requisicao.json();
	} catch {}
	const resposta = await finalizarChamada({
		metodo: requisicao.method,
		chamadaId: corpo?.call_id ?? null,
		segredoInterno: requisicao.headers.get(CABECALHO_INTERNO)
	}, porta, {
		segredoInterno: await segredoInterno(),
		agora: new Date().toISOString()
	});
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		}
	});
});
//#endregion
