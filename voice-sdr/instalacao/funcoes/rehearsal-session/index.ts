// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/rehearsal-session/index.ts. Não edite à mão: rode `npm run pacote`.
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
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
}
//#endregion
//#region supabase/functions/agent-publish/publicacao.ts
const CHAVE_DO_PROVEDOR_DE_VOZ = "api_key";
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
//#region supabase/functions/_shared/ensaio/perfis-de-lead.ts
const PERFIS_DE_LEAD = [
	{
		id: "interessado",
		rotulo: "Lead interessado",
		descricao: "Responde com calma, faz perguntas sobre a oferta e aceita seguir a conversa.",
		contexto: "Preencheu o formulário do site pedindo mais informações sobre a oferta."
	},
	{
		id: "apressado",
		rotulo: "Lead apressado",
		descricao: "Atende entre dois compromissos, responde curto e quer saber logo do que se trata.",
		contexto: "Baixou um material da empresa na semana passada e não respondeu o e-mail."
	},
	{
		id: "pede_pessoa",
		rotulo: "Lead que pede para falar com uma pessoa",
		descricao: "Ouve a apresentação e pede para ser atendido por alguém da equipe.",
		contexto: "Pediu um orçamento pelo site e deixou o telefone para contato."
	},
	{
		id: "pede_bloqueio",
		rotulo: "Lead que pede para não ser chamado",
		descricao: "Diz que não quer receber ligações e pede para ser tirado da lista.",
		contexto: "Está na base de contatos de um evento da empresa."
	},
	{
		id: "pessoa_errada",
		rotulo: "Pessoa errada",
		descricao: "Atende e diz que não é a pessoa procurada: o número é de outra pessoa.",
		contexto: "Preencheu o formulário do site pedindo mais informações sobre a oferta."
	}
];
function perfilPeloId(id) {
	if (typeof id !== "string") return null;
	return PERFIS_DE_LEAD.find((perfil) => perfil.id === id) ?? null;
}
function lerIdDoPerfil(valor) {
	return perfilPeloId(valor)?.id ?? null;
}
//#endregion
//#region supabase/functions/rehearsal-session/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido veio sem a conta.",
	acao_invalida: "O pedido veio sem um passo conhecido do ensaio.",
	proposito_invalido: "Escolha o propósito do ensaio: descoberta, lembrete, resgate ou acompanhamento.",
	modo_invalido: "Escolha como conversar: por voz ou por texto.",
	perfil_invalido: "Escolha com quem a assistente vai conversar no ensaio.",
	ensaio_ausente: "O pedido veio sem o ensaio.",
	ensaio_inexistente: "Este ensaio não existe nesta conta.",
	ensaio_encerrado: "Este ensaio já foi encerrado.",
	sem_agente: "Esta conta ainda não tem uma assistente montada. Configure a identidade dela, publique e volte para ensaiar.",
	sem_publicacao: "A assistente ainda não foi publicada neste propósito. Publique o playbook em Playbooks e volte para ensaiar.",
	sem_credencial_de_voz: "Nenhuma chave cadastrada para o provedor de voz. Cadastre a chave em Integrações e volte para ensaiar.",
	sem_sessao: "Entre na sua conta para ensaiar.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para ensaiar.",
	sem_acesso: "Você não tem acesso a esta conta.",
	papel_insuficiente: "Ensaiar com a assistente é tarefa de quem administra a conta. Peça o ensaio a quem administra.",
	provedor_indisponivel: "Não foi possível abrir a conversa agora. Tente de novo em alguns minutos.",
	resposta_ilegivel: "O provedor respondeu fora do formato esperado e a conversa não foi aberta.",
	falha_interna: "Não foi possível continuar o ensaio agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_invalido: 405,
	conta_ausente: 400,
	acao_invalida: 400,
	proposito_invalido: 400,
	modo_invalido: 400,
	perfil_invalido: 400,
	ensaio_ausente: 400,
	ensaio_inexistente: 404,
	ensaio_encerrado: 409,
	sem_publicacao: 428,
	sem_agente: 428,
	sem_credencial_de_voz: 409,
	sem_sessao: 401,
	sessao_invalida: 401,
	sem_acesso: 403,
	papel_insuficiente: 403,
	provedor_indisponivel: 503,
	resposta_ilegivel: 502,
	falha_interna: 500
};
const CAMINHO_DA_RECUSA = {
	sem_publicacao: "/sarah/playbooks",
	sem_agente: "/sarah/identidade",
	sem_credencial_de_voz: "/config/integracoes"
};
//#endregion
//#region supabase/functions/rehearsal-session/sessao.ts
const PAPEIS_QUE_ENSAIAM = new Set(["owner", "admin"]);
const ACOES = ["abrir", "encerrar"];
const MODOS = ["voice", "text"];
const VALIDADE_DA_SESSAO_MS = 9e5;
const MODOS_QUE_CONSOMEM_CREDITO = new Set(["voice"]);
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function atenderEnsaio(pedido, porta, opcoes = {}) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const contaId = texto(pedido.contaId);
	if (!contaId) return recusa("conta_ausente");
	const jwt = PREFIXO_BEARER.exec(pedido.autorizacao?.trim() ?? "")?.[1]?.trim();
	if (!jwt) return recusa("sem_sessao");
	const acao = lerAcao(pedido.acao);
	if (!acao) return recusa("acao_invalida");
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sessao_invalida");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (!papel) return recusa("sem_acesso");
		if (!PAPEIS_QUE_ENSAIAM.has(papel)) return recusa("papel_insuficiente");
		return acao === "abrir" ? await abrir(pedido, contaId, usuario.id, porta, opcoes.agora ?? (() => new Date())) : await encerrar(pedido, contaId, porta);
	} catch {
		return recusa("falha_interna");
	}
}
async function abrir(pedido, contaId, autorId, porta, agora) {
	const proposito = lerProposito(pedido.proposito);
	if (!proposito) return recusa("proposito_invalido");
	const modo = lerModo(pedido.modo);
	if (!modo) return recusa("modo_invalido");
	const perfil = lerIdDoPerfil(pedido.perfil);
	if (!perfil) return recusa("perfil_invalido");
	if (!await porta.contaTemAgente(contaId)) return recusa("sem_agente");
	const publicacao = await porta.publicacaoDoProposito(contaId, proposito);
	if (!publicacao?.provider_agent_id) return recusa("sem_publicacao");
	const sessao = await porta.pedirSessaoAssinada(publicacao.provider_agent_id);
	if (!sessao.ok) return recusa(sessao.codigo === "sem_credencial" ? "sem_credencial_de_voz" : "provedor_indisponivel");
	const urlAssinada = texto(sessao.urlAssinada);
	if (!urlAssinada) return recusa("resposta_ilegivel");
	const credenciais = sessao.credencial ? [sessao.credencial] : [];
	if (vazou({ urlAssinada }, credenciais)) return recusa("falha_interna");
	const criado = await porta.abrirEnsaio({
		contaId,
		proposito,
		modo,
		persona: { perfil },
		criadoPor: autorId,
		publicacaoId: publicacao.id,
		versaoDoPlaybookId: publicacao.playbook_version_id
	});
	const contexto = await porta.contextoDaAbertura(contaId, criado.chamadaId);
	const contextoDoLead = perfilPeloId(perfil)?.contexto ?? "";
	const abertura = contexto ? montarAbertura({
		...contexto,
		contextoDoLead
	}) : {
		variaveis: variaveisDaChamada(null, contextoDoLead),
		primeiraFala: null
	};
	const corpo = {
		ok: true,
		passo: "aberto",
		ensaioId: criado.ensaioId,
		chamadaId: criado.chamadaId,
		publicacaoId: publicacao.id,
		urlAssinada,
		modo,
		somenteTexto: modo === "text",
		expiraEm: new Date(agora().getTime() + VALIDADE_DA_SESSAO_MS).toISOString(),
		consomeCredito: MODOS_QUE_CONSOMEM_CREDITO.has(modo),
		variaveis: {
			...abertura.variaveis,
			call_id: criado.chamadaId
		},
		primeiraFala: abertura.primeiraFala
	};
	if (vazou(corpo, credenciais)) return recusa("falha_interna");
	return {
		status: 201,
		corpo
	};
}
function conversaDoAgente(conversa, esperado) {
	const lido = conversa.agenteId?.trim();
	return !esperado || !lido || lido === esperado;
}
function vazou(corpo, credenciais) {
	try {
		conferirQueNaoVazou(corpo, credenciais, "a sessão de ensaio carregava a chave do provedor");
		return false;
	} catch {
		return true;
	}
}
async function encerrar(pedido, contaId, porta) {
	const ensaioId = texto(pedido.ensaioId);
	if (!ensaioId) return recusa("ensaio_ausente");
	const ensaio = await porta.lerEnsaio(contaId, ensaioId);
	if (!ensaio) return recusa("ensaio_inexistente");
	if (ensaio.finished_at !== null) return recusa("ensaio_encerrado");
	const conversaId = ensaio.provider_conversation_id ?? texto(pedido.conversaId);
	const lida = conversaId ? await porta.buscarConversa(conversaId) : null;
	const conversa = lida && conversaDoAgente(lida, ensaio.provider_agent_id ?? null) ? lida : null;
	if (!await porta.encerrarEnsaio({
		ensaioId,
		transcricao: conversa ? { turns: conversa.turnos.map((turno) => ({
			role: turno.quem,
			text: turno.texto
		})) } : {},
		conversaId,
		duracaoSeg: conversa?.duracaoSeg ?? null
	})) return recusa("ensaio_encerrado");
	return {
		status: 200,
		corpo: {
			ok: true,
			passo: "encerrado",
			ensaioId,
			chamadaId: ensaio.call_id,
			turnos: conversa?.turnos.length ?? 0
		}
	};
}
function lerAcao(valor) {
	return typeof valor === "string" && ACOES.includes(valor) ? valor : null;
}
function lerProposito(valor) {
	return typeof valor === "string" && PROPOSITOS.includes(valor) ? valor : null;
}
function lerModo(valor) {
	return typeof valor === "string" && MODOS.includes(valor) ? valor : null;
}
function texto(valor) {
	const limpo = typeof valor === "string" ? valor.trim() : "";
	return limpo === "" ? null : limpo;
}
function recusa(motivo) {
	const caminho = CAMINHO_DA_RECUSA[motivo];
	return {
		status: STATUS[motivo],
		corpo: {
			ok: false,
			motivo,
			mensagem: MENSAGENS[motivo],
			...caminho ? { caminho } : {}
		}
	};
}
//#endregion
//#region supabase/functions/rehearsal-session/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const ENDERECO_DO_PROVEDOR = "https://api.elevenlabs.io/v1/convai";
const LIMITE_DO_PROVEDOR_MS = 2e4;
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
async function chaveDaVoz(contaId) {
	const resolvida = await cofre.resolveSecret(contaId, "voz", CHAVE_DO_PROVEDOR_DE_VOZ);
	return resolvida.ok ? resolvida.valor : null;
}
function criarPorta() {
	let contaEmVoo = null;
	return {
		async usuarioDaSessao(jwt) {
			const { data, error } = await servico.auth.getUser(jwt);
			if (error || !data.user) return null;
			return { id: data.user.id };
		},
		async papelNaConta(contaId, usuarioId) {
			contaEmVoo = contaId;
			const { data, error } = await servico.from("account_members").select("role").eq("account_id", contaId).eq("user_id", usuarioId).maybeSingle();
			if (error) throw new Error(error.message);
			return data?.role ?? null;
		},
		async contaTemAgente(contaId) {
			const { data, error } = await servico.from("agents").select("id").eq("account_id", contaId).maybeSingle();
			if (error) throw new Error(error.message);
			return data !== null;
		},
		async publicacaoDoProposito(contaId, proposito) {
			const { data, error } = await servico.from("agent_publications").select("id, provider_agent_id, status").eq("account_id", contaId).eq("purpose", proposito).maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			const { data: playbook, error: erroDoPlaybook } = await servico.from("playbooks").select("current_version_id").eq("account_id", contaId).eq("purpose", proposito).maybeSingle();
			if (erroDoPlaybook) throw new Error(erroDoPlaybook.message);
			return {
				id: data.id,
				provider_agent_id: data.status === "publicado" ? data.provider_agent_id ?? null : null,
				playbook_version_id: playbook?.current_version_id ?? null
			};
		},
		async pedirSessaoAssinada(agenteId) {
			const endpoint = "convai/conversation/get_signed_url";
			const chave = contaEmVoo ? await chaveDaVoz(contaEmVoo) : null;
			if (!chave) return {
				ok: false,
				codigo: "sem_credencial",
				status: null,
				endpoint
			};
			const inicio = Date.now();
			try {
				const resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/conversation/get_signed_url?agent_id=${encodeURIComponent(agenteId)}`, {
					headers: { "xi-api-key": chave },
					signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
				});
				let corpo = null;
				try {
					corpo = await resposta.json();
				} catch {}
				const url = corpo?.signed_url;
				return {
					ok: resposta.ok,
					status: resposta.status,
					codigo: resposta.ok ? null : String(resposta.status),
					latenciaMs: Date.now() - inicio,
					endpoint,
					urlAssinada: typeof url === "string" ? url : null,
					credencial: chave
				};
			} catch (erro) {
				return {
					ok: false,
					codigo: erro instanceof Error ? erro.name : "fetch_failed",
					status: null,
					latenciaMs: Date.now() - inicio,
					endpoint,
					credencial: chave
				};
			}
		},
		async abrirEnsaio(dados) {
			const { data, error } = await servico.rpc("abrir_ensaio", {
				p_account_id: dados.contaId,
				p_purpose: dados.proposito,
				p_mode: dados.modo,
				p_persona: dados.persona,
				p_created_by: dados.criadoPor,
				p_agent_publication_id: dados.publicacaoId,
				p_playbook_version_id: dados.versaoDoPlaybookId
			});
			if (error) throw new Error(error.message);
			const linha = (data ?? [])[0];
			if (!linha) throw new Error("abrir_ensaio não devolveu linha");
			return {
				ensaioId: linha.rehearsal_id,
				chamadaId: linha.call_id
			};
		},
		async contextoDaAbertura(contaId, chamadaId) {
			const { data: agente, error } = await servico.from("agents").select("name, company_name, first_message").eq("account_id", contaId).maybeSingle();
			if (error) throw new Error(error.message);
			if (!agente) return null;
			const { data: politica, error: erroDaPolitica } = await servico.from("account_settings").select("recording_enabled, recording_notice_text").eq("account_id", contaId).maybeSingle();
			if (erroDaPolitica) throw new Error(erroDaPolitica.message);
			const { data: chamada, error: erroDaChamada } = await servico.from("calls").select("lead_id").eq("account_id", contaId).eq("id", chamadaId).maybeSingle();
			if (erroDaChamada) throw new Error(erroDaChamada.message);
			let lead = null;
			if (chamada?.lead_id) {
				const { data: linha, error: erroDoLead } = await servico.from("leads").select("name, company, city").eq("account_id", contaId).eq("id", chamada.lead_id).maybeSingle();
				if (erroDoLead) throw new Error(erroDoLead.message);
				lead = linha ? {
					nome: linha.name ?? null,
					empresa: linha.company ?? null,
					cidade: linha.city ?? null
				} : null;
			}
			return {
				identidade: {
					nome: String(agente.name ?? ""),
					empresa: String(agente.company_name ?? ""),
					primeiraFala: agente.first_message ?? null
				},
				politica: {
					gravacaoLigada: politica?.recording_enabled !== false,
					avisoDeGravacao: politica?.recording_notice_text ?? null
				},
				lead
			};
		},
		async lerEnsaio(contaId, ensaioId) {
			const { data, error } = await servico.from("rehearsals").select("id, call_id, finished_at, agent_publication_id").eq("account_id", contaId).eq("id", ensaioId).maybeSingle();
			if (error) throw new Error(error.message);
			if (!data) return null;
			const { data: chamada, error: erroDaChamada } = await servico.from("calls").select("provider_conversation_id").eq("id", data.call_id).maybeSingle();
			if (erroDaChamada) throw new Error(erroDaChamada.message);
			let agente = null;
			if (data.agent_publication_id) {
				const { data: publicacao, error: erroDaPublicacao } = await servico.from("agent_publications").select("provider_agent_id").eq("account_id", contaId).eq("id", data.agent_publication_id).maybeSingle();
				if (erroDaPublicacao) throw new Error(erroDaPublicacao.message);
				agente = publicacao?.provider_agent_id ?? null;
			}
			return {
				id: data.id,
				call_id: data.call_id,
				finished_at: data.finished_at ?? null,
				provider_conversation_id: chamada?.provider_conversation_id ?? null,
				provider_agent_id: agente
			};
		},
		async buscarConversa(conversaId) {
			const chave = contaEmVoo ? await chaveDaVoz(contaEmVoo) : null;
			if (!chave) return null;
			try {
				const resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/conversations/${encodeURIComponent(conversaId)}`, {
					headers: { "xi-api-key": chave },
					signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
				});
				if (!resposta.ok) return null;
				const corpo = await resposta.json();
				const bruta = Array.isArray(corpo.transcript) ? corpo.transcript : [];
				const turnos = [];
				for (const item of bruta) {
					if (!item || typeof item !== "object") continue;
					const { role, message } = item;
					if (typeof message !== "string" || message.trim() === "") continue;
					turnos.push({
						quem: role === "agent" ? "agent" : "lead",
						texto: message.trim()
					});
				}
				const duracao = (corpo.metadata && typeof corpo.metadata === "object" ? corpo.metadata : {}).call_duration_secs;
				return {
					turnos,
					duracaoSeg: typeof duracao === "number" && Number.isFinite(duracao) ? duracao : null,
					agenteId: typeof corpo.agent_id === "string" ? corpo.agent_id : null
				};
			} catch {
				return null;
			}
		},
		async encerrarEnsaio(dados) {
			const { data, error } = await servico.rpc("encerrar_ensaio", {
				p_rehearsal_id: dados.ensaioId,
				p_transcript: dados.transcricao,
				p_provider_conversation_id: dados.conversaId,
				p_duration_sec: dados.duracaoSeg
			});
			if (error) throw new Error(error.message);
			return data === true;
		}
	};
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
	const resposta = await atenderEnsaio({
		metodo: requisicao.method,
		autorizacao: requisicao.headers.get("authorization"),
		contaId: corpo?.account_id ?? null,
		acao: corpo?.action ?? null,
		proposito: corpo?.purpose ?? null,
		modo: corpo?.mode ?? null,
		perfil: corpo?.persona_profile ?? null,
		ensaioId: corpo?.rehearsal_id ?? null,
		conversaId: corpo?.conversation_id ?? null
	}, criarPorta());
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
