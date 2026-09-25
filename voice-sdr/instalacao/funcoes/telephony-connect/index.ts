// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/telephony-connect/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
const TEXTO = new TextEncoder();
const CONTA_DO_PROVEDOR = /^AC[0-9a-fA-F]{32}$/;
function base64url(bytes) {
	const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let bruto = "";
	for (const byte of vista) bruto += String.fromCharCode(byte);
	return btoa(bruto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deBase64url(valor) {
	const preenchido = valor.replace(/-/g, "+").replace(/_/g, "/");
	return atob(preenchido + "=".repeat((4 - preenchido.length % 4) % 4));
}
async function assinar(carga, chave) {
	const material = await crypto.subtle.importKey("raw", TEXTO.encode(chave), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	return base64url(await crypto.subtle.sign("HMAC", material, TEXTO.encode(carga)));
}
function assinaturasConferem(recebida, esperada) {
	if (recebida.length !== esperada.length) return false;
	let diferenca = 0;
	for (let i = 0; i < recebida.length; i += 1) diferenca |= recebida.charCodeAt(i) ^ esperada.charCodeAt(i);
	return diferenca === 0;
}
async function emitirEstado(estado, chaveDoServidor, agora = Date.now()) {
	const carga = base64url(TEXTO.encode(JSON.stringify({
		contaId: estado.contaId,
		usuarioId: estado.usuarioId,
		emitidoEm: agora
	})));
	return `${carga}.${await assinar(carga, chaveDoServidor)}`;
}
async function lerEstado(valor, chaveDoServidor, agora = Date.now()) {
	const bruto = (valor ?? "").trim();
	if (!bruto) return {
		ok: false,
		motivo: "estado_ausente"
	};
	const partes = bruto.split(".");
	if (partes.length !== 2 || !partes[0] || !partes[1]) return {
		ok: false,
		motivo: "estado_malformado"
	};
	const [carga, assinatura] = partes;
	if (!assinaturasConferem(assinatura, await assinar(carga, chaveDoServidor))) return {
		ok: false,
		motivo: "assinatura_invalida"
	};
	let decodificada;
	try {
		decodificada = JSON.parse(deBase64url(carga));
	} catch {
		return {
			ok: false,
			motivo: "estado_malformado"
		};
	}
	const { contaId, usuarioId, emitidoEm } = decodificada ?? {};
	if (typeof contaId !== "string" || typeof usuarioId !== "string" || typeof emitidoEm !== "number" || !contaId || !usuarioId) return {
		ok: false,
		motivo: "estado_malformado"
	};
	if (agora - emitidoEm > 9e5 || emitidoEm > agora) return {
		ok: false,
		motivo: "estado_expirado"
	};
	return {
		ok: true,
		estado: {
			contaId,
			usuarioId,
			emitidoEm
		}
	};
}
async function lerRetornoDaAutorizacao(parametros, chaveDoServidor, agora = Date.now()) {
	const leitura = await lerEstado(parametros.estado, chaveDoServidor, agora);
	if (!leitura.ok) return leitura;
	const contaDoProvedor = (parametros.contaDoProvedor ?? "").trim();
	if (!contaDoProvedor) return {
		ok: false,
		motivo: "conta_do_provedor_ausente"
	};
	if (!CONTA_DO_PROVEDOR.test(contaDoProvedor)) return {
		ok: false,
		motivo: "conta_do_provedor_malformada"
	};
	return {
		ok: true,
		contaId: leitura.estado.contaId,
		usuarioId: leitura.estado.usuarioId,
		contaDoProvedor
	};
}
const FRASES_DE_RECUSA = {
	estado_ausente: "Este endereço só funciona a partir do botão de conectar na tela de integrações.",
	estado_malformado: "O pedido de conexão veio incompleto. Volte à tela de integrações e conecte de novo.",
	assinatura_invalida: "Não foi possível confirmar que este pedido partiu daqui. Conecte de novo pela tela de integrações.",
	estado_expirado: "O pedido de conexão expirou. Volte à tela de integrações e conecte de novo.",
	conta_do_provedor_ausente: "A telefonia não informou qual conta foi autorizada. Tente conectar de novo.",
	conta_do_provedor_malformada: "A telefonia informou uma conta em formato desconhecido. Tente conectar de novo."
};
//#endregion
//#region supabase/functions/telephony-connect/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CHAVE_DO_SERVIDOR = Deno.env.get("CHAVE_DO_SERVIDOR") ?? "";
const APP_DE_CONEXAO = Deno.env.get("TWILIO_CONNECT_APP_SID") ?? "";
const ENDERECO_DA_INTERFACE = Deno.env.get("ENDERECO_DA_INTERFACE") ?? "";
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
function json(corpo, status = 200) {
	return new Response(JSON.stringify(corpo), {
		status,
		headers: CABECALHOS
	});
}
function paraAInterface(estado, detalhe) {
	if (!ENDERECO_DA_INTERFACE) return new Response(detalhe ?? "Telefonia conectada.", {
		status: estado === "conectado" ? 200 : 400,
		headers: { "content-type": "text/plain; charset=utf-8" }
	});
	const destino = new URL("/config/integracoes", ENDERECO_DA_INTERFACE);
	destino.searchParams.set("telefonia", estado);
	if (detalhe) destino.searchParams.set("detalhe", detalhe);
	return new Response(null, {
		status: 303,
		headers: { location: destino.toString() }
	});
}
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	const caminho = new URL(requisicao.url).pathname;
	if (requisicao.method === "GET" && caminho.endsWith("/retorno")) {
		const parametros = new URL(requisicao.url).searchParams;
		const leitura = await lerRetornoDaAutorizacao({
			estado: parametros.get("state"),
			contaDoProvedor: parametros.get("AccountSid")
		}, CHAVE_DO_SERVIDOR);
		if (!leitura.ok) return paraAInterface("falha", FRASES_DE_RECUSA[leitura.motivo]);
		const { error } = await servico.rpc("registrar_conexao_de_telefonia", {
			p_account_id: leitura.contaId,
			p_provider_account_id: leitura.contaDoProvedor,
			p_authorized_by: leitura.usuarioId,
			p_scopes: ["read_all", "charge_account"]
		});
		if (error) return paraAInterface("falha", "A autorização chegou, mas não foi possível registrá-la. Tente conectar de novo.");
		return paraAInterface("conectado");
	}
	if (requisicao.method === "POST" && caminho.endsWith("/revogacao")) {
		let contaDoProvedor = "";
		try {
			const formulario = await requisicao.formData();
			contaDoProvedor = String(formulario.get("AccountSid") ?? "").trim();
		} catch {
			contaDoProvedor = "";
		}
		if (!contaDoProvedor) return json({
			ok: false,
			motivo: "conta_ausente"
		}, 400);
		const { data: conexao } = await servico.from("telephony_connections").select("account_id").eq("provider_account_id", contaDoProvedor).is("revoked_at", null).maybeSingle();
		if (!conexao) return json({
			ok: true,
			motivo: "nada_a_revogar"
		});
		const { error } = await servico.rpc("revogar_conexao_de_telefonia", {
			p_account_id: conexao.account_id,
			p_reason: "revogada pelo cliente no provedor"
		});
		if (error) return json({
			ok: false,
			motivo: "falha_ao_revogar"
		}, 500);
		return json({ ok: true });
	}
	if (requisicao.method !== "POST") return json({
		ok: false,
		motivo: "metodo_nao_suportado"
	}, 405);
	if (!APP_DE_CONEXAO) return json({
		ok: false,
		motivo: "conexao_indisponivel",
		mensagem: "Esta instalação não conecta a telefonia por autorização. Cadastre o Account SID e o Auth Token da sua Twilio na etapa de telefonia."
	}, 503);
	const autorizacao = requisicao.headers.get("authorization") ?? "";
	const jwt = autorizacao.toLowerCase().startsWith("bearer ") ? autorizacao.slice(7).trim() : "";
	if (!jwt) return json({
		ok: false,
		motivo: "sem_sessao"
	}, 401);
	const { data: sessao, error: erroDaSessao } = await servico.auth.getUser(jwt);
	if (erroDaSessao || !sessao.user) return json({
		ok: false,
		motivo: "sessao_invalida"
	}, 401);
	let corpo;
	try {
		corpo = await requisicao.json();
	} catch {
		corpo = {};
	}
	const contaId = (corpo.contaId ?? "").trim();
	if (!contaId) return json({
		ok: false,
		motivo: "conta_ausente"
	}, 400);
	const { data: podeAdministrar, error: erroDoPapel } = await servico.rpc("has_role", {
		p_account_id: contaId,
		p_role: "admin"
	});
	if (erroDoPapel || podeAdministrar !== true) return json({
		ok: false,
		motivo: "sem_permissao"
	}, 403);
	const estado = await emitirEstado({
		contaId,
		usuarioId: sessao.user.id
	}, CHAVE_DO_SERVIDOR);
	const enderecoDeAutorizacao = new URL(`https://www.twilio.com/authorize/${APP_DE_CONEXAO}`);
	enderecoDeAutorizacao.searchParams.set("state", estado);
	return json({
		ok: true,
		endereco: enderecoDeAutorizacao.toString()
	});
});
//#endregion
