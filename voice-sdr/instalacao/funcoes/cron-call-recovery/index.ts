// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/cron-call-recovery/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/call-finalize/formato-do-provedor.ts
function caminhoDaConversa(conversaId) {
	return `convai/conversations/${encodeURIComponent(conversaId)}`;
}
//#endregion
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
const TAMANHO_DO_ERRO = 1e3;
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
		const mensagem = mensagemDe(erro);
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
function mensagemDe(erro) {
	const texto = erro instanceof Error ? erro.message : String(erro);
	return (texto.trim() === "" ? "erro sem mensagem" : texto).slice(0, TAMANHO_DO_ERRO);
}
//#endregion
//#region supabase/functions/cron-call-recovery/recuperacao.ts
const NOME_DA_ROTINA = "cron-call-recovery";
const TAMANHO_DA_NOTA = 500;
const VIVAS = new Set([
	"queued",
	"ringing",
	"in_progress"
]);
function inicioDaConversa(chamada) {
	return Date.parse(chamada.answered_at ?? chamada.started_at);
}
const SITUACOES_NO_AR = new Set(["initiated", "in-progress"]);
function lerEstadoDaConversa(corpo) {
	if (typeof corpo !== "object" || corpo === null) return "sem_resposta";
	const situacao = corpo.status;
	if (typeof situacao !== "string") return "em_curso";
	if (SITUACOES_NO_AR.has(situacao)) return "em_curso";
	return situacao === "processing" || situacao === "done" || situacao === "failed" ? "encerrada" : "em_curso";
}
function ramoDaChamada(chamada, instanteMs) {
	if (chamada.finalized_at !== null) return chamada.answered_by === "human" && chamada.classification_source === null ? { ramo: "classificar" } : { ramo: "nenhum" };
	if ((chamada.status === "queued" || chamada.status === "ringing") && chamada.provider_call_sid === null && instanteMs - Date.parse(chamada.started_at) > 18e4) return { ramo: "orfa" };
	if (chamada.provider_conversation_id === null) return { ramo: "nenhum" };
	return VIVAS.has(chamada.status) ? { ramo: "consultar" } : { ramo: "finalizar" };
}
function decisaoDaConsulta(chamada, estado, instanteMs) {
	if (estado === "encerrada") return { decisao: "finalizar" };
	const decorrido = instanteMs - inicioDaConversa(chamada);
	const duracaoMaxima = chamada.max_duration_seconds * 1e3;
	if (estado === "em_curso") return decorrido > duracaoMaxima + 6e4 ? { decisao: "encerrar_por_duracao" } : { decisao: "aguardar" };
	return decorrido > duracaoMaxima + 6e5 ? { decisao: "perdida" } : { decisao: "aguardar" };
}
function eventoFalhou(evento) {
	return evento.status_code === null || evento.status_code >= 500;
}
function disjuntorDispara(conta, instanteMs) {
	const desde = instanteMs - conta.janela_em_minutos * 6e4;
	const naJanela = [...conta.eventos].filter((evento) => {
		const em = Date.parse(evento.at);
		return em > desde && em <= instanteMs;
	}).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, conta.falhas);
	return naJanela.length >= conta.falhas && naJanela.every(eventoFalhou);
}
function recuperarChamadas(pedido) {
	const { porta } = pedido;
	const agora = pedido.agora ?? Date.now;
	return executarRotina({
		nome: NOME_DA_ROTINA,
		porta: pedido.execucao,
		agora,
		trabalho: {
			async reivindicar(limite, instante) {
				const instanteMs = Date.parse(instante);
				const itens = (await porta.contasParaODisjuntor(instante)).filter((conta) => disjuntorDispara(conta, instanteMs)).slice(0, limite).map((conta) => ({
					chave: `disjuntor:${conta.account_id}`,
					tipo: "disjuntor",
					conta
				}));
				const restante = limite - itens.length;
				if (restante > 0) for (const chamada of await porta.reivindicarChamadas(restante, instante)) itens.push({
					chave: `chamada:${chamada.id}`,
					tipo: "chamada",
					chamada
				});
				return itens;
			},
			async processar(item, instante) {
				if (item.tipo === "disjuntor") {
					await dispararDisjuntor(porta, item.conta, instante);
					return;
				}
				await recuperarChamada(porta, item.chamada, instante);
			}
		}
	});
}
async function dispararDisjuntor(porta, conta, instante) {
	if (!await porta.acionarDisjuntor(conta.account_id, {
		dialing_paused_at: instante,
		dialing_paused_by: "00000000-0000-0000-0000-000000000000",
		dialing_paused_reason: "disjuntor"
	})) return;
	await porta.registrarDisjuntor({
		routine: NOME_DA_ROTINA,
		account_id: conta.account_id,
		started_at: instante,
		finished_at: instante,
		items: conta.falhas,
		error: `disjuntor: ${conta.falhas} falhas consecutivas de provedor em ${conta.janela_em_minutos} min; discagem pausada, retomada manual`
	});
}
async function recuperarChamada(porta, chamada, instante) {
	const instanteMs = Date.parse(instante);
	switch (ramoDaChamada(chamada, instanteMs).ramo) {
		case "nenhum": return;
		case "orfa":
			await fecharPerdida(porta, chamada, instante, {
				de: ["queued", "ringing"],
				status: "failed",
				end_reason: "dial_lost",
				ended_at: instante
			});
			return;
		case "finalizar":
			await finalizar(porta, chamada, instanteMs);
			return;
		case "classificar":
			await classificar(porta, chamada, instante);
			return;
	}
	switch (decisaoDaConsulta(chamada, await porta.estadoDaConversa(chamada.account_id, chamada.provider_conversation_id), instanteMs).decisao) {
		case "aguardar": return;
		case "finalizar":
			await finalizar(porta, chamada, instanteMs);
			return;
		case "encerrar_por_duracao":
			await encerrarPorDuracao(porta, chamada, instante);
			return;
		case "perdida":
			await fecharPerdida(porta, chamada, instante, {
				de: ["ringing", "in_progress"],
				status: "ended",
				end_reason: "provider_lost",
				ended_at: instante
			});
			return;
	}
}
async function fecharPerdida(porta, chamada, instante, fim) {
	if (!await porta.fecharComoPerdida(chamada.id, fim)) return;
	const codigo = await porta.reprogramar(chamada.id, instante);
	await porta.anotar(chamada.id, { recovery_note: nota(`${fim.end_reason}; reprogramação: ${codigo}`) });
}
async function finalizar(porta, chamada, instanteMs) {
	if (instanteMs - Date.parse(chamada.ended_at ?? chamada.started_at) > 864e5) {
		await porta.anotar(chamada.id, {
			recovery_gave_up_at: new Date(instanteMs).toISOString(),
			recovery_note: nota(`desistência: a transcrição não chegou em 24 h (${chamada.recovery_attempts} tentativas)`)
		});
		return;
	}
	let status;
	try {
		status = (await porta.finalizar(chamada.id)).status;
	} catch {
		status = null;
	}
	if (status === 200 || status === 409) return;
	if (status === 422 || status === 400) {
		await porta.anotar(chamada.id, {
			recovery_gave_up_at: new Date(instanteMs).toISOString(),
			recovery_note: nota(`desistência: call-finalize recusou em definitivo (${status})`)
		});
		return;
	}
	const tentativas = chamada.recovery_attempts + 1;
	await porta.anotar(chamada.id, {
		recovery_attempts: tentativas,
		recovery_note: nota(`finalização ${tentativas}: call-finalize ${status === null ? "não respondeu" : `respondeu ${status}`}`)
	});
}
async function encerrarPorDuracao(porta, chamada, instante) {
	const tentativas = chamada.recovery_attempts + 1;
	const sid = chamada.provider_call_sid;
	let aceitou = false;
	if (sid !== null) {
		await porta.marcarDuracaoMaxima(chamada.id);
		try {
			aceitou = await porta.encerrarNaTelefonia(chamada.account_id, sid);
		} catch {
			aceitou = false;
		}
	}
	if (aceitou) {
		await porta.anotar(chamada.id, { recovery_note: nota("max_duration: encerramento pedido à telefonia") });
		return;
	}
	const razao = sid === null ? "sem provider_call_sid" : "a telefonia recusou";
	if (tentativas >= 5) {
		await porta.anotar(chamada.id, {
			recovery_attempts: tentativas,
			recovery_gave_up_at: instante,
			recovery_note: nota(`desistência: encerramento por duração falhou ${tentativas} vezes (${razao})`)
		});
		return;
	}
	await porta.anotar(chamada.id, {
		recovery_attempts: tentativas,
		recovery_note: nota(`encerramento por duração ${tentativas}: ${razao}`)
	});
}
async function classificar(porta, chamada, instante) {
	let status;
	try {
		status = (await porta.classificar(chamada.id)).status;
	} catch {
		status = null;
	}
	if (status === 200 || status === 409) return;
	if (status === 400 || status === 404 || status === 422) {
		await porta.anotar(chamada.id, {
			classify_gave_up_at: instante,
			recovery_note: nota(`classificação: recusa definitiva (${status})`)
		});
		return;
	}
	const tentativas = chamada.classify_attempts + 1;
	const resposta = status === null ? "não respondeu" : `respondeu ${status}`;
	if (tentativas >= 5) {
		await porta.anotar(chamada.id, {
			classify_attempts: tentativas,
			classify_gave_up_at: instante,
			recovery_note: nota(`desistência: classificação falhou ${tentativas} vezes (call-classify ${resposta})`)
		});
		return;
	}
	await porta.anotar(chamada.id, {
		classify_attempts: tentativas,
		recovery_note: nota(`classificação ${tentativas}: call-classify ${resposta}`)
	});
}
function nota(texto) {
	return texto.slice(0, TAMANHO_DA_NOTA);
}
async function atenderRotina(pedido, recuperacao, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return {
		status: 405,
		corpo: { ok: false }
	};
	if (!await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno)) return {
		status: 401,
		corpo: { ok: false }
	};
	const resultado = await recuperarChamadas(recuperacao);
	return {
		status: resultado.ok ? 200 : 500,
		corpo: { ...resultado }
	};
}
//#endregion
//#region supabase/functions/cron-call-recovery/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
const ENDERECO_DO_PROVEDOR_DE_VOZ = "https://api.elevenlabs.io/v1";
const ENDERECO_DA_TELEFONIA = "https://api.twilio.com/2010-04-01";
const PROVEDOR_DE_VOZ = "voz";
const PROVEDOR_DE_TELEFONIA = "telefonia";
const LIMITE_DO_PROVEDOR_MS = 1e4;
const LIMITE_DAS_FUNCOES_MS = 3e4;
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
async function rastrear(evento) {
	const { error } = await servico.from("integration_events").insert({
		direction: "outbound",
		...evento
	});
	if (error) console.warn(JSON.stringify({
		funcao: "cron-call-recovery",
		passo: "rastro",
		erro: error.message
	}));
}
async function acionarFuncao(nome, chamadaId) {
	const resposta = await fetch(`${URL_DO_SUPABASE}/functions/v1/${nome}`, {
		method: "POST",
		headers: {
			"content-type": "application/json",
			authorization: `Bearer ${CHAVE_DE_SERVICO}`,
			[CABECALHO_DA_ROTINA]: await segredoInterno()
		},
		body: JSON.stringify({ call_id: chamadaId }),
		signal: AbortSignal.timeout(LIMITE_DAS_FUNCOES_MS)
	});
	await resposta.body?.cancel();
	return { status: resposta.status };
}
const porta = {
	async reivindicarChamadas(limite, instante) {
		const { data, error } = await servico.rpc("reivindicar_recuperacao", {
			p_limite: limite,
			p_instante: instante
		});
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async contasParaODisjuntor(instante) {
		const { data, error } = await servico.rpc("contas_para_o_disjuntor", { p_instante: instante });
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async estadoDaConversa(contaId, conversaId) {
		const resolucao = await cofre.resolveSecret(contaId, PROVEDOR_DE_VOZ, "api_key");
		if (!resolucao.ok) return "sem_resposta";
		const endpoint = caminhoDaConversa(conversaId);
		const inicio = Date.now();
		let status = null;
		let estado = "sem_resposta";
		try {
			const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${endpoint}`, {
				headers: { "xi-api-key": resolucao.valor },
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			status = resposta.status;
			if (resposta.ok) estado = lerEstadoDaConversa(await resposta.json());
			else await resposta.body?.cancel();
		} catch {
			status = null;
		}
		await rastrear({
			account_id: contaId,
			provider: PROVEDOR_DE_VOZ,
			endpoint,
			request: { conversation_id: conversaId },
			response: { estado },
			status_code: status,
			latency_ms: Date.now() - inicio,
			correlation_id: conversaId
		});
		return estado;
	},
	finalizar(chamadaId) {
		return acionarFuncao("call-finalize", chamadaId);
	},
	classificar(chamadaId) {
		return acionarFuncao("call-classify", chamadaId);
	},
	async marcarDuracaoMaxima(chamadaId) {
		const { error } = await servico.from("calls").update({ end_reason: "max_duration" }).eq("id", chamadaId).is("end_reason", null).is("finalized_at", null);
		if (error) throw new Error(error.message);
	},
	async encerrarNaTelefonia(contaId, sid) {
		const [identificador, token] = await Promise.all([cofre.resolveSecret(contaId, PROVEDOR_DE_TELEFONIA, "account_sid"), cofre.resolveSecret(contaId, PROVEDOR_DE_TELEFONIA, "auth_token")]);
		if (!identificador.ok || !token.ok) return false;
		const endpoint = `Calls/${sid}.json`;
		const inicio = Date.now();
		let status = null;
		try {
			const resposta = await fetch(`${ENDERECO_DA_TELEFONIA}/Accounts/${identificador.valor}/${endpoint}`, {
				method: "POST",
				headers: {
					authorization: `Basic ${btoa(`${identificador.valor}:${token.valor}`)}`,
					"content-type": "application/x-www-form-urlencoded"
				},
				body: new URLSearchParams({ Status: "completed" }),
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			status = resposta.status;
			await resposta.body?.cancel();
		} catch {
			status = null;
		}
		await rastrear({
			account_id: contaId,
			provider: PROVEDOR_DE_TELEFONIA,
			endpoint,
			request: {
				status: "completed",
				motivo: "max_duration"
			},
			response: {},
			status_code: status,
			latency_ms: Date.now() - inicio,
			correlation_id: sid
		});
		return status !== null && status >= 200 && status < 300;
	},
	async fecharComoPerdida(chamadaId, fim) {
		const { de, ...colunas } = fim;
		let consulta = servico.from("calls").update(colunas).eq("id", chamadaId).in("status", [...de]).is("finalized_at", null);
		if (fim.end_reason === "dial_lost") consulta = consulta.is("provider_call_sid", null);
		const { data, error } = await consulta.select("id");
		if (error) throw new Error(error.message);
		return Array.isArray(data) && data.length > 0;
	},
	async reprogramar(chamadaId, instante) {
		const { data, error } = await servico.rpc("reprogramar_chamada_perdida", {
			p_call_id: chamadaId,
			p_instante: instante
		});
		if (error) throw new Error(error.message);
		return typeof data === "string" ? data : "sem_resposta";
	},
	async anotar(chamadaId, nota) {
		const { error } = await servico.from("calls").update(nota).eq("id", chamadaId);
		if (error) throw new Error(error.message);
	},
	async acionarDisjuntor(contaId, freio) {
		const { data, error } = await servico.from("accounts").update(freio).eq("id", contaId).is("dialing_paused_at", null).select("id");
		if (error) throw new Error(error.message);
		return Array.isArray(data) && data.length > 0;
	},
	async registrarDisjuntor(linha) {
		const { error } = await servico.from("job_runs").insert(linha);
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
