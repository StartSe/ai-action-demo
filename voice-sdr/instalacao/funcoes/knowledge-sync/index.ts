// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/knowledge-sync/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/_shared/hash-de-segredo.ts
async function hashEmHexadecimal(segredo) {
	const bytes = new TextEncoder().encode(segredo.trim());
	const resumo = await crypto.subtle.digest("SHA-256", bytes);
	return [...new Uint8Array(resumo)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
({
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
}).nome;
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
FALAS_DE_TODO_PROPOSITO.avisoDeGravacao, [...FALAS_DE_TODO_PROPOSITO.recusaDeAfirmar], [...FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe], [...FALAS_DAS_REGRAS_TRAVADAS.pedidoDeHumano], [...FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada];
[...FALAS_DA_QUALIFICACAO.antesDeEncerrar];
[...FALAS_DE_DESCOBERTA.fechamento.sem_agenda], [...FALAS_DE_DESCOBERTA.fechamento.com_agenda];
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
//#region supabase/functions/knowledge-sync/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido veio sem a conta da base de conhecimento.",
	sem_sessao: "Entre na sua conta para sincronizar a base de conhecimento.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para sincronizar a base.",
	sem_acesso: "Você não tem acesso a esta conta.",
	papel_insuficiente: "Sincronizar a base de conhecimento é tarefa de quem administra a conta. Peça a sincronização a quem administra.",
	sem_credencial_de_voz: "Nenhuma chave cadastrada para o provedor de voz. Cadastre a chave em Integrações e sincronize.",
	credencial_da_plataforma_bloqueada: "Existe uma chave da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações.",
	falha_interna: "Não foi possível sincronizar a base agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_invalido: 405,
	conta_ausente: 400,
	sem_sessao: 401,
	sessao_invalida: 401,
	sem_acesso: 403,
	papel_insuficiente: 403,
	sem_credencial_de_voz: 409,
	credencial_da_plataforma_bloqueada: 409,
	falha_interna: 500
};
const MENSAGENS_DA_ENTRADA = {
	envio_recusado: "O provedor de voz recusou esta entrada. Confira a chave em Integrações e sincronize de novo.",
	envio_indisponivel: "O provedor de voz não respondeu a tempo para esta entrada. Sincronize de novo em alguns minutos.",
	remocao_recusada: "O provedor de voz recusou a remoção. A entrada continua marcada para sair e a assistente ainda pode usá-la. Sincronize de novo.",
	remocao_indisponivel: "O provedor de voz não respondeu à remoção. A entrada continua marcada para sair e a assistente ainda pode usá-la. Sincronize de novo em alguns minutos.",
	falha_ao_gravar: "O provedor respondeu, mas o registro desta entrada não foi gravado. Sincronize de novo para acertar o registro."
};
const MENSAGENS_DA_PUBLICACAO = {
	anexo_recusado: "O provedor de voz recusou os documentos neste propósito. Confira a chave em Integrações e sincronize de novo.",
	anexo_indisponivel: "O provedor de voz não respondeu a tempo neste propósito. Sincronize de novo em alguns minutos."
};
const CHAVE_DO_PROVEDOR_DE_VOZ = "api_key";
const PAPEIS_QUE_SINCRONIZAM = new Set(["owner", "admin"]);
const ENDERECOS_PADRAO = {
	enviar: "convai/knowledge-base/text",
	remover: "convai/knowledge-base/:id",
	anexar: "convai/agents/:id"
};
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function atenderSincronizacao(pedido, porta) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const contaId = typeof pedido.contaId === "string" ? pedido.contaId.trim() : "";
	if (!contaId) return recusa("conta_ausente");
	const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? "")?.[1]?.trim();
	if (!jwt) return recusa("sem_sessao");
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sessao_invalida");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (!papel) return recusa("sem_acesso");
		if (!PAPEIS_QUE_SINCRONIZAM.has(papel)) return recusa("papel_insuficiente");
		const resolucao = await porta.credencial(contaId, "voz", CHAVE_DO_PROVEDOR_DE_VOZ);
		if (!resolucao.ok) return recusa(resolucao.motivo === "plataforma_bloqueada" ? "credencial_da_plataforma_bloqueada" : "sem_credencial_de_voz");
		const corpo = await sincronizar(contaId, resolucao.valor, porta);
		conferirQueNaoVazou(corpo, [resolucao.valor], "a resposta da sincronização carregava a chave do provedor");
		return {
			status: 200,
			corpo
		};
	} catch {
		return recusa("falha_interna");
	}
}
function documentoDaEntrada(entrada) {
	const pergunta = entrada.question.trim();
	const resposta = entrada.answer.trim();
	return {
		nome: pergunta.length > 120 ? `${pergunta.slice(0, 119).trimEnd()}…` : pergunta,
		texto: `Pergunta: ${pergunta}\n\nResposta: ${resposta}`
	};
}
function hashDoDocumento(documento) {
	return hashEmHexadecimal(JSON.stringify([documento.nome, documento.texto]));
}
async function sincronizar(contaId, credencial, porta) {
	const passagem = {
		contaId,
		credencial,
		porta,
		vigentes: [],
		semRegistro: 0
	};
	const entradas = [];
	for (const entrada of await porta.entradasDaConta(contaId)) entradas.push(await sincronizarEntrada(entrada, passagem));
	const registradas = new Map((await porta.publicacoesDaConta(contaId)).map((linha) => [linha.purpose, linha]));
	const publicacoes = [];
	for (const proposito of PROPOSITOS) publicacoes.push(await anexar(proposito, registradas.get(proposito), passagem));
	const contar = (estado) => entradas.filter((item) => item.estado === estado).length;
	return {
		ok: true,
		contaId,
		entradas,
		publicacoes,
		enviadas: contar("enviada"),
		atualizadas: contar("atualizada"),
		removidas: contar("removida"),
		inalteradas: contar("inalterada"),
		erros: contar("erro"),
		semRegistro: passagem.semRegistro
	};
}
async function sincronizarEntrada(entrada, passagem) {
	if (entrada.removed_at !== null) return remover(entrada, passagem);
	const documento = documentoDaEntrada(entrada);
	const hash = await hashDoDocumento(documento);
	if (entrada.provider_doc_id === null) return enviar(entrada, documento, hash, "enviada", passagem);
	if (entrada.indexed_hash === hash) {
		passagem.vigentes.push({
			id: entrada.provider_doc_id,
			nome: documento.nome
		});
		return sucesso(entrada.id, "inalterada");
	}
	const removido = await removerNoProvedor(entrada.id, entrada.provider_doc_id, passagem);
	if (removido !== null) {
		passagem.vigentes.push({
			id: entrada.provider_doc_id,
			nome: documento.nome
		});
		return falhar(entrada.id, removido === "recusado" ? "remocao_recusada" : "remocao_indisponivel", passagem);
	}
	try {
		await passagem.porta.marcarDesindexada(entrada.id);
	} catch {
		return falhar(entrada.id, "falha_ao_gravar", passagem);
	}
	return enviar(entrada, documento, hash, "atualizada", passagem);
}
async function enviar(entrada, documento, hash, estado, passagem) {
	const { contaId, credencial, porta } = passagem;
	const resposta = await porta.enviarDocumento({
		contaId,
		entradaId: entrada.id,
		documento,
		credencial
	});
	const documentoId = resposta.ok ? resposta.documentoId?.trim() ?? "" : "";
	await rastrear(passagem, {
		account_id: contaId,
		direction: "outbound",
		provider: "voz",
		endpoint: resposta.endpoint ?? ENDERECOS_PADRAO.enviar,
		request: {
			operacao: estado === "enviada" ? "enviar" : "atualizar",
			caracteres_do_nome: documento.nome.length,
			caracteres_do_texto: documento.texto.length
		},
		response: {
			ok: resposta.ok,
			documento: documentoId || null
		},
		status_code: resposta.status ?? null,
		latency_ms: resposta.latenciaMs ?? null,
		correlation_id: entrada.id
	});
	if (!documentoId) {
		const motivo = eFalhaDoProvedor(traduzirErroDoProvedor(resposta.codigo, resposta.status).motivo) ? "envio_indisponivel" : "envio_recusado";
		return falhar(entrada.id, motivo, passagem);
	}
	let achou;
	try {
		achou = await porta.marcarIndexada(entrada.id, documentoId, hash);
	} catch {
		await removerNoProvedor(entrada.id, documentoId, passagem);
		return falhar(entrada.id, "falha_ao_gravar", passagem);
	}
	if (!achou) {
		const removido = await removerNoProvedor(entrada.id, documentoId, passagem);
		if (removido !== null) return falhar(entrada.id, removido === "recusado" ? "remocao_recusada" : "remocao_indisponivel", passagem);
		return sucesso(entrada.id, "removida");
	}
	passagem.vigentes.push({
		id: documentoId,
		nome: documento.nome
	});
	return sucesso(entrada.id, estado);
}
async function remover(entrada, passagem) {
	if (entrada.provider_doc_id !== null) {
		const removido = await removerNoProvedor(entrada.id, entrada.provider_doc_id, passagem);
		if (removido !== null) {
			passagem.vigentes.push({
				id: entrada.provider_doc_id,
				nome: documentoDaEntrada(entrada).nome
			});
			return falhar(entrada.id, removido === "recusado" ? "remocao_recusada" : "remocao_indisponivel", passagem);
		}
	}
	try {
		if (!await passagem.porta.apagarEntrada(entrada.id)) {
			await passagem.porta.marcarDesindexada(entrada.id);
			return falhar(entrada.id, "falha_ao_gravar", passagem);
		}
	} catch {
		return falhar(entrada.id, "falha_ao_gravar", passagem);
	}
	return sucesso(entrada.id, "removida");
}
async function removerNoProvedor(entradaId, documentoId, passagem) {
	const { contaId, credencial, porta } = passagem;
	const resposta = await porta.removerDocumento({
		contaId,
		documentoId,
		credencial
	});
	await rastrear(passagem, {
		account_id: contaId,
		direction: "outbound",
		provider: "voz",
		endpoint: resposta.endpoint ?? ENDERECOS_PADRAO.remover,
		request: {
			operacao: "remover",
			documento: documentoId
		},
		response: { ok: resposta.ok },
		status_code: resposta.status ?? null,
		latency_ms: resposta.latenciaMs ?? null,
		correlation_id: entradaId
	});
	if (resposta.ok || resposta.status === 404) return null;
	return eFalhaDoProvedor(traduzirErroDoProvedor(resposta.codigo, resposta.status).motivo) ? "indisponivel" : "recusado";
}
async function anexar(proposito, registrada, passagem) {
	const providerAgentId = registrada?.provider_agent_id?.trim() ?? "";
	if (!providerAgentId) return {
		proposito,
		estado: "sem_publicacao",
		motivo: null,
		mensagem: null,
		documentos: null
	};
	const { contaId, credencial, porta, vigentes } = passagem;
	const documentos = [...vigentes];
	const resposta = await porta.anexarDocumentos({
		contaId,
		proposito,
		providerAgentId,
		documentos,
		credencial
	});
	await rastrear(passagem, {
		account_id: contaId,
		direction: "outbound",
		provider: "voz",
		endpoint: resposta.endpoint ?? ENDERECOS_PADRAO.anexar,
		request: {
			operacao: "anexar",
			purpose: proposito,
			documentos: documentos.map((item) => item.id)
		},
		response: { ok: resposta.ok },
		status_code: resposta.status ?? null,
		latency_ms: resposta.latenciaMs ?? null,
		correlation_id: null
	});
	if (resposta.ok) return {
		proposito,
		estado: "anexada",
		motivo: null,
		mensagem: null,
		documentos: documentos.length
	};
	const motivo = eFalhaDoProvedor(traduzirErroDoProvedor(resposta.codigo, resposta.status).motivo) ? "anexo_indisponivel" : "anexo_recusado";
	return {
		proposito,
		estado: "erro",
		motivo,
		mensagem: MENSAGENS_DA_PUBLICACAO[motivo],
		documentos: null
	};
}
async function falhar(entradaId, motivo, passagem) {
	try {
		await passagem.porta.marcarErro(entradaId, motivo);
	} catch {}
	return {
		entradaId,
		estado: "erro",
		motivo,
		mensagem: MENSAGENS_DA_ENTRADA[motivo]
	};
}
function sucesso(entradaId, estado) {
	return {
		entradaId,
		estado,
		motivo: null,
		mensagem: null
	};
}
async function rastrear(passagem, evento) {
	try {
		await passagem.porta.registrarEventoDeIntegracao(evento);
	} catch {
		passagem.semRegistro += 1;
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
//#region supabase/functions/knowledge-sync/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const ENDERECO_DO_PROVEDOR = "https://api.elevenlabs.io/v1/convai";
const LIMITE_DO_PROVEDOR_MS = 15e3;
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
async function rpcBooleano(nome, parametros) {
	const { data, error } = await servico.rpc(nome, parametros);
	if (error) throw new Error(error.message);
	return data === true;
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
	credencial(contaId, provedor, chave) {
		return cofre.resolveSecret(contaId, provedor, chave);
	},
	async entradasDaConta(contaId) {
		const { data, error } = await servico.from("knowledge_entries").select("id, question, answer, provider_doc_id, indexed_hash, removed_at").eq("account_id", contaId).order("created_at", { ascending: true }).order("id", { ascending: true });
		if (error) throw new Error(error.message);
		return (data ?? []).map((linha) => ({
			id: String(linha.id),
			question: String(linha.question ?? ""),
			answer: String(linha.answer ?? ""),
			provider_doc_id: linha.provider_doc_id ?? null,
			indexed_hash: linha.indexed_hash ?? null,
			removed_at: linha.removed_at ?? null
		}));
	},
	async publicacoesDaConta(contaId) {
		const { data, error } = await servico.from("agent_publications").select("purpose, provider_agent_id").eq("account_id", contaId);
		if (error) throw new Error(error.message);
		return (data ?? []).map((linha) => ({
			purpose: String(linha.purpose),
			provider_agent_id: linha.provider_agent_id ?? null
		}));
	},
	async enviarDocumento(pedido) {
		const resposta = await chamar("POST", "/knowledge-base/text", pedido.credencial, ENDERECOS_PADRAO.enviar, {
			name: pedido.documento.nome,
			text: pedido.documento.texto
		});
		const id = resposta.corpo?.id ?? resposta.corpo?.document_id;
		return {
			...resposta,
			documentoId: typeof id === "string" ? id : null
		};
	},
	removerDocumento(pedido) {
		return chamar("DELETE", `/knowledge-base/${encodeURIComponent(pedido.documentoId)}?force=true`, pedido.credencial, ENDERECOS_PADRAO.remover);
	},
	anexarDocumentos(pedido) {
		return chamar("PATCH", `/agents/${encodeURIComponent(pedido.providerAgentId)}`, pedido.credencial, ENDERECOS_PADRAO.anexar, { conversation_config: { agent: { prompt: { knowledge_base: pedido.documentos.map((documento) => ({
			type: "text",
			id: documento.id,
			name: documento.nome,
			usage_mode: "auto"
		})) } } } });
	},
	marcarIndexada(entradaId, documentoId, hash) {
		return rpcBooleano("marcar_conhecimento_indexado", {
			p_entrada: entradaId,
			p_documento: documentoId,
			p_hash: hash
		});
	},
	marcarDesindexada(entradaId) {
		return rpcBooleano("marcar_conhecimento_desindexado", { p_entrada: entradaId });
	},
	marcarErro(entradaId, motivo) {
		return rpcBooleano("marcar_erro_do_conhecimento", {
			p_entrada: entradaId,
			p_motivo: motivo
		});
	},
	async apagarEntrada(entradaId) {
		const { data, error } = await servico.from("knowledge_entries").delete().eq("id", entradaId).not("removed_at", "is", null).select("id");
		if (error) throw new Error(error.message);
		return (data ?? []).length > 0;
	},
	async registrarEventoDeIntegracao(evento) {
		const { error } = await servico.from("integration_events").insert(evento);
		if (error) throw new Error(error.message);
	}
};
async function chamar(metodo, caminho, credencial, endpoint, corpo) {
	const comecou = Date.now();
	let resposta;
	try {
		resposta = await fetch(`${ENDERECO_DO_PROVEDOR}${caminho}`, {
			method: metodo,
			headers: {
				"xi-api-key": credencial,
				"content-type": "application/json"
			},
			body: corpo === void 0 ? void 0 : JSON.stringify(corpo),
			signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
		});
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - comecou,
			endpoint
		};
	}
	const latenciaMs = Date.now() - comecou;
	let lido = {};
	try {
		lido = await resposta.json();
	} catch {}
	if (!resposta.ok) {
		const detalhe = lido.error ?? lido.detail ?? lido;
		const codigo = typeof detalhe === "string" ? detalhe : detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null;
		return {
			ok: false,
			codigo: codigo === null ? null : String(codigo),
			status: resposta.status,
			latenciaMs,
			corpo: lido,
			endpoint
		};
	}
	return {
		ok: true,
		status: resposta.status,
		latenciaMs,
		corpo: lido,
		endpoint
	};
}
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	let contaId = null;
	try {
		const corpo = await requisicao.json();
		contaId = corpo?.contaId ?? corpo?.account_id ?? null;
	} catch {}
	const resposta = await atenderSincronizacao({
		metodo: requisicao.method,
		contaId,
		autorizacao: requisicao.headers.get("authorization")
	}, porta);
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
