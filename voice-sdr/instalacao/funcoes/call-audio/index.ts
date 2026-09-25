// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/call-audio/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
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
Object.freeze(CRITERIOS_MINIMOS.map((criterio, posicao) => ({
	key: criterio.key,
	label: criterio.rotulo,
	obrigatorio: criterio.obrigatorio,
	como: criterio.como === "trecho" ? "trecho" : "modelo",
	trechos: [...criterio.trechos ?? []],
	position: posicao
})));
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
new Set(CATALOGO_DE_FERRAMENTAS.map((f) => f.nome));
//#endregion
//#region supabase/functions/call-finalize/finalizacao.ts
const BALDE_DAS_GRAVACOES = "recordings";
//#endregion
//#region supabase/functions/call-audio/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	sem_sessao: "Entre na sua conta para ouvir a gravação.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para ouvir a gravação.",
	chamada_invalida: "O pedido precisa trazer o identificador da chamada.",
	chamada_desconhecida: "Chamada não encontrada.",
	sem_gravacao: "Esta chamada não tem gravação. A gravação estava desligada, ou a chamada ainda não foi finalizada.",
	armazenamento_indisponivel: "O armazenamento das gravações não respondeu. Tente de novo em alguns minutos.",
	falha_interna: "Não foi possível abrir a gravação agora. Tente de novo em alguns minutos."
};
function mensagemDoExpurgo(retencaoEmDias) {
	return `Esta gravação foi expurgada pelo prazo de retenção de ${retencaoEmDias === 1 ? "1 dia" : `${retencaoEmDias} dias`}.`;
}
const STATUS = {
	metodo_invalido: 405,
	sem_sessao: 401,
	sessao_invalida: 401,
	chamada_invalida: 400,
	chamada_desconhecida: 404,
	sem_gravacao: 404,
	gravacao_expurgada: 410,
	armazenamento_indisponivel: 503,
	falha_interna: 500
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function atenderAudio(pedido, porta, opcoes) {
	let resposta;
	try {
		resposta = await conduzir(pedido, porta, opcoes);
	} catch {
		resposta = recusa("falha_interna");
	}
	try {
		conferirQueNaoVazou(resposta.corpo, opcoes.segredosDaInstalacao, "credencial no corpo de call-audio");
	} catch {
		return recusa("falha_interna");
	}
	return resposta;
}
async function conduzir(pedido, porta, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const jwt = extrairJwt(pedido.autorizacao);
	if (!jwt) return recusa("sem_sessao");
	const chamadaId = typeof pedido.chamadaId === "string" ? pedido.chamadaId.trim() : "";
	if (!UUID.test(chamadaId)) return recusa("chamada_invalida");
	const usuario = await porta.usuarioDaSessao(jwt);
	if (!usuario) return recusa("sessao_invalida");
	const chamada = await porta.gravacaoDaChamada(chamadaId);
	if (!chamada) return recusa("chamada_desconhecida");
	if (!await porta.papelNaConta(chamada.account_id, usuario.id)) return recusa("chamada_desconhecida");
	const agoraMs = Date.parse(opcoes.agora);
	const expiraMs = chamada.recording_expires_at === null ? null : Date.parse(chamada.recording_expires_at);
	const caminho = chamada.recording_path?.trim() ?? "";
	if (expiraMs === null && caminho === "") return recusa("sem_gravacao");
	if (caminho === "" || expiraMs !== null && expiraMs <= agoraMs) {
		const retencao = await porta.retencaoDaConta(chamada.account_id);
		return {
			status: STATUS.gravacao_expurgada,
			corpo: {
				ok: false,
				motivo: "gravacao_expurgada",
				mensagem: mensagemDoExpurgo(retencao)
			}
		};
	}
	const restanteEmSegundos = expiraMs === null ? Infinity : Math.ceil((expiraMs - agoraMs) / 1e3);
	const validade = Math.min(300, restanteEmSegundos);
	let url;
	try {
		url = await porta.assinarGravacao(caminho, validade);
	} catch {
		return recusa("armazenamento_indisponivel");
	}
	return {
		status: 200,
		corpo: {
			ok: true,
			chamadaId: chamada.id,
			url,
			validadeEmSegundos: validade,
			expiraEm: new Date(agoraMs + validade * 1e3).toISOString()
		}
	};
}
function extrairJwt(autorizacao) {
	const jwt = PREFIXO_BEARER.exec(autorizacao?.trim() ?? "")?.[1]?.trim() ?? "";
	return jwt === "" ? null : jwt;
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
//#region supabase/functions/call-audio/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
	"access-control-allow-methods": "POST, OPTIONS"
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
	async gravacaoDaChamada(chamadaId) {
		const { data, error } = await servico.from("calls").select("id, account_id, recording_path, recording_expires_at").eq("id", chamadaId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const linha = data;
		return {
			id: linha.id,
			account_id: linha.account_id,
			recording_path: linha.recording_path ?? null,
			recording_expires_at: linha.recording_expires_at ?? null
		};
	},
	async papelNaConta(contaId, usuarioId) {
		const { data, error } = await servico.from("account_members").select("role").eq("account_id", contaId).eq("user_id", usuarioId).maybeSingle();
		if (error) throw new Error(error.message);
		return data?.role ?? null;
	},
	async retencaoDaConta(contaId) {
		const { data, error } = await servico.from("account_settings").select("retention_days").eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		const dias = data?.retention_days;
		return typeof dias === "number" ? dias : 90;
	},
	async assinarGravacao(caminho, validadeEmSegundos) {
		const { data, error } = await servico.storage.from(BALDE_DAS_GRAVACOES).createSignedUrl(caminho, validadeEmSegundos);
		if (error || !data?.signedUrl) throw new Error(error?.message ?? "URL assinada ausente");
		return data.signedUrl;
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
	const resposta = await atenderAudio({
		metodo: requisicao.method,
		chamadaId: corpo?.chamadaId ?? corpo?.call_id ?? null,
		autorizacao: requisicao.headers.get("authorization")
	}, porta, {
		agora: new Date().toISOString(),
		segredosDaInstalacao: [CHAVE_DE_SERVICO]
	});
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
