// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/inbound-twiml/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/_shared/telefonia/conta-no-endereco.ts
const PARAMETRO_DA_CONTA = "conta";
const FORMATO_DA_CONTA = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function contaDoEndereco(url) {
	let valores;
	try {
		valores = new URL(url).searchParams.getAll(PARAMETRO_DA_CONTA);
	} catch {
		return { tipo: "invalida" };
	}
	if (valores.length === 0) return { tipo: "sem_conta" };
	const [valor] = valores;
	if (valores.length > 1 || valor === void 0 || !FORMATO_DA_CONTA.test(valor)) return { tipo: "invalida" };
	return {
		tipo: "conta",
		contaId: valor.toLowerCase()
	};
}
//#endregion
//#region supabase/functions/phone-register/registro.ts
const PROVEDOR_DE_TELEFONIA = "telefonia";
const CHAVE_DO_TOKEN = "auth_token";
//#endregion
//#region supabase/functions/_shared/speech/atendimento-recebido.ts
const FALAS_DE_ATENDIMENTO_RECEBIDO = {
	apresentacao: "Oi! Aqui é a {nome_do_agente}, da {empresa}.",
	apresentacaoSemIdentidade: "Oi!",
	avisoDeEncaminhamento: "Só um instante que eu vou te passar pra pessoa certa.",
	recadoDaLinha: ["Ninguém consegue atender agora.", "Mas a gente vê que você ligou e te retorna. Obrigada, e até logo!"],
	linhaNaoAtende: "Essa ligação não pôde ser completada. Desculpa, e até logo."
};
//#endregion
//#region supabase/functions/_shared/hash-de-segredo.ts
function hashesIguais(a, b) {
	if (a.length !== b.length) return false;
	let diferenca = 0;
	for (let posicao = 0; posicao < a.length; posicao += 1) diferenca |= a.charCodeAt(posicao) ^ b.charCodeAt(posicao);
	return diferenca === 0;
}
//#endregion
//#region supabase/functions/_shared/telefonia/assinatura.ts
const FORMATO_DA_ASSINATURA = /^[A-Za-z0-9+/]{27}=$/;
function pareceAssinaturaDaTelefonia(valor) {
	return FORMATO_DA_ASSINATURA.test(valor);
}
function assinaturasIguais(a, b) {
	return hashesIguais(a, b);
}
async function assinaturaDaTelefonia(token, url, pares) {
	if (token.length === 0) throw new Error("token da telefonia vazio");
	const ordenados = [...pares].sort(([um], [outro]) => um < outro ? -1 : um > outro ? 1 : 0);
	let texto = url;
	for (const [nome, valor] of ordenados) texto += nome + valor;
	const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(token), {
		name: "HMAC",
		hash: "SHA-1"
	}, false, ["sign"]);
	const resumo = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(texto));
	let binario = "";
	for (const byte of new Uint8Array(resumo)) binario += String.fromCharCode(byte);
	return btoa(binario);
}
async function conferirAssinaturaDaTelefonia(pedido) {
	const token = pedido.token?.trim() ?? "";
	if (token.length === 0) return false;
	const recebida = pedido.assinatura?.trim() ?? "";
	if (!pareceAssinaturaDaTelefonia(recebida)) return false;
	return assinaturasIguais(recebida, await assinaturaDaTelefonia(token, pedido.url, pedido.pares));
}
//#endregion
//#region supabase/functions/inbound-twiml/documento.ts
const TIPO_DO_DOCUMENTO = "application/xml; charset=utf-8";
const VOZ_DA_TELEFONIA = "Polly.Camila-Neural";
const IDIOMA_DA_TELEFONIA = "pt-BR";
const ESCAPES = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&apos;"
};
function escaparXml(texto) {
	return texto.replace(/[&<>"']/g, (caractere) => ESCAPES[caractere] ?? caractere);
}
function say(frase) {
	return `<Say language="${IDIOMA_DA_TELEFONIA}" voice="${VOZ_DA_TELEFONIA}">${escaparXml(frase)}</Say>`;
}
function documento$1(corpo) {
	return `<?xml version="1.0" encoding="UTF-8"?><Response>${corpo}</Response>`;
}
function documentoDeEncerramento(frases) {
	return documento$1(`${frases.map(say).join("")}<Hangup/>`);
}
function documentoDeEncaminhamento(encaminhamento) {
	return documento$1(`${encaminhamento.frases.filter((frase) => frase.trim()).map(say).join("")}${`<Dial timeout="20" answerOnBridge="true" callerId="${escaparXml(encaminhamento.identificador)}">${escaparXml(encaminhamento.destino)}</Dial>`}`);
}
const FORMATO_E164 = /^\+[1-9][0-9]{7,14}$/;
const COMPORTAMENTOS_ATENDIDOS = new Set(["forward", "voicemail"]);
const RECUSA_DE_ASSINATURA = Object.freeze({
	status: 401,
	tipo: "text/plain; charset=utf-8",
	corpo: "assinatura invalida"
});
const RECUSA_DE_METODO = Object.freeze({
	status: 405,
	tipo: "text/plain; charset=utf-8",
	corpo: "metodo nao suportado"
});
async function atenderChamadaRecebida(pedido, porta, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return RECUSA_DE_METODO;
	const conta = contaDoEndereco(pedido.url);
	if (conta.tipo === "invalida") return RECUSA_DE_ASSINATURA;
	let token;
	if (conta.tipo === "conta") try {
		token = await porta.tokenDaConta(conta.contaId);
	} catch {
		return RECUSA_DE_ASSINATURA;
	}
	else token = opcoes.tokenDaInstalacao;
	if (!await conferirAssinaturaDaTelefonia({
		token,
		url: pedido.url,
		pares: pedido.pares,
		assinatura: pedido.assinatura
	})) return RECUSA_DE_ASSINATURA;
	const chamado = valorDoCorpo(pedido.pares, "To");
	if (!FORMATO_E164.test(chamado)) return encerrar(null);
	let linha;
	try {
		linha = await porta.linhaChamada(chamado);
	} catch {
		return encerrar(null);
	}
	if (linha && conta.tipo === "conta" && linha.account_id.toLowerCase() !== conta.contaId) return encerrar(null);
	if (!linha || !COMPORTAMENTOS_ATENDIDOS.has(linha.inbound_behavior)) return encerrar(linha);
	if (linha.inbound_behavior === "forward") {
		const destino = linha.forward_to?.trim() ?? "";
		if (!FORMATO_E164.test(destino)) return encerrar(linha);
		return documento(documentoDeEncaminhamento({
			destino,
			identificador: linha.e164,
			frases: [...apresentar(linha), FALAS_DE_ATENDIMENTO_RECEBIDO.avisoDeEncaminhamento]
		}));
	}
	return documento(documentoDeEncerramento([...apresentar(linha), ...FALAS_DE_ATENDIMENTO_RECEBIDO.recadoDaLinha]));
}
function documento(corpo) {
	return {
		status: 200,
		tipo: TIPO_DO_DOCUMENTO,
		corpo
	};
}
function apresentar(linha) {
	const nome = linha.agent_name?.trim() ?? "";
	const empresa = linha.company_name?.trim() ?? "";
	if (!nome || !empresa) return [FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacaoSemIdentidade];
	return [interpolarFala(FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacao, {
		nome_do_agente: nome,
		empresa
	})];
}
function encerrar(linha) {
	return documento(documentoDeEncerramento([...linha ? apresentar(linha) : [FALAS_DE_ATENDIMENTO_RECEBIDO.apresentacaoSemIdentidade], FALAS_DE_ATENDIMENTO_RECEBIDO.linhaNaoAtende]));
}
function valorDoCorpo(pares, nome) {
	for (const [chave, valor] of pares) if (chave === nome) return valor.trim();
	return "";
}
const MARCADOR = /\{([a-z_]+)\}/g;
function interpolarFala(fala, valores) {
	return fala.replace(MARCADOR, (_original, chave) => valores[chave] ?? "");
}
//#endregion
//#region supabase/functions/inbound-twiml/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const TOKEN_DA_INSTALACAO = Deno.env.get("SARAH_TELEFONIA_AUTH_TOKEN") ?? null;
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
	async tokenDaConta(contaId) {
		const resolucao = await cofre.resolveSecret(contaId, PROVEDOR_DE_TELEFONIA, CHAVE_DO_TOKEN);
		return resolucao.ok ? resolucao.valor : null;
	},
	async linhaChamada(e164) {
		const { data, error } = await servico.from("phone_lines").select("account_id, e164, inbound_behavior, forward_to").eq("e164", e164).eq("enabled", true).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const linha = data;
		const contaId = String(linha.account_id ?? "");
		const { data: agente } = await servico.from("agents").select("name, company_name").eq("account_id", contaId).maybeSingle();
		const identidade = agente ?? {};
		return {
			account_id: contaId,
			e164: String(linha.e164 ?? ""),
			inbound_behavior: String(linha.inbound_behavior ?? ""),
			forward_to: linha.forward_to ?? null,
			agent_name: identidade.name ?? null,
			company_name: identidade.company_name ?? null
		};
	}
};
Deno.serve(async (requisicao) => {
	const pares = [];
	if (requisicao.method.toUpperCase() === "POST") try {
		const texto = await requisicao.text();
		for (const [nome, valor] of new URLSearchParams(texto)) pares.push([nome, valor]);
	} catch {}
	const resposta = await atenderChamadaRecebida({
		metodo: requisicao.method,
		url: requisicao.url,
		pares,
		assinatura: requisicao.headers.get("x-twilio-signature")
	}, porta, { tokenDaInstalacao: TOKEN_DA_INSTALACAO });
	return new Response(resposta.corpo, {
		status: resposta.status,
		headers: {
			"content-type": resposta.tipo,
			"cache-control": "no-store"
		}
	});
});
//#endregion
