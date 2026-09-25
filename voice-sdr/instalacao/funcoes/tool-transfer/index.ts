// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/tool-transfer/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/_shared/segredo-da-instalacao.ts
const ROTULO_DA_CHAVE_DE_FERRAMENTAS = "sarah/tool-server-key/v1";
async function segredoDaInstalacao(pedido) {
	const definido = pedido.definido?.trim() ?? "";
	if (definido !== "") return definido;
	const base = pedido.chaveDeServico?.trim() ?? "";
	const rotulo = pedido.rotulo.trim();
	if (base === "" || rotulo === "") return "";
	const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(base), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	const assinatura = await crypto.subtle.sign("HMAC", material, new TextEncoder().encode(rotulo));
	return [...new Uint8Array(assinatura)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
const FERRAMENTA_DE_AGENDA = "tool-availability";
FALAS_DE_TODO_PROPOSITO.avisoDeGravacao, [...FALAS_DE_TODO_PROPOSITO.recusaDeAfirmar], [...FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe], [...FALAS_DAS_REGRAS_TRAVADAS.pedidoDeHumano], [...FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada];
[...FALAS_DA_QUALIFICACAO.antesDeEncerrar];
[...FALAS_DE_DESCOBERTA.fechamento.sem_agenda], [...FALAS_DE_DESCOBERTA.fechamento.com_agenda];
//#endregion
//#region supabase/functions/_shared/agente/compilador.ts
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
//#region supabase/functions/_shared/speech/ferramentas.ts
const FALAS_DAS_FERRAMENTAS = {
	falha: "Deixa eu confirmar isso com o time e já te retorno.",
	propositoErrado: "Isso eu não consigo resolver por aqui agora, mas deixo anotado pro time.",
	campoFaltando: "Só um instante, me conta de novo pra eu anotar certinho?"
};
//#endregion
//#region supabase/functions/_shared/provedor/assinatura-de-webhook.ts
const JANELA_DE_ROTACAO_EM_SEGUNDOS = 86400;
//#endregion
//#region supabase/functions/_shared/segredo-de-ferramenta.ts
async function derivarSegredoDeFerramenta(chaveDoServidor, contaId) {
	const chave = chaveDoServidor.trim();
	const conta = contaId.trim();
	if (chave === "") throw new Error("chave do servidor ausente");
	if (conta === "") throw new Error("conta ausente");
	const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	const assinatura = await crypto.subtle.sign("HMAC", material, new TextEncoder().encode(conta));
	return [...new Uint8Array(assinatura)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
//#endregion
//#region supabase/functions/_shared/tools/segredo.ts
const JANELA_DE_ROTACAO_EM_MS = JANELA_DE_ROTACAO_EM_SEGUNDOS * 1e3;
const TAMANHO_EM_HEXADECIMAL = 64;
const SO_HEXADECIMAL = /^[0-9a-f]+$/;
function derivarSegredo(chaveDoServidor, accountId) {
	return derivarSegredoDeFerramenta(chaveDoServidor, accountId);
}
async function conferirSegredo(pedido) {
	const apresentado = (pedido.cabecalho ?? "").trim();
	if (apresentado === "") return {
		ok: false,
		motivo: "cabecalho_ausente"
	};
	if (!SO_HEXADECIMAL.test(apresentado)) return {
		ok: false,
		motivo: "segredo_malformado"
	};
	if (apresentado.length !== TAMANHO_EM_HEXADECIMAL) return {
		ok: false,
		motivo: "tamanho_diferente"
	};
	const recebidos = bytesDoHexadecimal(apresentado);
	const vigente = pedido.chaves.vigente.trim();
	const anterior = anteriorDentroDaJanela(pedido.chaves, vigente, (pedido.agora ?? Date.now)());
	let achada = null;
	for (const contaId of pedido.contas) {
		const casouVigente = bytesIguais(recebidos, bytesDoHexadecimal(await derivarSegredo(vigente, contaId)));
		const casouAnterior = anterior !== null && bytesIguais(recebidos, bytesDoHexadecimal(await derivarSegredo(anterior, contaId)));
		if (achada === null && (casouVigente || casouAnterior)) achada = {
			contaId,
			chave: casouVigente ? "vigente" : "anterior"
		};
	}
	return achada === null ? {
		ok: false,
		motivo: "sem_conta"
	} : {
		ok: true,
		...achada
	};
}
function anteriorDentroDaJanela(chaves, vigente, agora) {
	const anterior = chaves.anterior?.trim() ?? "";
	if (anterior === "" || anterior === vigente) return null;
	const rotacionadaEm = chaves.rotacionadaEm;
	if (typeof rotacionadaEm !== "number" || !Number.isFinite(rotacionadaEm)) return null;
	const desdeARotacao = agora - rotacionadaEm;
	if (desdeARotacao < 0 || desdeARotacao > JANELA_DE_ROTACAO_EM_MS) return null;
	return anterior;
}
function bytesDoHexadecimal(hexadecimal) {
	const bytes = new Uint8Array(hexadecimal.length / 2);
	for (let posicao = 0; posicao < bytes.length; posicao += 1) bytes[posicao] = Number.parseInt(hexadecimal.slice(posicao * 2, posicao * 2 + 2), 16);
	return bytes;
}
function bytesIguais(a, b) {
	if (a.length !== b.length) return false;
	let diferenca = 0;
	for (let posicao = 0; posicao < a.length; posicao += 1) diferenca |= a[posicao] ^ b[posicao];
	return diferenca === 0;
}
//#endregion
//#region supabase/functions/_shared/tools/esqueleto.ts
const CABECALHO_DA_CONVERSA = "x-conversation-id";
const ORCAMENTO_PADRAO_MS = 4e3;
const DIRECAO_DE_ENSAIO = "rehearsal";
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
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ESTOUROU = Symbol("estourou");
function esperarPadrao(ms) {
	return new Promise((resolver) => setTimeout(resolver, ms));
}
function logPadrao(evento, detalhe) {
	console.error(`[ferramenta] ${evento}`, detalhe);
}
function resposta(status, ok, data, speech) {
	return {
		status,
		corpo: {
			ok,
			data,
			speech
		}
	};
}
const FALHA = () => resposta(200, false, null, FALAS_DAS_FERRAMENTAS.falha);
function comoObjeto(corpo) {
	return typeof corpo === "object" && corpo !== null && !Array.isArray(corpo) ? corpo : {};
}
function preenchido(valor) {
	if (valor === void 0 || valor === null) return false;
	return typeof valor !== "string" || valor.trim() !== "";
}
function falaComIdentificador(fala, chamada) {
	if (UUID.test(fala)) return true;
	return [
		chamada.id,
		chamada.account_id,
		chamada.lead_id
	].filter((id) => typeof id === "string" && id !== "").some((id) => fala.includes(id));
}
function mensagemDe(erro) {
	const texto = erro instanceof Error ? erro.message : String(erro);
	return texto.trim() === "" ? "sem mensagem" : texto.trim();
}
function criarFerramenta(definicao) {
	const doCatalogo = CATALOGO_DE_FERRAMENTAS.find((item) => item.nome === definicao.nome);
	if (doCatalogo === void 0) throw new Error(`Ferramenta fora do catálogo: ${definicao.nome}`);
	const esperados = [...doCatalogo.propositos].sort();
	const declarados = [...new Set(definicao.propositos)].sort();
	if (esperados.join(",") !== declarados.join(",")) throw new Error(`Os propósitos de ${definicao.nome} divergem do catálogo: ${declarados.join(", ")} contra ${esperados.join(", ")}`);
	const propositos = new Set(declarados);
	const obrigatorios = definicao.obrigatorios ?? [];
	return async function tratar(pedido, ambiente) {
		const agora = ambiente.agora ?? Date.now;
		const esperar = ambiente.esperar ?? esperarPadrao;
		const orcamento = ambiente.orcamentoMs ?? ORCAMENTO_PADRAO_MS;
		const log = ambiente.log ?? logPadrao;
		const inicio = agora();
		if (pedido.metodo !== "POST") return resposta(405, false, null, FALAS_DAS_FERRAMENTAS.falha);
		const conferencia = await conferirSegredo({
			cabecalho: pedido.segredo,
			chaves: ambiente.chaves,
			contas: await ambiente.porta.contasCandidatas(),
			agora
		});
		if (!conferencia.ok) {
			log("segredo_recusado", {
				ferramenta: definicao.nome,
				motivo: conferencia.motivo
			});
			return resposta(401, false, null, FALAS_DAS_FERRAMENTAS.falha);
		}
		const contaId = conferencia.contaId;
		if (conferencia.chave === "anterior") log("segredo_da_chave_anterior", {
			ferramenta: definicao.nome,
			contaId
		});
		const conversa = (pedido.conversa ?? "").trim();
		const chamada = conversa === "" ? null : await ambiente.porta.chamadaDaConversa(contaId, conversa);
		if (chamada === null || chamada.account_id !== contaId) {
			log("conversa_nao_encontrada", { ferramenta: definicao.nome });
			return resposta(404, false, null, FALAS_DAS_FERRAMENTAS.falha);
		}
		const entrada = comoObjeto(pedido.corpo);
		const registrar = async (saida, erro) => {
			try {
				await ambiente.porta.registrarInvocacao({
					account_id: contaId,
					call_id: chamada.id,
					tool: definicao.nome,
					request: entrada,
					response: { ...saida.corpo },
					latency_ms: Math.max(0, Math.round(agora() - inicio)),
					error: erro,
					at: new Date(inicio).toISOString()
				});
			} catch (falha) {
				log("registro_falhou", {
					ferramenta: definicao.nome,
					chamadaId: chamada.id,
					erro: mensagemDe(falha)
				});
			}
			return saida;
		};
		if (!propositos.has(chamada.purpose)) return registrar(resposta(409, false, null, FALAS_DAS_FERRAMENTAS.propositoErrado), `proposito_errado: ${chamada.purpose}`);
		const faltando = obrigatorios.find((campo) => !preenchido(entrada[campo.chave]));
		if (faltando !== void 0) return registrar(resposta(400, false, {
			campo: faltando.nome,
			chave: faltando.chave
		}, FALAS_DAS_FERRAMENTAS.campoFaltando), `campo_faltando: ${faltando.chave}`);
		const ensaio = chamada.direction === DIRECAO_DE_ENSAIO;
		const base = {
			contaId,
			chamada,
			entrada,
			agora,
			ensaio
		};
		const executar = async () => {
			let leitura;
			try {
				leitura = await definicao.executar.ler({
					...base,
					escrita: escritaQueLevanta()
				});
			} catch (falha) {
				return falha instanceof EscritaNaLeitura ? { erro: `escrita_na_leitura: ${mensagemDe(falha)}` } : { erro: `falha_do_executor: ${mensagemDe(falha)}` };
			}
			const conferirFala = (bruta) => {
				const fala = typeof bruta === "string" ? bruta.trim() : "";
				if (fala === "") return { erro: "fala_vazia" };
				if (falaComIdentificador(fala, chamada)) return { erro: "identificador_na_fala" };
				return fala;
			};
			let final = leitura;
			let fala = conferirFala(leitura.speech);
			if (typeof fala !== "string") return fala;
			if (definicao.executar.memoria !== void 0) try {
				await definicao.executar.memoria({
					...base,
					escrita: ambiente.escrita
				}, leitura);
			} catch (falha) {
				return { erro: `falha_da_memoria: ${mensagemDe(falha)}` };
			}
			if (!ensaio && definicao.executar.efeitos !== void 0) {
				try {
					const doEfeito = await definicao.executar.efeitos({
						...base,
						escrita: ambiente.escrita
					}, leitura);
					if (doEfeito) final = doEfeito;
				} catch (falha) {
					return { erro: `falha_do_efeito: ${mensagemDe(falha)}` };
				}
				if (final !== leitura) {
					fala = conferirFala(final.speech);
					if (typeof fala !== "string") return fala;
				}
			}
			const ok = final.ok ?? true;
			const erro = ok ? null : final.erro?.trim() || "recusa_da_ferramenta";
			return {
				saida: resposta(200, ok, final.data ?? null, fala),
				erroRegistrado: erro
			};
		};
		const execucao = executar();
		execucao.catch(() => void 0);
		const resultado = await Promise.race([execucao, esperar(orcamento).then(() => ESTOUROU)]);
		if (resultado === ESTOUROU) return registrar(FALHA(), `prazo_estourado: ${orcamento} ms`);
		if ("erro" in resultado) return registrar(FALHA(), resultado.erro);
		return registrar(resultado.saida, resultado.erroRegistrado);
	};
}
function criarPortaDeFerramentas(cliente, agora = Date.now) {
	let contasEmCache = null;
	return {
		async contasCandidatas() {
			const instante = agora();
			if (contasEmCache && instante - contasEmCache.lidasEm < 6e4) return contasEmCache.ids;
			const { data, error } = await cliente.from("accounts").select("id");
			if (error) throw new Error(error.message);
			const ids = (data ?? []).map((linha) => linha.id);
			contasEmCache = {
				lidasEm: instante,
				ids
			};
			return ids;
		},
		async chamadaDaConversa(contaId, conversaId) {
			const { data, error } = await cliente.from("calls").select("id, account_id, purpose, direction, lead_id").eq("account_id", contaId).eq("provider_conversation_id", conversaId).maybeSingle();
			if (error) throw new Error(error.message);
			return data ?? null;
		},
		async registrarInvocacao(invocacao) {
			const { error } = await cliente.from("call_tool_invocations").insert(invocacao);
			if (error) throw new Error(error.message);
		}
	};
}
//#endregion
//#region supabase/functions/_shared/speech/transferencia.ts
const FALAS_DA_TRANSFERENCIA = {
	emCurso: "Beleza, vou te passar pra uma pessoa do time. Fica na linha, tá?",
	retorno: "Anotei o seu pedido aqui, e alguém do time te procura pra conversar. Obrigada pela paciência, viu?"
};
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
//#region supabase/functions/tool-transfer/transferencia.ts
const URGENCIAS_ALTAS = new Set([
	"alta",
	"high",
	"urgente",
	"urgent"
]);
function texto(valor) {
	return typeof valor === "string" ? valor.trim() : "";
}
function urgenciaDoPedido(urgency) {
	return URGENCIAS_ALTAS.has(texto(urgency).toLowerCase()) ? "alta" : "normal";
}
function recorteDoPedido(entrada) {
	const partes = [texto(entrada.reason), texto(entrada.notes)].filter((parte) => parte !== "");
	return partes.length === 0 ? null : [...new Set(partes)].join(" | ");
}
function destinoDaTransferencia(gravado) {
	if (texto(gravado) === "") return {
		numero: null,
		pendencia: "destino_ausente"
	};
	const normalizado = normalizarTelefone(gravado);
	return normalizado.ok ? {
		numero: normalizado.e164,
		pendencia: null
	} : {
		numero: null,
		pendencia: "destino_invalido"
	};
}
function criarToolTransfer(leitura) {
	return criarFerramenta({
		nome: "tool-transfer",
		propositos: [...PROPOSITOS],
		obrigatorios: [{
			chave: "reason",
			nome: "motivo"
		}],
		executar: {
			async ler(contexto) {
				const urgencia = urgenciaDoPedido(contexto.entrada.urgency);
				const recorte = recorteDoPedido(contexto.entrada);
				const destino = destinoDaTransferencia(await leitura.destinoDaConta(contexto.contaId));
				if (destino.numero !== null) return {
					data: {
						transfer_number: destino.numero,
						queued: false
					},
					speech: FALAS_DA_TRANSFERENCIA.emCurso,
					plano: {
						pendencia: null,
						urgencia,
						recorte
					}
				};
				return {
					data: {
						transfer_number: null,
						queued: true
					},
					speech: FALAS_DA_TRANSFERENCIA.retorno,
					plano: {
						pendencia: destino.pendencia,
						urgencia,
						recorte
					}
				};
			},
			async efeitos(contexto, leitura) {
				const plano = leitura.plano;
				if (plano === void 0 || plano.pendencia === null) return;
				await contexto.escrita.abrirItemNaFila({
					contaId: contexto.contaId,
					chamadaId: contexto.chamada.id,
					leadId: contexto.chamada.lead_id,
					contexto: {
						call_id: contexto.chamada.id,
						recorte: plano.recorte,
						urgencia: plano.urgencia,
						pendencia: plano.pendencia
					}
				});
			}
		}
	});
}
//#endregion
//#region supabase/functions/tool-transfer/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CHAVE_DE_FERRAMENTAS = await segredoDaInstalacao({
	definido: Deno.env.get("SARAH_TOOL_SERVER_KEY"),
	chaveDeServico: CHAVE_DE_SERVICO,
	rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS
});
const CHAVE_ANTERIOR = Deno.env.get("SARAH_TOOL_SERVER_KEY_ANTERIOR") ?? null;
const ROTACIONADA_EM = (() => {
	const bruto = Deno.env.get("SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM") ?? "";
	const instante = Date.parse(bruto);
	return Number.isFinite(instante) ? instante : null;
})();
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store"
};
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const porta = criarPortaDeFerramentas(servico);
const leitura = { async destinoDaConta(contaId) {
	const { data, error } = await servico.from("agents").select("transfer_target").eq("account_id", contaId).maybeSingle();
	if (error) throw new Error(error.message);
	return data?.transfer_target ?? null;
} };
const escrita = { async abrirItemNaFila(item) {
	const { error } = await servico.rpc("criar_excecao", {
		p_account_id: item.contaId,
		p_kind: "human_requested",
		p_severity: "alta",
		p_call_id: item.chamadaId,
		p_lead_id: item.leadId,
		p_context: item.contexto
	});
	if (error) throw new Error(error.message);
} };
const tratar = criarToolTransfer(leitura);
const ambiente = {
	porta,
	escrita,
	chaves: {
		vigente: CHAVE_DE_FERRAMENTAS,
		anterior: CHAVE_ANTERIOR,
		rotacionadaEm: ROTACIONADA_EM
	}
};
Deno.serve(async (requisicao) => {
	let corpo = null;
	try {
		corpo = await requisicao.json();
	} catch {
		corpo = null;
	}
	const resposta = await tratar({
		metodo: requisicao.method,
		segredo: requisicao.headers.get("x-tool-secret"),
		conversa: requisicao.headers.get(CABECALHO_DA_CONVERSA),
		corpo
	}, ambiente);
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
