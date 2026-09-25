// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/tool-availability/index.ts. Não edite à mão: rode `npm run pacote`.
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
function texto(valor) {
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
		area: texto(entrada.area),
		especialistaId: texto(entrada.specialist_id),
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
function criarToolAvailability(leitura) {
	return criarFerramenta({
		nome: "tool-availability",
		propositos: [...PROPOSITOS],
		executar: executorDaDisponibilidade(leitura)
	});
}
function executorDaDisponibilidade(leitura) {
	return {
		async ler(contexto) {
			const agoraMs = contexto.agora();
			const agora = new Date(agoraMs).toISOString();
			const pedido = lerPedido(contexto.entrada);
			const configuracao = await leitura.configuracaoDaConta(contexto.contaId);
			const modoDaConta = modoDe(configuracao.modo);
			const fusoDoLead = (contexto.chamada.lead_id === null ? null : texto(await leitura.fusoDoLead(contexto.contaId, contexto.chamada.lead_id))) ?? configuracao.fusoDaConta;
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
//#region supabase/functions/tool-availability/index.ts
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
function falhou(error) {
	if (error) throw new Error(error.message);
}
const leitura = {
	async configuracaoDaConta(contaId) {
		const [configuracao, conta] = await Promise.all([servico.from("account_settings").select("routing_mode, fixed_specialist_id").eq("account_id", contaId).single(), servico.from("accounts").select("timezone").eq("id", contaId).single()]);
		falhou(configuracao.error);
		falhou(conta.error);
		if (!configuracao.data || !conta.data) throw new Error("conta sem configuração");
		return {
			modo: configuracao.data.routing_mode,
			especialistaFixo: configuracao.data.fixed_specialist_id,
			fusoDaConta: conta.data.timezone
		};
	},
	async fusoDoLead(contaId, leadId) {
		const { data, error } = await servico.from("leads").select("timezone").eq("account_id", contaId).eq("id", leadId).maybeSingle();
		falhou(error);
		return data?.timezone ?? null;
	},
	async especialistasDaConta(contaId) {
		const [especialistas, faixas] = await Promise.all([servico.from("specialists").select("id, area, active, timezone, default_duration_min, daily_cap, min_notice_min, max_notice_days, last_assigned_at").eq("account_id", contaId), servico.from("specialist_availability").select("specialist_id, weekday, start_time, end_time").eq("account_id", contaId)]);
		falhou(especialistas.error);
		falhou(faixas.error);
		const faixasDe = new Map();
		for (const faixa of faixas.data ?? []) faixasDe.set(faixa.specialist_id, [...faixasDe.get(faixa.specialist_id) ?? [], faixa]);
		return (especialistas.data ?? []).map((linha) => ({
			id: linha.id,
			area: linha.area,
			ativo: linha.active,
			fuso: linha.timezone,
			duracaoPadraoMin: linha.default_duration_min,
			tetoDiario: linha.daily_cap,
			antecedenciaMinimaMin: linha.min_notice_min,
			antecedenciaMaximaDias: linha.max_notice_days,
			ultimaAtribuicaoEm: linha.last_assigned_at,
			disponibilidade: (faixasDe.get(linha.id) ?? []).map((faixa) => ({
				diaDaSemana: faixa.weekday,
				inicio: faixa.start_time,
				fim: faixa.end_time
			}))
		}));
	},
	async agendaNoPeriodo(contaId, especialistaIds, periodo) {
		const noPeriodo = (tabela, colunas) => servico.from(tabela).select(colunas).eq("account_id", contaId).in("specialist_id", [...especialistaIds]).lt("starts_at", periodo.ate).gt("ends_at", periodo.de);
		const [bloqueios, ocupacao, reunioes] = await Promise.all([
			noPeriodo("specialist_blocks", "specialist_id, starts_at, ends_at"),
			noPeriodo("specialist_busy_blocks", "specialist_id, starts_at, ends_at"),
			noPeriodo("meetings", "specialist_id, starts_at, ends_at, status")
		]);
		falhou(bloqueios.error);
		falhou(ocupacao.error);
		falhou(reunioes.error);
		const intervalo = (linha) => ({
			inicio: linha.starts_at,
			fim: linha.ends_at
		});
		return especialistaIds.map((id) => ({
			especialistaId: id,
			bloqueios: (bloqueios.data ?? []).filter((linha) => linha.specialist_id === id).map(intervalo),
			ocupacaoExterna: (ocupacao.data ?? []).filter((linha) => linha.specialist_id === id).map(intervalo),
			reunioes: (reunioes.data ?? []).filter((linha) => linha.specialist_id === id).map((linha) => ({
				...intervalo(linha),
				status: linha.status
			}))
		}));
	}
};
const escrita = { async substituirOfertas(contaId, chamadaId, ofertas) {
	falhou((await servico.from("call_slot_offers").delete().eq("account_id", contaId).eq("call_id", chamadaId)).error);
	if (ofertas.length === 0) return;
	falhou((await servico.from("call_slot_offers").insert(ofertas.map((oferta) => ({
		...oferta,
		account_id: contaId,
		call_id: chamadaId
	})))).error);
} };
const tratar = criarToolAvailability(leitura);
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
