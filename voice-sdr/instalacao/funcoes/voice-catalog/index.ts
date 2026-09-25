// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/voice-catalog/index.ts. Não edite à mão: rode `npm run pacote`.
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
function limparEspacos(texto) {
	return texto.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/,+\s*([,.;:!?])/g, "$1").replace(/([([])\s+/g, "$1").trim();
}
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
const MARCADOR = /\{([a-z_]+)\}/g;
function valoresDaConta(identidade) {
	return {
		nome_do_agente: identidade.nome,
		empresa: identidade.empresa,
		nunca_afirmar: identidade.nuncaAfirmar.length > 0 ? identidade.nuncaAfirmar.join("; ") : "a conta não listou nada"
	};
}
function interpolarPrimeiraFala$1(primeiraFala, identidade) {
	const valores = {
		...valoresDaConta(identidade),
		...LEAD_DE_EXEMPLO
	};
	return limparEspacos(primeiraFala.replace(MARCADOR, (_original, chave) => valores[chave] ?? ""));
}
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
const POR_NOME = new Map(AJUSTES_DE_VOZ.map((ajuste) => [ajuste.nome, ajuste]));
function ajustePorNome(nome) {
	return POR_NOME.get(nome.trim().toLowerCase()) ?? null;
}
function lerCatalogoDoProvedor(bruto) {
	const lista = Array.isArray(bruto) ? bruto : Array.isArray(bruto?.voices) ? bruto.voices : [];
	const vozes = [];
	for (const item of lista) {
		const voz = lerVoz(item);
		if (voz) vozes.push(voz);
	}
	return {
		recebidas: lista.length,
		vozes
	};
}
function eEmPortugues(voz) {
	if (voz.idiomas.includes("pt")) return true;
	return voz.sotaque !== null && /portug|bra[sz]il/i.test(voz.sotaque);
}
const MODELO_DA_AMOSTRA = "eleven_multilingual_v2";
function corpoDaAmostra(texto, ajustes) {
	const voice_settings = {};
	for (const ajuste of AJUSTES_DE_VOZ) {
		const valor = ajustes[ajuste.nome];
		if (typeof valor === "number") voice_settings[ajuste.campoDoProvedor] = valor;
	}
	return {
		text: texto,
		model_id: MODELO_DA_AMOSTRA,
		language_code: "pt",
		voice_settings
	};
}
function lerAjustesGravados(gravados) {
	const lidos = {};
	for (const ajuste of AJUSTES_DE_VOZ) {
		const valor = gravados[ajuste.campoDoProvedor];
		if (typeof valor === "number" && Number.isFinite(valor)) lidos[ajuste.nome] = valor;
	}
	return lidos;
}
function lerVoz(item) {
	if (typeof item !== "object" || item === null) return null;
	const bruto = item;
	const id = texto(bruto.voice_id ?? bruto.id);
	if (!id) return null;
	const rotulos = objeto(bruto.labels);
	return {
		id,
		nome: texto(bruto.name) ?? id,
		genero: lerGenero(texto(rotulos.gender)),
		sotaque: texto(rotulos.accent),
		descricao: texto(rotulos.description) ?? texto(bruto.description),
		previa: texto(bruto.preview_url),
		ajustesGravados: lerAjustesGravados(objeto(bruto.settings)),
		idiomas: lerIdiomas(bruto)
	};
}
function lerGenero(bruto) {
	if (!bruto) return null;
	const valor = bruto.trim().toLowerCase();
	if (/female|feminin|mulher/.test(valor)) return "feminina";
	if (/male|masculin|homem/.test(valor)) return "masculina";
	if (/neutral|neutro|neutra|non[-_\s]?binary/.test(valor)) return "neutra";
	return null;
}
function lerIdiomas(bruto) {
	const candidatos = [texto(bruto.language), texto(objeto(bruto.fine_tuning).language)];
	const verificados = bruto.verified_languages;
	if (Array.isArray(verificados)) for (const item of verificados) candidatos.push(typeof item === "string" ? item : texto(objeto(item).language));
	const idiomas = [];
	for (const candidato of candidatos) {
		const codigo = candidato?.trim().toLowerCase().slice(0, 2);
		if (codigo && !idiomas.includes(codigo)) idiomas.push(codigo);
	}
	return idiomas;
}
function texto(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
function objeto(valor) {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? valor : {};
}
//#endregion
//#region supabase/functions/voice-catalog/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas GET e POST.",
	conta_ausente: "O pedido veio sem a conta cujas vozes seriam listadas.",
	sem_sessao: "Entre na sua conta para ouvir as vozes.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para ouvir as vozes.",
	sem_acesso: "Você não tem acesso a esta conta.",
	falha_interna: "Não foi possível listar as vozes agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_invalido: 405,
	conta_ausente: 400,
	sem_sessao: 401,
	sessao_invalida: 401,
	sem_acesso: 403,
	falha_interna: 500
};
const MENSAGENS_DA_AUSENCIA = {
	sem_chave: "Nenhuma chave cadastrada para o provedor de voz. Cadastre a chave em Integrações para ouvir as vozes.",
	plataforma_bloqueada: "Existe uma chave da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações."
};
const MENSAGENS_DA_AMOSTRA = {
	sem_agente: "Esta conta ainda não tem uma assistente montada. Configure a identidade dela para ouvir a abertura.",
	sem_primeira_fala: "Escreva a primeira fala da assistente para ouvir como ela vai soar nesta voz. A amostra usa a sua abertura, e não uma frase de catálogo.",
	voz_desconhecida: "Esta voz não está mais no catálogo em português do provedor. Escolha uma da lista ao lado.",
	provedor_recusou: "O provedor de voz recusou gerar a amostra. Confira a chave em Integrações e tente de novo.",
	provedor_indisponivel: "O provedor de voz não respondeu a tempo. A lista continua válida, e a amostra pode ser pedida de novo em alguns minutos."
};
const CHAVE_DO_PROVEDOR_DE_VOZ = "api_key";
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
const METODOS = new Set(["GET", "POST"]);
var RecusaDoPedido = class extends Error {
	motivo;
	constructor(motivo) {
		super(motivo);
		this.motivo = motivo;
	}
};
var FalhaDaLista = class extends Error {
	estado;
	falha;
	constructor(estado, falha) {
		super(falha.motivo);
		this.estado = estado;
		this.falha = falha;
	}
};
function criarCatalogoDeVozes(opcoes) {
	const { porta } = opcoes;
	const agora = opcoes.agora ?? Date.now;
	const instante = opcoes.instante ?? (() => new Date());
	const ttlMs = opcoes.ttlMs ?? 6e4;
	const cache = new Map();
	async function atender(pedido) {
		if (!METODOS.has(pedido.metodo.toUpperCase())) return recusa("metodo_invalido");
		const contaId = typeof pedido.contaId === "string" ? pedido.contaId.trim() : "";
		if (!contaId) return recusa("conta_ausente");
		const jwt = extrairJwt(pedido.autorizacao);
		if (!jwt) return recusa("sem_sessao");
		try {
			const usuario = await porta.usuarioDaSessao(jwt);
			if (!usuario) return recusa("sessao_invalida");
			if (!await porta.papelNaConta(contaId, usuario.id)) return recusa("sem_acesso");
			return await responder(contaId, pedido);
		} catch (erro) {
			if (erro instanceof RecusaDoPedido) return recusa(erro.motivo);
			return recusa("falha_interna");
		}
	}
	async function responder(contaId, pedido) {
		const resolucao = await porta.credencial(contaId, "voz", CHAVE_DO_PROVEDOR_DE_VOZ);
		if (!resolucao.ok) {
			const motivo = resolucao.motivo === "plataforma_bloqueada" ? "plataforma_bloqueada" : "sem_chave";
			return semCatalogo(contaId, "nao_configurado", {
				motivo,
				mensagem: MENSAGENS_DA_AUSENCIA[motivo]
			});
		}
		const credencial = resolucao.valor;
		const vozPedida = typeof pedido.vozId === "string" ? pedido.vozId.trim() : "";
		let lista;
		let doCache;
		try {
			const busca = buscarLista(contaId, credencial);
			doCache = busca.doCache;
			lista = await busca.lista;
		} catch (erro) {
			if (erro instanceof FalhaDaLista) return semCatalogo(contaId, erro.estado, erro.falha);
			throw erro;
		}
		const { amostra, pendencia } = vozPedida ? await ouvirAbertura(contaId, vozPedida, pedido.ajustes, lista, credencial) : {
			amostra: null,
			pendencia: null
		};
		const corpo = {
			ok: true,
			contaId,
			consultadoEm: instante().toISOString(),
			estado: "conectado",
			vozes: lista.vozes,
			vozesIgnoradas: lista.vozesIgnoradas,
			doCache,
			amostra,
			pendenciaDaAmostra: pendencia,
			erro: null
		};
		conferirQueNaoVazou(corpo, [credencial], "o catálogo de vozes carregava o valor de uma credencial");
		return {
			status: 200,
			corpo
		};
	}
	function buscarLista(contaId, credencial) {
		const guardada = cache.get(contaId);
		if (guardada && guardada.expiraEm > agora()) return {
			lista: guardada.lista,
			doCache: true
		};
		const lista = consultarProvedor(contaId, credencial);
		cache.set(contaId, {
			lista,
			expiraEm: agora() + ttlMs
		});
		lista.catch(() => {
			if (cache.get(contaId)?.lista === lista) cache.delete(contaId);
		});
		return {
			lista,
			doCache: false
		};
	}
	async function consultarProvedor(contaId, credencial) {
		const resposta = await listarComSeguranca(() => porta.listarVozes(contaId, credencial));
		if (!resposta.ok) {
			const { motivo, mensagem } = traduzirErroDoProvedor(resposta.codigo, resposta.status);
			throw new FalhaDaLista(eFalhaDoProvedor(motivo) ? "indisponivel" : "erro", {
				motivo,
				mensagem
			});
		}
		const { recebidas, vozes } = lerCatalogoDoProvedor(resposta.vozes);
		const emPortugues = vozes.filter(eEmPortugues);
		return {
			vozes: emPortugues.map(paraOCatalogo),
			vozesIgnoradas: recebidas - emPortugues.length,
			emPortugues: new Set(emPortugues.map((voz) => voz.id))
		};
	}
	async function ouvirAbertura(contaId, vozId, ajustesPedidos, lista, credencial) {
		if (!lista.emPortugues.has(vozId)) return {
			amostra: null,
			pendencia: pendente("voz_desconhecida")
		};
		const agente = await porta.agenteDaConta(contaId);
		if (!agente) return {
			amostra: null,
			pendencia: pendente("sem_agente")
		};
		const primeiraFala = agente.first_message?.trim() ?? "";
		if (!primeiraFala) return {
			amostra: null,
			pendencia: pendente("sem_primeira_fala")
		};
		const texto = interpolarPrimeiraFala(primeiraFala, agente);
		const ajustes = resolverAjustes(ajustesPedidos, agente.voice_settings);
		const resposta = await sintetizarComSeguranca(() => porta.sintetizarAmostra({
			contaId,
			vozId,
			texto,
			ajustes,
			corpo: corpoDaAmostra(texto, ajustes),
			credencial
		}));
		if (!resposta.ok || !resposta.audioBase64) {
			const { motivo } = traduzirErroDoProvedor(resposta.codigo, resposta.status);
			return {
				amostra: null,
				pendencia: pendente(eFalhaDoProvedor(motivo) ? "provedor_indisponivel" : "provedor_recusou")
			};
		}
		return {
			amostra: {
				vozId,
				texto,
				ajustes,
				formato: resposta.formato?.trim() || "audio/mpeg",
				audioBase64: resposta.audioBase64
			},
			pendencia: null
		};
	}
	function semCatalogo(contaId, estado, erro) {
		return {
			status: 200,
			corpo: {
				ok: true,
				contaId,
				consultadoEm: instante().toISOString(),
				estado,
				vozes: [],
				vozesIgnoradas: 0,
				doCache: false,
				amostra: null,
				pendenciaDaAmostra: null,
				erro
			}
		};
	}
	return {
		atender,
		invalidar: (contaId) => void cache.delete(contaId.trim()),
		limpar: () => cache.clear()
	};
}
function extrairJwt(autorizacao) {
	return PREFIXO_BEARER.exec(autorizacao?.trim() ?? "")?.[1]?.trim() || null;
}
function interpolarPrimeiraFala(primeiraFala, agente) {
	return interpolarPrimeiraFala$1(primeiraFala, {
		nome: agente.name,
		empresa: agente.company_name,
		nuncaAfirmar: agente.never_claim
	});
}
function resolverAjustes(pedidos, gravados) {
	const daConta = lerAjustesGravados(gravados);
	const daTela = objetoDoPedido(pedidos);
	const resolvidos = {};
	for (const ajuste of AJUSTES_DE_VOZ) {
		const pedido = daTela[ajuste.nome];
		const escolhido = typeof pedido === "number" && Number.isFinite(pedido) ? pedido : daConta[ajuste.nome] ?? ajuste.padrao;
		resolvidos[ajuste.nome] = Math.min(ajuste.maximo, Math.max(ajuste.minimo, escolhido));
	}
	return resolvidos;
}
function objetoDoPedido(pedidos) {
	if (typeof pedidos !== "object" || pedidos === null) return {};
	const lidos = {};
	for (const [chave, valor] of Object.entries(pedidos)) {
		const ajuste = ajustePorNome(chave);
		if (!ajuste) continue;
		const numero = typeof valor === "string" ? Number(valor) : valor;
		if (typeof numero === "number" && Number.isFinite(numero)) lidos[ajuste.nome] = numero;
	}
	return lidos;
}
function paraOCatalogo(voz) {
	return {
		id: voz.id,
		nome: voz.nome,
		genero: voz.genero,
		sotaque: voz.sotaque,
		descricao: voz.descricao,
		previa: voz.previa,
		ajustesAceitos: AJUSTES_DE_VOZ.map((ajuste) => ({
			nome: ajuste.nome,
			rotulo: ajuste.rotulo,
			explicacao: ajuste.explicacao,
			minimo: ajuste.minimo,
			maximo: ajuste.maximo,
			padrao: voz.ajustesGravados[ajuste.nome] ?? ajuste.padrao,
			passo: ajuste.passo
		}))
	};
}
async function listarComSeguranca(chamada) {
	try {
		return await chamada();
	} catch {
		return {
			ok: false,
			codigo: "timeout"
		};
	}
}
async function sintetizarComSeguranca(chamada) {
	try {
		return await chamada();
	} catch {
		return {
			ok: false,
			codigo: "timeout"
		};
	}
}
function pendente(motivo) {
	return {
		motivo,
		mensagem: MENSAGENS_DA_AMOSTRA[motivo]
	};
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
//#region supabase/functions/voice-catalog/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const ENDERECO_DO_PROVEDOR = "https://api.elevenlabs.io/v1";
const LIMITE_DA_LISTA_MS = 1e4;
const LIMITE_DA_AMOSTRA_MS = 2e4;
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
	"access-control-allow-methods": "GET, POST, OPTIONS"
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
const catalogo = criarCatalogoDeVozes({ porta: {
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
	async agenteDaConta(contaId) {
		const { data, error } = await servico.from("agents").select("name, company_name, never_claim, voice_settings, first_message").eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const linha = data;
		return {
			name: String(linha.name ?? ""),
			company_name: String(linha.company_name ?? ""),
			never_claim: Array.isArray(linha.never_claim) ? linha.never_claim : [],
			voice_settings: typeof linha.voice_settings === "object" && linha.voice_settings !== null ? linha.voice_settings : {},
			first_message: linha.first_message ?? null
		};
	},
	credencial(contaId, provedor, chave) {
		return cofre.resolveSecret(contaId, provedor, chave);
	},
	listarVozes(_contaId, credencial) {
		return listarVozes(credencial);
	},
	sintetizarAmostra(pedido) {
		return sintetizarAmostra(pedido);
	}
} });
async function listarVozes(credencial) {
	let resposta;
	try {
		resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/voices`, {
			headers: { "xi-api-key": credencial },
			signal: AbortSignal.timeout(LIMITE_DA_LISTA_MS)
		});
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null
		};
	}
	let corpo = {};
	try {
		corpo = await resposta.json();
	} catch {}
	if (!resposta.ok) return {
		ok: false,
		codigo: codigoDoErro(corpo),
		status: resposta.status
	};
	return {
		ok: true,
		vozes: corpo,
		status: resposta.status
	};
}
async function sintetizarAmostra(pedido) {
	let resposta;
	try {
		resposta = await fetch(`${ENDERECO_DO_PROVEDOR}/text-to-speech/${encodeURIComponent(pedido.vozId)}`, {
			method: "POST",
			headers: {
				"xi-api-key": pedido.credencial,
				"content-type": "application/json",
				accept: "audio/mpeg"
			},
			body: JSON.stringify(pedido.corpo),
			signal: AbortSignal.timeout(LIMITE_DA_AMOSTRA_MS)
		});
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null
		};
	}
	if (!resposta.ok) {
		let corpo = {};
		try {
			corpo = await resposta.json();
		} catch {}
		return {
			ok: false,
			codigo: codigoDoErro(corpo),
			status: resposta.status
		};
	}
	return {
		ok: true,
		audioBase64: emBase64(new Uint8Array(await resposta.arrayBuffer())),
		formato: resposta.headers.get("content-type") ?? "audio/mpeg",
		status: resposta.status
	};
}
function codigoDoErro(corpo) {
	const detalhe = corpo.detail ?? corpo.error ?? corpo;
	const codigo = typeof detalhe === "string" ? detalhe : detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null;
	return codigo === null ? null : String(codigo);
}
function emBase64(bytes) {
	const pedaco = 32768;
	let texto = "";
	for (let inicio = 0; inicio < bytes.length; inicio += pedaco) texto += String.fromCharCode(...bytes.subarray(inicio, inicio + pedaco));
	return btoa(texto);
}
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	const endereco = new URL(requisicao.url);
	let contaId = endereco.searchParams.get("contaId");
	let vozId = endereco.searchParams.get("vozId");
	let ajustes = null;
	if (requisicao.method === "POST") try {
		const corpo = await requisicao.json();
		contaId = corpo?.contaId ?? corpo?.conta_id ?? contaId;
		vozId = corpo?.vozId ?? corpo?.voz_id ?? vozId;
		ajustes = corpo?.ajustes ?? null;
	} catch {}
	const resposta = await catalogo.atender({
		metodo: requisicao.method,
		contaId,
		autorizacao: requisicao.headers.get("authorization"),
		vozId,
		ajustes
	});
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
