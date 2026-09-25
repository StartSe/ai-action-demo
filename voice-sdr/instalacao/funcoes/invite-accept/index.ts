// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/invite-accept/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#endregion
//#region supabase/functions/_shared/token-de-convite.ts
function hashDeToken(token) {
	return hashEmHexadecimal(token);
}
//#endregion
//#region supabase/functions/invite-accept/respostas.ts
const MENSAGENS = {
	aceito: "Convite aceito. Você já faz parte da equipe.",
	ja_membro: "Você já faz parte desta equipe. O convite foi encerrado e seu papel continua o mesmo.",
	ja_aceito: "Este convite já foi usado. Entre com seu e-mail e senha para acessar a conta.",
	expirado: "Este convite expirou. Peça um novo link a quem administra a conta.",
	revogado: "Este convite foi cancelado por quem administra a conta. Peça um novo link.",
	nao_encontrado: "Este link de convite não é válido. Confira se ele foi copiado por inteiro.",
	email_divergente: "Este convite é para outro e-mail. Entre com o endereço que recebeu o convite.",
	usuario_desconhecido: "Não foi possível identificar sua conta de acesso. Entre de novo e repita.",
	metodo_invalido: "Este endereço aceita apenas POST.",
	token_ausente: "O link de convite veio sem o token. Abra o link do e-mail outra vez.",
	sem_sessao: "Entre ou crie sua conta de acesso para aceitar o convite.",
	sessao_invalida: "Sua sessão expirou. Entre de novo e abra o link do convite.",
	falha_interna: "Não foi possível aceitar o convite agora. Tente de novo em alguns minutos."
};
const STATUS = {
	aceito: 200,
	ja_membro: 200,
	ja_aceito: 409,
	expirado: 410,
	revogado: 410,
	nao_encontrado: 404,
	email_divergente: 403,
	usuario_desconhecido: 401,
	metodo_invalido: 405,
	token_ausente: 400,
	sem_sessao: 401,
	sessao_invalida: 401,
	falha_interna: 500
};
//#endregion
//#region supabase/functions/invite-accept/aceite.ts
const PREFIXO_BEARER = /^bearer\s+(.+)$/i;
async function aceitarConvite(pedido, porta) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const token = typeof pedido.token === "string" ? pedido.token.trim() : "";
	if (!token) return recusa("token_ausente");
	const jwt = extrairJwt(pedido.autorizacao);
	if (!jwt) return recusa("sem_sessao");
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sessao_invalida");
		return traduzir(await porta.aceitar(await hashDeToken(token), usuario.id));
	} catch {
		return recusa("falha_interna");
	}
}
function extrairJwt(autorizacao) {
	return PREFIXO_BEARER.exec(autorizacao?.trim() ?? "")?.[1]?.trim() || null;
}
function traduzir(resultado) {
	const codigo = resultado.resultado;
	if (!(codigo === "aceito" || codigo === "ja_membro")) return recusa(codigo);
	const { conta_id: id, conta_nome: nome, papel } = resultado;
	if (!id || !nome || !papel) return recusa("falha_interna");
	return {
		status: STATUS[codigo],
		corpo: {
			ok: true,
			motivo: codigo,
			mensagem: MENSAGENS[codigo],
			conta: {
				id,
				nome,
				papel
			}
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
//#endregion
//#region supabase/functions/invite-accept/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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
const porta = {
	async usuarioDaSessao(jwt) {
		const { data, error } = await servico.auth.getUser(jwt);
		if (error || !data.user?.email) return null;
		return {
			id: data.user.id,
			email: data.user.email
		};
	},
	async aceitar(tokenHash, usuarioId) {
		const { data, error } = await servico.rpc("aceitar_convite", {
			p_token_hash: tokenHash,
			p_usuario_id: usuarioId
		});
		if (error) throw new Error(error.message);
		const linha = Array.isArray(data) ? data[0] : data;
		if (!linha) throw new Error("aceitar_convite não devolveu linha");
		return linha;
	}
};
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	let token = null;
	try {
		token = (await requisicao.json())?.token ?? null;
	} catch {}
	const resposta = await aceitarConvite({
		metodo: requisicao.method,
		token,
		autorizacao: requisicao.headers.get("authorization")
	}, porta);
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
