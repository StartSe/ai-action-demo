// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/calendar-connect/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/_shared/agenda/calendario.ts
const MENSAGENS_DO_CALENDARIO = {
	nao_conectado: "Este especialista não tem calendário conectado. Os horários saem só da disponibilidade cadastrada aqui.",
	conexao_expirada: "A conexão com o calendário expirou, reconecte a agenda deste especialista para voltar a ler a ocupação.",
	sem_permissao_de_calendario: "O aplicativo ainda não tem permissão de calendário. É o estado normal enquanto o Google não conclui a verificação, e não depende de quem administra a conta.",
	agenda_nao_encontrada: "A agenda conectada não foi encontrada no calendário. Reconecte o calendário deste especialista e escolha a agenda de novo.",
	limite_de_taxa: "O calendário recusou por excesso de consultas. A conexão continua de pé, e a leitura se repete sozinha em alguns minutos.",
	provedor_indisponivel: "O calendário está fora do ar. A conexão continua de pé, e a leitura se repete sozinha na próxima passagem.",
	sem_resposta: "O calendário não respondeu no tempo esperado. A conexão continua de pé, e a leitura se repete sozinha na próxima passagem.",
	falha_do_calendario: "O calendário recusou o pedido e não informou o motivo. Reconecte a agenda deste especialista se a falha continuar.",
	endereco_ical_recusado: "O endereço iCal não abriu. Confira se colou o endereço secreto inteiro, ou gere outro no calendário e cole aqui de novo.",
	ical_invalido: "O endereço respondeu, mas não com uma agenda no formato iCal. Copie de novo o endereço secreto no formato iCal do calendário.",
	calendario_so_de_leitura: "O calendário por endereço iCal é só de leitura. A reunião chega à agenda do especialista pelo convite por e-mail."
};
//#endregion
//#region supabase/functions/_shared/agenda/calendario-google.ts
const ENDERECO_DE_AUTORIZACAO = "https://accounts.google.com/o/oauth2/v2/auth";
const ESCOPOS_DO_CALENDARIO = ["https://www.googleapis.com/auth/calendar.events", "https://www.googleapis.com/auth/calendar.freebusy"];
function montarEnderecoDeAutorizacao(pedido) {
	const endereco = new URL(ENDERECO_DE_AUTORIZACAO);
	endereco.searchParams.set("client_id", pedido.clienteId);
	endereco.searchParams.set("redirect_uri", pedido.redirecionamento);
	endereco.searchParams.set("response_type", "code");
	endereco.searchParams.set("scope", ESCOPOS_DO_CALENDARIO.join(" "));
	endereco.searchParams.set("access_type", "offline");
	endereco.searchParams.set("prompt", "consent");
	endereco.searchParams.set("state", pedido.estado);
	return endereco.toString();
}
//#endregion
//#region supabase/functions/_shared/agenda/estado-da-conexao.ts
const PROPOSITO = "calendario";
const TEXTO = new TextEncoder();
function base64url(bytes) {
	const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let bruto = "";
	for (const byte of vista) bruto += String.fromCharCode(byte);
	return btoa(bruto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function assinar(carga, chave) {
	const material = await crypto.subtle.importKey("raw", TEXTO.encode(chave), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	return base64url(await crypto.subtle.sign("HMAC", material, TEXTO.encode(carga)));
}
async function emitirEstadoDaConexao(estado, chaveDoServidor, agora = Date.now()) {
	if (chaveDoServidor.trim() === "") throw new Error("chave do servidor ausente");
	const carga = base64url(TEXTO.encode(JSON.stringify({
		p: PROPOSITO,
		c: estado.contaId,
		e: estado.especialistaId,
		u: estado.usuarioId,
		t: agora
	})));
	return `${carga}.${await assinar(carga, chaveDoServidor)}`;
}
//#endregion
//#region supabase/functions/calendar-connect/conexao.ts
const PAPEIS_QUE_CONECTAM = new Set(["owner", "admin"]);
const MENSAGENS_DA_CONEXAO = {
	metodo_nao_suportado: "Este endereço só aceita o pedido de conexão da tela do especialista.",
	sem_sessao: "Sua sessão terminou. Entre de novo para conectar o calendário.",
	pedido_incompleto: "O pedido não informou a conta e o especialista. Abra a ficha do especialista e conecte de novo.",
	sem_permissao: "Só quem administra a conta conecta o calendário de um especialista.",
	especialista_nao_encontrado: "Este especialista não foi encontrado nesta conta.",
	aguardando_google: MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario,
	falha_interna: "Não foi possível preparar a conexão agora. Tente de novo em alguns minutos."
};
const STATUS = {
	metodo_nao_suportado: 405,
	sem_sessao: 401,
	pedido_incompleto: 400,
	sem_permissao: 403,
	especialista_nao_encontrado: 404,
	aguardando_google: 200,
	falha_interna: 500
};
function recusa(motivo) {
	return {
		status: STATUS[motivo],
		corpo: {
			ok: false,
			motivo,
			mensagem: MENSAGENS_DA_CONEXAO[motivo]
		}
	};
}
function texto(valor) {
	return typeof valor === "string" ? valor.trim() : "";
}
async function atenderConexaoDoCalendario(pedido, porta, configuracao) {
	if (pedido.metodo !== "POST") return recusa("metodo_nao_suportado");
	const jwt = /^bearer\s+(.+)$/i.exec(pedido.autorizacao?.trim() ?? "")?.[1]?.trim() ?? "";
	if (!jwt) return recusa("sem_sessao");
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (!usuario) return recusa("sem_sessao");
		const contaId = texto(pedido.contaId);
		const especialistaId = texto(pedido.especialistaId);
		if (!contaId || !especialistaId) return recusa("pedido_incompleto");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (!papel || !PAPEIS_QUE_CONECTAM.has(papel)) return recusa("sem_permissao");
		if (!await porta.especialistaDaConta(contaId, especialistaId)) return recusa("especialista_nao_encontrado");
		if (!configuracao.clienteId || !configuracao.redirecionamento || !configuracao.chaveDoServidor.trim()) return recusa("aguardando_google");
		const agora = configuracao.agora?.() ?? Date.now();
		const estado = await emitirEstadoDaConexao({
			contaId,
			especialistaId,
			usuarioId: usuario.id
		}, configuracao.chaveDoServidor, agora);
		return {
			status: 200,
			corpo: {
				ok: true,
				estado: "autorizar",
				url: montarEnderecoDeAutorizacao({
					clienteId: configuracao.clienteId,
					redirecionamento: configuracao.redirecionamento,
					estado
				})
			}
		};
	} catch {
		return recusa("falha_interna");
	}
}
//#endregion
//#region supabase/functions/calendar-connect/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CHAVE_DO_SERVIDOR = Deno.env.get("CHAVE_DO_SERVIDOR") ?? "";
const CLIENTE_ID = Deno.env.get("SARAH_GOOGLE_CLIENT_ID") ?? "";
const REDIRECIONAMENTO = Deno.env.get("SARAH_GOOGLE_REDIRECT_URI") ?? (URL_DO_SUPABASE ? `${URL_DO_SUPABASE}/functions/v1/calendar-callback` : "");
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
	async especialistaDaConta(contaId, especialistaId) {
		const { data, error } = await servico.from("specialists").select("id").eq("id", especialistaId).eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		return data !== null;
	}
};
Deno.serve(async (requisicao) => {
	if (requisicao.method === "OPTIONS") return new Response(null, {
		status: 204,
		headers: CABECALHOS
	});
	let corpo = null;
	try {
		corpo = await requisicao.json();
	} catch {}
	const resposta = await atenderConexaoDoCalendario({
		metodo: requisicao.method,
		autorizacao: requisicao.headers.get("authorization"),
		contaId: corpo?.account_id ?? null,
		especialistaId: corpo?.specialist_id ?? null
	}, porta, {
		clienteId: CLIENTE_ID,
		redirecionamento: REDIRECIONAMENTO,
		chaveDoServidor: CHAVE_DO_SERVIDOR
	});
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
