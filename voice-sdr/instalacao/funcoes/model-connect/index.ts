// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/model-connect/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/_shared/modelo/openrouter.ts
const PROVEDOR = "openrouter";
const CHAVE_NO_COFRE = "api_key";
const URL_DE_AUTORIZACAO = "https://openrouter.ai/auth";
const URL_DA_TROCA = "https://openrouter.ai/api/v1/auth/keys";
const URL_DOS_MODELOS = "https://openrouter.ai/api/v1/models";
const PARAMETRO_DO_ESTADO = "state";
function montarUrlDeAutorizacao(pedido) {
	const retorno = new URL(pedido.callbackUrl);
	retorno.searchParams.set(PARAMETRO_DO_ESTADO, pedido.estado);
	const url = new URL(URL_DE_AUTORIZACAO);
	url.searchParams.set("callback_url", retorno.toString());
	url.searchParams.set("code_challenge", pedido.desafio);
	url.searchParams.set("code_challenge_method", pedido.metodoDoDesafio);
	url.searchParams.set("key_label", pedido.rotuloDaChave);
	url.searchParams.set(PARAMETRO_DO_ESTADO, pedido.estado);
	return url.toString();
}
function lerEstadoDaVolta(parametros) {
	const direto = typeof parametros.state === "string" ? parametros.state.trim() : "";
	if (direto !== "") return direto;
	const daQuery = typeof parametros.callbackQuery === "string" ? parametros.callbackQuery.trim() : "";
	return daQuery === "" ? null : daQuery;
}
function corpoDaTroca(codigo, verifier, metodo) {
	return {
		code: codigo,
		code_verifier: verifier,
		code_challenge_method: metodo
	};
}
function lerChaveDaTroca(dado) {
	if (!dado || typeof dado !== "object" || Array.isArray(dado)) return null;
	const chave = dado.key;
	if (typeof chave !== "string") return null;
	const limpa = chave.trim();
	return limpa === "" ? null : limpa;
}
function resumoDaChave(chave) {
	return {
		final: chave.slice(-4),
		caracteres: chave.length
	};
}
function lerCatalogo(dado) {
	const lista = dado && typeof dado === "object" && Array.isArray(dado.data) ? dado.data : [];
	const modelos = [];
	for (const item of lista) {
		if (!item || typeof item !== "object") continue;
		const { id, name, context_length: contexto, pricing, architecture } = item;
		if (typeof id !== "string" || id.trim() === "") continue;
		const precos = pricing && typeof pricing === "object" ? pricing : {};
		modelos.push({
			id: id.trim(),
			nome: typeof name === "string" && name.trim() !== "" ? name.trim() : id.trim(),
			contexto: numero(contexto),
			precoDeEntrada: textoOuNulo(precos.prompt),
			precoDeSaida: textoOuNulo(precos.completion),
			entradas: lerEntradas(architecture)
		});
	}
	return modelos;
}
function lerEntradas(arquitetura) {
	if (!arquitetura || typeof arquitetura !== "object") return null;
	const lista = arquitetura.input_modalities;
	if (!Array.isArray(lista)) return null;
	return lista.filter((item) => typeof item === "string").map((item) => item.trim().toLowerCase());
}
function numero(valor) {
	return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
function textoOuNulo(valor) {
	if (typeof valor !== "string") return null;
	const limpo = valor.trim();
	return limpo === "" ? null : limpo;
}
//#endregion
//#region supabase/functions/_shared/origens-permitidas.ts
function origensPermitidas(definidas, origemDoPedido) {
	const lista = (definidas ?? "").split(",").map((origem) => origem.trim()).filter((origem) => origem !== "");
	if (lista.length > 0) return lista;
	const origem = origemDoPedido?.trim() ?? "";
	if (origem === "" || origem === "null") return [];
	try {
		return [new URL(origem).origin];
	} catch {
		return [];
	}
}
//#endregion
//#region supabase/functions/_shared/modelo/pkce.ts
const METODO_DO_DESAFIO = "S256";
function base64url(bytes) {
	let binario = "";
	for (const byte of bytes) binario += String.fromCharCode(byte);
	return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function bytesAleatorios(quantidade) {
	const bytes = new Uint8Array(quantidade);
	crypto.getRandomValues(bytes);
	return bytes;
}
function criarVerifier() {
	return base64url(bytesAleatorios(32));
}
function criarEstado() {
	return base64url(bytesAleatorios(24));
}
async function desafioDoVerifier(verifier) {
	const resumo = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
	return base64url(new Uint8Array(resumo));
}
async function criarPar() {
	const verifier = criarVerifier();
	return {
		verifier,
		desafio: await desafioDoVerifier(verifier),
		estado: criarEstado()
	};
}
//#endregion
//#region supabase/functions/_shared/marca.ts
const NOME_DO_PRODUTO = "Voice SDR";
//#endregion
//#region supabase/functions/model-connect/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido veio sem a conta.",
	acao_invalida: "O pedido veio sem um passo conhecido da conexão.",
	retorno_ausente: "O pedido veio sem o endereço de retorno.",
	retorno_invalido: "O endereço de retorno não é desta aplicação.",
	codigo_ausente: "O provedor não devolveu o código de autorização.",
	estado_ausente: "O provedor não devolveu a marca desta autorização.",
	estado_desconhecido: "Esta autorização não vale mais. Comece a conexão de novo pela tela de integrações.",
	conta_divergente: "Esta autorização foi aberta em outra conta.",
	sem_sessao: "Entre na sua conta para conectar o modelo.",
	sessao_invalida: "Sua sessão expirou. Entre de novo para conectar o modelo.",
	sem_acesso: "Você não tem acesso a esta conta.",
	papel_insuficiente: "Conectar o provedor de modelo guarda uma credencial no cofre da conta, e isso é do dono. Peça a conexão a quem é dono da conta.",
	provedor_recusou: "O provedor recusou esta autorização. Ela pode ter passado do prazo de dez minutos. Comece de novo.",
	provedor_indisponivel: "Não foi possível falar com o provedor agora. Tente de novo em alguns minutos.",
	resposta_ilegivel: "O provedor respondeu fora do formato esperado e nada foi gravado.",
	falha_interna: "Não foi possível concluir a conexão agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_invalido: 405,
	conta_ausente: 400,
	acao_invalida: 400,
	retorno_ausente: 400,
	retorno_invalido: 400,
	codigo_ausente: 400,
	estado_ausente: 400,
	estado_desconhecido: 409,
	conta_divergente: 403,
	sem_sessao: 401,
	sessao_invalida: 401,
	sem_acesso: 403,
	papel_insuficiente: 403,
	provedor_recusou: 502,
	provedor_indisponivel: 503,
	resposta_ilegivel: 502,
	falha_interna: 500
};
function rotuloDaChave(nomeDaConta) {
	const limpo = nomeDaConta.trim();
	return limpo === "" ? NOME_DO_PRODUTO : `${NOME_DO_PRODUTO} — ${limpo}`;
}
//#endregion
//#region supabase/functions/model-connect/conexao.ts
const PAPEIS_QUE_CONECTAM = new Set(["owner"]);
const ACOES = [
	"iniciar",
	"concluir",
	"desconectar",
	"catalogo"
];
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function atenderConexao(pedido, porta) {
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
		if (!PAPEIS_QUE_CONECTAM.has(papel)) return recusa("papel_insuficiente");
		if (acao === "iniciar") return await iniciar(pedido, contaId, usuario.id, porta);
		if (acao === "concluir") return await concluir(pedido, contaId, usuario.id, porta);
		if (acao === "desconectar") return await desconectar(contaId, porta);
		return await catalogo(porta);
	} catch {
		return recusa("falha_interna");
	}
}
function lerAcao(valor) {
	return typeof valor === "string" && ACOES.includes(valor) ? valor : null;
}
async function iniciar(pedido, contaId, autorId, porta) {
	const retorno = texto(pedido.retorno);
	if (!retorno) return recusa("retorno_ausente");
	if (!retornoPermitido(retorno, porta.origensPermitidas())) return recusa("retorno_invalido");
	const par = await criarPar();
	await porta.abrirAutorizacao({
		contaId,
		provedor: PROVEDOR,
		estado: par.estado,
		verifier: par.verifier,
		callbackUrl: retorno,
		criadaPor: autorId
	});
	return {
		status: 200,
		corpo: {
			ok: true,
			passo: "iniciada",
			url: montarUrlDeAutorizacao({
				callbackUrl: retorno,
				desafio: par.desafio,
				metodoDoDesafio: METODO_DO_DESAFIO,
				estado: par.estado,
				rotuloDaChave: rotuloDaChave(await porta.nomeDaConta(contaId))
			})
		}
	};
}
async function concluir(pedido, contaId, autorId, porta) {
	const codigo = texto(pedido.codigo);
	if (!codigo) return recusa("codigo_ausente");
	const estado = lerEstadoDaVolta({
		state: pedido.estado,
		callbackQuery: pedido.estadoDaQuery
	});
	if (!estado) return recusa("estado_ausente");
	const emVoo = await porta.consumirAutorizacao(estado);
	if (!emVoo) return recusa("estado_desconhecido");
	if (emVoo.contaId !== contaId) return recusa("conta_divergente");
	const resposta = await porta.trocarCodigoPorChave(corpoDaTroca(codigo, emVoo.verifier, METODO_DO_DESAFIO));
	if (!resposta.ok) {
		const status = resposta.status ?? 0;
		return recusa(status >= 400 && status < 500 ? "provedor_recusou" : "provedor_indisponivel");
	}
	const chave = lerChaveDaTroca(resposta.corpo);
	if (!chave) return recusa("resposta_ilegivel");
	await porta.gravarChaveNoCofre(contaId, chave, autorId);
	const resumo = resumoDaChave(chave);
	await porta.concluirConexao(contaId, emVoo.provedor, resumo, autorId);
	return {
		status: 200,
		corpo: {
			ok: true,
			passo: "conectada",
			provedor: emVoo.provedor,
			resumo
		}
	};
}
async function desconectar(contaId, porta) {
	await porta.desconectar(contaId);
	await porta.apagarChaveDoCofre(contaId);
	return {
		status: 200,
		corpo: {
			ok: true,
			passo: "desconectada"
		}
	};
}
async function catalogo(porta) {
	const resposta = await porta.buscarCatalogo();
	if (!resposta.ok) return recusa("provedor_indisponivel");
	const modelos = lerCatalogo(resposta.corpo);
	if (modelos.length === 0) return recusa("resposta_ilegivel");
	return {
		status: 200,
		corpo: {
			ok: true,
			passo: "catalogo",
			modelos
		}
	};
}
function retornoPermitido(retorno, origens) {
	let url;
	try {
		url = new URL(retorno);
	} catch {
		return false;
	}
	const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
	if (url.protocol !== "https:" && !(url.protocol === "http:" && localhost)) return false;
	return origens.some((permitida) => {
		try {
			return new URL(permitida).origin === url.origin;
		} catch {
			return false;
		}
	});
}
function texto(valor) {
	const limpo = typeof valor === "string" ? valor.trim() : "";
	return limpo === "" ? null : limpo;
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
//#region supabase/functions/model-connect/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CHAVE_ANONIMA = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ORIGENS_DEFINIDAS = Deno.env.get("SARAH_ORIGENS_PERMITIDAS");
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
function comoUsuario(jwt) {
	return createClient(URL_DO_SUPABASE, CHAVE_ANONIMA, {
		auth: {
			persistSession: false,
			autoRefreshToken: false
		},
		global: { headers: { Authorization: `Bearer ${jwt}` } }
	});
}
async function irAoProvedor(url, init, endpoint) {
	const inicio = Date.now();
	const cancelar = AbortSignal.timeout(LIMITE_DO_PROVEDOR_MS);
	try {
		const resposta = await fetch(url, {
			...init,
			signal: cancelar
		});
		let corpo = null;
		try {
			corpo = await resposta.json();
		} catch {}
		return {
			ok: resposta.ok,
			status: resposta.status,
			codigo: resposta.ok ? null : String(resposta.status),
			latenciaMs: Date.now() - inicio,
			endpoint,
			corpo
		};
	} catch (erro) {
		return {
			ok: false,
			status: null,
			codigo: erro instanceof Error ? erro.name : "fetch_failed",
			latenciaMs: Date.now() - inicio,
			endpoint,
			corpo: null
		};
	}
}
function montarPorta(jwt, origens) {
	const daPessoa = comoUsuario(jwt);
	return {
		async usuarioDaSessao(token) {
			const { data, error } = await servico.auth.getUser(token);
			if (error || !data.user) return null;
			return { id: data.user.id };
		},
		async papelNaConta(contaId, usuarioId) {
			const { data, error } = await servico.from("account_members").select("role").eq("account_id", contaId).eq("user_id", usuarioId).maybeSingle();
			if (error) throw new Error(error.message);
			return data?.role ?? null;
		},
		async nomeDaConta(contaId) {
			const { data, error } = await servico.from("accounts").select("name").eq("id", contaId).maybeSingle();
			if (error) throw new Error(error.message);
			return data?.name ?? "";
		},
		async abrirAutorizacao(dados) {
			const { error } = await servico.rpc("abrir_autorizacao_de_modelo", {
				p_account_id: dados.contaId,
				p_provider: dados.provedor,
				p_state: dados.estado,
				p_code_verifier: dados.verifier,
				p_callback_url: dados.callbackUrl,
				p_created_by: dados.criadaPor
			});
			if (error) throw new Error(error.message);
		},
		async consumirAutorizacao(estado) {
			const { data, error } = await servico.rpc("consumir_autorizacao_de_modelo", { p_state: estado });
			if (error) throw new Error(error.message);
			const linha = (data ?? [])[0];
			if (!linha) return null;
			return {
				contaId: linha.account_id,
				provedor: linha.provider,
				verifier: linha.code_verifier,
				callbackUrl: linha.callback_url
			};
		},
		async trocarCodigoPorChave(corpo) {
			return await irAoProvedor(URL_DA_TROCA, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(corpo)
			}, "api/v1/auth/keys");
		},
		async buscarCatalogo() {
			return await irAoProvedor(URL_DOS_MODELOS, { method: "GET" }, "api/v1/models");
		},
		async gravarChaveNoCofre(contaId, chave) {
			const { error } = await daPessoa.rpc("set_account_secret", {
				p_account_id: contaId,
				p_provider: PROVEDOR,
				p_key_name: CHAVE_NO_COFRE,
				p_secret: chave,
				p_metadata: { origem: "oauth" }
			});
			if (error) throw new Error(error.message);
		},
		async apagarChaveDoCofre(contaId) {
			const { error } = await daPessoa.rpc("delete_account_secret", {
				p_account_id: contaId,
				p_provider: PROVEDOR,
				p_key_name: CHAVE_NO_COFRE
			});
			if (error) throw new Error(error.message);
		},
		async concluirConexao(contaId, provedor, resumo, autorId) {
			const { error } = await servico.rpc("concluir_conexao_de_modelo", {
				p_account_id: contaId,
				p_provider: provedor,
				p_connection: resumo,
				p_connected_by: autorId
			});
			if (error) throw new Error(error.message);
		},
		async desconectar(contaId) {
			const { error } = await servico.rpc("desconectar_modelo_da_conta", { p_account_id: contaId });
			if (error) throw new Error(error.message);
		},
		origensPermitidas() {
			return origens;
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
	const autorizacao = requisicao.headers.get("authorization");
	const jwt = /^bearer\s+(.+)$/i.exec(autorizacao?.trim() ?? "")?.[1]?.trim() ?? "";
	const resposta = await atenderConexao({
		metodo: requisicao.method,
		autorizacao,
		contaId: corpo?.account_id ?? null,
		acao: corpo?.action ?? null,
		retorno: corpo?.return_url ?? null,
		codigo: corpo?.code ?? null,
		estado: corpo?.state ?? null,
		estadoDaQuery: corpo?.callback_state ?? null
	}, montarPorta(jwt, origensPermitidas(ORIGENS_DEFINIDAS, requisicao.headers.get("origin"))));
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
