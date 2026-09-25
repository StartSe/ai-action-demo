// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/call-cancel/index.ts. Não edite à mão: rode `npm run pacote`.
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
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
}
//#endregion
//#region supabase/functions/call-cancel/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	sem_sessao: "Entre na sua conta para cancelar a chamada.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para cancelar a chamada.",
	alvo_invalido: "O pedido precisa trazer a chamada ou o item da fila, e só um dos dois.",
	alvo_desconhecido: "Chamada não encontrada.",
	papel_insuficiente: "Cancelar chamada exige o papel de operador, administrador ou dono da conta.",
	em_discagem: "A discagem deste item já começou. Aguarde alguns segundos e cancele a chamada que ela abriu.",
	em_transicao: "A chamada mudou de estado durante o pedido. Tente cancelar de novo.",
	sem_identificador_no_provedor: "Esta chamada não tem identificador na telefonia, e por isso não pode ser encerrada daqui.",
	credencial_indisponivel: "A credencial da telefonia desta conta não está disponível. Confira em Integrações.",
	provedor_nao_encerrou: "A telefonia não confirmou o encerramento. A chamada continua em curso; tente cancelar de novo.",
	falha_interna: "Não foi possível cancelar agora. Tente de novo em alguns segundos."
};
const STATUS = {
	metodo_invalido: 405,
	sem_sessao: 401,
	sessao_invalida: 401,
	alvo_invalido: 400,
	alvo_desconhecido: 404,
	papel_insuficiente: 403,
	em_discagem: 409,
	em_transicao: 409,
	sem_identificador_no_provedor: 422,
	credencial_indisponivel: 503,
	provedor_nao_encerrou: 502,
	falha_interna: 500
};
const MENSAGENS_DO_ESTADO = {
	retirado_da_fila: "Discagem retirada da fila. A assistente não vai ligar.",
	cancelada_antes_de_discar: "Chamada cancelada antes de discar.",
	encerrando: "Chamada sendo encerrada. A ficha é atualizada quando a telefonia confirmar o fim.",
	ja_retirado: "Esta discagem já tinha saído da fila.",
	ja_cancelada: "Esta chamada já estava cancelada.",
	ja_encerrada: "Esta chamada já tinha terminado."
};
//#endregion
//#region supabase/functions/call-cancel/cancelamento.ts
const PAPEIS_QUE_CANCELAM = new Set([
	"owner",
	"admin",
	"operator"
]);
const PROVEDOR_DE_TELEFONIA = "telefonia";
const CHAVE_DO_IDENTIFICADOR = "account_sid";
const CHAVE_DO_TOKEN = "auth_token";
const FONTE_DA_TRILHA = "edge:call-cancel";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
const VIVOS = new Set([
	"queued",
	"ringing",
	"in_progress"
]);
var RecusaDoPedido = class extends Error {
	motivo;
	constructor(motivo) {
		super(motivo);
		this.motivo = motivo;
	}
};
async function cancelar(pedido, porta, opcoes) {
	const credenciais = [];
	let resposta;
	try {
		resposta = await conduzir(pedido, porta, opcoes, credenciais);
	} catch (erro) {
		resposta = recusa(erro instanceof RecusaDoPedido ? erro.motivo : "falha_interna");
	}
	try {
		conferirQueNaoVazou(resposta.corpo, credenciais, "credencial no corpo de call-cancel");
	} catch {
		return recusa("falha_interna");
	}
	return resposta;
}
async function conduzir(pedido, porta, opcoes, credenciais) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const jwt = extrairJwt(pedido.autorizacao);
	if (!jwt) return recusa("sem_sessao");
	const chamadaId = uuid(pedido.chamadaId);
	const itemId = uuid(pedido.itemDaFilaId);
	if ([pedido.chamadaId, pedido.itemDaFilaId].filter((v) => v !== null && v !== void 0).length !== 1 || chamadaId === null && itemId === null) return recusa("alvo_invalido");
	const usuario = await porta.usuarioDaSessao(jwt);
	if (!usuario) return recusa("sessao_invalida");
	const contexto = {
		usuarioId: usuario.id,
		motivo: texto(pedido.motivo),
		agora: opcoes.agora,
		porta,
		credenciais
	};
	if (itemId !== null) return cancelarItem(itemId, contexto);
	return cancelarChamada(chamadaId ?? "", contexto);
}
async function cancelarItem(itemId, contexto) {
	const { porta } = contexto;
	const item = await porta.itemDaFila(itemId);
	if (!item) return recusa("alvo_desconhecido");
	await exigirPapel(item.account_id, contexto);
	if (item.call_id !== null && (item.status === "claimed" || item.status === "done")) return cancelarChamada(item.call_id, contexto, true);
	if (item.status === "claimed") return recusa("em_discagem");
	if (item.status !== "queued") return atendido("fila", item.id, "ja_retirado", item.status);
	if (!await porta.retirarDaFila(item.id)) {
		const atual = await porta.itemDaFila(item.id);
		if (atual?.status === "canceled" || atual?.status === "failed") return atendido("fila", item.id, "ja_retirado", atual.status);
		return recusa(atual?.status === "claimed" ? "em_discagem" : "em_transicao");
	}
	await trilhaOuDesfaz({
		account_id: item.account_id,
		actor: "user",
		actor_id: contexto.usuarioId,
		source: FONTE_DA_TRILHA,
		action: "dial_queue_canceled",
		target_type: "dial_queue",
		target_id: item.id,
		reason: contexto.motivo,
		payload: { estado_anterior: "queued" }
	}, () => porta.devolverAFila(item.id), contexto);
	return atendido("fila", item.id, "retirado_da_fila", "canceled");
}
async function cancelarChamada(chamadaId, contexto, papelJaConferido = false) {
	const { porta } = contexto;
	const chamada = await porta.chamada(chamadaId);
	if (!chamada) return recusa("alvo_desconhecido");
	if (!papelJaConferido) await exigirPapel(chamada.account_id, contexto);
	const parada = estadoParado(chamada);
	if (parada) return atendido("chamada", chamada.id, parada, chamada.status);
	const sid = chamada.provider_call_sid?.trim() ?? "";
	if (chamada.status === "queued" && sid === "") return fecharAntesDeDiscar(chamada, contexto);
	if (sid === "") return recusa("sem_identificador_no_provedor");
	return encerrarEmCurso(chamada, sid, contexto);
}
async function fecharAntesDeDiscar(chamada, contexto) {
	const { porta } = contexto;
	if (!await porta.fecharAntesDeDiscar(chamada.id, contexto.agora)) return releitura(chamada.id, contexto);
	await trilhaOuDesfaz(linhaDaChamada(chamada, contexto, "antes_de_discar"), () => porta.reabrirAntesDeDiscar(chamada.id), contexto);
	return atendido("chamada", chamada.id, "cancelada_antes_de_discar", "failed");
}
async function encerrarEmCurso(chamada, sid, contexto) {
	const { porta } = contexto;
	const identificador = await exigirCredencial(chamada.account_id, CHAVE_DO_IDENTIFICADOR, contexto);
	const token = await exigirCredencial(chamada.account_id, CHAVE_DO_TOKEN, contexto);
	if (!await porta.marcarCancelamento(chamada.id)) return releitura(chamada.id, contexto);
	await trilhaOuDesfaz(linhaDaChamada(chamada, contexto, "encerramento_pedido"), () => porta.desmarcarCancelamento(chamada.id), contexto);
	const resposta = await porta.encerrarNoProvedor({
		providerCallSid: sid,
		identificador,
		token
	});
	try {
		await porta.registrarEventoDeIntegracao({
			account_id: chamada.account_id,
			direction: "outbound",
			provider: PROVEDOR_DE_TELEFONIA,
			endpoint: resposta.endpoint ?? "calls",
			request: {
				call_sid: sid,
				status: "completed"
			},
			response: { ok: resposta.ok },
			status_code: resposta.status ?? null,
			latency_ms: resposta.latenciaMs ?? null,
			correlation_id: chamada.id
		});
	} catch {}
	if (!resposta.ok) {
		await porta.desmarcarCancelamento(chamada.id);
		return recusa("provedor_nao_encerrou");
	}
	return atendido("chamada", chamada.id, "encerrando", chamada.status);
}
async function releitura(chamadaId, contexto) {
	const atual = await contexto.porta.chamada(chamadaId);
	if (!atual) return recusa("alvo_desconhecido");
	const parada = estadoParado(atual);
	if (parada) return atendido("chamada", atual.id, parada, atual.status);
	return recusa("em_transicao");
}
function estadoParado(chamada) {
	if (chamada.finalized_at !== null || !VIVOS.has(chamada.status)) return chamada.end_reason === "canceled" ? "ja_cancelada" : "ja_encerrada";
	if (chamada.end_reason === "canceled") return "ja_cancelada";
	return null;
}
function linhaDaChamada(chamada, contexto, efeito) {
	return {
		account_id: chamada.account_id,
		actor: "user",
		actor_id: contexto.usuarioId,
		source: FONTE_DA_TRILHA,
		action: "call_canceled",
		target_type: "calls",
		target_id: chamada.id,
		reason: contexto.motivo,
		payload: {
			estado_anterior: chamada.status,
			efeito
		}
	};
}
async function exigirPapel(contaId, contexto) {
	const papel = await contexto.porta.papelNaConta(contaId, contexto.usuarioId);
	if (!papel) throw new RecusaDoPedido("alvo_desconhecido");
	if (!PAPEIS_QUE_CANCELAM.has(papel)) throw new RecusaDoPedido("papel_insuficiente");
}
async function exigirCredencial(contaId, chave, contexto) {
	const resolucao = await contexto.porta.credencial(contaId, PROVEDOR_DE_TELEFONIA, chave);
	if (!resolucao.ok) throw new RecusaDoPedido("credencial_indisponivel");
	contexto.credenciais.push(resolucao.valor);
	return resolucao.valor;
}
async function trilhaOuDesfaz(linha, desfazer, contexto) {
	try {
		await contexto.porta.registrarAuditoria(linha);
	} catch {
		await desfazer();
		throw new RecusaDoPedido("falha_interna");
	}
}
function atendido(alvo, id, estado, status) {
	return {
		status: 200,
		corpo: {
			ok: true,
			alvo,
			id,
			estado,
			mensagem: MENSAGENS_DO_ESTADO[estado],
			status
		}
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
function uuid(valor) {
	const dado = typeof valor === "string" ? valor.trim() : "";
	return UUID.test(dado) ? dado : null;
}
function texto(valor) {
	if (typeof valor !== "string") return null;
	const dado = valor.trim();
	return dado === "" ? null : dado;
}
function extrairJwt(autorizacao) {
	const jwt = PREFIXO_BEARER.exec(autorizacao?.trim() ?? "")?.[1]?.trim() ?? "";
	return jwt === "" ? null : jwt;
}
//#endregion
//#region supabase/functions/call-cancel/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const ENDERECO_DA_TELEFONIA = "https://api.twilio.com/2010-04-01";
const LIMITE_DO_PROVEDOR_MS = 1e4;
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
	"access-control-allow-methods": "POST, OPTIONS"
};
const COLUNAS_DA_CHAMADA = "id, account_id, status, end_reason, provider_call_sid, finalized_at";
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
async function venceu(consulta) {
	const { data, error } = await consulta;
	if (error) throw new Error(error.message);
	return Array.isArray(data) && data.length > 0;
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
	async itemDaFila(itemId) {
		const { data, error } = await servico.from("dial_queue").select("id, account_id, status, call_id").eq("id", itemId).maybeSingle();
		if (error) throw new Error(error.message);
		return data ?? null;
	},
	async chamada(chamadaId) {
		const { data, error } = await servico.from("calls").select(COLUNAS_DA_CHAMADA).eq("id", chamadaId).maybeSingle();
		if (error) throw new Error(error.message);
		return data ?? null;
	},
	retirarDaFila(itemId) {
		return venceu(servico.from("dial_queue").update({ status: "canceled" }).eq("id", itemId).eq("status", "queued").select("id"));
	},
	async devolverAFila(itemId) {
		const { error } = await servico.from("dial_queue").update({ status: "queued" }).eq("id", itemId).eq("status", "canceled");
		if (error) throw new Error(error.message);
	},
	fecharAntesDeDiscar(chamadaId, agora) {
		return venceu(servico.from("calls").update({
			status: "failed",
			end_reason: "canceled",
			ended_at: agora
		}).eq("id", chamadaId).eq("status", "queued").is("provider_call_sid", null).is("finalized_at", null).select("id"));
	},
	async reabrirAntesDeDiscar(chamadaId) {
		const { error } = await servico.from("calls").update({
			status: "queued",
			end_reason: null,
			ended_at: null
		}).eq("id", chamadaId).eq("status", "failed").eq("end_reason", "canceled").is("finalized_at", null);
		if (error) throw new Error(error.message);
	},
	marcarCancelamento(chamadaId) {
		return venceu(servico.from("calls").update({ end_reason: "canceled" }).eq("id", chamadaId).in("status", ["ringing", "in_progress"]).is("finalized_at", null).is("end_reason", null).select("id"));
	},
	async desmarcarCancelamento(chamadaId) {
		const { error } = await servico.from("calls").update({ end_reason: null }).eq("id", chamadaId).eq("end_reason", "canceled").is("finalized_at", null);
		if (error) throw new Error(error.message);
	},
	async registrarAuditoria(linha) {
		const { error } = await servico.from("audit_log").insert(linha);
		if (error) throw new Error(error.message);
	},
	credencial(contaId, provedor, chave) {
		return cofre.resolveSecret(contaId, provedor, chave);
	},
	encerrarNoProvedor,
	async registrarEventoDeIntegracao(evento) {
		const { error } = await servico.from("integration_events").insert(evento);
		if (error) throw new Error(error.message);
	}
};
async function encerrarNoProvedor(pedido) {
	const endpoint = `Accounts/${pedido.identificador}/Calls/${pedido.providerCallSid}.json`;
	const inicio = Date.now();
	try {
		const resposta = await fetch(`${ENDERECO_DA_TELEFONIA}/${endpoint}`, {
			method: "POST",
			headers: {
				authorization: `Basic ${btoa(`${pedido.identificador}:${pedido.token}`)}`,
				"content-type": "application/x-www-form-urlencoded"
			},
			body: new URLSearchParams({ Status: "completed" }),
			signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
		});
		await resposta.body?.cancel();
		return {
			ok: resposta.ok,
			status: resposta.status,
			latenciaMs: Date.now() - inicio,
			endpoint: `Calls/${pedido.providerCallSid}.json`
		};
	} catch (erro) {
		return {
			ok: false,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			status: null,
			latenciaMs: Date.now() - inicio,
			endpoint: `Calls/${pedido.providerCallSid}.json`
		};
	}
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
	const resposta = await cancelar({
		metodo: requisicao.method,
		chamadaId: corpo?.chamadaId ?? corpo?.call_id ?? null,
		itemDaFilaId: corpo?.itemDaFilaId ?? corpo?.dial_queue_id ?? null,
		motivo: corpo?.motivo ?? corpo?.reason ?? null,
		autorizacao: requisicao.headers.get("authorization")
	}, porta, { agora: new Date().toISOString() });
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
