// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/call-events/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/_shared/hash-de-segredo.ts
const HASH_HEXADECIMAL = /^[0-9a-f]{64}$/;
function pareceHashEmHexadecimal(valor) {
	return HASH_HEXADECIMAL.test(valor);
}
function hashesIguais(a, b) {
	if (a.length !== b.length) return false;
	let diferenca = 0;
	for (let posicao = 0; posicao < a.length; posicao += 1) diferenca |= a.charCodeAt(posicao) ^ b.charCodeAt(posicao);
	return diferenca === 0;
}
const PREFIXO_DO_INSTANTE = "t=";
const PREFIXO_DA_ASSINATURA = "v0=";
function lerAssinaturaDoProvedor(cabecalho) {
	const texto = cabecalho?.trim() ?? "";
	if (texto === "") return null;
	let instante = null;
	let valor = null;
	for (const parte of texto.split(",")) {
		const pedaco = parte.trim();
		if (pedaco.startsWith(PREFIXO_DO_INSTANTE)) {
			const digitos = pedaco.slice(2);
			if (!/^[0-9]{1,15}$/.test(digitos)) return null;
			instante = Number(digitos);
		} else if (pedaco.startsWith(PREFIXO_DA_ASSINATURA)) valor = pedaco.slice(3);
	}
	if (instante === null || valor === null) return null;
	if (!pareceHashEmHexadecimal(valor)) return null;
	return {
		instante,
		valor
	};
}
async function assinaturaDoProvedor(segredo, instante, corpo) {
	if (segredo.length === 0) throw new Error("segredo de webhook do provedor vazio");
	const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	const resumo = await crypto.subtle.sign("HMAC", material, new TextEncoder().encode(`${instante}.${corpo}`));
	return [...new Uint8Array(resumo)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function lerInstanteDaRotacao(texto) {
	const valor = texto?.trim() ?? "";
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(valor)) return null;
	const milissegundos = Date.parse(valor);
	return Number.isFinite(milissegundos) ? Math.floor(milissegundos / 1e3) : null;
}
async function conferirAssinaturaDoProvedor(pedido) {
	const segredo = pedido.segredo?.trim() ?? "";
	if (segredo.length === 0) return false;
	const lida = lerAssinaturaDoProvedor(pedido.assinatura);
	if (!lida) return false;
	if (Math.abs(pedido.agoraEmSegundos - lida.instante) > 1800) return false;
	const esperada = await assinaturaDoProvedor(segredo, lida.instante, pedido.corpo);
	if (hashesIguais(lida.valor, esperada)) return true;
	const anterior = pedido.segredoAnterior?.trim() ?? "";
	if (anterior.length === 0 || anterior === segredo) return false;
	const rotacionadoEm = pedido.rotacionadoEmSegundos;
	if (typeof rotacionadoEm !== "number" || !Number.isFinite(rotacionadoEm)) return false;
	const desdeARotacao = pedido.agoraEmSegundos - rotacionadoEm;
	if (desdeARotacao < 0 || desdeARotacao > 86400) return false;
	const comOAnterior = await assinaturaDoProvedor(anterior, lida.instante, pedido.corpo);
	return hashesIguais(lida.valor, comOAnterior);
}
//#endregion
//#region supabase/functions/_shared/provedor/webhooks-da-conta.ts
const PARAMETRO_DA_CONTA = "conta";
const CHAVE_DO_SEGREDO_DO_FIM = "webhook_secret";
const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function contaDoEndereco(endereco) {
	let valor;
	try {
		valor = new URL(endereco).searchParams.get(PARAMETRO_DA_CONTA);
	} catch {
		return null;
	}
	const conta = valor?.trim().toLowerCase() ?? "";
	return FORMATO_DE_UUID.test(conta) ? conta : null;
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
//#endregion
//#region supabase/functions/call-events/formato-do-provedor.ts
function lerAvisoDoProvedor(corpo) {
	const campos = objeto(corpo);
	if (!campos) return null;
	const dados = objeto(campos.data) ?? {};
	const metadados = objeto(dados.metadata) ?? {};
	const telefonia = objeto(metadados.phone_call) ?? {};
	const instante = campos.event_timestamp;
	return {
		tipo: texto(campos.type),
		conversaId: texto(dados.conversation_id),
		chamadaDaTelefoniaId: texto(telefonia.call_sid) ?? texto(metadados.call_sid),
		situacao: texto(dados.status),
		instanteDoEvento: typeof instante === "number" && Number.isFinite(instante) ? instante : null
	};
}
function objeto(valor) {
	return typeof valor === "object" && valor !== null && !Array.isArray(valor) ? valor : null;
}
function texto(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
//#endregion
//#region supabase/functions/call-events/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	assinatura_invalida: "Assinatura inválida.",
	corpo_invalido: "O webhook chegou sem um corpo JSON legível.",
	finalizacao_indisponivel: "A finalização desta ligação não pôde ser acionada agora. Reenvie o aviso.",
	falha_interna: "Não foi possível processar este aviso agora. Reenvie o aviso."
};
const STATUS = {
	metodo_invalido: 405,
	assinatura_invalida: 401,
	corpo_invalido: 400,
	finalizacao_indisponivel: 503,
	falha_interna: 503
};
const ENDPOINT_DO_AVISO = "call-events";
async function receberAviso(pedido, porta, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	if (!lerAssinaturaDoProvedor(pedido.assinatura)) return recusa("assinatura_invalida");
	let contaProvada = null;
	let cofreFalhou = false;
	const conta = pedido.contaDoEndereco ?? null;
	if (conta) {
		let segredoDaConta = null;
		try {
			segredoDaConta = await porta.segredoDoWebhookDaConta(conta);
		} catch {
			cofreFalhou = true;
		}
		if (await conferirAssinaturaDoProvedor({
			segredo: segredoDaConta,
			corpo: pedido.corpo,
			assinatura: pedido.assinatura,
			agoraEmSegundos: opcoes.agoraEmSegundos
		})) contaProvada = conta;
	}
	if (contaProvada === null) {
		if (!await conferirAssinaturaDoProvedor({
			segredo: opcoes.segredoDoWebhook,
			segredoAnterior: opcoes.segredoAnterior,
			rotacionadoEmSegundos: opcoes.rotacionadoEmSegundos,
			corpo: pedido.corpo,
			assinatura: pedido.assinatura,
			agoraEmSegundos: opcoes.agoraEmSegundos
		})) return recusa(cofreFalhou ? "falha_interna" : "assinatura_invalida");
	}
	let corpo;
	try {
		corpo = JSON.parse(pedido.corpo);
	} catch {
		return recusa("corpo_invalido");
	}
	const aviso = lerAvisoDoProvedor(corpo);
	if (!aviso) return recusa("corpo_invalido");
	let chamada;
	try {
		chamada = await resolverChamada(aviso, porta);
	} catch {
		return recusa("falha_interna");
	}
	if (chamada && contaProvada !== null && chamada.account_id !== contaProvada) chamada = null;
	if (!chamada) {
		try {
			await porta.registrarAvisoSemChamada({
				tipo: aviso.tipo,
				conversaId: aviso.conversaId,
				chamadaDaTelefoniaId: aviso.chamadaDaTelefoniaId
			});
		} catch {}
		return {
			status: 200,
			corpo: {
				ok: true,
				chamadaId: null,
				desfecho: "conversa_desconhecida"
			}
		};
	}
	let acionada = true;
	try {
		await porta.acionarFinalizacao(chamada.id);
	} catch {
		acionada = false;
	}
	const resposta = acionada ? {
		status: 200,
		corpo: {
			ok: true,
			chamadaId: chamada.id,
			desfecho: "finalizacao_acionada"
		}
	} : recusa("finalizacao_indisponivel");
	await registrarRastro(chamada, aviso, resposta, porta);
	return resposta;
}
async function resolverChamada(aviso, porta) {
	if (aviso.conversaId) {
		const pelaConversa = await porta.chamadaPelaConversa(aviso.conversaId);
		if (pelaConversa) return pelaConversa;
	}
	if (aviso.chamadaDaTelefoniaId) return await porta.chamadaPelaTelefonia(aviso.chamadaDaTelefoniaId);
	return null;
}
async function registrarRastro(chamada, aviso, resposta, porta) {
	try {
		await porta.registrarEventoDeIntegracao({
			account_id: chamada.account_id,
			direction: "inbound",
			provider: "voz",
			endpoint: ENDPOINT_DO_AVISO,
			request: {
				type: aviso.tipo,
				conversation_id: aviso.conversaId,
				call_sid: aviso.chamadaDaTelefoniaId,
				status: aviso.situacao,
				event_timestamp: aviso.instanteDoEvento
			},
			response: { ...resposta.corpo },
			status_code: resposta.status,
			latency_ms: null,
			correlation_id: chamada.id
		});
	} catch {}
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
//#region supabase/functions/call-events/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
const SEGREDO_DO_WEBHOOK = Deno.env.get("SARAH_VOZ_WEBHOOK_SECRET") ?? null;
const SEGREDO_ANTERIOR = Deno.env.get("SARAH_VOZ_WEBHOOK_SECRET_ANTERIOR") ?? null;
const ROTACIONADO_EM = lerInstanteDaRotacao(Deno.env.get("SARAH_VOZ_WEBHOOK_ROTACIONADO_EM"));
const CABECALHO_DA_ASSINATURA = "elevenlabs-signature";
const CABECALHO_INTERNO = "x-internal-secret";
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
async function chamadaPor(coluna, valor) {
	const { data, error } = await servico.from("calls").select("id, account_id").eq(coluna, valor).limit(1).maybeSingle();
	if (error) throw new Error(error.message);
	if (!data) return null;
	const linha = data;
	return {
		id: String(linha.id ?? ""),
		account_id: String(linha.account_id ?? "")
	};
}
const porta = {
	async segredoDoWebhookDaConta(contaId) {
		const { data, error } = await servico.rpc("get_account_secret", {
			p_account_id: contaId,
			p_provider: "voz",
			p_key_name: CHAVE_DO_SEGREDO_DO_FIM
		});
		if (error) throw new Error(error.message);
		return typeof data === "string" && data.trim() !== "" ? data : null;
	},
	chamadaPelaConversa: (conversaId) => chamadaPor("provider_conversation_id", conversaId),
	chamadaPelaTelefonia: (sid) => chamadaPor("provider_call_sid", sid),
	async acionarFinalizacao(chamadaId) {
		const resposta = await fetch(`${URL_DO_SUPABASE}/functions/v1/call-finalize`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				[CABECALHO_INTERNO]: await segredoInterno(),
				authorization: `Bearer ${CHAVE_DE_SERVICO}`
			},
			body: JSON.stringify({ call_id: chamadaId })
		});
		await resposta.body?.cancel();
		if (!resposta.ok && resposta.status !== 409) throw new Error(`call-finalize respondeu ${resposta.status}`);
	},
	async registrarEventoDeIntegracao(evento) {
		const { error } = await servico.from("integration_events").insert(evento);
		if (error) throw new Error(error.message);
	},
	async registrarAvisoSemChamada(aviso) {
		console.warn(JSON.stringify({
			funcao: "call-events",
			desfecho: "conversa_desconhecida",
			...aviso
		}));
	}
};
Deno.serve(async (requisicao) => {
	let corpo = "";
	if (requisicao.method.toUpperCase() === "POST") try {
		corpo = await requisicao.text();
	} catch {}
	const resposta = await receberAviso({
		metodo: requisicao.method,
		corpo,
		assinatura: requisicao.headers.get(CABECALHO_DA_ASSINATURA),
		contaDoEndereco: contaDoEndereco(requisicao.url)
	}, porta, {
		segredoDoWebhook: SEGREDO_DO_WEBHOOK,
		segredoAnterior: SEGREDO_ANTERIOR,
		rotacionadoEmSegundos: ROTACIONADO_EM,
		agoraEmSegundos: Math.floor(Date.now() / 1e3)
	});
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		}
	});
});
//#endregion
