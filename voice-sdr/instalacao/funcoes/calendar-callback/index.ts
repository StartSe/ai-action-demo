// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/calendar-callback/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/_shared/provedor/erros.ts
const MENSAGENS_DO_PROVEDOR = {
	chave_invalida: "A chave cadastrada foi recusada pelo provedor. Gere uma nova no painel dele e substitua aqui.",
	sem_permissao: "A chave é válida, mas não tem permissão para esta operação. Confira o escopo dela no painel do provedor.",
	sem_credito: "A conta no provedor está sem saldo. Recarregue no painel dele para voltar a operar.",
	limite_de_taxa: "O provedor recusou por excesso de chamadas. Aguarde alguns minutos e teste de novo.",
	provedor_indisponivel: "O provedor está fora do ar. A chave continua cadastrada, e o teste pode ser repetido depois.",
	sem_resposta: "O provedor não respondeu no tempo esperado. A chave continua cadastrada, e o teste pode ser repetido depois.",
	falha_do_provedor: "O provedor recusou a verificação e não informou o motivo. Confira a chave no painel dele e teste de novo.",
	sessao_desconectada: "A instância do WhatsApp está sem sessão com o celular. Leia o QR code no painel da Z-API e teste de novo."
};
const POR_CODIGO = [
	[/whatsapp[_\-\s]?not[_\-\s]?connected|not[_\-\s]?connected|disconnected/i, "sessao_desconectada"],
	[/client[_\-\s]?token/i, "chave_invalida"],
	[/invalid[_\-\s]?api[_\-\s]?key/i, "chave_invalida"],
	[/authentication|unauthenticated|unauthorized|invalid[_\-\s]?token|invalid[_\-\s]?credential/i, "chave_invalida"],
	[/invalid[_\-\s]?grant|expired[_\-\s]?token/i, "chave_invalida"],
	[/forbidden|permission[_\-\s]?denied|insufficient[_\-\s]?scope|missing[_\-\s]?scope/i, "sem_permissao"],
	[/quota[_\-\s]?exceeded|insufficient[_\-\s]?credit|payment[_\-\s]?required|out[_\-\s]?of[_\-\s]?credit|billing/i, "sem_credito"],
	[/rate[_\-\s]?limit|too[_\-\s]?many[_\-\s]?requests|throttl/i, "limite_de_taxa"],
	[/timeout|timed[_\-\s]?out|network|econn|fetch[_\-\s]?failed/i, "sem_resposta"],
	[/unavailable|bad[_\-\s]?gateway|internal[_\-\s]?server|server[_\-\s]?error/i, "provedor_indisponivel"]
];
function porStatus(status) {
	if (status === 401) return "chave_invalida";
	if (status === 403) return "sem_permissao";
	if (status === 402) return "sem_credito";
	if (status === 429) return "limite_de_taxa";
	if (status >= 500) return "provedor_indisponivel";
	return null;
}
function traduzirErroDoProvedor(codigo, status) {
	const motivo = motivoDe(codigo, status);
	return {
		motivo,
		mensagem: MENSAGENS_DO_PROVEDOR[motivo]
	};
}
function motivoDe(codigo, status) {
	const texto = codigo?.trim() ?? "";
	if (texto) {
		for (const [padrao, motivo] of POR_CODIGO) if (padrao.test(texto)) return motivo;
	}
	if (typeof status === "number" && Number.isFinite(status)) {
		const doStatus = porStatus(status);
		if (doStatus) return doStatus;
	}
	return "falha_do_provedor";
}
//#endregion
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
const SO_ESPERAR = new Set([
	"limite_de_taxa",
	"provedor_indisponivel",
	"sem_resposta"
]);
function falhaDoCalendario(motivo) {
	return {
		ok: false,
		estado: motivo === "nao_conectado" ? "nao_configurado" : SO_ESPERAR.has(motivo) ? "indisponivel" : "erro",
		motivo,
		mensagem: MENSAGENS_DO_CALENDARIO[motivo]
	};
}
const DO_CALENDARIO = [
	[/invalid[_\-\s]?grant|expired[_\-\s]?or[_\-\s]?revoked/i, "conexao_expirada"],
	[/insufficient[_\-\s]?(scope|permissions?)|scope[_\-\s]?insufficient|access[_\-\s]?denied|unverified|app[_\-\s]?not[_\-\s]?verified|admin[_\-\s]?policy/i, "sem_permissao_de_calendario"],
	[/rate[_\-\s]?limit|quota[_\-\s]?exceeded|usage[_\-\s]?limits/i, "limite_de_taxa"],
	[/not[_\-\s]?found/i, "agenda_nao_encontrada"]
];
const DA_TABELA_COMUM = {
	chave_invalida: "conexao_expirada",
	sem_permissao: "sem_permissao_de_calendario",
	sem_credito: "limite_de_taxa",
	limite_de_taxa: "limite_de_taxa",
	provedor_indisponivel: "provedor_indisponivel",
	sem_resposta: "sem_resposta",
	falha_do_provedor: "falha_do_calendario",
	sessao_desconectada: "falha_do_calendario"
};
function traduzirErroDoCalendario(codigo, status) {
	const texto = codigo?.trim() ?? "";
	if (texto) {
		for (const [padrao, motivo] of DO_CALENDARIO) if (padrao.test(texto)) return falhaDoCalendario(motivo);
	}
	if (!texto && status === 404) return falhaDoCalendario("agenda_nao_encontrada");
	return falhaDoCalendario(DA_TABELA_COMUM[traduzirErroDoProvedor(texto, status).motivo]);
}
const SEGREDO_DO_CALENDARIO = {
	provedor: "google_calendar",
	chave: "refresh_token"
};
const RECURSO_DO_CALENDARIO = "specialist_calendars";
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
//#region supabase/functions/_shared/agenda/calendario-google.ts
const ENDERECO_DO_TOKEN = "https://oauth2.googleapis.com/token";
function codigoDoErro(corpo) {
	const erro = campo(corpo, "error");
	if (typeof erro === "string") return erro;
	const detalhes = campo(erro, "errors");
	return (Array.isArray(detalhes) ? texto(campo(detalhes[0], "reason")) : null) ?? texto(campo(erro, "status"));
}
function lerJson(textoCru) {
	if (!textoCru) return null;
	try {
		return JSON.parse(textoCru);
	} catch {
		return null;
	}
}
function campo(valor, nome) {
	if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return void 0;
	return Object.prototype.hasOwnProperty.call(valor, nome) ? valor[nome] : void 0;
}
function texto(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}
const AGENDA_PRINCIPAL = "primary";
async function trocarCodigoPorToken(opcoes) {
	let status;
	let corpo;
	try {
		const resposta = await opcoes.buscar(ENDERECO_DO_TOKEN, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: opcoes.clienteId,
				client_secret: opcoes.clienteSegredo,
				code: opcoes.codigo,
				redirect_uri: opcoes.redirecionamento,
				grant_type: "authorization_code"
			}).toString(),
			signal: AbortSignal.timeout(opcoes.prazoMs ?? 3e3)
		});
		status = resposta.status;
		corpo = lerJson(await resposta.text());
	} catch {
		return falhaDoCalendario("sem_resposta");
	}
	if (status !== 200) return traduzirErroDoCalendario(codigoDoErro(corpo), status);
	const token = texto(campo(corpo, "refresh_token"));
	if (!token) return falhaDoCalendario("falha_do_calendario");
	return {
		ok: true,
		valor: { tokenDeAtualizacao: token }
	};
}
//#endregion
//#region supabase/functions/_shared/hash-de-segredo.ts
function hashesIguais(a, b) {
	if (a.length !== b.length) return false;
	let diferenca = 0;
	for (let posicao = 0; posicao < a.length; posicao += 1) diferenca |= a.charCodeAt(posicao) ^ b.charCodeAt(posicao);
	return diferenca === 0;
}
const PROPOSITO = "calendario";
const TEXTO = new TextEncoder();
function base64url(bytes) {
	const vista = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
	let bruto = "";
	for (const byte of vista) bruto += String.fromCharCode(byte);
	return btoa(bruto).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deBase64url(valor) {
	const preenchido = valor.replace(/-/g, "+").replace(/_/g, "/");
	const binario = atob(preenchido + "=".repeat((4 - preenchido.length % 4) % 4));
	return new TextDecoder().decode(Uint8Array.from(binario, (letra) => letra.charCodeAt(0)));
}
async function assinar(carga, chave) {
	const material = await crypto.subtle.importKey("raw", TEXTO.encode(chave), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	return base64url(await crypto.subtle.sign("HMAC", material, TEXTO.encode(carga)));
}
async function lerEstadoDaConexao(valor, chaveDoServidor, agora = Date.now()) {
	const bruto = (valor ?? "").trim();
	if (!bruto) return {
		ok: false,
		motivo: "estado_ausente"
	};
	if (chaveDoServidor.trim() === "") return {
		ok: false,
		motivo: "assinatura_invalida"
	};
	const partes = bruto.split(".");
	if (partes.length !== 2 || !partes[0] || !partes[1]) return {
		ok: false,
		motivo: "estado_malformado"
	};
	const [carga, assinatura] = partes;
	if (!hashesIguais(assinatura, await assinar(carga, chaveDoServidor))) return {
		ok: false,
		motivo: "assinatura_invalida"
	};
	let lido;
	try {
		lido = JSON.parse(deBase64url(carga));
	} catch {
		return {
			ok: false,
			motivo: "estado_malformado"
		};
	}
	const { p, c, e, u, t } = lido ?? {};
	if (p !== PROPOSITO || !textoCheio(c) || !textoCheio(e) || !textoCheio(u) || typeof t !== "number") return {
		ok: false,
		motivo: "estado_malformado"
	};
	if (agora - t > 6e5 || t > agora) return {
		ok: false,
		motivo: "estado_expirado"
	};
	return {
		ok: true,
		estado: {
			contaId: c,
			especialistaId: e,
			usuarioId: u,
			emitidoEm: t
		}
	};
}
function textoCheio(valor) {
	return typeof valor === "string" && valor.trim() !== "";
}
//#endregion
//#region supabase/functions/_shared/marca.ts
const NOME_DO_PRODUTO = "Voice SDR";
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
}
//#endregion
//#region supabase/functions/calendar-callback/pagina.ts
const FECHAR_A_JANELA = `Pode fechar esta janela e voltar para o ${NOME_DO_PRODUTO}.`;
const VOLTAR = `Voltar para o ${NOME_DO_PRODUTO}`;
function escaparHtml(valor) {
	return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function montarPagina(conteudo) {
	const titulo = escaparHtml(conteudo.titulo);
	const frase = escaparHtml(conteudo.frase);
	const saida = conteudo.destino ? `<p><a href="${escaparHtml(conteudo.destino)}">${escaparHtml(VOLTAR)}</a></p>` : `<p>${escaparHtml(FECHAR_A_JANELA)}</p>`;
	return [
		"<!doctype html>",
		"<html lang=\"pt-BR\">",
		"<head>",
		"<meta charset=\"utf-8\">",
		"<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
		"<meta name=\"robots\" content=\"noindex\">",
		`<title>${titulo}</title>`,
		"<style>body{font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1.5rem;line-height:1.5;color:#1f1f1f}h1{font-size:1.25rem}</style>",
		"</head>",
		"<body>",
		`<h1>${titulo}</h1>`,
		`<p>${frase}</p>`,
		saida,
		"</body>",
		"</html>"
	].join("\n");
}
//#endregion
//#region supabase/functions/calendar-callback/retorno.ts
const PROVEDOR_DO_CALENDARIO = "google";
const PAPEIS_QUE_CONECTAM = new Set(["owner", "admin"]);
const FRASES_DA_VOLTA = {
	metodo_nao_suportado: "Este endereço só recebe a volta da autorização do Google.",
	estado_ausente: "Este endereço só funciona a partir do botão de conectar na ficha do especialista.",
	estado_malformado: "O pedido de conexão voltou incompleto. Abra a ficha do especialista e conecte de novo.",
	assinatura_invalida: "Não foi possível confirmar que este pedido partiu daqui. Conecte de novo pela ficha do especialista.",
	estado_expirado: "O pedido de conexão expirou. Abra a ficha do especialista e conecte de novo.",
	autorizacao_negada: "A autorização foi cancelada no Google. O calendário continua como estava.",
	codigo_ausente: "O Google não devolveu a autorização. Conecte de novo pela ficha do especialista.",
	especialista_de_outra_conta: "Este especialista não pertence à conta que pediu a conexão. Nada foi gravado.",
	sem_permissao: "Só quem administra a conta conecta o calendário de um especialista. Nada foi gravado.",
	aguardando_google: MENSAGENS_DO_CALENDARIO.sem_permissao_de_calendario,
	troca_recusada: "O Google recusou a autorização. Conecte de novo pela ficha do especialista.",
	falha_ao_gravar: "A autorização chegou, mas não foi possível gravá-la. Conecte de novo pela ficha do especialista."
};
const TITULO_CONECTADO = "Calendário conectado";
const FRASE_CONECTADO = `A agenda deste especialista está ligada ao ${NOME_DO_PRODUTO}. A ocupação aparece na próxima leitura, em até cinco minutos.`;
const FRASE_RECONECTADO = "A agenda deste especialista foi reconectada. A ocupação aparece na próxima leitura, em até cinco minutos.";
const TITULO_RECUSADO = "Calendário não conectado";
const STATUS = {
	metodo_nao_suportado: 405,
	estado_ausente: 400,
	estado_malformado: 400,
	assinatura_invalida: 400,
	estado_expirado: 400,
	autorizacao_negada: 200,
	codigo_ausente: 400,
	especialista_de_outra_conta: 403,
	sem_permissao: 403,
	aguardando_google: 200,
	troca_recusada: 502,
	falha_ao_gravar: 500
};
async function atenderVoltaDoCalendario(pedido, porta, configuracao) {
	const sensiveis = [];
	if (pedido.codigo) sensiveis.push(pedido.codigo);
	const resposta = await decidir(pedido, porta, configuracao, sensiveis);
	try {
		conferirQueNaoVazou(resposta, sensiveis, "calendar-callback: credencial no corpo da resposta");
		return resposta;
	} catch {
		return pagina(STATUS.falha_ao_gravar, TITULO_RECUSADO, FRASES_DA_VOLTA.falha_ao_gravar, configuracao.destino);
	}
}
async function decidir(pedido, porta, configuracao, sensiveis) {
	const recusar = (motivo, detalhe, contexto = {}) => {
		porta.registrarNoLog({
			evento: "volta_recusada",
			motivo,
			...detalhe ? { detalhe } : {},
			...contexto
		});
		return pagina(STATUS[motivo], TITULO_RECUSADO, FRASES_DA_VOLTA[motivo], configuracao.destino);
	};
	if (pedido.metodo !== "GET") return recusar("metodo_nao_suportado");
	const agora = configuracao.agora?.() ?? Date.now();
	const leitura = await lerEstadoDaConexao(pedido.estado, configuracao.chaveDoServidor, agora);
	if (!leitura.ok) return recusar(leitura.motivo);
	const { contaId, especialistaId, usuarioId } = leitura.estado;
	const contexto = {
		contaId,
		especialistaId
	};
	if (pedido.erro) return recusar("autorizacao_negada", void 0, contexto);
	const codigo = pedido.codigo?.trim() ?? "";
	if (!codigo) return recusar("codigo_ausente", void 0, contexto);
	try {
		if (!await porta.especialistaDaConta(contaId, especialistaId)) return recusar("especialista_de_outra_conta", void 0, contexto);
		const papel = await porta.papelNaConta(contaId, usuarioId);
		if (!papel || !PAPEIS_QUE_CONECTAM.has(papel)) return recusar("sem_permissao", void 0, contexto);
	} catch {
		return recusar("falha_ao_gravar", void 0, contexto);
	}
	if (!configuracao.clienteId || !configuracao.clienteSegredo || !configuracao.redirecionamento) return recusar("aguardando_google", void 0, contexto);
	const troca = await trocarCodigoPorToken({
		buscar: configuracao.buscar,
		clienteId: configuracao.clienteId,
		clienteSegredo: configuracao.clienteSegredo,
		redirecionamento: configuracao.redirecionamento,
		codigo,
		...configuracao.prazoMs ? { prazoMs: configuracao.prazoMs } : {}
	});
	if (!troca.ok) return recusar(troca.motivo === "sem_permissao_de_calendario" ? "aguardando_google" : "troca_recusada", troca.motivo, contexto);
	const token = troca.valor.tokenDeAtualizacao;
	sensiveis.push(token);
	let gravado;
	try {
		gravado = await porta.gravarCalendario({
			contaId,
			especialistaId,
			provedor: PROVEDOR_DO_CALENDARIO,
			agendaId: AGENDA_PRINCIPAL,
			tokenDeAtualizacao: token
		});
	} catch {
		return recusar("falha_ao_gravar", void 0, contexto);
	}
	porta.invalidarCredencial(contaId, SEGREDO_DO_CALENDARIO.provedor, SEGREDO_DO_CALENDARIO.chave);
	porta.registrarNoLog({
		evento: "calendario_conectado",
		...contexto,
		reaproveitado: gravado.reaproveitado
	});
	return pagina(200, TITULO_CONECTADO, gravado.reaproveitado ? FRASE_RECONECTADO : FRASE_CONECTADO, configuracao.destino);
}
function pagina(status, titulo, frase, destino) {
	return {
		status,
		html: montarPagina({
			titulo,
			frase,
			destino: destino || null
		})
	};
}
//#endregion
//#region supabase/functions/calendar-callback/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CHAVE_DO_SERVIDOR = Deno.env.get("CHAVE_DO_SERVIDOR") ?? "";
const CLIENTE_ID = Deno.env.get("SARAH_GOOGLE_CLIENT_ID") ?? "";
const CLIENTE_SEGREDO = Deno.env.get("SARAH_GOOGLE_CLIENT_SECRET") ?? "";
const REDIRECIONAMENTO = Deno.env.get("SARAH_GOOGLE_REDIRECT_URI") ?? (URL_DO_SUPABASE ? `${URL_DO_SUPABASE}/functions/v1/calendar-callback` : "");
const ENDERECO_DA_INTERFACE = Deno.env.get("ENDERECO_DA_INTERFACE") ?? "";
const PRAZO_DA_TROCA_MS = 1e4;
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
		async modoDeCredencial() {
			return "account";
		}
	},
	ambiente: lerAmbiente(Deno.env.get("SARAH_AMBIENTE"))
});
const porta = {
	async especialistaDaConta(contaId, especialistaId) {
		const { data, error } = await servico.from("specialists").select("id").eq("id", especialistaId).eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		return data !== null;
	},
	async papelNaConta(contaId, usuarioId) {
		const { data, error } = await servico.from("account_members").select("role").eq("account_id", contaId).eq("user_id", usuarioId).maybeSingle();
		if (error) throw new Error(error.message);
		return data?.role ?? null;
	},
	async gravarCalendario(calendario) {
		const { data, error } = await servico.rpc("conectar_calendario_do_especialista", {
			p_account_id: calendario.contaId,
			p_specialist_id: calendario.especialistaId,
			p_provider: calendario.provedor,
			p_external_id: calendario.agendaId,
			p_refresh_token: calendario.tokenDeAtualizacao
		});
		if (error) throw new Error("conectar_calendario_do_especialista falhou");
		const linha = (data ?? [])[0];
		if (!linha) throw new Error("conectar_calendario_do_especialista não devolveu linha");
		return {
			calendarioId: linha.calendar_id,
			reaproveitado: linha.reaproveitado
		};
	},
	invalidarCredencial(contaId, provedor, chave) {
		cofre.invalidar(contaId, provedor, chave);
	},
	registrarNoLog(evento) {
		console.warn(JSON.stringify({
			funcao: "calendar-callback",
			recurso: RECURSO_DO_CALENDARIO,
			...evento
		}));
	}
};
Deno.serve(async (requisicao) => {
	const parametros = new URL(requisicao.url).searchParams;
	const resposta = await atenderVoltaDoCalendario({
		metodo: requisicao.method,
		estado: parametros.get("state"),
		codigo: parametros.get("code"),
		erro: parametros.get("error")
	}, porta, {
		buscar: fetch,
		clienteId: CLIENTE_ID,
		clienteSegredo: CLIENTE_SEGREDO,
		redirecionamento: REDIRECIONAMENTO,
		chaveDoServidor: CHAVE_DO_SERVIDOR,
		destino: ENDERECO_DA_INTERFACE ? new URL("/especialistas", ENDERECO_DA_INTERFACE).toString() : null,
		prazoMs: PRAZO_DA_TROCA_MS
	});
	return new Response(resposta.html, {
		status: resposta.status,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"cache-control": "no-store",
			"referrer-policy": "no-referrer"
		}
	});
});
//#endregion
