// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/emergency-stop/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/emergency-stop/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	sem_sessao: "Entre na sua conta para usar a parada de emergência.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para usar a parada de emergência.",
	acao_invalida: "O pedido precisa dizer se a conta para ou volta a discar.",
	conta_invalida: "O pedido precisa trazer a conta.",
	motivo_obrigatorio: "Escreva o motivo. Ele fica registrado junto com o seu nome.",
	conta_desconhecida: "Conta não encontrada.",
	papel_insuficiente: "A parada de emergência exige o papel de administrador ou dono da conta.",
	falha_interna: "Não foi possível concluir agora. Tente de novo em alguns segundos."
};
const STATUS = {
	metodo_invalido: 405,
	sem_sessao: 401,
	sessao_invalida: 401,
	acao_invalida: 400,
	conta_invalida: 400,
	motivo_obrigatorio: 400,
	conta_desconhecida: 404,
	papel_insuficiente: 403,
	falha_interna: 500
};
const MENSAGENS_DO_ESTADO = {
	parada: "Discagem parada. Nenhuma ligação nova sai desta conta até alguém retomar.",
	ja_parada: "A discagem desta conta já estava parada.",
	retomada: "Discagem retomada. A fila volta a ser consumida no próximo minuto.",
	ja_operando: "A discagem desta conta já estava ativa."
};
const FRASES_DAS_FALHAS = {
	credencial_indisponivel: "A credencial da telefonia não está disponível. A chamada termina sozinha ou pela varredura de recuperação.",
	provedor_nao_encerrou: "A telefonia não confirmou o encerramento. A chamada termina sozinha ou pela varredura de recuperação.",
	falha_interna: "Não foi possível pedir o encerramento. A chamada termina sozinha ou pela varredura de recuperação."
};
//#endregion
//#region supabase/functions/emergency-stop/freio.ts
const PAPEIS_QUE_PARAM = new Set(["owner", "admin"]);
const PROVEDOR_DE_TELEFONIA = "telefonia";
const CHAVE_DO_IDENTIFICADOR = "account_sid";
const CHAVE_DO_TOKEN = "auth_token";
const FONTE_DA_TRILHA = "edge:emergency-stop";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function atenderFreio(pedido, porta, opcoes) {
	const credenciais = [];
	let resposta;
	try {
		resposta = await conduzir(pedido, porta, opcoes, credenciais);
	} catch {
		resposta = recusa("falha_interna");
	}
	try {
		conferirQueNaoVazou(resposta.corpo, credenciais, "credencial no corpo de emergency-stop");
	} catch {
		return recusa("falha_interna");
	}
	return resposta;
}
async function conduzir(pedido, porta, opcoes, credenciais) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const jwt = extrairJwt(pedido.autorizacao);
	if (!jwt) return recusa("sem_sessao");
	const acao = pedido.acao;
	if (acao !== "parar" && acao !== "retomar") return recusa("acao_invalida");
	const contaId = uuid(pedido.contaId);
	if (contaId === null) return recusa("conta_invalida");
	const motivo = texto(pedido.motivo);
	if (motivo === null) return recusa("motivo_obrigatorio");
	const usuario = await porta.usuarioDaSessao(jwt);
	if (!usuario) return recusa("sessao_invalida");
	const papel = await porta.papelNaConta(contaId, usuario.id);
	if (!papel) return recusa("conta_desconhecida");
	if (!PAPEIS_QUE_PARAM.has(papel)) return recusa("papel_insuficiente");
	const contexto = {
		contaId,
		usuarioId: usuario.id,
		motivo,
		agora: opcoes.agora,
		porta,
		credenciais
	};
	return acao === "parar" ? parar(contexto) : retomar(contexto);
}
async function parar(contexto) {
	const { porta, contaId } = contexto;
	const puxadoEm = await porta.puxarFreio(contaId, {
		em: contexto.agora,
		por: contexto.usuarioId,
		motivo: contexto.motivo
	});
	let pausadaEm = puxadoEm;
	let semRegistro = false;
	if (puxadoEm === null) pausadaEm = (await porta.estadoDoFreio(contaId))?.dialing_paused_at ?? null;
	else {
		try {
			await porta.registrarAuditoria({
				account_id: contaId,
				actor: "user",
				actor_id: contexto.usuarioId,
				source: FONTE_DA_TRILHA,
				action: "dialing_paused",
				target_type: "accounts",
				target_id: contaId,
				reason: contexto.motivo,
				payload: { pausada_em: puxadoEm }
			});
		} catch {
			semRegistro = true;
		}
		if (porta.pausarCampanhas) try {
			await porta.pausarCampanhas(contaId, contexto.motivo);
		} catch {}
	}
	const encerramentos = await encerrarEmCurso(contexto);
	const estado = puxadoEm === null ? "ja_parada" : "parada";
	return {
		status: 200,
		corpo: {
			ok: true,
			estado,
			mensagem: MENSAGENS_DO_ESTADO[estado],
			pausadaEm,
			encerramentos,
			...semRegistro ? { semRegistro: true } : {}
		}
	};
}
async function encerrarEmCurso(contexto) {
	const chamadas = await contexto.porta.chamadasEmCurso(contexto.contaId);
	if (chamadas.length === 0) return {
		pedidos: 0,
		jaEmEncerramento: 0,
		falhas: []
	};
	const par = await resolverPar(contexto);
	const desfechos = await emParalelo(chamadas, 5, (chamada) => encerrarUma(chamada, par, contexto).catch(() => ({
		tipo: "falha",
		motivo: "falha_interna"
	})));
	let pedidos = 0;
	let jaEmEncerramento = 0;
	const falhas = [];
	desfechos.forEach((desfecho, indice) => {
		if (desfecho.tipo === "pedido") pedidos += 1;
		else if (desfecho.tipo === "ja_em_encerramento") jaEmEncerramento += 1;
		else falhas.push({
			chamadaId: chamadas[indice]?.id ?? "",
			motivo: desfecho.motivo,
			mensagem: FRASES_DAS_FALHAS[desfecho.motivo]
		});
	});
	return {
		pedidos,
		jaEmEncerramento,
		falhas
	};
}
async function encerrarUma(chamada, par, contexto) {
	const { porta } = contexto;
	if (!await porta.marcarCancelamento(chamada.id)) return { tipo: "ja_em_encerramento" };
	let falha = null;
	if (par === null) falha = "credencial_indisponivel";
	else {
		const resposta = await porta.encerrarNoProvedor({
			providerCallSid: chamada.provider_call_sid,
			...par
		});
		await registrarEvento(chamada, resposta, contexto);
		if (!resposta.ok) falha = "provedor_nao_encerrou";
	}
	try {
		await porta.registrarAuditoria({
			account_id: contexto.contaId,
			actor: "user",
			actor_id: contexto.usuarioId,
			source: FONTE_DA_TRILHA,
			action: "call_canceled",
			target_type: "calls",
			target_id: chamada.id,
			reason: contexto.motivo,
			payload: {
				origem: "freio_de_emergencia",
				estado_anterior: chamada.status,
				efeito: falha === null ? "encerramento_pedido" : "encerramento_falhou",
				...falha === null ? {} : { falha }
			}
		});
	} catch {}
	return falha === null ? { tipo: "pedido" } : {
		tipo: "falha",
		motivo: falha
	};
}
async function resolverPar(contexto) {
	try {
		const identificador = await contexto.porta.credencial(contexto.contaId, PROVEDOR_DE_TELEFONIA, CHAVE_DO_IDENTIFICADOR);
		const token = await contexto.porta.credencial(contexto.contaId, PROVEDOR_DE_TELEFONIA, CHAVE_DO_TOKEN);
		if (!identificador.ok || !token.ok) return null;
		contexto.credenciais.push(identificador.valor, token.valor);
		return {
			identificador: identificador.valor,
			token: token.valor
		};
	} catch {
		return null;
	}
}
async function registrarEvento(chamada, resposta, contexto) {
	try {
		await contexto.porta.registrarEventoDeIntegracao({
			account_id: contexto.contaId,
			direction: "outbound",
			provider: PROVEDOR_DE_TELEFONIA,
			endpoint: resposta.endpoint ?? "calls",
			request: {
				call_sid: chamada.provider_call_sid,
				status: "completed",
				origem: "freio_de_emergencia"
			},
			response: { ok: resposta.ok },
			status_code: resposta.status ?? null,
			latency_ms: resposta.latenciaMs ?? null,
			correlation_id: chamada.id
		});
	} catch {}
}
async function emParalelo(itens, limite, tarefa) {
	const resultados = new Array(itens.length);
	let proximo = 0;
	async function trabalhador() {
		while (proximo < itens.length) {
			const indice = proximo;
			proximo += 1;
			resultados[indice] = await tarefa(itens[indice]);
		}
	}
	const trabalhadores = Array.from({ length: Math.min(limite, itens.length) }, () => trabalhador());
	await Promise.all(trabalhadores);
	return resultados;
}
async function retomar(contexto) {
	const { porta, contaId } = contexto;
	const anterior = await porta.estadoDoFreio(contaId);
	if (!anterior || anterior.dialing_paused_at === null) return atendido("ja_operando", null);
	if (!await porta.soltarFreio(contaId)) return atendido("ja_operando", null);
	try {
		await porta.registrarAuditoria({
			account_id: contaId,
			actor: "user",
			actor_id: contexto.usuarioId,
			source: FONTE_DA_TRILHA,
			action: "dialing_resumed",
			target_type: "accounts",
			target_id: contaId,
			reason: contexto.motivo,
			payload: {
				pausada_em: anterior.dialing_paused_at,
				pausada_por: anterior.dialing_paused_by,
				motivo_da_parada: anterior.dialing_paused_reason
			}
		});
	} catch {
		await porta.repuxarFreio(contaId, anterior);
		return recusa("falha_interna");
	}
	return atendido("retomada", null);
}
function atendido(estado, pausadaEm) {
	return {
		status: 200,
		corpo: {
			ok: true,
			estado,
			mensagem: MENSAGENS_DO_ESTADO[estado],
			pausadaEm
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
//#region supabase/functions/emergency-stop/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const ENDERECO_DA_TELEFONIA = "https://api.twilio.com/2010-04-01";
const LIMITE_DO_PROVEDOR_MS = 5e3;
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
	"access-control-allow-methods": "POST, OPTIONS"
};
const COLUNAS_DO_FREIO = "dialing_paused_at, dialing_paused_by, dialing_paused_reason";
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
	async puxarFreio(contaId, freio) {
		const { data, error } = await servico.from("accounts").update({
			dialing_paused_at: freio.em,
			dialing_paused_by: freio.por,
			dialing_paused_reason: freio.motivo
		}).eq("id", contaId).is("dialing_paused_at", null).select("dialing_paused_at");
		if (error) throw new Error(error.message);
		return (Array.isArray(data) ? data[0] : void 0)?.dialing_paused_at ?? null;
	},
	async estadoDoFreio(contaId) {
		const { data, error } = await servico.from("accounts").select(COLUNAS_DO_FREIO).eq("id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		return data ?? null;
	},
	soltarFreio(contaId) {
		return venceu(servico.from("accounts").update({
			dialing_paused_at: null,
			dialing_paused_by: null,
			dialing_paused_reason: null
		}).eq("id", contaId).not("dialing_paused_at", "is", null).select("id"));
	},
	async repuxarFreio(contaId, anterior) {
		const { error } = await servico.from("accounts").update({
			dialing_paused_at: anterior.dialing_paused_at,
			dialing_paused_by: anterior.dialing_paused_by,
			dialing_paused_reason: anterior.dialing_paused_reason
		}).eq("id", contaId).is("dialing_paused_at", null);
		if (error) throw new Error(error.message);
	},
	async chamadasEmCurso(contaId) {
		const { data, error } = await servico.from("calls").select("id, status, provider_call_sid").eq("account_id", contaId).in("status", [
			"queued",
			"ringing",
			"in_progress"
		]).not("provider_call_sid", "is", null).is("finalized_at", null).is("end_reason", null);
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	marcarCancelamento(chamadaId) {
		return venceu(servico.from("calls").update({ end_reason: "canceled" }).eq("id", chamadaId).in("status", [
			"queued",
			"ringing",
			"in_progress"
		]).is("finalized_at", null).is("end_reason", null).select("id"));
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
	const resposta = await atenderFreio({
		metodo: requisicao.method,
		acao: corpo?.acao ?? null,
		contaId: corpo?.contaId ?? corpo?.account_id ?? null,
		motivo: corpo?.motivo ?? corpo?.reason ?? null,
		autorizacao: requisicao.headers.get("authorization")
	}, porta, { agora: new Date().toISOString() });
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
