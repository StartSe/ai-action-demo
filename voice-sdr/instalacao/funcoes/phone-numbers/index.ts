// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/phone-numbers/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/phone-numbers/catalogo.ts
function temApontamento(a) {
	return Boolean(a.enderecoDeVoz || a.aplicativo || a.enderecoDeEstado);
}
const PAPEIS_QUE_VEEM = new Set(["owner", "admin"]);
const PREFIXO_BEARER = /^Bearer\s+(.+)$/i;
const FRASES = {
	metodo_invalido: "Este endereço responde a POST.",
	conta_ausente: "O pedido veio sem a conta a consultar.",
	sem_sessao: "Entre de novo para ver os números da conta.",
	sessao_invalida: "Sua sessão expirou. Entre de novo.",
	sem_acesso: "Você não participa desta conta.",
	papel_insuficiente: "Cadastrar linha é de quem administra a conta. Peça a quem administra.",
	telefonia_nao_configurada: "Cadastre a chave da telefonia em integrações antes de escolher o número.",
	provedor_recusou: "A telefonia recusou a consulta. Confira a chave em integrações.",
	provedor_indisponivel: "A telefonia não respondeu agora. Tente de novo em alguns minutos.",
	falha_interna: "Não foi possível listar agora. Tente de novo."
};
function recusa(motivo) {
	return {
		ok: false,
		motivo,
		mensagem: FRASES[motivo]
	};
}
function extrairJwt(autorizacao) {
	return PREFIXO_BEARER.exec(autorizacao?.trim() ?? "")?.[1]?.trim() || null;
}
async function atenderCatalogo(pedido, porta) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const contaId = typeof pedido.contaId === "string" ? pedido.contaId.trim() : "";
	if (!contaId) return recusa("conta_ausente");
	const jwt = extrairJwt(pedido.autorizacao);
	if (!jwt) return recusa("sem_sessao");
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sessao_invalida");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (!papel) return recusa("sem_acesso");
		if (!PAPEIS_QUE_VEEM.has(papel)) return recusa("papel_insuficiente");
		const credenciais = await porta.credenciaisDaTelefonia(contaId);
		if (!credenciais) return recusa("telefonia_nao_configurada");
		const doProvedor = await porta.numerosDoProvedor(credenciais);
		const cadastrados = new Set(await porta.numerosJaCadastrados(contaId));
		return {
			ok: true,
			numeros: doProvedor.map((n) => ({
				...n,
				jaCadastrado: cadastrados.has(n.e164),
				sobrescreveConfiguracao: !cadastrados.has(n.e164) && temApontamento(n.apontamento)
			})).sort((a, b) => {
				if (a.jaCadastrado !== b.jaCadastrado) return a.jaCadastrado ? 1 : -1;
				if (a.atendeVoz !== b.atendeVoz) return a.atendeVoz ? -1 : 1;
				return a.e164 < b.e164 ? -1 : a.e164 > b.e164 ? 1 : 0;
			})
		};
	} catch (erro) {
		const nome = erro instanceof Error ? erro.name : "";
		if (nome === "TimeoutError" || nome === "AbortError") return recusa("provedor_indisponivel");
		if (erro instanceof RecusaDoProvedor) return recusa(erro.motivo);
		return recusa("falha_interna");
	}
}
var RecusaDoProvedor = class extends Error {
	motivo;
	constructor(motivo) {
		super(motivo);
		this.name = "RecusaDoProvedor";
		this.motivo = motivo;
	}
};
//#endregion
//#region supabase/functions/phone-numbers/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const LIMITE_DA_CONSULTA_MS = 1e4;
const TETO_DE_NUMEROS = 100;
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
function semVazio(valor) {
	return typeof valor === "string" && valor.trim() ? valor.trim() : null;
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
	async credenciaisDaTelefonia(contaId) {
		const identificador = await cofre.resolveSecret(contaId, "telefonia", "account_sid");
		const token = await cofre.resolveSecret(contaId, "telefonia", "auth_token");
		if (!identificador.ok || !token.ok) return null;
		return {
			identificador: identificador.valor,
			token: token.valor
		};
	},
	async numerosDoProvedor({ identificador, token }) {
		const endereco = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(identificador)}/IncomingPhoneNumbers.json?PageSize=${TETO_DE_NUMEROS}`;
		const resposta = await fetch(endereco, {
			headers: { authorization: `Basic ${btoa(`${identificador}:${token}`)}` },
			signal: AbortSignal.timeout(LIMITE_DA_CONSULTA_MS)
		});
		if (!resposta.ok) throw new RecusaDoProvedor(resposta.status === 401 || resposta.status === 403 ? "provedor_recusou" : "provedor_indisponivel");
		return ((await resposta.json()).incoming_phone_numbers ?? []).filter((linha) => semVazio(linha.phone_number)).map((linha) => {
			const e164 = semVazio(linha.phone_number) ?? "";
			return {
				e164,
				rotulo: semVazio(linha.friendly_name) ?? e164,
				atendeVoz: linha.capabilities?.voice === true,
				apontamento: {
					enderecoDeVoz: semVazio(linha.voice_url),
					aplicativo: semVazio(linha.voice_application_sid),
					enderecoDeEstado: semVazio(linha.status_callback)
				}
			};
		});
	},
	async numerosJaCadastrados(contaId) {
		const { data, error } = await servico.from("phone_lines").select("e164").eq("account_id", contaId);
		if (error) throw new Error(error.message);
		return (data ?? []).map((linha) => linha.e164);
	}
};
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	let corpo = {};
	try {
		corpo = await requisicao.json();
	} catch {
		corpo = {};
	}
	const resposta = await atenderCatalogo({
		metodo: requisicao.method,
		contaId: corpo.contaId,
		autorizacao: requisicao.headers.get("authorization")
	}, porta);
	const status = resposta.ok ? 200 : resposta.motivo === "sem_sessao" || resposta.motivo === "sessao_invalida" ? 401 : resposta.motivo === "sem_acesso" || resposta.motivo === "papel_insuficiente" ? 403 : resposta.motivo === "metodo_invalido" ? 405 : resposta.motivo === "falha_interna" ? 500 : 400;
	return new Response(JSON.stringify(resposta), {
		status,
		headers: CABECALHOS
	});
});
//#endregion
