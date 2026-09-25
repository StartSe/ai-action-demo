// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/cron-retention/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
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
//#region supabase/functions/cron-retention/expurgo.ts
const NOME_DA_ROTINA = "cron-retention";
const CHAVE_DO_PROVEDOR_DE_VOZ = "api_key";
const BALDE_DAS_GRAVACOES = "recordings";
function caminhoDaConversa(conversaId) {
	return `convai/conversations/${encodeURIComponent(conversaId)}`;
}
function provedorConfirmou(resposta) {
	if (resposta === null || resposta.status_code === null) return false;
	return resposta.status_code >= 200 && resposta.status_code < 300;
}
function razaoDoProvedor(resposta) {
	if (resposta === null) return "credencial do provedor de voz indisponível";
	if (resposta.status_code === null) return "provedor de voz sem resposta";
	if (resposta.status_code === 404) return "o provedor de voz não encontrou a conversa (404); ela pode estar sob outra credencial";
	return `provedor de voz respondeu ${resposta.status_code}`;
}
async function expurgarConteudo(pedido) {
	const { porta } = pedido;
	const agora = pedido.agora ?? Date.now;
	const expurgadasPorConta = new Map();
	const passagem = { iniciadaEm: null };
	const resultado = await executarRotina({
		nome: NOME_DA_ROTINA,
		porta: pedido.execucao,
		agora,
		trabalho: {
			async reivindicar(limite, instante) {
				passagem.iniciadaEm = instante;
				return (await porta.reivindicarChamadas(limite, instante)).map((chamada) => ({
					chave: chamada.id,
					chamada
				}));
			},
			async processar(item, instante) {
				if (await expurgarChamada(porta, item.chamada, instante) === "expurgada") {
					const conta = item.chamada.account_id;
					expurgadasPorConta.set(conta, (expurgadasPorConta.get(conta) ?? 0) + 1);
				}
			}
		}
	});
	const { iniciadaEm } = passagem;
	if (iniciadaEm !== null) {
		const fim = new Date(agora()).toISOString();
		for (const [conta, quantas] of expurgadasPorConta) await porta.registrarNaConta({
			routine: NOME_DA_ROTINA,
			account_id: conta,
			started_at: iniciadaEm,
			finished_at: fim,
			items: quantas,
			error: null
		});
	}
	return resultado;
}
async function expurgarChamada(porta, chamada, instante) {
	const falhas = [];
	let storageEm = chamada.purge_storage_at;
	let provedorEm = chamada.purge_provider_at;
	const caminho = chamada.recording_path?.trim() ?? "";
	if (caminho !== "" && storageEm === null) {
		let resposta;
		try {
			resposta = await porta.apagarGravacao(caminho);
		} catch (erro) {
			resposta = {
				ok: false,
				razao: erro instanceof Error ? erro.message : "erro sem mensagem"
			};
		}
		if (resposta.ok) storageEm = instante;
		else falhas.push(`Storage recusou a remoção: ${resposta.razao}`);
	}
	const conversa = chamada.provider_conversation_id?.trim() ?? "";
	if (conversa !== "" && provedorEm === null) {
		let resposta;
		try {
			resposta = await porta.apagarConversa(chamada.account_id, conversa);
		} catch {
			resposta = {
				status_code: null,
				latency_ms: 0
			};
		}
		const confirmou = provedorConfirmou(resposta);
		if (resposta !== null) await porta.rastrear({
			account_id: chamada.account_id,
			direction: "outbound",
			provider: "voz",
			endpoint: caminhoDaConversa(conversa),
			request: {
				metodo: "DELETE",
				motivo: "expurgo"
			},
			response: { expurgo: confirmou ? "confirmado" : "recusado" },
			status_code: resposta.status_code,
			latency_ms: Math.max(0, Math.round(resposta.latency_ms)),
			correlation_id: chamada.id
		});
		if (confirmou) provedorEm = instante;
		else falhas.push(razaoDoProvedor(resposta));
	}
	if (falhas.length === 0) {
		await porta.concluir(chamada.id, {
			recording_path: null,
			transcript: {},
			content_purged_at: instante,
			recording_expires_at: validadeDaGravacao(chamada, instante),
			purge_storage_at: storageEm,
			purge_provider_at: provedorEm,
			purge_note: null
		});
		return "expurgada";
	}
	const tentativas = chamada.purge_attempts + 1;
	const razao = falhas.join("; ");
	const desiste = tentativas >= 5;
	await porta.anotar(chamada.id, {
		...chamada.purge_storage_at === null && storageEm !== null ? { purge_storage_at: storageEm } : {},
		...chamada.purge_provider_at === null && provedorEm !== null ? { purge_provider_at: provedorEm } : {},
		purge_attempts: tentativas,
		purge_note: razao,
		...desiste ? { purge_gave_up_at: instante } : {}
	});
	if (!desiste) return "pendente";
	await porta.registrarNaConta({
		routine: NOME_DA_ROTINA,
		account_id: chamada.account_id,
		started_at: instante,
		finished_at: instante,
		items: 1,
		error: `desistência do expurgo da chamada ${chamada.id} depois de ${tentativas} falhas: ${razao}; o conteúdo continua guardado e precisa de apuração manual`
	});
	return "desistencia";
}
function validadeDaGravacao(chamada, instante) {
	const atual = chamada.recording_expires_at;
	if (!((chamada.recording_path?.trim() ?? "") !== "")) return atual;
	if (atual === null || Date.parse(atual) > Date.parse(instante)) return instante;
	return atual;
}
async function atenderRotina(pedido, expurgo, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return {
		status: 405,
		corpo: { ok: false }
	};
	if (!await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno)) return {
		status: 401,
		corpo: { ok: false }
	};
	const resultado = await expurgarConteudo(expurgo);
	return {
		status: resultado.ok ? 200 : 500,
		corpo: { ...resultado }
	};
}
//#endregion
//#region supabase/functions/cron-retention/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
const ENDERECO_DO_PROVEDOR_DE_VOZ = "https://api.elevenlabs.io/v1";
const LIMITE_DO_PROVEDOR_MS = 1e4;
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
const porta = {
	async reivindicarChamadas(limite, instante) {
		const { data, error } = await servico.rpc("reivindicar_expurgo", {
			p_limite: limite,
			p_instante: instante
		});
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async apagarGravacao(caminho) {
		const { error } = await servico.storage.from(BALDE_DAS_GRAVACOES).remove([caminho]);
		return error ? {
			ok: false,
			razao: error.message
		} : { ok: true };
	},
	async apagarConversa(contaId, conversaId) {
		const credencial = await cofre.resolveSecret(contaId, "voz", CHAVE_DO_PROVEDOR_DE_VOZ);
		if (!credencial.ok) return null;
		const inicio = Date.now();
		try {
			const resposta = await fetch(`${ENDERECO_DO_PROVEDOR_DE_VOZ}/${caminhoDaConversa(conversaId)}`, {
				method: "DELETE",
				headers: { "xi-api-key": credencial.valor },
				signal: AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS)
			});
			await resposta.body?.cancel();
			return {
				status_code: resposta.status,
				latency_ms: Date.now() - inicio
			};
		} catch {
			return {
				status_code: null,
				latency_ms: Date.now() - inicio
			};
		}
	},
	async rastrear(rastro) {
		const { error } = await servico.from("integration_events").insert(rastro);
		if (error) console.warn(JSON.stringify({
			funcao: "cron-retention",
			passo: "rastro",
			erro: error.message
		}));
	},
	async anotar(chamadaId, nota) {
		const { error } = await servico.from("calls").update(nota).eq("id", chamadaId).is("content_purged_at", null);
		if (error) throw new Error(error.message);
	},
	async concluir(chamadaId, conclusao) {
		const { error } = await servico.from("calls").update(conclusao).eq("id", chamadaId).is("content_purged_at", null);
		if (error) throw new Error(error.message);
	},
	async registrarNaConta(linha) {
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
