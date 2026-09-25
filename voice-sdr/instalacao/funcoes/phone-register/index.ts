// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/phone-register/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/_shared/telefonia/conta-no-endereco.ts
const PARAMETRO_DA_CONTA = "conta";
function enderecoComConta(base, contaId) {
	const endereco = new URL(base);
	endereco.searchParams.set(PARAMETRO_DA_CONTA, contaId);
	return endereco.toString();
}
//#endregion
//#region supabase/functions/phone-register/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido veio sem a conta cuja linha seria registrada.",
	linha_ausente: "O pedido veio sem a linha telefônica a registrar.",
	sem_sessao: "Entre na sua conta para registrar o número.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para registrar o número.",
	sem_acesso: "Você não tem acesso a esta conta.",
	papel_insuficiente: "Registrar um número é configuração da conta. Peça a quem administra a conta para fazer o registro.",
	linha_desconhecida: "Esta linha telefônica não existe nesta conta.",
	numero_nao_encontrado: "Este número não está na conta de telefonia desta conta. Confira o número e as chaves da telefonia em Integrações.",
	sem_credencial_de_telefonia: "Faltam as chaves da telefonia desta conta. Cadastre o identificador e o token em Integrações para registrar o número.",
	telefonia_bloqueada: "Existem chaves de telefonia da plataforma, mas esta conta precisa usar as próprias. Cadastre as chaves desta conta em Integrações.",
	sem_credencial_de_voz: "Falta a chave do provedor de voz desta conta. Cadastre a chave em Integrações para o número atender pela assistente.",
	voz_bloqueada: "Existe uma chave do provedor de voz da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta em Integrações.",
	sem_publicacao: "A assistente ainda não foi publicada nesta conta. Publique o agente antes de apontar o número para ela.",
	falha_ao_gravar: "O número foi configurado no provedor, mas o registro não foi gravado aqui. Peça o registro de novo em alguns minutos.",
	falha_interna: "Não foi possível registrar o número agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_invalido: 405,
	conta_ausente: 400,
	linha_ausente: 400,
	sem_sessao: 401,
	sessao_invalida: 401,
	sem_acesso: 403,
	papel_insuficiente: 403,
	linha_desconhecida: 404,
	numero_nao_encontrado: 404,
	sem_credencial_de_telefonia: 409,
	telefonia_bloqueada: 409,
	sem_credencial_de_voz: 409,
	voz_bloqueada: 409,
	sem_publicacao: 409,
	falha_ao_gravar: 500,
	falha_interna: 500
};
const MENSAGENS_DO_ESTADO = {
	registrado: "O número está registrado e atende conforme o comportamento escolhido.",
	inalterado: "O número já estava registrado com este comportamento. Nada mudou no provedor.",
	aguardando_aprovacao: "O registro foi aberto e está aguardando aprovação da operadora. Isso leva alguns dias, e não é preciso pedir de novo."
};
const STATUS_DA_FALHA_DO_PROVEDOR = {
	recusou: 502,
	indisponivel: 503
};
//#endregion
//#region supabase/functions/phone-register/registro.ts
const PROVEDOR_DE_TELEFONIA = "telefonia";
const CHAVE_DO_IDENTIFICADOR = "account_sid";
const CHAVE_DO_TOKEN = "auth_token";
const CHAVE_DO_PROVEDOR_DE_VOZ = "api_key";
const PAPEIS_QUE_REGISTRAM = new Set(["owner", "admin"]);
const PROPOSITO_DA_ENTRADA = "discovery";
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
var RecusaDoPedido = class extends Error {
	motivo;
	constructor(motivo) {
		super(motivo);
		this.motivo = motivo;
	}
};
var RecusaDoProvedor = class extends Error {
	motivo;
	frase;
	constructor(codigo, status) {
		const traduzido = traduzirErroDoProvedor(codigo, status);
		super(traduzido.motivo);
		this.motivo = traduzido.motivo;
		this.frase = traduzido.mensagem;
	}
};
async function atenderRegistro(pedido, porta, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const contaId = typeof pedido.contaId === "string" ? pedido.contaId.trim() : "";
	if (!contaId) return recusa("conta_ausente");
	const linhaId = typeof pedido.linhaId === "string" ? pedido.linhaId.trim() : "";
	if (!linhaId) return recusa("linha_ausente");
	const jwt = extrairJwt(pedido.autorizacao);
	if (!jwt) return recusa("sem_sessao");
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sessao_invalida");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (!papel) return recusa("sem_acesso");
		if (!PAPEIS_QUE_REGISTRAM.has(papel)) return recusa("papel_insuficiente");
		return await registrar(contaId, linhaId, porta, opcoes);
	} catch (erro) {
		if (erro instanceof RecusaDoPedido) return recusa(erro.motivo);
		if (erro instanceof RecusaDoProvedor) return {
			status: eFalhaDoProvedor(erro.motivo) ? STATUS_DA_FALHA_DO_PROVEDOR.indisponivel : STATUS_DA_FALHA_DO_PROVEDOR.recusou,
			corpo: {
				ok: false,
				motivo: erro.motivo,
				mensagem: erro.frase
			}
		};
		return recusa("falha_interna");
	}
}
async function registrar(contaId, linhaId, porta, opcoes) {
	const linha = await porta.linhaDaConta(contaId, linhaId);
	if (!linha) throw new RecusaDoPedido("linha_desconhecida");
	const destino = destinoDoComportamento(linha.inbound_behavior);
	const vigente = destinoVigente(linha);
	if (vigente === destino) return pronto(linha, destino, "inalterado", {
		providerNumberId: linha.provider_number_id,
		providerVoiceId: linha.provider_voice_id,
		sobrouNoProvedorDeVoz: false,
		semRegistro: false
	});
	const identificador = await exigirCredencial(porta, contaId, PROVEDOR_DE_TELEFONIA, CHAVE_DO_IDENTIFICADOR, "sem_credencial_de_telefonia", "telefonia_bloqueada");
	const token = await exigirCredencial(porta, contaId, PROVEDOR_DE_TELEFONIA, CHAVE_DO_TOKEN, "sem_credencial_de_telefonia", "telefonia_bloqueada");
	const eventos = [];
	const busca = await porta.numeroNaTelefonia({
		contaId,
		e164: linha.e164,
		identificador,
		token
	});
	eventos.push(evento(contaId, PROVEDOR_DE_TELEFONIA, "numeros", { e164: linha.e164 }, busca));
	if (!busca.ok) throw new RecusaDoProvedor(busca.codigo, busca.status);
	const providerNumberId = busca.providerNumberId?.trim() ?? "";
	if (!providerNumberId) throw new RecusaDoPedido("numero_nao_encontrado");
	let providerVoiceId = null;
	let estado = "registrado";
	let sobrouNoProvedorDeVoz = false;
	if (destino === "voz") {
		const credencialDeVoz = await exigirCredencial(porta, contaId, "voz", CHAVE_DO_PROVEDOR_DE_VOZ, "sem_credencial_de_voz", "voz_bloqueada");
		const publicacao = await porta.publicacaoDeEntrada(contaId);
		if (!publicacao) throw new RecusaDoPedido("sem_publicacao");
		const importacao = await porta.importarNoProvedorDeVoz({
			contaId,
			e164: linha.e164,
			identificador,
			token,
			providerNumberId,
			rotulo: linha.label,
			providerAgentId: publicacao.provider_agent_id,
			credencialDeVoz,
			providerVoiceId: linha.provider_voice_id
		});
		eventos.push(evento(contaId, "voz", "telefones", { e164: linha.e164 }, importacao));
		if (!importacao.ok) throw new RecusaDoProvedor(importacao.codigo, importacao.status);
		providerVoiceId = importacao.providerVoiceId?.trim() || null;
		if (importacao.pendente) estado = "aguardando_aprovacao";
	} else {
		if (vigente === "voz" && linha.provider_voice_id) {
			const credencialDeVoz = await porta.credencial(contaId, "voz", CHAVE_DO_PROVEDOR_DE_VOZ);
			if (credencialDeVoz.ok) {
				const remocao = await porta.removerDoProvedorDeVoz({
					contaId,
					providerVoiceId: linha.provider_voice_id,
					credencialDeVoz: credencialDeVoz.valor
				});
				eventos.push(evento(contaId, "voz", "telefones", { remover: true }, remocao));
				sobrouNoProvedorDeVoz = !remocao.ok;
			} else sobrouNoProvedorDeVoz = true;
		}
		const webhookDeVoz = enderecoComConta(opcoes.enderecoDoAtendimento, contaId);
		const apontamento = await porta.apontarWebhookDeVoz({
			contaId,
			e164: linha.e164,
			identificador,
			token,
			providerNumberId,
			webhookDeVoz
		});
		eventos.push(evento(contaId, PROVEDOR_DE_TELEFONIA, "numeros", {
			providerNumberId,
			webhookDeVoz
		}, apontamento));
		if (!apontamento.ok) throw new RecusaDoProvedor(apontamento.codigo, apontamento.status);
	}
	let semRegistro = false;
	try {
		await porta.gravarRegistro({
			linhaId,
			contaId,
			providerNumberId,
			providerVoiceId
		});
	} catch {
		throw new RecusaDoPedido("falha_ao_gravar");
	}
	for (const item of eventos) try {
		await porta.registrarEventoDeIntegracao(item);
	} catch {
		semRegistro = true;
	}
	return pronto(linha, destino, estado, {
		providerNumberId,
		providerVoiceId,
		sobrouNoProvedorDeVoz,
		semRegistro
	});
}
function pronto(linha, destino, estado, desfecho) {
	return {
		status: 200,
		corpo: {
			ok: true,
			contaId: linha.account_id,
			linhaId: linha.id,
			e164: linha.e164,
			comportamento: linha.inbound_behavior,
			destino,
			estado,
			mensagem: MENSAGENS_DO_ESTADO[estado],
			...desfecho
		}
	};
}
function destinoDoComportamento(comportamento) {
	return comportamento === "agent" ? "voz" : "webhook";
}
function destinoVigente(linha) {
	if (!linha.provider_number_id?.trim()) return null;
	return linha.provider_voice_id?.trim() ? "voz" : "webhook";
}
async function exigirCredencial(porta, contaId, provedor, chave, semChave, bloqueada) {
	const resolucao = await porta.credencial(contaId, provedor, chave);
	if (resolucao.ok) return resolucao.valor;
	throw new RecusaDoPedido(resolucao.motivo === "plataforma_bloqueada" ? bloqueada : semChave);
}
function evento(contaId, provedor, endpointPadrao, request, resposta) {
	return {
		account_id: contaId,
		direction: "outbound",
		provider: provedor,
		endpoint: resposta.endpoint ?? endpointPadrao,
		request,
		response: resposta.corpo ?? {},
		status_code: resposta.status ?? null,
		latency_ms: resposta.latenciaMs ?? null,
		correlation_id: null
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
function extrairJwt(autorizacao) {
	return PREFIXO_BEARER.exec(autorizacao?.trim() ?? "")?.[1]?.trim() || null;
}
async function registrarNumero(pedido, porta, opcoes) {
	const vistos = [];
	const resposta = await atenderRegistro(pedido, {
		...porta,
		async credencial(contaId, provedor, chave) {
			const resolucao = await porta.credencial(contaId, provedor, chave);
			if (resolucao.ok) vistos.push(resolucao.valor);
			return resolucao;
		}
	}, opcoes);
	try {
		conferirQueNaoVazou(resposta.corpo, vistos, "credencial no corpo de phone-register");
	} catch {
		return recusa("falha_interna");
	}
	return resposta;
}
//#endregion
//#region supabase/functions/phone-register/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const ENDERECO_DA_TELEFONIA = "https://api.twilio.com/2010-04-01";
const ENDERECO_DO_PROVEDOR_DE_VOZ = "https://api.elevenlabs.io/v1";
const ENDERECO_DO_ATENDIMENTO = Deno.env.get("SARAH_INBOUND_TWIML_URL") ?? `${(Deno.env.get("SUPABASE_URL") ?? "").replace(/\/+$/, "")}/functions/v1/inbound-twiml`;
const LIMITE_DO_PROVEDOR_MS = 2e4;
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
	async linhaDaConta(contaId, linhaId) {
		const { data, error } = await servico.from("phone_lines").select("id, account_id, e164, label, inbound_behavior, forward_to, provider_number_id, provider_voice_id").eq("account_id", contaId).eq("id", linhaId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const linha = data;
		return {
			id: String(linha.id ?? ""),
			account_id: String(linha.account_id ?? ""),
			e164: String(linha.e164 ?? ""),
			label: String(linha.label ?? ""),
			inbound_behavior: String(linha.inbound_behavior ?? ""),
			forward_to: linha.forward_to ?? null,
			provider_number_id: linha.provider_number_id ?? null,
			provider_voice_id: linha.provider_voice_id ?? null
		};
	},
	async publicacaoDeEntrada(contaId) {
		const { data, error } = await servico.from("agent_publications").select("provider_agent_id").eq("account_id", contaId).eq("purpose", PROPOSITO_DA_ENTRADA).eq("status", "publicado").maybeSingle();
		if (error) throw new Error(error.message);
		const publicacao = data?.provider_agent_id;
		return publicacao ? { provider_agent_id: publicacao } : null;
	},
	credencial(contaId, provedor, chave) {
		return cofre.resolveSecret(contaId, provedor, chave);
	},
	numeroNaTelefonia,
	importarNoProvedorDeVoz,
	apontarWebhookDeVoz,
	removerDoProvedorDeVoz,
	async gravarRegistro(linha) {
		const { error } = await servico.from("phone_lines").update({
			provider_number_id: linha.providerNumberId,
			provider_voice_id: linha.providerVoiceId
		}).eq("account_id", linha.contaId).eq("id", linha.linhaId);
		if (error) throw new Error(error.message);
	},
	async registrarEventoDeIntegracao(evento) {
		const { error } = await servico.from("integration_events").insert(evento);
		if (error) throw new Error(error.message);
	}
};
function autorizacaoDaTelefonia(identificador, token) {
	return `Basic ${btoa(`${identificador}:${token}`)}`;
}
async function numeroNaTelefonia(pedido) {
	const endpoint = `Accounts/${pedido.identificador}/IncomingPhoneNumbers.json`;
	const endereco = new URL(`${ENDERECO_DA_TELEFONIA}/${endpoint}`);
	endereco.searchParams.set("PhoneNumber", pedido.e164);
	const inicio = Date.now();
	let resposta;
	try {
		resposta = await fetch(endereco, {
			headers: { authorization: autorizacaoDaTelefonia(pedido.identificador, pedido.token) },
			signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
		});
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - inicio,
			endpoint
		};
	}
	const corpo = await corpoJson(resposta);
	const latenciaMs = Date.now() - inicio;
	if (!resposta.ok) return {
		ok: false,
		codigo: codigoDoErro(corpo),
		status: resposta.status,
		latenciaMs,
		endpoint
	};
	const lista = Array.isArray(corpo.incoming_phone_numbers) ? corpo.incoming_phone_numbers : [];
	const primeiro = lista[0] ?? {};
	return {
		ok: true,
		providerNumberId: typeof primeiro.sid === "string" ? primeiro.sid : null,
		status: resposta.status,
		latenciaMs,
		corpo: { encontrados: lista.length },
		endpoint
	};
}
async function importarNoProvedorDeVoz(pedido) {
	const criando = !pedido.providerVoiceId;
	const endpoint = criando ? "convai/phone-numbers" : `convai/phone-numbers/${pedido.providerVoiceId}`;
	const inicio = Date.now();
	let resposta;
	try {
		resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
			method: criando ? "POST" : "PATCH",
			headers: {
				"xi-api-key": pedido.credencialDeVoz,
				"content-type": "application/json"
			},
			body: JSON.stringify({
				provider: "twilio",
				phone_number: pedido.e164,
				label: pedido.rotulo,
				sid: pedido.identificador,
				token: pedido.token,
				agent_id: pedido.providerAgentId
			}),
			signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
		});
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - inicio,
			endpoint
		};
	}
	const corpo = await corpoJson(resposta);
	const latenciaMs = Date.now() - inicio;
	if (!resposta.ok) return {
		ok: false,
		codigo: codigoDoErro(corpo),
		status: resposta.status,
		latenciaMs,
		endpoint
	};
	const estado = typeof corpo.status === "string" ? corpo.status : "";
	return {
		ok: true,
		providerVoiceId: typeof corpo.phone_number_id === "string" ? corpo.phone_number_id : pedido.providerVoiceId ?? null,
		pendente: /pending|awaiting|review/i.test(estado),
		status: resposta.status,
		latenciaMs,
		corpo: { status: estado },
		endpoint
	};
}
async function apontarWebhookDeVoz(pedido) {
	const endpoint = `Accounts/${pedido.identificador}/IncomingPhoneNumbers/${pedido.providerNumberId}.json`;
	const corpoDoPedido = new URLSearchParams({
		VoiceUrl: pedido.webhookDeVoz,
		VoiceMethod: "POST"
	});
	const inicio = Date.now();
	let resposta;
	try {
		resposta = await fetch(`${ENDERECO_DA_TELEFONIA}/${endpoint}`, {
			method: "POST",
			headers: {
				authorization: autorizacaoDaTelefonia(pedido.identificador, pedido.token),
				"content-type": "application/x-www-form-urlencoded"
			},
			body: corpoDoPedido,
			signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
		});
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - inicio,
			endpoint
		};
	}
	const corpo = await corpoJson(resposta);
	const latenciaMs = Date.now() - inicio;
	if (!resposta.ok) return {
		ok: false,
		codigo: codigoDoErro(corpo),
		status: resposta.status,
		latenciaMs,
		endpoint
	};
	return {
		ok: true,
		status: resposta.status,
		latenciaMs,
		corpo: {},
		endpoint
	};
}
async function removerDoProvedorDeVoz(pedido) {
	const endpoint = `convai/phone-numbers/${pedido.providerVoiceId}`;
	const inicio = Date.now();
	let resposta;
	try {
		resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
			method: "DELETE",
			headers: { "xi-api-key": pedido.credencialDeVoz },
			signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
		});
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - inicio,
			endpoint
		};
	}
	const latenciaMs = Date.now() - inicio;
	if (!resposta.ok) return {
		ok: false,
		codigo: codigoDoErro(await corpoJson(resposta)),
		status: resposta.status,
		latenciaMs,
		endpoint
	};
	return {
		ok: true,
		status: resposta.status,
		latenciaMs,
		corpo: {},
		endpoint
	};
}
async function corpoJson(resposta) {
	try {
		return await resposta.json();
	} catch {
		return {};
	}
}
function codigoDoErro(corpo) {
	const detalhe = corpo.detail ?? corpo.error ?? corpo;
	const codigo = typeof detalhe === "string" ? detalhe : detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null;
	return codigo === null ? null : String(codigo);
}
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	let contaId = null;
	let linhaId = null;
	try {
		const corpo = await requisicao.json();
		contaId = corpo?.contaId ?? corpo?.conta_id ?? null;
		linhaId = corpo?.linhaId ?? corpo?.linha_id ?? null;
	} catch {}
	const resposta = await registrarNumero({
		metodo: requisicao.method,
		contaId,
		linhaId,
		autorizacao: requisicao.headers.get("authorization")
	}, porta, { enderecoDoAtendimento: ENDERECO_DO_ATENDIMENTO });
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
