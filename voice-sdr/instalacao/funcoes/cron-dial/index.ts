// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/cron-dial/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
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
//#endregion
//#region supabase/functions/_shared/rotinas/portao.ts
const CABECALHO_DA_ROTINA = "x-internal-secret";
async function segredoDaRotinaConfere(recebido, esperado) {
	const dado = recebido?.trim() ?? "";
	const referencia = esperado?.trim() ?? "";
	if (dado === "" || referencia === "") return false;
	const [a, b] = await Promise.all([hashEmHexadecimal(dado), hashEmHexadecimal(referencia)]);
	return hashesIguais(a, b);
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
//#region supabase/functions/_shared/ddd.ts
const SAO_PAULO = "America/Sao_Paulo";
const MANAUS = "America/Manaus";
const RIO_BRANCO = "America/Rio_Branco";
const CAMPO_GRANDE = "America/Campo_Grande";
const CUIABA = "America/Cuiaba";
new Set(new Map([
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
//#endregion
//#region supabase/functions/_shared/whatsapp/zapi.ts
const PROVEDOR_DO_WHATSAPP = "whatsapp";
const CHAVES_DA_ZAPI = [
	"instance_id",
	"token",
	"client_token"
];
const URL_DA_ZAPI = "https://api.z-api.io";
function base(credenciais) {
	return `${URL_DA_ZAPI}/instances/${encodeURIComponent(credenciais.instance_id.trim())}/token/${encodeURIComponent(credenciais.token.trim())}`;
}
function cabecalhos(credenciais) {
	return {
		"client-token": credenciais.client_token.trim(),
		"content-type": "application/json"
	};
}
function telefoneDaZapi(e164) {
	return e164.replace(/\D/g, "");
}
function pedidoDeEnvioDeTexto(credenciais, e164, texto) {
	return {
		url: `${base(credenciais)}/send-text`,
		init: {
			method: "POST",
			headers: cabecalhos(credenciais),
			body: JSON.stringify({
				phone: telefoneDaZapi(e164),
				message: texto
			})
		},
		endpoint: "send-text"
	};
}
function objeto$1(valor) {
	return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
}
function texto$3(valor) {
	if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
	if (typeof valor !== "string") return null;
	const limpo = valor.trim();
	return limpo === "" ? null : limpo;
}
function lerIdDoEnvio(corpo) {
	const dado = objeto$1(corpo);
	if (dado === null) return null;
	return texto$3(dado.messageId) ?? texto$3(dado.id) ?? texto$3(dado.zaapId);
}
function lerCodigoDoErro(corpo) {
	const dado = objeto$1(corpo);
	if (dado === null) return null;
	return texto$3(dado.error) ?? texto$3(dado.message) ?? texto$3(dado.code);
}
//#endregion
//#region supabase/functions/_shared/whatsapp/envio.ts
const LIMITE_DO_ENVIO_MS = 1e4;
async function enviarTexto(credenciais, telefone, texto, buscar) {
	const pedido = pedidoDeEnvioDeTexto(credenciais, telefone, texto);
	const inicio = Date.now();
	try {
		const resposta = await buscar(pedido.url, pedido.init);
		let corpo = null;
		try {
			corpo = await resposta.json();
		} catch {}
		const idDoProvedor = lerIdDoEnvio(corpo);
		const ok = resposta.ok && idDoProvedor !== null;
		return {
			ok,
			codigo: ok ? null : lerCodigoDoErro(corpo) ?? String(resposta.status),
			status: resposta.status,
			latenciaMs: Date.now() - inicio,
			endpoint: pedido.endpoint,
			idDoProvedor
		};
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - inicio,
			endpoint: pedido.endpoint,
			idDoProvedor: null
		};
	}
}
//#endregion
//#region supabase/functions/_shared/agenda/modalidades.ts
const MODALIDADES_DA_REUNIAO = [
	"video",
	"telefone",
	"presencial"
];
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
const DESFECHO_PARA_ETAPA = Object.freeze({
	atendeu_sem_qualificar: "contacted",
	qualificado: "qualified",
	reuniao_marcada: "meeting_booked",
	ganho: "won",
	sem_fit: "lost",
	sem_interesse: "lost",
	perdido: "lost"
});
const SLUG = /^[a-z][a-z0-9_]{2,31}$/;
function resolverEtapa(desfecho, catalogo) {
	const chaves = new Set(catalogo.map((etapa) => etapa.key));
	const mapeada = Object.prototype.hasOwnProperty.call(DESFECHO_PARA_ETAPA, desfecho) ? DESFECHO_PARA_ETAPA[desfecho] : void 0;
	if (mapeada !== void 0) return chaves.has(mapeada) ? {
		ok: true,
		stageKey: mapeada
	} : {
		ok: false,
		motivo: "etapa_ausente_no_catalogo"
	};
	if (CHAVES_CANONICAS.includes(desfecho)) return chaves.has(desfecho) ? {
		ok: true,
		stageKey: desfecho
	} : {
		ok: false,
		motivo: "etapa_ausente_no_catalogo"
	};
	if (SLUG.test(desfecho) && chaves.has(desfecho)) return {
		ok: true,
		stageKey: desfecho
	};
	return {
		ok: false,
		motivo: "desfecho_desconhecido"
	};
}
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
const INTEIRO_NA_FAIXA = (n, min, max) => typeof n === "number" && Number.isInteger(n) && n >= min && n <= max;
function reguaValida(regua) {
	if (!regua || !Array.isArray(regua.criterios) || regua.criterios.length === 0) return false;
	const chaves = new Set();
	let soma = 0;
	for (const criterio of regua.criterios) {
		if (typeof criterio?.key !== "string" || criterio.key.trim() === "") return false;
		if (chaves.has(criterio.key)) return false;
		if (!INTEIRO_NA_FAIXA(criterio.peso, 0, 100)) return false;
		chaves.add(criterio.key);
		soma += criterio.peso;
	}
	if (soma !== 100) return false;
	const cortes = regua.cortes;
	return INTEIRO_NA_FAIXA(cortes?.morno, 1, 100) && INTEIRO_NA_FAIXA(cortes?.quente, 1, 100) && cortes.morno < cortes.quente;
}
function temperaturaDoScore(score, cortes) {
	if (score >= cortes.quente) return "quente";
	if (score >= cortes.morno) return "morno";
	return "frio";
}
function calcularPontuacao(respostas, regua) {
	if (!reguaValida(regua)) return {
		ok: false,
		motivo: "regua_invalida"
	};
	const atendidos = [];
	const faltando = [];
	const reprovados = [];
	let score = 0;
	for (const criterio of regua.criterios) {
		const resposta = Object.prototype.hasOwnProperty.call(respostas, criterio.key) ? respostas[criterio.key] : void 0;
		if (resposta === true) {
			atendidos.push(criterio.key);
			score += criterio.peso;
		} else if (resposta === false) reprovados.push(criterio.key);
		else faltando.push(criterio.key);
	}
	return {
		ok: true,
		score,
		temperatura: temperaturaDoScore(score, regua.cortes),
		criteriosAtendidos: atendidos,
		criteriosFaltando: faltando,
		criteriosReprovados: reprovados
	};
}
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
//#region supabase/functions/_shared/speech/whatsapp.ts
const FALAS_DO_WHATSAPP = {
	pedirTexto: "Por aqui eu só consigo ler mensagem escrita. Pode me mandar em texto?",
	audioNaoOuvido: "Não consegui ouvir o seu áudio. Pode repetir ou me mandar por escrito?",
	imagemNaoVista: "Não consegui abrir a sua imagem. Pode mandar de novo ou me contar por escrito?",
	descadastro: "Tudo bem, tirei o seu número da nossa lista. Você não vai receber mais mensagens nossas. Desculpa o incômodo.",
	preContato: "Oi, {nome_do_lead}! Aqui é {nome_do_agente}, da {empresa}. Estou te ligando agora, tudo bem?",
	preContatoSemIdentidade: "Oi, {nome_do_lead}! Estou te ligando agora, tudo bem?",
	abertura: "Oi, {nome_do_lead}! Aqui é {nome_do_agente}, da {empresa}. Tudo bem? Posso te fazer umas perguntas rápidas por aqui?",
	avisoDaLigacao: "Estou te ligando agora, tudo bem?"
};
[
	"# Canal: WhatsApp, por texto",
	"Esta conversa é por mensagem de WhatsApp, não por ligação. Vale o que as camadas acima dizem sobre quem você é, o propósito e as regras travadas, com estas diferenças:",
	"- Escreva mensagens curtas, de uma a três frases, como gente escreve no WhatsApp.",
	"- Faça uma pergunta por vez.",
	"- Sem markdown: nada de asterisco, cerquilha, lista ou link inventado.",
	"- Não prometa ligação que a pessoa não pediu. Se ela pedir para ser chamada por telefone, diga que o time vai retornar.",
	"- Não fale de gravação: nesta conversa não há áudio gravado.",
	"- As ferramentas de ligação (end_call, transfer_to_number, voicemail_detection) não existem aqui. Para passar a conversa a alguém do time, chame tool-transfer; depois disso, só avise que alguém do time vai responder.",
	"- Horário, só os que tool-availability devolver, com o dia e a hora que ela disser. Nunca invente horário.",
	"- Nunca escreva o nome de um campo nem um marcador entre chaves."
].join("\n");
const INSTRUCAO_DA_TRANSCRICAO = [
	"Transcreva fielmente, em português, o áudio que a pessoa mandou pelo WhatsApp.",
	"Escreva só o que foi dito, com pontuação, sem resumir, sem comentar e sem responder.",
	"Não invente palavras. Trecho que não der para entender vira [trecho inaudível].",
	"Se não der para entender nada, ou se não houver fala, responda apenas: [inaudivel]"
].join("\n");
const INSTRUCAO_DA_DESCRICAO = [
	"Descreva de forma objetiva, em português e em até cinco frases, o que a imagem que a pessoa mandou pelo WhatsApp mostra.",
	"Se houver texto escrito na imagem, transcreva-o entre aspas.",
	"Não identifique pessoas: não diga quem são, nem nome, idade, etnia ou qualquer traço que as identifique. Diga só que há uma pessoa, se houver.",
	"Não responda à pessoa e não faça suposições além do que se vê."
].join("\n");
//#endregion
//#region supabase/functions/_shared/agente/primeira-fala.ts
const LEAD_DE_EXEMPLO = {
	nome_do_lead: "Marcos Ferreira",
	empresa_do_lead: "Fluxo Cargo",
	cidade_do_lead: "Joinville",
	nome_do_especialista: "Marina Alcântara"
};
[...new Set([
	...MARCADORES_DA_PUBLICACAO,
	...MARCADORES_DA_CHAMADA,
	...Object.keys(LEAD_DE_EXEMPLO)
])];
function valoresDaConta(identidade) {
	return {
		nome_do_agente: identidade.nome,
		empresa: identidade.empresa,
		nunca_afirmar: identidade.nuncaAfirmar.length > 0 ? identidade.nuncaAfirmar.join("; ") : "a conta não listou nada"
	};
}
//#endregion
//#region supabase/functions/_shared/whatsapp/abertura.ts
const MARCADOR_CRU = /\{\{?\s*[A-Za-z0-9_]+\s*\}?\}/;
function valoresDaAbertura(identidade, lead) {
	return {
		...valoresDaConta({
			nome: identidade.nome.trim(),
			empresa: identidade.empresa.trim(),
			nuncaAfirmar: identidade.nuncaAfirmar ?? []
		}),
		nome_do_lead: lead?.nome?.trim() ?? "",
		empresa_do_lead: lead?.empresa?.trim() ?? "",
		cidade_do_lead: lead?.cidade?.trim() ?? "",
		nome_do_especialista: ""
	};
}
//#endregion
//#region supabase/functions/_shared/whatsapp/pre-contato.ts
const JANELA_DO_PRE_CONTATO_MS = 432e5;
function textoDoPreContato(escritoPelaConta, identidade, lead) {
	const doLead = typeof lead === "string" || lead === null ? { nome: lead } : lead;
	const semIdentidade = !identidade || identidade.nome.trim() === "";
	const abertura = identidade?.abertura?.trim();
	return interpolarFala(escritoPelaConta?.trim() || (abertura && !semIdentidade ? `${abertura} ${FALAS_DO_WHATSAPP.avisoDaLigacao}` : "") || (semIdentidade ? FALAS_DO_WHATSAPP.preContatoSemIdentidade : FALAS_DO_WHATSAPP.preContato), valoresDaAbertura({
		nome: identidade?.nome ?? "",
		empresa: identidade?.empresa ?? ""
	}, doLead));
}
async function enviarPreContato(pedido, porta, agora = Date.now) {
	const { contaId, leadId } = pedido;
	const configuracao = await porta.configuracao(contaId);
	if (!configuracao.ligado) return "desligado";
	if (leadId === null) return "sem_lead";
	const lead = await porta.lead(contaId, leadId);
	if (lead === null) return "sem_lead";
	if (await porta.numeroBloqueado(contaId, lead.telefone)) return "numero_bloqueado";
	if (!await porta.atendeONumero(contaId, lead.telefone)) return "fora_do_modo_de_teste";
	const credenciais = await porta.credenciais(contaId);
	if (credenciais === null) return "whatsapp_nao_configurado";
	const desde = new Date(agora() - JANELA_DO_PRE_CONTATO_MS).toISOString();
	if (await porta.mensagemNossaDesde(contaId, lead.telefone, desde)) return "ja_houve_mensagem";
	const texto = textoDoPreContato(configuracao.texto, await porta.identidade(contaId), lead);
	if (texto === "" || MARCADOR_CRU.test(texto)) return "texto_invalido";
	const { conversaId } = await porta.abrirConversa(contaId, lead.telefone, leadId, "assistente");
	const envio = await porta.enviar(credenciais, lead.telefone, texto);
	await porta.registrarSaida({
		contaId,
		conversaId,
		autor: "assistente",
		autorId: null,
		texto,
		envio
	});
	if (!envio.ok) return "envio_falhou";
	await porta.narrar(contaId, leadId, conversaId);
	return "enviado";
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
function textoOuNulo$1(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
function objeto(valor) {
	return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
}
function lerRetrato(bruto) {
	const retrato = objeto(bruto);
	if (retrato === null || retrato.versao !== 1) return null;
	const identidade = objeto(retrato.identidade);
	const roteiro = objeto(retrato.roteiro);
	const whatsapp = objeto(retrato.whatsapp) ?? {};
	if (identidade === null || roteiro === null) return null;
	const nome = textoOuNulo$1(identidade.nome);
	const empresa = textoOuNulo$1(identidade.empresa);
	const playbookVersionId = textoOuNulo$1(roteiro.playbook_version_id);
	const versao = Number(roteiro.versao);
	if (nome === null || empresa === null || playbookVersionId === null || !Number.isInteger(versao)) return null;
	if (typeof roteiro.camada_dois !== "string") return null;
	return {
		identidade: {
			nome,
			empresa,
			oferta: textoOuNulo$1(identidade.oferta),
			nuncaAfirmar: Array.isArray(identidade.nunca_afirmar) ? identidade.nunca_afirmar.filter((item) => typeof item === "string") : []
		},
		playbook: {
			playbookVersionId,
			versao,
			camadaDois: roteiro.camada_dois,
			camadaTres: typeof roteiro.camada_tres === "string" ? roteiro.camada_tres : ""
		},
		aberturaDoWhatsapp: textoOuNulo$1(whatsapp.abertura),
		jeitoDoWhatsapp: textoOuNulo$1(whatsapp.jeito)
	};
}
//#endregion
//#region supabase/functions/_shared/whatsapp/midia.ts
const LIMITE_DA_MIDIA_BYTES = 10485760;
const TAMANHO_MAXIMO_DA_LEITURA = 4e3;
const TOKENS_DA_LEITURA = 1200;
async function baixarMidia(url, buscar, limiteBytes = LIMITE_DA_MIDIA_BYTES) {
	let endereco;
	try {
		endereco = new URL(url);
	} catch {
		return {
			ok: false,
			motivo: "endereco_invalido"
		};
	}
	if (endereco.protocol !== "https:") return {
		ok: false,
		motivo: "endereco_invalido"
	};
	let resposta;
	try {
		resposta = await buscar(endereco.toString(), { method: "GET" });
	} catch {
		return {
			ok: false,
			motivo: "falha_no_download"
		};
	}
	if (!resposta.ok) return {
		ok: false,
		motivo: "falha_no_download"
	};
	const declarado = Number(resposta.headers.get("content-length") ?? "");
	if (Number.isFinite(declarado) && declarado > limiteBytes) {
		await resposta.body?.cancel().catch(() => {});
		return {
			ok: false,
			motivo: "grande_demais"
		};
	}
	const mime = resposta.headers.get("content-type");
	try {
		if (!resposta.body) {
			const bytes = new Uint8Array(await resposta.arrayBuffer());
			return bytes.byteLength > limiteBytes ? {
				ok: false,
				motivo: "grande_demais"
			} : {
				ok: true,
				bytes,
				mime
			};
		}
		const leitor = resposta.body.getReader();
		const pedacos = [];
		let total = 0;
		for (;;) {
			const { done, value } = await leitor.read();
			if (done) break;
			total += value.byteLength;
			if (total > limiteBytes) {
				await leitor.cancel().catch(() => {});
				return {
					ok: false,
					motivo: "grande_demais"
				};
			}
			pedacos.push(value);
		}
		const bytes = new Uint8Array(total);
		let posicao = 0;
		for (const pedaco of pedacos) {
			bytes.set(pedaco, posicao);
			posicao += pedaco.byteLength;
		}
		return {
			ok: true,
			bytes,
			mime
		};
	} catch {
		return {
			ok: false,
			motivo: "falha_no_download"
		};
	}
}
function paraBase64(bytes) {
	let binario = "";
	const PEDACO = 32768;
	for (let indice = 0; indice < bytes.length; indice += PEDACO) binario += String.fromCharCode(...bytes.subarray(indice, indice + PEDACO));
	return btoa(binario);
}
function tipoBase(mime) {
	return (mime ?? "").split(";")[0].trim().toLowerCase();
}
function formatoDoAudio(mime) {
	return {
		"audio/ogg": "ogg",
		"audio/opus": "ogg",
		"audio/mpeg": "mp3",
		"audio/mp3": "mp3",
		"audio/wav": "wav",
		"audio/x-wav": "wav",
		"audio/wave": "wav",
		"audio/aac": "aac",
		"audio/mp4": "m4a",
		"audio/x-m4a": "m4a",
		"audio/m4a": "m4a",
		"audio/flac": "flac",
		"audio/aiff": "aiff",
		"audio/x-aiff": "aiff"
	}[tipoBase(mime)] ?? null;
}
const IMAGENS = new Set([
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/gif"
]);
function tipoDaImagem(mime) {
	const base = tipoBase(mime);
	return IMAGENS.has(base) ? base : null;
}
const PROVEDOR_DO_MODELO = "modelo";
function leituraAproveitavel(texto) {
	const limpo = (texto ?? "").trim();
	if (limpo === "" || limpo.toLowerCase().replace(/[\s.]/g, "") === "[inaudivel]") return null;
	return limpo.slice(0, TAMANHO_MAXIMO_DA_LEITURA);
}
async function lerMidiaDaMensagem(pedido, porta) {
	const falhar = async (desfecho) => {
		await porta.gravarLeitura(pedido.contaId, pedido.mensagemId, "falhou", null);
		return desfecho;
	};
	if (pedido.anexo === null) return await falhar("sem_anexo");
	const download = await baixarMidia(pedido.anexo.url, porta.buscar);
	if (!download.ok) return await falhar(download.motivo);
	const mime = pedido.anexo.mime ?? download.mime;
	let conteudo;
	if (pedido.midia === "audio") {
		const formato = formatoDoAudio(mime);
		if (formato === null) return await falhar("formato_nao_lido");
		conteudo = {
			tipo: "audio",
			base64: paraBase64(download.bytes),
			formato
		};
	} else {
		const tipo = tipoDaImagem(mime);
		if (tipo === null) return await falhar("formato_nao_lido");
		conteudo = {
			tipo: "imagem",
			dataUri: `data:${tipo};base64,${paraBase64(download.bytes)}`
		};
	}
	const instrucao = pedido.midia === "audio" ? INSTRUCAO_DA_TRANSCRICAO : INSTRUCAO_DA_DESCRICAO;
	let resposta;
	try {
		resposta = await porta.lerComModelo(pedido.contaId, pedido.midia, {
			instrucao,
			conteudo,
			maxTokens: TOKENS_DA_LEITURA
		});
	} catch {
		return await falhar("modelo_falhou");
	}
	try {
		await porta.registrarEvento({
			account_id: pedido.contaId,
			direction: "outbound",
			provider: PROVEDOR_DO_MODELO,
			endpoint: resposta.endpoint ?? "api/v1/chat/completions",
			request: {
				model: resposta.modelo,
				tarefa: pedido.midia,
				mime: tipoBase(mime) || null,
				bytes: download.bytes.byteLength,
				prompt: instrucao
			},
			response: {
				ok: resposta.ok,
				codigo: resposta.codigo ?? null,
				tokens_de_entrada: resposta.tokensDeEntrada ?? null,
				tokens_de_saida: resposta.tokensDeSaida ?? null
			},
			status_code: resposta.status ?? null,
			latency_ms: resposta.latenciaMs ?? null,
			correlation_id: `whatsapp:${pedido.mensagemId}`
		});
	} catch {}
	if (!resposta.ok) return await falhar("modelo_falhou");
	const texto = leituraAproveitavel(resposta.texto);
	if (texto === null) return await falhar("nao_entendeu");
	await porta.gravarLeitura(pedido.contaId, pedido.mensagemId, "lida", texto);
	return "lida";
}
//#endregion
//#region supabase/functions/_shared/whatsapp/modo.ts
const MODO_PADRAO_DO_WHATSAPP = "teste";
function lerModoDoWhatsapp(valor) {
	return valor === "todos" ? "todos" : MODO_PADRAO_DO_WHATSAPP;
}
function modoAtendeONumero(modo, numerosDeTeste, telefone) {
	if (modo === "todos") return true;
	for (const numero of numerosDeTeste) if (numero === telefone) return true;
	return false;
}
//#endregion
//#region supabase/functions/_shared/speech/ferramentas.ts
const FALAS_DAS_FERRAMENTAS = {
	falha: "Deixa eu confirmar isso com o time e já te retorno.",
	propositoErrado: "Isso eu não consigo resolver por aqui agora, mas deixo anotado pro time.",
	campoFaltando: "Só um instante, me conta de novo pra eu anotar certinho?"
};
var EscritaNaLeitura = class extends Error {
	constructor(membro) {
		super(`a leitura tocou a porta de escrita: ${membro}`);
		this.name = "EscritaNaLeitura";
	}
};
function escritaQueLevanta() {
	const levantar = (membro) => {
		throw new EscritaNaLeitura(String(membro));
	};
	return new Proxy({}, {
		get: (_alvo, membro) => levantar(membro),
		set: (_alvo, membro) => levantar(membro),
		has: (_alvo, membro) => levantar(membro),
		apply: () => levantar("chamada")
	});
}
const MOTIVO_GRAVADO = {
	lead_request: "Pediu durante a ligação para não ser mais chamado.",
	wrong_number: "Número errado: quem atendeu não era a pessoa procurada."
};
function texto$2(valor) {
	return typeof valor === "string" ? valor.trim() : "";
}
function origemDoMotivo(reason) {
	return texto$2(reason).toLowerCase() === "wrong_number" ? "wrong_number" : "lead_request";
}
function notasDoPedido(entrada) {
	const reason = texto$2(entrada.reason);
	const partes = [["lead_request", "wrong_number"].includes(reason.toLowerCase()) ? "" : reason, texto$2(entrada.notes)].filter((parte) => parte !== "");
	return partes.length === 0 ? null : [...new Set(partes)].join(" | ");
}
Object.freeze({
	status: {
		metodo_invalido: 405,
		endereco_invalido: 401,
		falha_interna: 503
	}.endereco_invalido,
	corpo: Object.freeze({
		ok: false,
		motivo: "endereco_invalido",
		mensagem: {
			metodo_invalido: "Este endereço aceita apenas POST.",
			endereco_invalido: "Endereço de webhook inválido.",
			falha_interna: "Não foi possível gravar esta mensagem agora. Reenvie o aviso."
		}.endereco_invalido
	})
});
//#endregion
//#region supabase/functions/whatsapp-inbound/entrada.ts
const MOTIVO_DO_DESCADASTRO = "Pediu pelo WhatsApp para não receber mais mensagens.";
//#endregion
//#region supabase/functions/_shared/tools/execucao-direta.ts
const UUID$1 = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
function mensagemDe$2(erro) {
	const texto = erro instanceof Error ? erro.message : String(erro);
	return texto.trim() === "" ? "sem mensagem" : texto.trim();
}
function preenchido(valor) {
	if (valor === void 0 || valor === null) return false;
	return typeof valor !== "string" || valor.trim() !== "";
}
function falha(erro) {
	return {
		ok: false,
		data: null,
		speech: null,
		erro
	};
}
async function executarFerramentaDireto(pedido) {
	const agora = pedido.agora ?? Date.now;
	const faltando = (pedido.obrigatorios ?? []).find((campo) => !preenchido(pedido.entrada[campo.chave]));
	if (faltando !== void 0) return {
		ok: false,
		data: {
			campo: faltando.nome,
			chave: faltando.chave
		},
		speech: null,
		erro: `campo_faltando: ${faltando.chave}`
	};
	const base = {
		contaId: pedido.contaId,
		chamada: pedido.chamada,
		entrada: pedido.entrada,
		agora,
		ensaio: false
	};
	let leitura;
	try {
		leitura = await pedido.executor.ler({
			...base,
			escrita: escritaQueLevanta()
		});
	} catch (erro) {
		return falha(erro instanceof EscritaNaLeitura ? `escrita_na_leitura: ${mensagemDe$2(erro)}` : `falha_do_executor: ${mensagemDe$2(erro)}`);
	}
	const conferir = (fala) => {
		const texto = typeof fala === "string" ? fala.trim() : "";
		return texto === "" || UUID$1.test(texto) ? null : texto;
	};
	if (conferir(leitura.speech) === null) return falha("fala_invalida");
	if (pedido.executor.memoria !== void 0) try {
		await pedido.executor.memoria({
			...base,
			escrita: pedido.escrita
		}, leitura);
	} catch (erro) {
		return falha(`falha_da_memoria: ${mensagemDe$2(erro)}`);
	}
	let final = leitura;
	if (pedido.executor.efeitos !== void 0) try {
		const doEfeito = await pedido.executor.efeitos({
			...base,
			escrita: pedido.escrita
		}, leitura);
		if (doEfeito) final = doEfeito;
	} catch (erro) {
		return falha(`falha_do_efeito: ${mensagemDe$2(erro)}`);
	}
	const fala = conferir(final.speech);
	if (fala === null) return falha("fala_invalida");
	const ok = final.ok ?? true;
	return {
		ok,
		data: final.data ?? null,
		speech: fala,
		erro: ok ? null : final.erro?.trim() || "recusa_da_ferramenta"
	};
}
//#endregion
//#region supabase/functions/_shared/whatsapp/resposta.ts
const VALIDADE_DA_OFERTA_MS = 72e5;
//#endregion
//#region supabase/functions/_shared/email/email.ts
const MOTIVOS_DE_CONFIGURACAO = new Set(["nao_configurado", "remetente_invalido"]);
const MENSAGENS_DO_EMAIL = {
	chave_invalida: "O provedor de e-mail recusou a chave cadastrada. Gere uma nova no painel dele e substitua em Integrações.",
	sem_permissao: "O provedor de e-mail recusou o envio por permissão. Confira se o domínio de envio está verificado no painel dele.",
	sem_credito: "A conta no provedor de e-mail está sem saldo. Recarregue no painel dele para voltar a enviar.",
	limite_de_taxa: "O provedor de e-mail recusou por excesso de envios. O convite sai sozinho na próxima tentativa.",
	provedor_indisponivel: "O provedor de e-mail está fora do ar. O convite sai sozinho na próxima tentativa.",
	sem_resposta: "O provedor de e-mail não respondeu no tempo esperado. O convite sai sozinho na próxima tentativa.",
	falha_do_provedor: "O provedor de e-mail recusou o envio e não informou o motivo. Confira a configuração em Integrações se a falha continuar.",
	sessao_desconectada: "O provedor de e-mail recusou o envio e não informou o motivo. Confira a configuração em Integrações se a falha continuar.",
	destinatario_recusado: "O provedor de e-mail recusou o endereço do destinatário. Confira o e-mail cadastrado.",
	nao_configurado: "Convite não enviado: configure o e-mail em Integrações, com a chave do provedor e o remetente num domínio verificado nele. O convite sai sozinho depois disso.",
	remetente_invalido: "Convite não enviado: o remetente cadastrado em Integrações não é um endereço de e-mail. Use o formato Nome <agenda@seudominio.com.br>, com o domínio verificado no provedor."
};
function falhaDoEmail(motivo) {
	return {
		ok: false,
		motivo,
		mensagem: MENSAGENS_DO_EMAIL[motivo]
	};
}
const MINUTO = 6e4;
const DIA = 864e5;
const HORA_DO_DIA = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
const DIAS_DA_SEMANA = [
	"domingo",
	"segunda-feira",
	"terça-feira",
	"quarta-feira",
	"quinta-feira",
	"sexta-feira",
	"sábado"
];
const MESES = [
	"janeiro",
	"fevereiro",
	"março",
	"abril",
	"maio",
	"junho",
	"julho",
	"agosto",
	"setembro",
	"outubro",
	"novembro",
	"dezembro"
];
function gerarHorarios(entrada) {
	const { especialista, fusoDoLead } = entrada;
	conferirEspecialista(especialista);
	const agora = instanteDe(entrada.agora, "agora");
	const duracao = especialista.duracaoPadraoMin * MINUTO;
	const limiteMinimo = agora + especialista.antecedenciaMinimaMin * MINUTO;
	const limiteMaximo = agora + especialista.antecedenciaMaximaDias * DIA;
	const bloqueios = intervalosDe(entrada.bloqueios, "bloqueios");
	const ocupacaoExterna = intervalosDe(entrada.ocupacaoExterna, "ocupacaoExterna");
	const reunioes = intervalosDe(entrada.reunioesMarcadas, "reunioesMarcadas");
	const faixasPorDia = unirFaixas(entrada.disponibilidade);
	const reunioesDoDia = contarPorDiaLocal(reunioes, especialista.fuso);
	relogioLocal(fusoDoLead, agora);
	const ofertas = [];
	const descartes = [];
	const ultimoDia = chaveDeData(dataLocalDe(especialista.fuso, limiteMaximo));
	let dia = dataLocalDe(especialista.fuso, agora);
	for (let volta = 0; volta <= especialista.antecedenciaMaximaDias + 2; volta += 1) {
		const faixas = faixasPorDia.get(diaDaSemanaDe(dia)) ?? [];
		const noTeto = (reunioesDoDia.get(chaveDeData(dia)) ?? 0) >= especialista.tetoDiario;
		for (const faixa of faixas) {
			const abre = instanteDeHoraLocal(especialista.fuso, dia, faixa.inicio);
			const fechaEm = instanteDeHoraLocal(especialista.fuso, dia, faixa.fim);
			for (let inicio = abre; inicio < fechaEm; inicio += duracao) {
				const fim = inicio + duracao;
				const candidato = {
					inicio: paraIso(inicio),
					fim: paraIso(fim)
				};
				const motivo = recusaDe$1({
					inicio,
					fim,
					fechaEm,
					limiteMinimo,
					limiteMaximo,
					noTeto,
					reunioes,
					bloqueios,
					ocupacaoExterna
				});
				if (motivo) {
					descartes.push({
						...candidato,
						motivo
					});
					if (motivo === "fora_da_faixa") break;
					continue;
				}
				ofertas.push({
					...candidato,
					fusoDoEspecialista: especialista.fuso,
					rotuloNoFusoDoLead: rotularInstante(inicio, fusoDoLead)
				});
				if (ofertas.length === 4) return {
					ofertas,
					descartes
				};
			}
		}
		if (chaveDeData(dia) === ultimoDia) break;
		dia = diaSeguinte(dia);
	}
	return {
		ofertas,
		descartes
	};
}
function rotularInstante(instante, fuso) {
	const ts = typeof instante === "number" ? instante : instanteDe(instante, "instante");
	const partes = partesEm(fuso, ts);
	const nomeDoDia = DIAS_DA_SEMANA[diaDaSemanaDe(partes)];
	const nomeDoMes = MESES[partes.mes - 1];
	if (!nomeDoDia || !nomeDoMes) throw new Error(`instante fora do calendário: ${ts}`);
	return `${nomeDoDia}, ${partes.dia} de ${nomeDoMes} de ${partes.ano}, ${dois(partes.hora)}h${dois(partes.minuto)}`;
}
function relogioEm(instante, fuso) {
	const partes = partesEm(fuso, typeof instante === "number" ? instante : instanteDe(instante, "instante"));
	return {
		ano: partes.ano,
		mes: partes.mes,
		dia: partes.dia,
		diaDaSemana: diaDaSemanaDe(partes),
		hora: partes.hora,
		minuto: partes.minuto,
		diaCivil: Math.floor(Date.UTC(partes.ano, partes.mes - 1, partes.dia) / DIA)
	};
}
function diasDaSemanaNoHorizonte(fuso, agora, dias) {
	if (!Number.isInteger(dias) || dias < 0) throw new Error(`dias precisa ser inteiro não negativo: ${dias}`);
	const inicio = instanteDe(agora, "agora");
	if (dias >= 6) {
		relogioLocal(fuso, inicio);
		return new Set([
			0,
			1,
			2,
			3,
			4,
			5,
			6
		]);
	}
	const ultimo = chaveDeData(dataLocalDe(fuso, inicio + dias * DIA));
	const encontrados = new Set();
	let dia = dataLocalDe(fuso, inicio);
	for (let volta = 0; volta <= dias + 2; volta += 1) {
		encontrados.add(diaDaSemanaDe(dia));
		if (chaveDeData(dia) === ultimo) break;
		dia = diaSeguinte(dia);
	}
	return encontrados;
}
const CONFERENCIAS = [
	{
		motivo: "fora_da_faixa",
		recusa: (c) => c.fim > c.fechaEm
	},
	{
		motivo: "antecedencia_minima",
		recusa: (c) => c.inicio < c.limiteMinimo
	},
	{
		motivo: "antecedencia_maxima",
		recusa: (c) => c.inicio >= c.limiteMaximo
	},
	{
		motivo: "teto_diario",
		recusa: (c) => c.noTeto
	},
	{
		motivo: "reuniao_existente",
		recusa: (c) => colideCom(c.reunioes, c.inicio, c.fim)
	},
	{
		motivo: "bloqueado",
		recusa: (c) => colideCom(c.bloqueios, c.inicio, c.fim)
	},
	{
		motivo: "ocupado_externo",
		recusa: (c) => colideCom(c.ocupacaoExterna, c.inicio, c.fim)
	}
];
function recusaDe$1(conferencia) {
	for (const { motivo, recusa } of CONFERENCIAS) if (recusa(conferencia)) return motivo;
	return null;
}
function colideCom(faixas, inicio, fim) {
	return faixas.some((faixa) => inicio < faixa.fim && faixa.inicio < fim);
}
function unirFaixas(faixas) {
	const porDia = new Map();
	for (const faixa of faixas) {
		if (!Number.isInteger(faixa.diaDaSemana) || faixa.diaDaSemana < 0 || faixa.diaDaSemana > 6) throw new Error(`dia da semana fora de 0..6: ${faixa.diaDaSemana}`);
		const inicio = minutosDoDia(faixa.inicio);
		const fim = minutosDoDia(faixa.fim);
		if (fim <= inicio) throw new Error(`faixa sem duração: ${faixa.inicio}–${faixa.fim}`);
		const doDia = porDia.get(faixa.diaDaSemana) ?? [];
		doDia.push({
			inicio,
			fim
		});
		porDia.set(faixa.diaDaSemana, doDia);
	}
	for (const [dia, doDia] of porDia) {
		const ordenadas = [...doDia].sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);
		const unidas = [];
		for (const faixa of ordenadas) {
			const anterior = unidas[unidas.length - 1];
			if (anterior && faixa.inicio <= anterior.fim) {
				anterior.fim = Math.max(anterior.fim, faixa.fim);
				continue;
			}
			unidas.push({ ...faixa });
		}
		porDia.set(dia, unidas);
	}
	return porDia;
}
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
function instanteDeHoraLocal(fuso, data, minutos) {
	const alvo = Date.UTC(data.ano, data.mes - 1, data.dia, Math.floor(minutos / 60), minutos % 60);
	const primeiro = alvo - (relogioLocal(fuso, alvo) - alvo);
	const segundo = alvo - (relogioLocal(fuso, primeiro) - primeiro);
	if (relogioLocal(fuso, segundo) === alvo) return segundo;
	return Math.max(primeiro, segundo);
}
function diaDaSemanaDe(data) {
	return ((Math.floor(Date.UTC(data.ano, data.mes - 1, data.dia) / DIA) + 4) % 7 + 7) % 7;
}
function diaSeguinte(data) {
	return dataLocalDe("UTC", Date.UTC(data.ano, data.mes - 1, data.dia + 1));
}
function chaveDeData(data) {
	return `${data.ano}-${dois(data.mes)}-${dois(data.dia)}`;
}
function contarPorDiaLocal(reunioes, fuso) {
	const contagem = new Map();
	for (const reuniao of reunioes) {
		const chave = chaveDeData(dataLocalDe(fuso, reuniao.inicio));
		contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
	}
	return contagem;
}
function conferirEspecialista(especialista) {
	const inteiroNaoNegativo = (valor, campo) => {
		if (!Number.isInteger(valor) || valor < 0) throw new Error(`${campo} precisa ser inteiro não negativo: ${valor}`);
	};
	if (!Number.isInteger(especialista.duracaoPadraoMin) || especialista.duracaoPadraoMin <= 0) throw new Error(`duracaoPadraoMin precisa ser inteiro positivo: ${especialista.duracaoPadraoMin}`);
	inteiroNaoNegativo(especialista.tetoDiario, "tetoDiario");
	inteiroNaoNegativo(especialista.antecedenciaMinimaMin, "antecedenciaMinimaMin");
	inteiroNaoNegativo(especialista.antecedenciaMaximaDias, "antecedenciaMaximaDias");
}
function instanteDe(iso, campo) {
	const ts = Date.parse(iso);
	if (Number.isNaN(ts)) throw new Error(`${campo} não é instante ISO-8601: ${iso}`);
	return ts;
}
function intervalosDe(intervalos, campo) {
	return intervalos.map((intervalo) => {
		const inicio = instanteDe(intervalo.inicio, `${campo}.inicio`);
		const fim = instanteDe(intervalo.fim, `${campo}.fim`);
		if (fim <= inicio) throw new Error(`${campo} sem duração: ${intervalo.inicio}–${intervalo.fim}`);
		return {
			inicio,
			fim
		};
	});
}
function minutosDoDia(hora) {
	const casou = HORA_DO_DIA.exec(hora.trim());
	if (!casou) throw new Error(`hora fora do formato HH:MM: ${hora}`);
	const h = Number(casou[1]);
	const m = Number(casou[2]);
	if (Number(casou[3] ?? "0") !== 0) throw new Error(`faixa com segundo não se oferece: ${hora}`);
	const total = h * 60 + m;
	if (m > 59 || total > 1440) throw new Error(`hora fora do dia: ${hora}`);
	return total;
}
function paraIso(instante) {
	const p = partesEm("UTC", instante);
	return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}T${dois(p.hora)}:${dois(p.minuto)}:${dois(p.segundo)}Z`;
}
function dois(valor) {
	return String(valor).padStart(2, "0");
}
//#endregion
//#region supabase/functions/_shared/discagem/janela.ts
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
//#endregion
//#region supabase/functions/_shared/speech/convite.ts
const NOME_DA_MODALIDADE$1 = {
	video: "Vídeo",
	telefone: "Telefone",
	presencial: "Presencial"
};
function horarioNoFuso(instante, fuso) {
	return `${rotularInstante(instante, fuso)} (horário de ${nomeDoFuso(fuso)})`;
}
function duracaoEmMinutos(inicio, fim) {
	return Math.round((Date.parse(fim) - Date.parse(inicio)) / 6e4);
}
function caminhoDoLead(dados) {
	const quem = dados.especialista.nome;
	if (dados.modalidade === "video") return dados.especialista.sala ? `É por vídeo, e o link pra entrar é este: ${dados.especialista.sala}` : `É por vídeo, e ${quem} te manda o link da sala antes de começar.`;
	if (dados.modalidade === "telefone") return `É por telefone: ${quem} te liga no número em que a gente conversou.`;
	return dados.especialista.sala ? `É presencial, neste endereço: ${dados.especialista.sala}` : `É presencial, e ${quem} te confirma o endereço antes do dia.`;
}
function textoDoConviteDoLead(dados) {
	const nome = dados.lead.nome?.trim();
	const quem = dados.especialista.nome;
	const saudacao = nome ? `Oi, ${nome}!` : "Oi!";
	const assistente = dados.assistente?.trim() || null;
	const corpo = [
		saudacao,
		"",
		`${assistente ? `Aqui é ${assistente}, da ${dados.empresa}.` : `Aqui é a assistente da ${dados.empresa}.`} Como a gente combinou, sua conversa com ${quem} ficou marcada pra ${horarioNoFuso(dados.inicio, dados.lead.fuso)}.`,
		"",
		caminhoDoLead(dados),
		"",
		"O convite vai anexado, é só abrir pra salvar na sua agenda.",
		"",
		"Até lá!",
		assistente ?? dados.empresa
	];
	return {
		assunto: `Sua conversa com ${quem} está marcada`,
		corpo: corpo.join("\n")
	};
}
const NOME_DA_ORIGEM = new Map([
	["import", "importação de planilha"],
	["intake", "formulário"],
	["manual", "cadastro manual"],
	["whatsapp", "conversa pelo WhatsApp"]
]);
function historicoDoLead(dados) {
	const lead = dados.lead;
	const fuso = dados.especialista.fuso;
	const local = [lead.cidade?.trim(), lead.estado?.trim()].filter(Boolean).join("/");
	const origem = lead.origem ? NOME_DA_ORIGEM.get(lead.origem) ?? lead.origem : null;
	return [
		...lead.empresa?.trim() ? [`Empresa: ${lead.empresa.trim()}`] : [],
		...local ? [`Local: ${local}`] : [],
		...origem ? [`Origem: ${origem}`] : [],
		...lead.temperatura ? [`Temperatura: ${lead.temperatura}`] : [],
		...lead.entrouEm ? [`Entrou em: ${rotularInstante(lead.entrouEm, fuso)}`] : [],
		...lead.ultimaAtividade ? [`Última atividade: ${rotularInstante(lead.ultimaAtividade, fuso)}`] : []
	];
}
function textoDoConviteDoEspecialista(dados) {
	const nome = dados.lead.nome?.trim() || "Lead sem nome";
	const sala = dados.especialista.sala?.trim() || null;
	const historico = historicoDoLead(dados);
	const corpo = [
		"Reunião marcada pela assistente.",
		"",
		`Lead: ${nome}`,
		`Quando: ${horarioNoFuso(dados.inicio, dados.especialista.fuso)}`,
		`Duração: ${duracaoEmMinutos(dados.inicio, dados.fim)} min`,
		`Modalidade: ${NOME_DA_MODALIDADE$1[dados.modalidade]}`,
		...sala ? [`${dados.modalidade === "presencial" ? "Endereço" : "Sala"}: ${sala}`] : [],
		...dados.modalidade === "telefone" && dados.lead.telefone ? [`Telefone do lead: ${dados.lead.telefone}`] : [],
		"",
		"Resumo de passagem:",
		dados.resumo ?? "Sem resumo de passagem registrado.",
		...historico.length > 0 ? [
			"",
			"Histórico do lead:",
			...historico
		] : [],
		...dados.notas ? [
			"",
			"Notas da marcação:",
			dados.notas
		] : []
	];
	return {
		assunto: `Reunião marcada com ${nome}: ${rotularInstante(dados.inicio, dados.especialista.fuso)}`,
		corpo: corpo.join("\n")
	};
}
//#endregion
//#region supabase/functions/_shared/agenda/calendario.ts
const MENSAGENS_DO_CALENDARIO = {
	nao_conectado: "Este especialista não tem calendário conectado. Os horários saem só da disponibilidade cadastrada aqui.",
	conexao_expirada: "A conexão com o calendário expirou, reconecte a agenda deste especialista para voltar a ler a ocupação.",
	sem_permissao_de_calendario: "O aplicativo ainda não tem permissão de calendário. É o estado normal enquanto o Google não conclui a verificação, e não depende de quem administra a conta.",
	agenda_nao_encontrada: "A agenda conectada não foi encontrada no calendário. Reconecte o calendário deste especialista e escolha a agenda de novo.",
	limite_de_taxa: "O calendário recusou por excesso de consultas. A conexão continua de pé, e a leitura se repete sozinha em alguns minutos.",
	provedor_indisponivel: "O calendário está fora do ar. A conexão continua de pé, e a leitura se repete sozinha na próxima passagem.",
	sem_resposta: "O calendário não respondeu no tempo esperado. A conexão continua de pé, e a leitura se repete sozinha na próxima passagem.",
	falha_do_calendario: "O calendário recusou o pedido e não informou o motivo. Reconecte a agenda deste especialista se a falha continuar.",
	endereco_ical_recusado: "O endereço iCal não abriu. Confira se colou o endereço secreto inteiro, ou gere outro no calendário e cole aqui de novo.",
	ical_invalido: "O endereço respondeu, mas não com uma agenda no formato iCal. Copie de novo o endereço secreto no formato iCal do calendário.",
	calendario_so_de_leitura: "O calendário por endereço iCal é só de leitura. A reunião chega à agenda do especialista pelo convite por e-mail."
};
const SO_ESPERAR = new Set([
	"limite_de_taxa",
	"provedor_indisponivel",
	"sem_resposta"
]);
function falhaDoCalendario(motivo) {
	return {
		ok: false,
		estado: motivo === "nao_conectado" ? "nao_configurado" : SO_ESPERAR.has(motivo) ? "indisponivel" : "erro",
		motivo,
		mensagem: MENSAGENS_DO_CALENDARIO[motivo]
	};
}
function protegerPorta(porta) {
	const proteger = async (ida) => {
		try {
			return await ida();
		} catch {
			return falhaDoCalendario("sem_resposta");
		}
	};
	return {
		lerOcupacao: (janela) => {
			const conferida = janelaAbsoluta(janela.inicio, janela.fim);
			return proteger(() => porta.lerOcupacao(conferida));
		},
		conferirHorario: (inicio, fim) => {
			const conferida = janelaAbsoluta(inicio, fim);
			return proteger(() => porta.conferirHorario(conferida.inicio, conferida.fim));
		},
		criarEvento: (reuniao) => {
			const conferida = janelaAbsoluta(reuniao.inicio, reuniao.fim);
			return proteger(() => porta.criarEvento({
				...reuniao,
				inicio: conferida.inicio,
				fim: conferida.fim
			}));
		},
		apagarEvento: (id) => proteger(() => porta.apagarEvento(id))
	};
}
const COM_DESLOCAMENTO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;
function eInstanteAbsoluto(valor) {
	return COM_DESLOCAMENTO.test(valor) && !Number.isNaN(Date.parse(valor));
}
function janelaAbsoluta(inicio, fim) {
	if (!eInstanteAbsoluto(inicio)) throw new Error(`início da janela sem deslocamento: ${inicio}`);
	if (!eInstanteAbsoluto(fim)) throw new Error(`fim da janela sem deslocamento: ${fim}`);
	if (Date.parse(fim) <= Date.parse(inicio)) throw new Error(`janela sem duração: ${inicio} a ${fim}`);
	return {
		inicio: paraUtc(Date.parse(inicio)),
		fim: paraUtc(Date.parse(fim))
	};
}
function paraUtc(ts) {
	return new Date(ts).toISOString().replace(".000Z", "Z");
}
//#endregion
//#region supabase/functions/_shared/agenda/evento-da-reuniao.ts
const RECUO_EM_MINUTOS$1 = [
	1,
	5,
	15,
	60
];
const TETO_DE_TENTATIVAS$1 = RECUO_EM_MINUTOS$1.length + 1;
const NOME_DA_MODALIDADE = {
	video: "Vídeo",
	telefone: "Telefone",
	presencial: "Presencial"
};
function textoDoResumo(resumo) {
	if (typeof resumo === "string") return resumo.trim() || null;
	if (resumo && typeof resumo === "object") for (const chave of [
		"resumo",
		"texto",
		"summary"
	]) {
		const valor = resumo[chave];
		if (typeof valor === "string" && valor.trim()) return valor.trim();
	}
	return null;
}
function montarEventoDaReuniao(reuniao) {
	const nome = reuniao.nomeDoLead?.trim() || "lead sem nome";
	const sala = reuniao.salaDoEspecialista?.trim() || null;
	const resumo = textoDoResumo(reuniao.handoff_summary);
	const notas = reuniao.notes?.trim() || null;
	const linhas = [
		`Modalidade: ${NOME_DA_MODALIDADE[reuniao.modality]}`,
		...sala ? [`Sala: ${sala}`] : [],
		...resumo ? [
			"",
			"Resumo de passagem:",
			resumo
		] : [],
		...notas ? [
			"",
			"Notas da marcação:",
			notas
		] : [],
		"",
		"Marcada pela assistente."
	];
	return {
		reuniaoId: reuniao.id,
		inicio: reuniao.starts_at,
		fim: reuniao.ends_at,
		titulo: `Reunião com ${nome}`,
		descricao: linhas.join("\n"),
		local: sala
	};
}
function falhaDepoisDe(tentativas, erro, agoraMs) {
	const espera = tentativas < TETO_DE_TENTATIVAS$1 ? RECUO_EM_MINUTOS$1[tentativas - 1] : void 0;
	return {
		tentativas,
		erro,
		proximaTentativa: espera === void 0 ? null : new Date(agoraMs + espera * 6e4).toISOString()
	};
}
async function criarEventoDaReuniao(pedido) {
	const { reuniao, calendario, porta } = pedido;
	if (reuniao.external_event_id !== null) return {
		situacao: "ja_existia",
		externalEventId: reuniao.external_event_id
	};
	if (calendario === null) return { situacao: "sem_calendario" };
	const resultado = "ok" in calendario ? calendario : await protegerPorta(calendario).criarEvento(montarEventoDaReuniao(reuniao));
	if (resultado.ok) {
		await porta.gravarEvento(reuniao.account_id, reuniao.id, resultado.valor.externalEventId);
		return {
			situacao: "criado",
			externalEventId: resultado.valor.externalEventId
		};
	}
	const falha = falhaDepoisDe(reuniao.event_attempts + 1, resultado.mensagem, pedido.agora());
	await porta.registrarFalhaDoEvento(reuniao.account_id, reuniao.id, falha);
	return {
		situacao: "falhou",
		falha
	};
}
//#endregion
//#region supabase/functions/_shared/agenda/convite-de-reuniao.ts
const RECUO_EM_MINUTOS = [
	1,
	5,
	15,
	60
];
const TETO_DE_TENTATIVAS = RECUO_EM_MINUTOS.length + 1;
const MENSAGEM_SEM_EMAIL = "O lead não tem e-mail cadastrado. Cadastre o e-mail na ficha do lead e o convite sai na próxima passagem.";
function fusoDoLead(reuniao) {
	return reuniao.lead.fuso?.trim() || reuniao.fusoDaConta;
}
function dadosDoConvite(reuniao) {
	return {
		inicio: reuniao.starts_at,
		fim: reuniao.ends_at,
		modalidade: reuniao.modality,
		empresa: reuniao.empresa,
		assistente: reuniao.assistente,
		especialista: {
			nome: reuniao.especialista.nome,
			sala: reuniao.especialista.sala,
			fuso: reuniao.especialista.fuso
		},
		lead: {
			...reuniao.lead,
			fuso: fusoDoLead(reuniao)
		},
		resumo: textoDoResumo(reuniao.handoff_summary),
		notas: reuniao.notes?.trim() || null
	};
}
function escaparTextoDoIcs(texto) {
	return texto.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function dobrarLinhaDoIcs(linha) {
	const codificador = new TextEncoder();
	const partes = [];
	let atual = "";
	let bytes = 0;
	for (const caractere of linha) {
		const tamanho = codificador.encode(caractere).length;
		const limite = partes.length === 0 ? 75 : 74;
		if (bytes + tamanho > limite) {
			partes.push(atual);
			atual = "";
			bytes = 0;
		}
		atual += caractere;
		bytes += tamanho;
	}
	partes.push(atual);
	return partes.join("\r\n ");
}
function instanteDoIcs(instante) {
	const ms = Date.parse(instante);
	if (!Number.isFinite(ms)) throw new Error(`instante inválido para o convite: ${instante}`);
	return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function uidDoConvite(reuniaoId) {
	return `reuniao-${reuniaoId}@sarah`;
}
function montarIcs(evento) {
	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Sarah Voice SDR//Convite de reunião//PT-BR",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${uidDoConvite(evento.reuniaoId)}`,
		`DTSTAMP:${instanteDoIcs(evento.carimbo)}`,
		`DTSTART:${instanteDoIcs(evento.inicio)}`,
		`DTEND:${instanteDoIcs(evento.fim)}`,
		`SUMMARY:${escaparTextoDoIcs(evento.titulo)}`,
		`DESCRIPTION:${escaparTextoDoIcs(evento.descricao)}`,
		...evento.local ? [`LOCATION:${escaparTextoDoIcs(evento.local)}`] : [],
		"END:VEVENT",
		"END:VCALENDAR"
	].map(dobrarLinhaDoIcs).join("\r\n") + "\r\n";
}
function chaveDoConvite(reuniaoId, lado, tentativa) {
	return `convite-${reuniaoId}-${lado}-${tentativa}`;
}
function montarConvite(reuniao, lado, para, agoraMs) {
	const dados = dadosDoConvite(reuniao);
	const texto = lado === "lead" ? textoDoConviteDoLead(dados) : textoDoConviteDoEspecialista(dados);
	const nomeDoLead = reuniao.lead.nome?.trim() || "lead sem nome";
	const ics = montarIcs({
		reuniaoId: reuniao.id,
		inicio: reuniao.starts_at,
		fim: reuniao.ends_at,
		titulo: lado === "lead" ? `Conversa com ${reuniao.especialista.nome}` : `Reunião com ${nomeDoLead}`,
		descricao: texto.corpo,
		local: reuniao.especialista.sala,
		carimbo: new Date(agoraMs).toISOString()
	});
	const entrega = lado === "lead" ? reuniao.entregaDoLead : reuniao.entregaDoEspecialista;
	return {
		para,
		assunto: texto.assunto,
		texto: texto.corpo,
		anexos: [{
			nome: "convite.ics",
			tipo: "text/calendar; charset=utf-8; method=PUBLISH",
			conteudo: ics
		}],
		chaveDeIdempotencia: chaveDoConvite(reuniao.id, lado, entrega.tentativas + 1)
	};
}
function pendenciaDepoisDe(tentativas, erro, agoraMs) {
	const espera = tentativas < TETO_DE_TENTATIVAS ? RECUO_EM_MINUTOS[tentativas - 1] : void 0;
	return {
		tentativas,
		erro,
		proximaTentativa: espera === void 0 ? null : new Date(agoraMs + espera * 6e4).toISOString()
	};
}
function ladoPendente(entrega, agoraMs) {
	if (entrega.enviadoEm !== null) return false;
	if (entrega.tentativas >= TETO_DE_TENTATIVAS) return false;
	return entrega.proximaTentativa === null || Date.parse(entrega.proximaTentativa) <= agoraMs;
}
new Set([...MOTIVOS_DE_CONFIGURACAO].map((motivo) => MENSAGENS_DO_EMAIL[motivo]));
async function enviarUmLado(pedido, lado, para, agoraMs) {
	const { reuniao, email, porta } = pedido;
	const entrega = lado === "lead" ? reuniao.entregaDoLead : reuniao.entregaDoEspecialista;
	if (entrega.enviadoEm !== null) return { situacao: "ja_enviado" };
	if (!ladoPendente(entrega, agoraMs)) return { situacao: "aguardando" };
	if (para === null) {
		const pendencia = {
			tentativas: entrega.tentativas,
			erro: MENSAGEM_SEM_EMAIL,
			proximaTentativa: new Date(agoraMs + 36e5).toISOString()
		};
		await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia);
		return {
			situacao: "sem_email",
			pendencia
		};
	}
	if ("ok" in email && MOTIVOS_DE_CONFIGURACAO.has(email.motivo)) {
		const pendencia = {
			tentativas: entrega.tentativas,
			erro: email.mensagem,
			proximaTentativa: new Date(agoraMs + 36e5).toISOString()
		};
		await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia);
		return {
			situacao: "email_nao_configurado",
			pendencia
		};
	}
	const resultado = "ok" in email ? email : await email.enviar(montarConvite(reuniao, lado, para, agoraMs)).catch(() => falhaDoEmail("sem_resposta"));
	if (resultado.ok) {
		await porta.gravarEnvioDoConvite(reuniao.account_id, reuniao.id, lado, new Date(agoraMs).toISOString());
		return { situacao: "enviado" };
	}
	const pendencia = pendenciaDepoisDe(entrega.tentativas + 1, resultado.mensagem, agoraMs);
	await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia);
	return {
		situacao: "falhou",
		pendencia
	};
}
async function enviarConvitesDaReuniao(pedido) {
	const agoraMs = pedido.agora();
	const destinatarioDoLead = pedido.reuniao.lead.email?.trim() || null;
	const destinatarioDoEspecialista = pedido.reuniao.especialista.email.trim() || null;
	const [especialista, lead] = await Promise.allSettled([enviarUmLado(pedido, "especialista", destinatarioDoEspecialista, agoraMs), enviarUmLado(pedido, "lead", destinatarioDoLead, agoraMs)]);
	if (especialista.status === "rejected") throw especialista.reason;
	if (lead.status === "rejected") throw lead.reason;
	return {
		lead: lead.value,
		especialista: especialista.value
	};
}
//#endregion
//#region supabase/functions/_shared/speech/agenda.ts
const DIAS_FALADOS = [
	"domingo",
	"segunda",
	"terça",
	"quarta",
	"quinta",
	"sexta",
	"sábado"
];
const POSICOES_FALADAS = [
	"um",
	"dois",
	"três",
	"quatro"
];
const LUGARES_DOS_FUSOS = new Map([
	["America/Sao_Paulo", "aqui em São Paulo"],
	["America/Manaus", "aqui em Manaus"],
	["America/Rio_Branco", "aqui em Rio Branco"],
	["America/Campo_Grande", "aqui em Campo Grande"],
	["America/Cuiaba", "aqui em Cuiabá"],
	["America/Belem", "aqui em Belém"],
	["America/Fortaleza", "aqui em Fortaleza"],
	["America/Recife", "aqui em Recife"],
	["America/Bahia", "aqui em Salvador"],
	["America/Noronha", "aqui em Noronha"]
]);
function falarHora(hora, minuto) {
	if (hora === 0 && minuto === 0) return "meia-noite";
	if (hora === 12 && minuto === 0) return "meio-dia";
	if (hora === 0 && minuto === 30) return "meia-noite e meia";
	if (hora === 12 && minuto === 30) return "meio-dia e meia";
	return minuto === 0 ? `${hora}h` : `${hora}h${String(minuto).padStart(2, "0")}`;
}
function falarDia(relogio, hoje) {
	const distancia = relogio.diaCivil - hoje.diaCivil;
	if (distancia === 0) return "hoje";
	if (distancia === 1) return "amanhã";
	const nome = DIAS_FALADOS[relogio.diaDaSemana] ?? "";
	return distancia > 1 && distancia < 7 ? nome : `${nome}, dia ${relogio.dia},`;
}
function preposicao(hora) {
	if (hora.startsWith("meio-dia")) return `ao ${hora}`;
	if (hora.startsWith("meia-noite")) return `à ${hora}`;
	return `às ${hora}`;
}
function falarHorario(horario, agora) {
	const doLead = relogioEm(horario.inicio, horario.fusoDoLead);
	const hojeDoLead = relogioEm(agora, horario.fusoDoLead);
	const horaDoLead = falarHora(doLead.hora, doLead.minuto);
	const base = `${falarDia(doLead, hojeDoLead)} ${preposicao(horaDoLead)}`;
	const doEspecialista = relogioEm(horario.inicio, horario.fusoDoEspecialista);
	if (doEspecialista.diaCivil === doLead.diaCivil && doEspecialista.hora === doLead.hora && doEspecialista.minuto === doLead.minuto) return base;
	const lugar = LUGARES_DOS_FUSOS.get(horario.fusoDoEspecialista) ?? "no horário do especialista";
	return `${base} no seu horário, ${falarHora(doEspecialista.hora, doEspecialista.minuto)}${doEspecialista.diaCivil === doLead.diaCivil ? "" : ` de ${DIAS_FALADOS[doEspecialista.diaDaSemana] ?? ""}`} ${lugar}`;
}
function falarOferta(horarios, agora) {
	if (horarios.length === 0) return FALAS_DA_AGENDA.agendaCheia;
	if (horarios.length > POSICOES_FALADAS.length) throw new Error(`a oferta tem no máximo ${POSICOES_FALADAS.length} horários: ${horarios.length}`);
	if (horarios.length === 1) return `Tenho um horário: ${falarHorario(horarios[0], agora)}. Fica bom pra você?`;
	return `Tenho estas opções: ${horarios.map((horario, indice) => `opção ${POSICOES_FALADAS[indice]}, ${falarHorario(horario, agora)}`).join("; ")}. Qual fica melhor pra você?`;
}
function falarConfirmacao(horario, agora) {
	return `Fechado, ficou marcado pra ${falarHorario(horario, agora)}. Vou te mandar o convite por e-mail.`;
}
const FALAS_DA_AGENDA = {
	horarioTomado: "Esse horário acabou de ser preenchido, deixa eu ver outro.",
	falha: FALAS_DAS_FERRAMENTAS.falha,
	agendaCheia: "Poxa, a agenda está bem cheia nos próximos dias. Deixa eu pedir pro time te chamar com uma opção, tá bom?",
	ofertaSemValidade: "Deixa eu olhar a agenda de novo pra te passar os horários certinhos.",
	diaLotado: "Esse dia acabou de lotar, deixa eu ver outro dia pra você.",
	emCimaDaHora: "Esse horário ficou em cima da hora pra marcar, deixa eu ver um pouco mais pra frente.",
	longeDemais: "Esse horário ficou longe demais na agenda, deixa eu ver uma data mais próxima.",
	jaTemReuniao: "Vi aqui que você já tem uma conversa marcada com a gente, então vou manter essa, tá bom?",
	especialistaSaiu: "Essa agenda acabou de sair do ar, deixa eu ver outro horário com o time.",
	qualModalidade: "Você prefere fazer por vídeo, por telefone ou presencial?"
};
//#endregion
//#region supabase/functions/tool-book-meeting/agendamento.ts
const MODALIDADES = MODALIDADES_DA_REUNIAO;
const FALAS_DOS_CODIGOS = new Map([
	["horario_ocupado", FALAS_DA_AGENDA.horarioTomado],
	["fora_da_disponibilidade", FALAS_DA_AGENDA.horarioTomado],
	["teto_diario", FALAS_DA_AGENDA.diaLotado],
	["antecedencia_minima", FALAS_DA_AGENDA.emCimaDaHora],
	["antecedencia_maxima", FALAS_DA_AGENDA.longeDemais],
	["lead_com_reuniao_ativa", FALAS_DA_AGENDA.jaTemReuniao],
	["especialista_inativo", FALAS_DA_AGENDA.especialistaSaiu]
]);
const POSICAO = /^[1-4]$/;
function lerPosicao(valor) {
	if (typeof valor === "number") return Number.isInteger(valor) && valor >= 1 && valor <= 4 ? valor : null;
	if (typeof valor === "string" && POSICAO.test(valor.trim())) return Number(valor.trim());
	return null;
}
function lerModalidade(valor) {
	if (typeof valor !== "string") return null;
	const limpa = valor.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
	return MODALIDADES.find((modalidade) => modalidade === limpa) ?? null;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function lerEmail(valor) {
	if (typeof valor !== "string") return null;
	const limpo = valor.trim().toLowerCase();
	return EMAIL.test(limpo) ? limpo : null;
}
function lerNotas(valor) {
	if (typeof valor !== "string") return null;
	const limpas = valor.trim();
	return limpas === "" ? null : limpas;
}
function recusa$2(motivo, speech) {
	return {
		ok: false,
		data: { reason: motivo },
		speech,
		erro: motivo
	};
}
function executorDoAgendamento(leitura) {
	return {
		async ler(contexto) {
			const agoraMs = contexto.agora();
			const agora = new Date(agoraMs).toISOString();
			const modalidade = lerModalidade(contexto.entrada.modality);
			if (modalidade === null) return recusa$2("modalidade_desconhecida", FALAS_DA_AGENDA.qualModalidade);
			const leadId = contexto.chamada.lead_id;
			if (leadId === null) return recusa$2("chamada_sem_lead", FALAS_DA_AGENDA.falha);
			const posicao = lerPosicao(contexto.entrada.slot_position);
			const oferta = posicao === null ? null : await leitura.ofertaDaChamada(contexto.contaId, contexto.chamada.id, posicao);
			if (oferta === null) return recusa$2("posicao_nao_oferecida", FALAS_DA_AGENDA.ofertaSemValidade);
			if (Date.parse(oferta.expires_at) <= agoraMs) return recusa$2("oferta_expirada", FALAS_DA_AGENDA.ofertaSemValidade);
			const calendario = await leitura.calendarioDoEspecialista(contexto.contaId, oferta.specialist_id);
			if (calendario !== null) {
				const conferencia = await calendario.conferirHorario(oferta.starts_at, oferta.ends_at);
				if (conferencia.ok && !conferencia.valor.livre) return recusa$2("horario_ocupado_no_calendario", FALAS_DA_AGENDA.horarioTomado);
			}
			const horario = {
				inicio: oferta.starts_at,
				fusoDoLead: await leitura.fusoDoLead(contexto.contaId, leadId),
				fusoDoEspecialista: oferta.fusoDoEspecialista
			};
			return {
				data: {
					meeting_id: null,
					starts_at: oferta.starts_at
				},
				speech: falarConfirmacao(horario, agora),
				plano: {
					pedido: {
						p_account_id: contexto.contaId,
						p_lead_id: leadId,
						p_specialist_id: oferta.specialist_id,
						p_starts_at: oferta.starts_at,
						p_ends_at: oferta.ends_at,
						p_modality: modalidade,
						p_notes: lerNotas(contexto.entrada.notes),
						p_booked_call_id: contexto.chamada.id
					},
					email: lerEmail(contexto.entrada.email)
				}
			};
		},
		async efeitos(contexto, leitura) {
			const plano = leitura.plano;
			if (leitura.ok === false || plano === void 0) return;
			const { resultado, reuniao_id } = await contexto.escrita.agendarReuniao(plano.pedido);
			if (resultado !== "agendada") {
				const fala = FALAS_DOS_CODIGOS.get(resultado);
				if (fala === void 0) throw new Error(`código desconhecido de agendar_reuniao: ${resultado}`);
				return {
					ok: false,
					data: { reason: resultado },
					speech: fala,
					erro: resultado
				};
			}
			if (reuniao_id === null) throw new Error("agendar_reuniao agendou sem devolver o id");
			await contexto.escrita.consumirOfertas(contexto.contaId, contexto.chamada.id);
			if (plano.email !== null) await contexto.escrita.preencherEmailDoLead(contexto.contaId, plano.pedido.p_lead_id, plano.email);
			await Promise.all([criarEventoSemDesfazer(contexto, reuniao_id), enviarConvitesSemDesfazer(contexto, reuniao_id)]);
			return {
				data: {
					meeting_id: reuniao_id,
					starts_at: plano.pedido.p_starts_at
				},
				speech: leitura.speech
			};
		}
	};
}
async function criarEventoSemDesfazer(contexto, reuniaoId) {
	const escrita = contexto.escrita;
	try {
		const reuniao = await escrita.reuniaoParaEvento(contexto.contaId, reuniaoId);
		if (reuniao === null) return;
		await criarEventoDaReuniao({
			reuniao,
			calendario: await escrita.calendarioParaEvento(contexto.contaId, reuniao.specialist_id),
			porta: escrita,
			agora: contexto.agora
		});
	} catch (erro) {
		escrita.registrarNoLog?.({
			funcao: "tool-book-meeting",
			passo: "evento_da_reuniao",
			reuniao: reuniaoId,
			erro: erro instanceof Error ? erro.message : String(erro)
		});
	}
}
async function enviarConvitesSemDesfazer(contexto, reuniaoId) {
	const escrita = contexto.escrita;
	try {
		const reuniao = await escrita.reuniaoParaConvite(contexto.contaId, reuniaoId);
		if (reuniao === null) return;
		await enviarConvitesDaReuniao({
			reuniao,
			email: await escrita.emailParaConvite(contexto.contaId),
			porta: escrita,
			agora: contexto.agora
		});
	} catch (erro) {
		escrita.registrarNoLog?.({
			funcao: "tool-book-meeting",
			passo: "convite_da_reuniao",
			reuniao: reuniaoId,
			erro: erro instanceof Error ? erro.message : String(erro)
		});
	}
}
//#endregion
//#region supabase/functions/_shared/agenda/roteamento.ts
function escolherEspecialista(entrada) {
	const { modo, candidatos, agora } = entrada;
	conferirModo(modo);
	const especialistaFixo = conferirDestinoDoModo(modo, entrada.especialistaFixo);
	const descartados = [];
	const aptos = [];
	const horizontes = new Map();
	for (const candidato of candidatos) {
		marcaDe(candidato);
		const motivo = exclusaoDe(candidato, agora, horizontes);
		if (motivo) descartados.push({
			id: candidato.id,
			motivo
		});
		else aptos.push(candidato);
	}
	const escolhidos = aplicarModo(modo, aptos, entrada.areaPedida, especialistaFixo);
	if (escolhidos.length > 0) return {
		roteou: true,
		escolhidos,
		descartados
	};
	const motivo = recusaDe({
		modo,
		temApto: aptos.length > 0
	});
	if (!motivo) throw new Error(`o modo ${modo} recusou sem motivo`);
	return {
		roteou: false,
		motivo,
		descartados
	};
}
function exclusaoDe(candidato, agora, horizontes) {
	if (!candidato.ativo) return "inativo";
	return temFaixaNoHorizonte(candidato, agora, horizontes) ? null : "sem_disponibilidade";
}
function temFaixaNoHorizonte(candidato, agora, horizontes) {
	if (candidato.disponibilidade.length === 0) return false;
	const chave = `${encodeURIComponent(candidato.fuso)}|${candidato.antecedenciaMaximaDias}`;
	let horizonte = horizontes.get(chave);
	if (!horizonte) {
		horizonte = diasDaSemanaNoHorizonte(candidato.fuso, agora, candidato.antecedenciaMaximaDias);
		horizontes.set(chave, horizonte);
	}
	return candidato.disponibilidade.some((faixa) => {
		if (!Number.isInteger(faixa.diaDaSemana) || faixa.diaDaSemana < 0 || faixa.diaDaSemana > 6) throw new Error(`dia da semana fora de 0..6: ${faixa.diaDaSemana}`);
		return horizonte.has(faixa.diaDaSemana);
	});
}
function aplicarModo(modo, aptos, areaPedida, especialistaFixo) {
	if (modo === "fixed") return aptos.filter((candidato) => candidato.id === especialistaFixo);
	if (modo === "area") {
		const pedida = normalizar(areaPedida);
		return [...pedida === null ? [] : aptos.filter((c) => normalizar(c.area) === pedida)].sort(ordemDeId);
	}
	return [...aptos].sort(ordemDeRodizio);
}
function ordemDeRodizio(a, b) {
	const marcaA = marcaDe(a);
	const marcaB = marcaDe(b);
	if (marcaA === null && marcaB !== null) return -1;
	if (marcaA !== null && marcaB === null) return 1;
	if (marcaA !== null && marcaB !== null && marcaA !== marcaB) return marcaA - marcaB;
	return ordemDeId(a, b);
}
function ordemDeId(a, b) {
	if (a.id === b.id) return 0;
	return a.id < b.id ? -1 : 1;
}
function marcaDe(candidato) {
	if (candidato.ultimaAtribuicaoEm === null) return null;
	const ts = Date.parse(candidato.ultimaAtribuicaoEm);
	if (Number.isNaN(ts)) throw new Error(`ultimaAtribuicaoEm não é instante ISO-8601: ${candidato.ultimaAtribuicaoEm}`);
	return ts;
}
const RECUSAS = [
	{
		motivo: "sem_disponibilidade",
		recusa: (c) => !c.temApto
	},
	{
		motivo: "especialista_fixo_inativo",
		recusa: (c) => c.modo === "fixed"
	},
	{
		motivo: "sem_especialista_na_area",
		recusa: (c) => c.modo === "area"
	}
];
function recusaDe(conferencia) {
	for (const { motivo, recusa } of RECUSAS) if (recusa(conferencia)) return motivo;
	return null;
}
const MODOS$1 = [
	"area",
	"round_robin",
	"fixed"
];
function conferirModo(modo) {
	if (!MODOS$1.includes(modo)) throw new Error(`modo de roteamento desconhecido: ${modo}`);
}
function conferirDestinoDoModo(modo, especialistaFixo) {
	const destino = especialistaFixo ?? null;
	if (modo === "fixed" && destino === null) throw new Error("modo fixed sem especialistaFixo: o destino do modo é obrigatório");
	if (modo !== "fixed" && destino !== null) throw new Error(`modo ${modo} com especialistaFixo: destino que ninguém honra`);
	return destino;
}
function normalizar(area) {
	if (typeof area !== "string") return null;
	const limpa = area.trim().toLowerCase();
	return limpa === "" ? null : limpa;
}
//#endregion
//#region supabase/functions/tool-availability/disponibilidade.ts
const STATUS_QUE_OCUPAM = new Set(["scheduled", "confirmed"]);
const DURACAO_MINIMA = 15;
const DURACAO_MAXIMA = 240;
const MODOS = [
	"area",
	"round_robin",
	"fixed"
];
const DIA_MS = 864e5;
const INTEIRO_POSITIVO = /^[1-9][0-9]*$/;
function texto$1(valor) {
	if (typeof valor !== "string") return null;
	const limpo = valor.trim();
	return limpo === "" ? null : limpo;
}
function inteiroPositivo(valor) {
	if (typeof valor === "number") return Number.isInteger(valor) && valor > 0 ? valor : null;
	if (typeof valor === "string" && INTEIRO_POSITIVO.test(valor.trim())) return Number(valor.trim());
	return null;
}
function lerPedido(entrada) {
	const duracao = inteiroPositivo(entrada.duration_min);
	return {
		area: texto$1(entrada.area),
		especialistaId: texto$1(entrada.specialist_id),
		duracaoMin: duracao !== null && duracao >= DURACAO_MINIMA && duracao <= DURACAO_MAXIMA ? duracao : null,
		diasAFrente: inteiroPositivo(entrada.days_ahead)
	};
}
function comPedido(especialista, pedido) {
	return {
		...especialista,
		duracaoPadraoMin: pedido.duracaoMin ?? especialista.duracaoPadraoMin,
		antecedenciaMaximaDias: pedido.diasAFrente === null ? especialista.antecedenciaMaximaDias : Math.min(pedido.diasAFrente, especialista.antecedenciaMaximaDias)
	};
}
function comoCandidato(especialista) {
	return {
		id: especialista.id,
		area: especialista.area,
		ativo: especialista.ativo,
		fuso: especialista.fuso,
		antecedenciaMaximaDias: especialista.antecedenciaMaximaDias,
		disponibilidade: [...especialista.disponibilidade],
		ultimaAtribuicaoEm: especialista.ultimaAtribuicaoEm
	};
}
function modoDe(gravado) {
	const modo = MODOS.find((conhecido) => conhecido === gravado);
	if (modo === void 0) throw new Error(`routing_mode desconhecido: ${gravado}`);
	return modo;
}
function periodoDaLeitura(agora, especialistas) {
	const horizonte = Math.max(...especialistas.map((e) => e.antecedenciaMaximaDias));
	return {
		de: new Date(agora - DIA_MS).toISOString(),
		ate: new Date(agora + (horizonte + 1) * DIA_MS).toISOString()
	};
}
function ofertasDe(especialista, agenda, fusoDoLead, agora) {
	return gerarHorarios({
		especialista: {
			fuso: especialista.fuso,
			duracaoPadraoMin: especialista.duracaoPadraoMin,
			tetoDiario: especialista.tetoDiario,
			antecedenciaMinimaMin: especialista.antecedenciaMinimaMin,
			antecedenciaMaximaDias: especialista.antecedenciaMaximaDias
		},
		disponibilidade: [...especialista.disponibilidade],
		bloqueios: [...agenda?.bloqueios ?? []],
		ocupacaoExterna: [...agenda?.ocupacaoExterna ?? []],
		reunioesMarcadas: (agenda?.reunioes ?? []).filter((reuniao) => STATUS_QUE_OCUPAM.has(reuniao.status)).map(({ inicio, fim }) => ({
			inicio,
			fim
		})),
		fusoDoLead,
		agora
	}).ofertas.map((oferta) => ({
		especialistaId: especialista.id,
		oferta
	}));
}
function juntarPorInstante(listas) {
	const vistos = new Set();
	const juntas = [];
	const todas = listas.flat().sort((a, b) => Date.parse(a.oferta.inicio) - Date.parse(b.oferta.inicio));
	for (const item of todas) {
		const instante = Date.parse(item.oferta.inicio);
		if (vistos.has(instante)) continue;
		vistos.add(instante);
		juntas.push(item);
		if (juntas.length === 4) break;
	}
	return juntas;
}
function vazia(motivo) {
	return {
		data: {
			offers: [],
			reason: motivo
		},
		speech: FALAS_DA_AGENDA.agendaCheia,
		plano: { ofertas: [] }
	};
}
function executorDaDisponibilidade(leitura) {
	return {
		async ler(contexto) {
			const agoraMs = contexto.agora();
			const agora = new Date(agoraMs).toISOString();
			const pedido = lerPedido(contexto.entrada);
			const configuracao = await leitura.configuracaoDaConta(contexto.contaId);
			const modoDaConta = modoDe(configuracao.modo);
			const fusoDoLead = (contexto.chamada.lead_id === null ? null : texto$1(await leitura.fusoDoLead(contexto.contaId, contexto.chamada.lead_id))) ?? configuracao.fusoDaConta;
			const especialistas = (await leitura.especialistasDaConta(contexto.contaId)).map((e) => comPedido(e, pedido));
			const porId = new Map(especialistas.map((e) => [e.id, e]));
			const roteamento = escolherEspecialista({
				modo: pedido.especialistaId === null ? modoDaConta : "fixed",
				especialistaFixo: pedido.especialistaId ?? (modoDaConta === "fixed" ? configuracao.especialistaFixo : null),
				areaPedida: pedido.area,
				candidatos: especialistas.map(comoCandidato),
				agora
			});
			if (!roteamento.roteou) return vazia(roteamento.motivo);
			const escolhidos = roteamento.escolhidos.map((candidato) => porId.get(candidato.id));
			const agendas = await leitura.agendaNoPeriodo(contexto.contaId, escolhidos.map((e) => e.id), periodoDaLeitura(agoraMs, escolhidos));
			const agendaDe = new Map(agendas.map((agenda) => [agenda.especialistaId, agenda]));
			const gerar = (e) => ofertasDe(e, agendaDe.get(e.id), fusoDoLead, agora);
			let escolhidas;
			if (pedido.especialistaId === null && modoDaConta === "area") escolhidas = juntarPorInstante(escolhidos.map(gerar));
			else {
				escolhidas = [];
				for (const especialista of escolhidos) {
					escolhidas = gerar(especialista);
					if (escolhidas.length > 0) break;
				}
			}
			if (escolhidas.length === 0) return vazia("sem_horario");
			const falados = escolhidas.map(({ oferta }) => ({
				inicio: oferta.inicio,
				fusoDoLead,
				fusoDoEspecialista: oferta.fusoDoEspecialista
			}));
			return {
				data: { offers: escolhidas.map(({ oferta }, indice) => ({
					position: indice + 1,
					starts_at: oferta.inicio,
					ends_at: oferta.fim,
					label: falarHorario(falados[indice], agora)
				})) },
				speech: falarOferta(falados, agora),
				plano: { ofertas: escolhidas.map(({ especialistaId, oferta }, indice) => ({
					position: indice + 1,
					specialist_id: especialistaId,
					starts_at: oferta.inicio,
					ends_at: oferta.fim
				})) }
			};
		},
		async memoria(contexto, leitura) {
			await contexto.escrita.substituirOfertas(contexto.contaId, contexto.chamada.id, leitura.plano?.ofertas ?? []);
		}
	};
}
//#endregion
//#region supabase/functions/_shared/qualificacao/resultado.ts
const CHAVES_DO_BRIEFING = [
	"pain",
	"fit",
	"objections",
	"next_action"
];
function textoConfirmado(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : void 0;
}
function briefingDaEntrada(entrada) {
	const briefing = {};
	for (const chave of CHAVES_DO_BRIEFING) {
		const valor = textoConfirmado(entrada[chave]);
		if (valor !== void 0) briefing[chave] = valor;
	}
	return briefing;
}
function sentimentoNaFaixa(valor) {
	return typeof valor === "number" && Number.isFinite(valor) && valor >= -1 && valor <= 1 ? valor : null;
}
function respostasDaEntrada(valor) {
	if (!valor || typeof valor !== "object" || Array.isArray(valor)) return {};
	const saida = {};
	for (const [chave, resposta] of Object.entries(valor)) saida[chave] = typeof resposta === "boolean" ? resposta : null;
	return saida;
}
function classificacaoDaQualificacao(entrada) {
	return {
		stage_key: entrada.stageKey,
		temperature: entrada.pontuacao.temperatura,
		score: entrada.pontuacao.score,
		...entrada.briefing,
		sentiment: entrada.sentimento,
		criterios_atendidos: entrada.pontuacao.criteriosAtendidos,
		criterios_faltando: entrada.pontuacao.criteriosFaltando,
		criterios_reprovados: entrada.pontuacao.criteriosReprovados
	};
}
DESCRITOR_DA_QUALIFICACAO.propositos;
function recusa$1(erro) {
	return {
		ok: false,
		erro,
		data: null,
		speech: FALAS_DAS_FERRAMENTAS.falha
	};
}
const OBRIGATORIOS_DA_QUALIFICACAO = [{
	chave: "stage_key",
	nome: "etapa"
}];
function executorDaQualificacao(leitura) {
	return {
		async ler(contexto) {
			const leadId = contexto.chamada.lead_id;
			if (leadId === null) return recusa$1("lead_ausente");
			const [catalogo, regua] = await Promise.all([leitura.catalogoDeEtapas(contexto.contaId), leitura.reguaDaConta(contexto.contaId)]);
			const etapa = resolverEtapa(String(contexto.entrada.stage_key), catalogo);
			if (!etapa.ok) return recusa$1("etapa_desconhecida");
			const pontuacao = calcularPontuacao(respostasDaEntrada(contexto.entrada.criterios), regua);
			if (!pontuacao.ok) return recusa$1("regua_invalida");
			const briefing = briefingDaEntrada(contexto.entrada);
			const sentimento = sentimentoNaFaixa(contexto.entrada.sentiment);
			const gravacao = {
				contaId: contexto.contaId,
				leadId,
				score: pontuacao.score,
				temperatura: pontuacao.temperatura,
				sentimento,
				briefing
			};
			const classificacao = classificacaoDaQualificacao({
				stageKey: etapa.stageKey,
				pontuacao,
				briefing,
				sentimento
			});
			return {
				data: {
					lead_id: leadId,
					score: pontuacao.score
				},
				speech: FALAS_DA_QUALIFICACAO.registrada,
				plano: {
					leadId,
					stageKey: etapa.stageKey,
					gravacao,
					classificacao
				}
			};
		},
		async efeitos(contexto, leitura) {
			const plano = leitura.plano;
			if (leitura.ok === false || plano === void 0) return;
			await contexto.escrita.gravarLead(plano.gravacao);
			await contexto.escrita.moverEtapa(plano.leadId, plano.stageKey);
			await contexto.escrita.gravarClassificacao(contexto.contaId, contexto.chamada.id, plano.classificacao);
		}
	};
}
//#endregion
//#region supabase/functions/whatsapp-inbound/ferramentas.ts
const DIRECAO_DO_WHATSAPP = "whatsapp";
const FALAS = {
	bloqueado: "Número tirado da lista: nenhuma mensagem nova vai para esta pessoa. Confirme isso a ela e se despeça.",
	humano: "Pedido registrado: alguém do time vai responder por aqui. Diga isso à pessoa sem prometer prazo."
};
function texto(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
function ferramentasDaConversa(conversa, portas) {
	const contaId = conversa.account_id;
	const base = {
		contaId,
		chamada: {
			id: conversa.id,
			account_id: contaId,
			purpose: conversa.purpose,
			direction: DIRECAO_DO_WHATSAPP,
			lead_id: conversa.lead_id
		},
		agora: portas.agora
	};
	return new Map([
		["tool-qualify", (entrada) => executarFerramentaDireto({
			...base,
			entrada,
			executor: executorDaQualificacao(portas.qualificacao.leitura),
			escrita: {
				...portas.qualificacao.escrita,
				gravarClassificacao: async () => {}
			},
			obrigatorios: OBRIGATORIOS_DA_QUALIFICACAO
		})],
		["tool-availability", (entrada) => executarFerramentaDireto({
			...base,
			entrada,
			executor: executorDaDisponibilidade(portas.disponibilidade.leitura),
			escrita: portas.disponibilidade.escrita
		})],
		["tool-book-meeting", (entrada) => executarFerramentaDireto({
			...base,
			entrada,
			executor: executorDoAgendamento(portas.agendamento.leitura),
			escrita: {
				...portas.agendamento.escrita,
				agendarReuniao: (pedido) => portas.agendamento.escrita.agendarReuniao({
					...pedido,
					p_booked_call_id: null
				})
			},
			obrigatorios: [{
				chave: "slot_position",
				nome: "posição do horário"
			}, {
				chave: "modality",
				nome: "modalidade"
			}]
		})],
		["tool-dnc", async (entrada) => {
			const origem = origemDoMotivo(entrada.reason);
			await portas.canal.bloquear(contaId, conversa.phone_e164, origem, notasDoPedido(entrada));
			await portas.canal.encerrar(contaId, conversa.id, origem === "wrong_number" ? "pessoa_errada" : "descadastro");
			return {
				ok: true,
				data: { blocked: true },
				speech: FALAS.bloqueado,
				erro: null
			};
		}],
		["tool-transfer", async (entrada) => {
			await portas.canal.pedirHumano(conversa, texto(entrada.reason));
			return {
				ok: true,
				data: { queued: true },
				speech: FALAS.humano,
				erro: null
			};
		}]
	]);
}
function ofertasParaAConversa(ofertas, agoraMs) {
	const expira = new Date(agoraMs + VALIDADE_DA_OFERTA_MS).toISOString();
	return ofertas.map((oferta) => ({
		...oferta,
		expires_at: expira
	}));
}
function ofertaNaPosicao(ofertas, posicao) {
	return ofertas.find((oferta) => oferta.position === posicao) ?? null;
}
//#endregion
//#region supabase/functions/whatsapp-inbound/portas-do-supabase.ts
function falhou(resposta) {
	if (resposta.error) throw new Error(resposta.error.message);
	return resposta.data;
}
function linhas(resposta) {
	const dado = falhou(resposta);
	return Array.isArray(dado) ? dado : [];
}
function primeira(resposta) {
	const dado = falhou(resposta);
	if (Array.isArray(dado)) return dado[0] ?? null;
	return dado !== null && typeof dado === "object" ? dado : null;
}
function textoOuNulo(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
const COLUNAS_DA_CONVERSA = "id, account_id, lead_id, phone_e164, status, purpose, slot_offers";
function lerConversaDaLinha(linha) {
	if (linha === null) return null;
	return {
		id: String(linha.id),
		account_id: String(linha.account_id),
		lead_id: textoOuNulo(linha.lead_id),
		phone_e164: String(linha.phone_e164),
		status: linha.status,
		purpose: linha.purpose,
		slot_offers: Array.isArray(linha.slot_offers) ? linha.slot_offers : []
	};
}
function estadoDaLeitura(valor, criadaEm, agoraMs) {
	if (valor === "lida" || valor === "falhou") return valor;
	if (valor !== "pendente") return null;
	const instante = typeof criadaEm === "string" ? Date.parse(criadaEm) : NaN;
	return Number.isFinite(instante) && agoraMs - instante > 12e4 ? "falhou" : "pendente";
}
function contextoDoBriefing(briefing) {
	if (briefing === null || typeof briefing !== "object" || Array.isArray(briefing)) return null;
	const partes = Object.entries(briefing).filter(([, valor]) => typeof valor === "string" && valor.trim() !== "").map(([chave, valor]) => `${chave}: ${String(valor).trim()}`);
	return partes.length === 0 ? null : partes.join("; ").slice(0, 600);
}
function criarPortasDoCanal(ambiente) {
	const { cliente } = ambiente;
	const agora = ambiente.agora ?? Date.now;
	const lerConversa = async (contaId, conversaId) => lerConversaDaLinha(primeira(await cliente.from("whatsapp_conversations").select(COLUNAS_DA_CONVERSA).eq("account_id", contaId).eq("id", conversaId).maybeSingle()));
	const mudarEstado = async (contaId, conversaId, de, para, acao, motivo, autorId = null) => String(falhou(await cliente.rpc("mudar_estado_da_conversa_do_whatsapp", {
		p_account_id: contaId,
		p_conversation_id: conversaId,
		p_de: de,
		p_para: para,
		p_acao: acao,
		p_actor: autorId === null ? "agent" : "user",
		p_actor_id: autorId,
		p_motivo: motivo
	})));
	const registrarItem = async (contaId, chave, severidade, leadId, tipo, contexto) => {
		const resultado = falhou(await cliente.rpc("registrar_item_de_fila", {
			p_account_id: contaId,
			p_kind: tipo,
			p_severity: severidade,
			p_deduplicacao_key: chave,
			p_context: contexto,
			p_threshold_snapshot: null,
			p_lead_id: leadId,
			p_call_id: null
		}));
		if (resultado !== "criado" && resultado !== "ja_aberto") throw new Error(String(resultado));
	};
	const bloquearNumero = async (contaId, telefone, origem, motivo, notas) => {
		return { criado: primeira(await cliente.rpc("bloquear_numero_pela_ferramenta", {
			p_account_id: contaId,
			p_phone_e164: telefone,
			p_source: origem,
			p_reason: motivo,
			p_notes: notas,
			p_blocked_at: new Date(agora()).toISOString()
		}))?.criado === true };
	};
	const credenciais = async (contaId) => {
		const valores = await Promise.all(CHAVES_DA_ZAPI.map((chave) => ambiente.segredo(contaId, PROVEDOR_DO_WHATSAPP, chave)));
		if (valores.some((valor) => !valor)) return null;
		const [instance_id, token, client_token] = valores;
		return {
			instance_id,
			token,
			client_token
		};
	};
	const atendeONumero = async (contaId, telefone) => {
		const [configuracao, numero] = await Promise.all([cliente.from("account_settings").select("whatsapp_mode").eq("account_id", contaId).maybeSingle(), cliente.from("account_test_numbers").select("phone_e164").eq("account_id", contaId).eq("phone_e164", telefone).maybeSingle()]);
		const modo = lerModoDoWhatsapp(primeira(configuracao)?.whatsapp_mode);
		const lista = primeira(numero);
		return modoAtendeONumero(modo, lista === null ? [] : [String(lista.phone_e164)], telefone);
	};
	const portasDasFerramentas = () => ({
		agora,
		qualificacao: {
			leitura: {
				async catalogoDeEtapas(contaId) {
					return linhas(await cliente.from("pipeline_stages").select("key, label, is_won, is_lost, pipelines!inner(is_default)").eq("account_id", contaId).eq("pipelines.is_default", true).order("position")).map((linha) => ({
						key: String(linha.key),
						label: String(linha.label),
						is_won: linha.is_won === true,
						is_lost: linha.is_lost === true
					}));
				},
				async reguaDaConta() {
					return REGUA_DE_EXEMPLO;
				}
			},
			escrita: {
				async gravarLead(gravacao) {
					const atual = primeira(await cliente.from("leads").select("briefing").eq("account_id", gravacao.contaId).eq("id", gravacao.leadId).maybeSingle());
					if (!atual) throw new Error("lead_ausente");
					const briefing = {
						...atual.briefing ?? {},
						...gravacao.briefing
					};
					falhou(await cliente.from("leads").update({
						briefing,
						score: gravacao.score,
						temperature: gravacao.temperatura,
						...gravacao.sentimento === null ? {} : { last_sentiment: gravacao.sentimento }
					}).eq("account_id", gravacao.contaId).eq("id", gravacao.leadId));
				},
				async moverEtapa(leadId, stageKey) {
					const linha = primeira(await cliente.rpc("mover_lead_de_etapa", {
						p_lead_id: leadId,
						p_stage_key: stageKey,
						p_actor: "agent",
						p_actor_id: null
					}));
					const resultado = String(linha?.resultado ?? "sem_resultado");
					if (resultado !== "movido" && resultado !== "mesma_etapa") throw new Error(resultado);
				}
			}
		},
		disponibilidade: {
			leitura: leituraDaDisponibilidade(cliente),
			escrita: { async substituirOfertas(contaId, conversaId, ofertas) {
				falhou(await cliente.from("whatsapp_conversations").update({ slot_offers: ofertasParaAConversa(ofertas, agora()) }).eq("account_id", contaId).eq("id", conversaId));
			} }
		},
		agendamento: {
			leitura: leituraDoAgendamento(cliente, lerConversa),
			escrita: escritaDoAgendamento(cliente)
		},
		canal: {
			async bloquear(contaId, telefone, origem, notas) {
				return bloquearNumero(contaId, telefone, origem, MOTIVO_GRAVADO[origem].replace("durante a ligação", "pelo WhatsApp"), notas);
			},
			async encerrar(contaId, conversaId, motivo) {
				await mudarEstado(contaId, conversaId, ["assistente", "humano"], "encerrada", "encerrada", motivo);
			},
			async pedirHumano(alvo, motivo) {
				await mudarEstado(alvo.account_id, alvo.id, ["assistente"], "humano", "pedido_humano", "pedido_do_lead");
				await registrarItem(alvo.account_id, `whatsapp:humano:${alvo.id}`, "alta", alvo.lead_id, "pedido_humano", {
					canal: "whatsapp",
					conversation_id: alvo.id,
					motivo: "pedido_do_lead",
					recorte: motivo
				});
			}
		}
	});
	return {
		lerConversa,
		async telefoneDoLead(contaId, leadId) {
			return textoOuNulo(primeira(await cliente.from("leads").select("phone_e164").eq("account_id", contaId).eq("id", leadId).is("merged_into_id", null).maybeSingle())?.phone_e164);
		},
		mudarEstado(contaId, conversaId, de, para, acao, autorId) {
			return mudarEstado(contaId, conversaId, de, para, acao, null, autorId);
		},
		async atualizarEntregas(contaId, ids, estado) {
			const anteriores = estado === "lida" ? ["enviada", "entregue"] : estado === "entregue" ? ["enviada"] : [];
			if (anteriores.length === 0) return;
			falhou(await cliente.from("whatsapp_messages").update({ status: estado }).eq("account_id", contaId).in("provider_message_id", [...ids]).in("status", anteriores));
		},
		async mensagemExistente(contaId, idDoProvedor) {
			const linha = primeira(await cliente.from("whatsapp_messages").select("conversation_id").eq("account_id", contaId).eq("provider_message_id", idDoProvedor).maybeSingle());
			return linha ? { conversaId: String(linha.conversation_id) } : null;
		},
		async registrarLead(contaId, lead) {
			const linha = primeira(await cliente.rpc("registrar_lead", {
				p_account_id: contaId,
				p_lead: lead,
				p_ao_duplicar: "ignorar"
			}));
			if (!linha?.lead_id) throw new Error("registrar_lead não devolveu linha");
			return String(linha.lead_id);
		},
		async abrirConversa(contaId, telefone, leadId, iniciadaPor) {
			const linha = primeira(await cliente.rpc("abrir_conversa_do_whatsapp", {
				p_account_id: contaId,
				p_phone_e164: telefone,
				p_lead_id: leadId,
				p_purpose: "discovery",
				p_started_by: iniciadaPor
			}));
			if (!linha?.conversation_id) throw new Error("abrir_conversa_do_whatsapp não devolveu linha");
			return {
				conversaId: String(linha.conversation_id),
				criada: linha.criada === true
			};
		},
		async registrarEntrada(contaId, conversaId, mensagem) {
			const linha = primeira(await cliente.rpc("registrar_mensagem_do_whatsapp", {
				p_account_id: contaId,
				p_conversation_id: conversaId,
				p_direction: "in",
				p_author: "lead",
				p_author_id: null,
				p_body: mensagem.texto,
				p_media_kind: mensagem.midia,
				p_provider_message_id: mensagem.idDoProvedor,
				p_status: "recebida"
			}));
			const mensagemId = String(linha?.message_id ?? "");
			const nova = linha?.nova === true;
			if (nova && mensagem.leitura !== null) falhou(await cliente.from("whatsapp_messages").update({ media_status: mensagem.leitura }).eq("account_id", contaId).eq("id", mensagemId));
			return {
				mensagemId,
				nova
			};
		},
		async lerMidia(contaId, mensagemId, midia, anexo) {
			const semModelo = async () => ({
				ok: false,
				codigo: "sem_credencial",
				status: null,
				modelo: ""
			});
			return await lerMidiaDaMensagem({
				contaId,
				mensagemId,
				midia,
				anexo
			}, {
				buscar: ambiente.buscarMidia ?? (async () => new Response(null, { status: 503 })),
				lerComModelo: ambiente.lerMidiaComModelo ?? semModelo,
				async gravarLeitura(conta, id, estado, texto) {
					falhou(await cliente.from("whatsapp_messages").update({
						media_status: estado,
						media_text: texto
					}).eq("account_id", conta).eq("id", id));
				},
				async registrarEvento(evento) {
					falhou(await cliente.from("integration_events").insert(evento));
				}
			});
		},
		async bloquear(contaId, telefone, notas) {
			return bloquearNumero(contaId, telefone, "lead_request", MOTIVO_DO_DESCADASTRO, notas);
		},
		async encerrarPorDescadastro(contaId, conversaId) {
			return mudarEstado(contaId, conversaId, ["assistente", "humano"], "encerrada", "encerrada", "descadastro");
		},
		async abrirItemDeBloqueio(contaId, conversa, recorte) {
			await registrarItem(contaId, `whatsapp:bloqueio:${conversa.id}`, "baixa", conversa.lead_id, "pedido_bloqueio", {
				canal: "whatsapp",
				conversation_id: conversa.id,
				origem: "lead_request",
				recorte
			});
		},
		async canalLigado(contaId) {
			return primeira(await cliente.from("account_settings").select("whatsapp_enabled").eq("account_id", contaId).maybeSingle())?.whatsapp_enabled === true;
		},
		atendeONumero,
		credenciais,
		enviar(credenciaisDaConta, telefone, texto) {
			return enviarTexto(credenciaisDaConta, telefone, texto, ambiente.buscar);
		},
		async registrarSaida(saida) {
			return textoOuNulo(primeira(await cliente.rpc("registrar_mensagem_do_whatsapp", {
				p_account_id: saida.contaId,
				p_conversation_id: saida.conversaId,
				p_direction: "out",
				p_author: saida.autor,
				p_author_id: saida.autorId,
				p_body: saida.texto,
				p_media_kind: null,
				p_provider_message_id: saida.envio.idDoProvedor ?? null,
				p_status: saida.envio.ok ? "enviada" : "falhou",
				p_error: saida.envio.ok ? null : String(saida.envio.codigo ?? saida.envio.status ?? "falha")
			}))?.message_id);
		},
		async reivindicar(contaId, conversaId) {
			const dado = falhou(await cliente.rpc("reivindicar_resposta_do_whatsapp", {
				p_account_id: contaId,
				p_conversation_id: conversaId
			}));
			const valor = Array.isArray(dado) ? dado[0] : dado;
			return typeof valor === "string" && valor !== "" ? valor : null;
		},
		async soltar(contaId, conversaId, corte) {
			return falhou(await cliente.rpc("soltar_resposta_do_whatsapp", {
				p_account_id: contaId,
				p_conversation_id: conversaId,
				p_corte: corte
			})) === true;
		},
		async numeroBloqueado(contaId, telefone) {
			return primeira(await cliente.from("dnc_entries").select("id").eq("account_id", contaId).eq("phone_e164", telefone).is("removed_at", null).maybeSingle()) !== null;
		},
		async abrirItemNaFila(item) {
			await registrarItem(item.contaId, `whatsapp:${item.motivo}:${item.conversaId}`, item.motivo === "pedido_do_lead" ? "alta" : "media", item.leadId, "pedido_humano", {
				canal: "whatsapp",
				conversation_id: item.conversaId,
				motivo: item.motivo,
				recorte: item.recorte
			});
		},
		async agente(contaId, proposito) {
			const [publicacao, politica, criterios] = await Promise.all([
				cliente.from("agent_publications").select("channel_snapshot").eq("account_id", contaId).eq("purpose", proposito).eq("status", "publicado").maybeSingle(),
				cliente.from("account_settings").select("max_duration_seconds, recording_enabled, recording_notice_text, retention_days").eq("account_id", contaId).maybeSingle(),
				cliente.from("evaluation_criteria").select(COLUNAS_DO_CRITERIO).eq("account_id", contaId).order("position")
			]);
			const publicada = lerRetrato(primeira(publicacao)?.channel_snapshot);
			const linhaDaPolitica = primeira(politica);
			if (publicada === null || linhaDaPolitica === null) return null;
			return {
				identidade: {
					...publicada.identidade,
					jeito: publicada.jeitoDoWhatsapp
				},
				playbook: publicada.playbook,
				aberturaDoWhatsapp: publicada.aberturaDoWhatsapp,
				politica: {
					duracaoMaximaSegundos: Number(linhaDaPolitica.max_duration_seconds),
					gravacaoLigada: linhaDaPolitica.recording_enabled !== false,
					avisoDeGravacao: textoOuNulo(linhaDaPolitica.recording_notice_text),
					retencaoDias: Number(linhaDaPolitica.retention_days)
				},
				criterios: linhas(criterios).map((linha) => lerLinhaDeCriterio(linha))
			};
		},
		async lead(contaId, leadId) {
			const linha = primeira(await cliente.from("leads").select("name, company, city, timezone, briefing").eq("account_id", contaId).eq("id", leadId).maybeSingle());
			if (linha === null) return null;
			return {
				nome: textoOuNulo(linha.name),
				empresa: textoOuNulo(linha.company),
				cidade: textoOuNulo(linha.city),
				contexto: contextoDoBriefing(linha.briefing),
				fuso: textoOuNulo(linha.timezone)
			};
		},
		async fusoDaConta(contaId) {
			return textoOuNulo(primeira(await cliente.from("accounts").select("timezone").eq("id", contaId).maybeSingle())?.timezone) ?? "America/Sao_Paulo";
		},
		async historico(contaId, conversaId, limite) {
			return linhas(await cliente.from("whatsapp_messages").select("direction, author, body, media_kind, media_text, media_status, created_at").eq("account_id", contaId).eq("conversation_id", conversaId).order("created_at", { ascending: false }).limit(limite)).reverse().map((linha) => ({
				direcao: linha.direction === "in" ? "in" : "out",
				autor: linha.author,
				texto: String(linha.body ?? ""),
				midia: textoOuNulo(linha.media_kind),
				leitura: textoOuNulo(linha.media_text),
				estadoDaLeitura: estadoDaLeitura(linha.media_status, linha.created_at, agora())
			}));
		},
		async motor(conversa) {
			return {
				ferramentas: ferramentasDaConversa(conversa, portasDasFerramentas()),
				rodada: (pedido) => ambiente.rodada(conversa.account_id, pedido)
			};
		}
	};
}
function criarPortaDoPreContato(ambiente) {
	const { cliente } = ambiente;
	const canal = criarPortasDoCanal(ambiente);
	return {
		async configuracao(contaId) {
			const linha = primeira(await cliente.from("account_settings").select("whatsapp_pre_contact, whatsapp_pre_contact_text").eq("account_id", contaId).maybeSingle());
			return {
				ligado: linha?.whatsapp_pre_contact === true,
				texto: textoOuNulo(linha?.whatsapp_pre_contact_text)
			};
		},
		async identidade(contaId) {
			const publicacoes = linhas(await cliente.from("agent_publications").select("channel_snapshot").eq("account_id", contaId).eq("status", "publicado").order("published_at", { ascending: false }).limit(4));
			for (const linha of publicacoes) {
				const publicada = lerRetrato(linha.channel_snapshot);
				if (publicada !== null) return {
					nome: publicada.identidade.nome,
					empresa: publicada.identidade.empresa,
					abertura: publicada.aberturaDoWhatsapp
				};
			}
			return null;
		},
		async lead(contaId, leadId) {
			const linha = primeira(await cliente.from("leads").select("name, phone_e164, company, city").eq("account_id", contaId).eq("id", leadId).maybeSingle());
			const telefone = textoOuNulo(linha?.phone_e164);
			return telefone === null ? null : {
				nome: textoOuNulo(linha?.name),
				telefone,
				empresa: textoOuNulo(linha?.company),
				cidade: textoOuNulo(linha?.city)
			};
		},
		numeroBloqueado: canal.numeroBloqueado,
		atendeONumero: canal.atendeONumero,
		credenciais: canal.credenciais,
		async mensagemNossaDesde(contaId, telefone, desde) {
			const conversas = linhas(await cliente.from("whatsapp_conversations").select("id").eq("account_id", contaId).eq("phone_e164", telefone)).map((linha) => String(linha.id));
			if (conversas.length === 0) return false;
			return linhas(await cliente.from("whatsapp_messages").select("id").eq("account_id", contaId).in("conversation_id", conversas).eq("direction", "out").gt("created_at", desde).limit(1)).length > 0;
		},
		abrirConversa: (contaId, telefone, leadId, iniciadaPor) => canal.abrirConversa(contaId, telefone, leadId, iniciadaPor),
		enviar: canal.enviar,
		registrarSaida: canal.registrarSaida,
		async narrar(_contaId, leadId, conversaId) {
			falhou(await cliente.rpc("registrar_evento_de_lead", {
				p_lead_id: leadId,
				p_kind: "whatsapp",
				p_actor: "agent",
				p_actor_id: null,
				p_summary: null,
				p_payload: {
					acao: "pre_contato",
					conversation_id: conversaId
				}
			}));
		}
	};
}
function leituraDaDisponibilidade(cliente) {
	return {
		async configuracaoDaConta(contaId) {
			const [configuracao, conta] = await Promise.all([cliente.from("account_settings").select("routing_mode, fixed_specialist_id").eq("account_id", contaId).maybeSingle(), cliente.from("accounts").select("timezone").eq("id", contaId).maybeSingle()]);
			const linhaDaConfiguracao = primeira(configuracao);
			const linhaDaConta = primeira(conta);
			if (!linhaDaConfiguracao || !linhaDaConta) throw new Error("conta sem configuração");
			return {
				modo: String(linhaDaConfiguracao.routing_mode),
				especialistaFixo: textoOuNulo(linhaDaConfiguracao.fixed_specialist_id),
				fusoDaConta: String(linhaDaConta.timezone)
			};
		},
		async fusoDoLead(contaId, leadId) {
			return textoOuNulo(primeira(await cliente.from("leads").select("timezone").eq("account_id", contaId).eq("id", leadId).maybeSingle())?.timezone);
		},
		async especialistasDaConta(contaId) {
			const [especialistas, faixas] = await Promise.all([cliente.from("specialists").select("id, area, active, timezone, default_duration_min, daily_cap, min_notice_min, max_notice_days, last_assigned_at").eq("account_id", contaId), cliente.from("specialist_availability").select("specialist_id, weekday, start_time, end_time").eq("account_id", contaId)]);
			const faixasDe = new Map();
			for (const faixa of linhas(faixas)) {
				const id = String(faixa.specialist_id);
				faixasDe.set(id, [...faixasDe.get(id) ?? [], faixa]);
			}
			return linhas(especialistas).map((linha) => ({
				id: String(linha.id),
				area: textoOuNulo(linha.area),
				ativo: linha.active === true,
				fuso: String(linha.timezone),
				duracaoPadraoMin: Number(linha.default_duration_min),
				tetoDiario: Number(linha.daily_cap),
				antecedenciaMinimaMin: Number(linha.min_notice_min),
				antecedenciaMaximaDias: Number(linha.max_notice_days),
				ultimaAtribuicaoEm: textoOuNulo(linha.last_assigned_at),
				disponibilidade: (faixasDe.get(String(linha.id)) ?? []).map((faixa) => ({
					diaDaSemana: Number(faixa.weekday),
					inicio: String(faixa.start_time),
					fim: String(faixa.end_time)
				}))
			}));
		},
		async agendaNoPeriodo(contaId, especialistaIds, periodo) {
			const noPeriodo = (tabela, colunas) => cliente.from(tabela).select(colunas).eq("account_id", contaId).in("specialist_id", [...especialistaIds]).lt("starts_at", periodo.ate).gt("ends_at", periodo.de);
			const [bloqueios, ocupacao, reunioes] = await Promise.all([
				noPeriodo("specialist_blocks", "specialist_id, starts_at, ends_at"),
				noPeriodo("specialist_busy_blocks", "specialist_id, starts_at, ends_at"),
				noPeriodo("meetings", "specialist_id, starts_at, ends_at, status")
			]);
			const intervalo = (linha) => ({
				inicio: String(linha.starts_at),
				fim: String(linha.ends_at)
			});
			const de = (resposta, id) => linhas(resposta).filter((linha) => linha.specialist_id === id);
			return especialistaIds.map((id) => ({
				especialistaId: id,
				bloqueios: de(bloqueios, id).map(intervalo),
				ocupacaoExterna: de(ocupacao, id).map(intervalo),
				reunioes: de(reunioes, id).map((linha) => ({
					...intervalo(linha),
					status: String(linha.status)
				}))
			}));
		}
	};
}
function leituraDoAgendamento(cliente, lerConversa) {
	return {
		async ofertaDaChamada(contaId, conversaId, posicao) {
			const conversa = await lerConversa(contaId, conversaId);
			const oferta = conversa === null ? null : ofertaNaPosicao(conversa.slot_offers, posicao);
			if (oferta === null) return null;
			const especialista = primeira(await cliente.from("specialists").select("timezone").eq("account_id", contaId).eq("id", oferta.specialist_id).maybeSingle());
			return {
				...oferta,
				fusoDoEspecialista: textoOuNulo(especialista?.timezone) ?? "America/Sao_Paulo"
			};
		},
		async fusoDoLead(contaId, leadId) {
			const [lead, conta] = await Promise.all([cliente.from("leads").select("timezone").eq("account_id", contaId).eq("id", leadId).maybeSingle(), cliente.from("accounts").select("timezone").eq("id", contaId).maybeSingle()]);
			return textoOuNulo(primeira(lead)?.timezone) ?? textoOuNulo(primeira(conta)?.timezone) ?? "America/Sao_Paulo";
		},
		async calendarioDoEspecialista() {
			return null;
		}
	};
}
function escritaDoAgendamento(cliente) {
	return {
		async agendarReuniao(pedido) {
			const linha = primeira(await cliente.rpc("agendar_reuniao", pedido));
			if (!linha) throw new Error("agendar_reuniao não devolveu linha");
			return {
				resultado: String(linha.resultado),
				reuniao_id: textoOuNulo(linha.reuniao_id)
			};
		},
		async consumirOfertas(contaId, conversaId) {
			falhou(await cliente.from("whatsapp_conversations").update({ slot_offers: [] }).eq("account_id", contaId).eq("id", conversaId));
		},
		async preencherEmailDoLead(contaId, leadId, email) {
			falhou(await cliente.from("leads").update({ email }).eq("account_id", contaId).eq("id", leadId).is("email", null));
		},
		async reuniaoParaEvento() {
			return null;
		},
		async calendarioParaEvento() {
			return null;
		},
		async reuniaoParaConvite() {
			return null;
		},
		async emailParaConvite() {
			return {
				ok: false,
				motivo: "nao_configurado",
				mensagem: ""
			};
		}
	};
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
function lerChave(texto) {
	if (texto.length === 0) return recusa("vazia");
	const partes = texto.split(SEPARADOR);
	const fonte = partes[0];
	if (fonte === void 0 || !ehFonte(fonte)) return recusa("fonte_desconhecida");
	switch (fonte) {
		case "manual": {
			const id = simples(partes);
			return id === void 0 ? recusa("formato_invalido") : UUID.test(id) ? {
				ok: true,
				pedido: {
					fonte: "manual",
					uuidDoCliente: id
				}
			} : recusa("uuid_invalido");
		}
		case "stl": {
			const id = simples(partes);
			return id === void 0 ? recusa("formato_invalido") : UUID.test(id) ? {
				ok: true,
				pedido: {
					fonte: "stl",
					leadId: id
				}
			} : recusa("uuid_invalido");
		}
		case "rem": {
			const id = simples(partes);
			return id === void 0 ? recusa("formato_invalido") : UUID.test(id) ? {
				ok: true,
				pedido: {
					fonte: "rem",
					meetingId: id
				}
			} : recusa("uuid_invalido");
		}
		case "rescue": {
			const composta = composto(partes);
			if (!composta.ok) return composta;
			return {
				ok: true,
				pedido: {
					fonte: "rescue",
					meetingId: composta.id,
					ordinal: composta.n
				}
			};
		}
		case "cad": {
			const composta = composto(partes);
			if (!composta.ok) return composta;
			return {
				ok: true,
				pedido: {
					fonte: "cad",
					enrollmentId: composta.id,
					passo: composta.n
				}
			};
		}
		case "camp": {
			const composta = composto(partes);
			if (!composta.ok) return composta;
			return {
				ok: true,
				pedido: {
					fonte: "camp",
					targetId: composta.id,
					tentativa: composta.n
				}
			};
		}
	}
}
function ehFonte(valor) {
	return FONTES_DE_DISCAGEM.includes(valor);
}
function recusa(motivo) {
	return {
		ok: false,
		motivo
	};
}
function simples(partes) {
	return partes.length === 2 ? partes[1] : void 0;
}
function composto(partes) {
	if (partes.length !== 3) return {
		ok: false,
		motivo: "formato_invalido"
	};
	const id = partes[1];
	const n = partes[2];
	if (id === void 0 || !UUID.test(id)) return {
		ok: false,
		motivo: "uuid_invalido"
	};
	if (n === void 0 || !/^[1-9][0-9]*$/.test(n)) return {
		ok: false,
		motivo: "ordinal_invalido"
	};
	return {
		ok: true,
		id,
		n: Number(n)
	};
}
//#endregion
//#region supabase/functions/_shared/discagem/pausa.ts
function consumoDaFila(conta) {
	if (!conta || !("dialing_paused_at" in conta) || conta.dialing_paused_at === void 0) return {
		consumir: false,
		motivo: "estado_desconhecido",
		item: "queued"
	};
	if (conta.dialing_paused_at !== null) return {
		consumir: false,
		motivo: "conta_parada",
		item: "queued"
	};
	return { consumir: true };
}
const TAMANHO_DO_ERRO$1 = 1e3;
function avaliarVolume(itens, historico) {
	if (historico.length === 0) return {
		alarme: false,
		media: null
	};
	const media = historico.reduce((soma, valor) => soma + valor, 0) / historico.length;
	return {
		alarme: media > 0 && itens > 3 * media,
		media
	};
}
async function executarRotina(pedido) {
	const { nome, porta, trabalho } = pedido;
	const agora = pedido.agora ?? Date.now;
	const teto = pedido.teto ?? 25;
	if (!Number.isInteger(teto) || teto < 1 || teto > 25) throw new RangeError(`teto de ${teto} itens fora da faixa de 1 a 25 (${nome})`);
	const instante = () => new Date(agora()).toISOString();
	const iniciadaEm = instante();
	const execucaoId = await porta.inserirExecucao({
		routine: nome,
		started_at: iniciadaEm,
		account_id: null
	});
	let itens = 0;
	let volume;
	try {
		const reivindicados = await trabalho.reivindicar(teto, iniciadaEm);
		if (reivindicados.length > teto) throw new Error(`a reivindicação devolveu ${reivindicados.length} itens com teto de ${teto}; nenhum foi processado`);
		const vistas = new Set();
		for (const item of reivindicados) {
			if (vistas.has(item.chave)) continue;
			vistas.add(item.chave);
			await trabalho.processar(item, iniciadaEm);
			itens += 1;
		}
		const historico = await porta.itensDasUltimasExecucoes(nome, 10, iniciadaEm);
		volume = avaliarVolume(itens, historico);
	} catch (erro) {
		const mensagem = mensagemDe$1(erro);
		await porta.concluirExecucao(execucaoId, {
			finished_at: instante(),
			items: itens,
			error: mensagem,
			volume_alert: false,
			volume_baseline: null
		});
		return {
			ok: false,
			execucaoId,
			itens,
			erro: mensagem
		};
	}
	await porta.concluirExecucao(execucaoId, {
		finished_at: instante(),
		items: itens,
		error: null,
		volume_alert: volume.alarme,
		volume_baseline: volume.media
	});
	return {
		ok: true,
		execucaoId,
		itens,
		alarme: volume.alarme,
		media: volume.media
	};
}
function mensagemDe$1(erro) {
	const texto = erro instanceof Error ? erro.message : String(erro);
	return (texto.trim() === "" ? "erro sem mensagem" : texto).slice(0, TAMANHO_DO_ERRO$1);
}
//#endregion
//#region supabase/functions/cron-dial/despacho.ts
const NOME_DA_ROTINA = "cron-dial";
const TAMANHO_DO_ERRO = 500;
const RECUSAS_DA_GUARDA = new Set([
	"freio_puxado",
	"portao_de_lead_real",
	"numero_bloqueado",
	"fora_da_janela",
	"intervalo_minimo",
	"teto_por_numero",
	"teto_da_conta",
	"teto_de_gasto",
	"sem_linha_disponivel"
]);
const RECUSAS_DEFINITIVAS = new Set([
	"conta_ausente",
	"proposito_invalido",
	"fonte_invalida",
	"referencia_invalida",
	"destino_ausente",
	"pulo_invalido",
	"fonte_de_gente",
	"conta_desconhecida",
	"lead_desconhecido",
	"telefone_invalido"
]);
function vagasDaConta(conta) {
	if (!consumoDaFila(conta).consumir) return 0;
	return Math.max(0, conta.max_concurrent - conta.ativas);
}
function recuoEmMinutos(falhas) {
	return Math.min(60, 2 ** Math.max(0, falhas - 1));
}
function pedidoDoItem(item) {
	const leitura = lerChave(`${item.source}:${item.source_ref}`);
	if (!leitura.ok) return null;
	const chave = leitura.pedido;
	let referencia;
	let ordinal = null;
	switch (chave.fonte) {
		case "manual":
			referencia = chave.uuidDoCliente;
			break;
		case "stl":
			referencia = chave.leadId;
			break;
		case "rem":
			referencia = chave.meetingId;
			break;
		case "rescue":
			referencia = chave.meetingId;
			ordinal = chave.ordinal;
			break;
		case "cad":
			referencia = chave.enrollmentId;
			ordinal = chave.passo;
			break;
		case "camp":
			referencia = chave.targetId;
			ordinal = chave.tentativa;
	}
	return {
		contaId: item.account_id,
		proposito: item.purpose,
		fonte: chave.fonte,
		referencia,
		ordinal,
		tentativa: item.attempt,
		leadId: item.lead_id,
		motivo: `fila de discagem, item ${item.id}`
	};
}
function desfechoDaResposta(resposta, erro) {
	if (!resposta) return {
		tipo: "transitoria",
		motivo: mensagemDe(erro ?? "call-place não respondeu")
	};
	const corpo = typeof resposta.corpo === "object" && resposta.corpo !== null ? resposta.corpo : {};
	const chamadaId = typeof corpo.chamadaId === "string" && corpo.chamadaId !== "" ? corpo.chamadaId : null;
	const motivo = typeof corpo.motivo === "string" && corpo.motivo !== "" ? corpo.motivo : null;
	if (corpo.ok === true) {
		if (chamadaId) return {
			tipo: "discada",
			chamadaId,
			erro: null
		};
		return {
			tipo: "transitoria",
			motivo: "call-place aceitou sem devolver a chamada"
		};
	}
	if (chamadaId) return {
		tipo: "discada",
		chamadaId,
		erro: motivo ?? `status ${resposta.status}`
	};
	if (motivo && RECUSAS_DA_GUARDA.has(motivo)) return {
		tipo: "recusada",
		motivo
	};
	if (motivo && RECUSAS_DEFINITIVAS.has(motivo)) return {
		tipo: "definitiva",
		motivo
	};
	return {
		tipo: "transitoria",
		motivo: motivo ?? `status ${resposta.status}`
	};
}
function despacharFila(pedido) {
	const { porta } = pedido;
	const agora = pedido.agora ?? Date.now;
	return executarRotina({
		nome: NOME_DA_ROTINA,
		porta: pedido.execucao,
		agora,
		trabalho: {
			async reivindicar(limite, instante) {
				const contas = await porta.situacaoDaFila(instante);
				const tomados = [];
				for (const conta of contas) {
					const restante = limite - tomados.length;
					if (restante <= 0) break;
					const vagas = vagasDaConta(conta);
					if (vagas === 0) continue;
					const itens = await porta.reivindicarDaConta(conta.account_id, Math.min(vagas, restante), instante);
					for (const linha of itens) tomados.push({
						chave: linha.id,
						linha
					});
				}
				return tomados;
			},
			async processar({ linha }, instante) {
				const pedidoAoCallPlace = pedidoDoItem(linha);
				let desfecho;
				if (!pedidoAoCallPlace) desfecho = {
					tipo: "definitiva",
					motivo: "referencia_invalida"
				};
				else try {
					desfecho = desfechoDaResposta(await porta.discar(pedidoAoCallPlace));
				} catch (erro) {
					desfecho = desfechoDaResposta(null, erro);
				}
				await registrarDesfecho(porta, linha, desfecho, instante);
				if (desfecho.tipo === "discada" && desfecho.erro === null && porta.preContato) try {
					await porta.preContato(linha);
				} catch {}
			}
		}
	});
}
async function registrarDesfecho(porta, linha, desfecho, instante) {
	switch (desfecho.tipo) {
		case "discada":
			await porta.concluirItem(linha.id, {
				call_id: desfecho.chamadaId,
				last_error: desfecho.erro === null ? null : cortar(`provedor: ${desfecho.erro}`)
			});
			return;
		case "recusada":
			await porta.concluirItem(linha.id, {
				call_id: null,
				last_error: cortar(`recusa da guarda: ${desfecho.motivo}`)
			});
			return;
		case "definitiva":
			await porta.falharItem(linha.id, {
				last_error: cortar(`recusa definitiva: ${desfecho.motivo}`),
				failures: linha.failures
			});
			return;
		case "transitoria": {
			const falhas = linha.failures + 1;
			const erro = cortar(`falha ${falhas} de 6: ${desfecho.motivo}`);
			if (falhas >= 6) {
				await porta.falharItem(linha.id, {
					last_error: erro,
					failures: falhas
				});
				return;
			}
			const runAt = new Date(Date.parse(instante) + recuoEmMinutos(falhas) * 6e4).toISOString();
			await porta.reprogramarItem(linha.id, {
				run_at: runAt,
				last_error: erro,
				failures: falhas
			});
			return;
		}
	}
}
async function atenderRotina(pedido, despacho, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return {
		status: 405,
		corpo: { ok: false }
	};
	if (!await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno)) return {
		status: 401,
		corpo: { ok: false }
	};
	const resultado = await despacharFila(despacho);
	return {
		status: resultado.ok ? 200 : 500,
		corpo: { ...resultado }
	};
}
function mensagemDe(erro) {
	const texto = erro instanceof Error ? erro.message : String(erro);
	return texto.trim() === "" ? "erro sem mensagem" : texto;
}
function cortar(texto) {
	return texto.slice(0, TAMANHO_DO_ERRO);
}
//#endregion
//#region supabase/functions/cron-dial/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
const LIMITE_DE_CALL_PLACE_MS = 15e3;
const COLUNAS_DO_ITEM = "id, account_id, lead_id, purpose, source, source_ref, attempt, failures";
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const execucao = {
	async inserirExecucao(linha) {
		const { data, error } = await servico.from("job_runs").insert(linha).select("id").single();
		if (error) throw new Error(error.message);
		return data.id;
	},
	async concluirExecucao(id, linha) {
		const { error } = await servico.from("job_runs").update(linha).eq("id", id);
		if (error) throw new Error(error.message);
	},
	async itensDasUltimasExecucoes(rotina, quantas, antesDe) {
		const { data, error } = await servico.from("job_runs").select("items").eq("routine", rotina).is("account_id", null).is("error", null).not("finished_at", "is", null).lt("started_at", antesDe).order("started_at", { ascending: false }).limit(quantas);
		if (error) throw new Error(error.message);
		return (data ?? []).map((linha) => linha.items ?? 0);
	}
};
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
	ambiente: lerAmbiente(Deno.env.get("SARAH_AMBIENTE"))
});
const preContato = criarPortaDoPreContato({
	cliente: servico,
	async segredo(contaId, provedor, chave) {
		const resolucao = await cofre.resolveSecret(contaId, provedor, chave);
		return resolucao.ok ? resolucao.valor : null;
	},
	buscar: (url, init) => fetch(url, {
		...init,
		signal: AbortSignal.timeout(LIMITE_DO_ENVIO_MS)
	}),
	rodada: async () => ({
		ok: false,
		codigo: "sem_credencial"
	})
});
const porta = {
	async preContato(item) {
		const desfecho = await enviarPreContato({
			contaId: item.account_id,
			leadId: item.lead_id
		}, preContato);
		if (desfecho === "envio_falhou" || desfecho === "texto_invalido") console.error("[cron-dial] pre_contato", {
			item: item.id,
			desfecho
		});
	},
	async situacaoDaFila(instante) {
		const { data, error } = await servico.rpc("situacao_da_fila", { p_instante: instante });
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async reivindicarDaConta(contaId, limite, instante) {
		const { data, error } = await servico.rpc("reivindicar_da_fila", {
			p_account_id: contaId,
			p_limite: limite,
			p_instante: instante
		}).select(COLUNAS_DO_ITEM);
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async discar(pedido) {
		const resposta = await fetch(`${URL_DO_SUPABASE}/functions/v1/call-place`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				authorization: `Bearer ${CHAVE_DE_SERVICO}`,
				[CABECALHO_DA_ROTINA]: await segredoInterno()
			},
			body: JSON.stringify(pedido),
			signal: AbortSignal.timeout(LIMITE_DE_CALL_PLACE_MS)
		});
		let corpo = null;
		try {
			corpo = await resposta.json();
		} catch {}
		return {
			status: resposta.status,
			corpo
		};
	},
	async concluirItem(id, fim) {
		const { error } = await servico.from("dial_queue").update({
			status: "done",
			...fim
		}).eq("id", id).eq("status", "claimed");
		if (error) throw new Error(error.message);
	},
	async falharItem(id, fim) {
		const { error } = await servico.from("dial_queue").update({
			status: "failed",
			...fim
		}).eq("id", id).eq("status", "claimed");
		if (error) throw new Error(error.message);
	},
	async reprogramarItem(id, fim) {
		const { error } = await servico.from("dial_queue").update({
			status: "queued",
			claimed_at: null,
			...fim
		}).eq("id", id).eq("status", "claimed");
		if (error) throw new Error(error.message);
	}
};
Deno.serve(async (requisicao) => {
	const resposta = await atenderRotina({
		metodo: requisicao.method,
		segredo: requisicao.headers.get(CABECALHO_DA_ROTINA)
	}, {
		porta,
		execucao
	}, { segredoInterno: await segredoInterno() });
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: { "content-type": "application/json; charset=utf-8" }
	});
});
//#endregion
