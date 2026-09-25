// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/whatsapp-connect/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/_shared/segredo-da-instalacao.ts
const ROTULO_DA_CHAVE_DE_FERRAMENTAS = "sarah/tool-server-key/v1";
async function segredoDaInstalacao(pedido) {
	const definido = pedido.definido?.trim() ?? "";
	if (definido !== "") return definido;
	const base = pedido.chaveDeServico?.trim() ?? "";
	const rotulo = pedido.rotulo.trim();
	if (base === "" || rotulo === "") return "";
	const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(base), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	const assinatura = await crypto.subtle.sign("HMAC", material, new TextEncoder().encode(rotulo));
	return [...new Uint8Array(assinatura)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
//#endregion
//#region supabase/functions/_shared/ddd.ts
const SAO_PAULO = "America/Sao_Paulo";
const MANAUS = "America/Manaus";
const RIO_BRANCO = "America/Rio_Branco";
const CAMPO_GRANDE = "America/Campo_Grande";
const CUIABA = "America/Cuiaba";
new Set(new Map([
	["11", {
		cidade: "São Paulo",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["12", {
		cidade: "São José dos Campos",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["13", {
		cidade: "Santos",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["14", {
		cidade: "Bauru",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["15", {
		cidade: "Sorocaba",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["16", {
		cidade: "Ribeirão Preto",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["17", {
		cidade: "São José do Rio Preto",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["18", {
		cidade: "Presidente Prudente",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["19", {
		cidade: "Campinas",
		estado: "SP",
		fuso: SAO_PAULO
	}],
	["21", {
		cidade: "Rio de Janeiro",
		estado: "RJ",
		fuso: SAO_PAULO
	}],
	["22", {
		cidade: "Campos dos Goytacazes",
		estado: "RJ",
		fuso: SAO_PAULO
	}],
	["24", {
		cidade: "Volta Redonda",
		estado: "RJ",
		fuso: SAO_PAULO
	}],
	["27", {
		cidade: "Vitória",
		estado: "ES",
		fuso: SAO_PAULO
	}],
	["28", {
		cidade: "Cachoeiro de Itapemirim",
		estado: "ES",
		fuso: SAO_PAULO
	}],
	["31", {
		cidade: "Belo Horizonte",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["32", {
		cidade: "Juiz de Fora",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["33", {
		cidade: "Governador Valadares",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["34", {
		cidade: "Uberlândia",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["35", {
		cidade: "Poços de Caldas",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["37", {
		cidade: "Divinópolis",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["38", {
		cidade: "Montes Claros",
		estado: "MG",
		fuso: SAO_PAULO
	}],
	["41", {
		cidade: "Curitiba",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["42", {
		cidade: "Ponta Grossa",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["43", {
		cidade: "Londrina",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["44", {
		cidade: "Maringá",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["45", {
		cidade: "Foz do Iguaçu",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["46", {
		cidade: "Francisco Beltrão",
		estado: "PR",
		fuso: SAO_PAULO
	}],
	["47", {
		cidade: "Joinville",
		estado: "SC",
		fuso: SAO_PAULO
	}],
	["48", {
		cidade: "Florianópolis",
		estado: "SC",
		fuso: SAO_PAULO
	}],
	["49", {
		cidade: "Chapecó",
		estado: "SC",
		fuso: SAO_PAULO
	}],
	["51", {
		cidade: "Porto Alegre",
		estado: "RS",
		fuso: SAO_PAULO
	}],
	["53", {
		cidade: "Pelotas",
		estado: "RS",
		fuso: SAO_PAULO
	}],
	["54", {
		cidade: "Caxias do Sul",
		estado: "RS",
		fuso: SAO_PAULO
	}],
	["55", {
		cidade: "Santa Maria",
		estado: "RS",
		fuso: SAO_PAULO
	}],
	["61", {
		cidade: "Brasília",
		estado: "DF",
		fuso: SAO_PAULO
	}],
	["62", {
		cidade: "Goiânia",
		estado: "GO",
		fuso: SAO_PAULO
	}],
	["63", {
		cidade: "Palmas",
		estado: "TO",
		fuso: SAO_PAULO
	}],
	["64", {
		cidade: "Rio Verde",
		estado: "GO",
		fuso: SAO_PAULO
	}],
	["65", {
		cidade: "Cuiabá",
		estado: "MT",
		fuso: CUIABA
	}],
	["66", {
		cidade: "Rondonópolis",
		estado: "MT",
		fuso: CUIABA
	}],
	["67", {
		cidade: "Campo Grande",
		estado: "MS",
		fuso: CAMPO_GRANDE
	}],
	["68", {
		cidade: "Rio Branco",
		estado: "AC",
		fuso: RIO_BRANCO
	}],
	["69", {
		cidade: "Porto Velho",
		estado: "RO",
		fuso: MANAUS
	}],
	["71", {
		cidade: "Salvador",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["73", {
		cidade: "Itabuna",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["74", {
		cidade: "Juazeiro",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["75", {
		cidade: "Feira de Santana",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["77", {
		cidade: "Vitória da Conquista",
		estado: "BA",
		fuso: SAO_PAULO
	}],
	["79", {
		cidade: "Aracaju",
		estado: "SE",
		fuso: SAO_PAULO
	}],
	["81", {
		cidade: "Recife",
		estado: "PE",
		fuso: SAO_PAULO
	}],
	["82", {
		cidade: "Maceió",
		estado: "AL",
		fuso: SAO_PAULO
	}],
	["83", {
		cidade: "João Pessoa",
		estado: "PB",
		fuso: SAO_PAULO
	}],
	["84", {
		cidade: "Natal",
		estado: "RN",
		fuso: SAO_PAULO
	}],
	["85", {
		cidade: "Fortaleza",
		estado: "CE",
		fuso: SAO_PAULO
	}],
	["86", {
		cidade: "Teresina",
		estado: "PI",
		fuso: SAO_PAULO
	}],
	["87", {
		cidade: "Petrolina",
		estado: "PE",
		fuso: SAO_PAULO
	}],
	["88", {
		cidade: "Juazeiro do Norte",
		estado: "CE",
		fuso: SAO_PAULO
	}],
	["89", {
		cidade: "Picos",
		estado: "PI",
		fuso: SAO_PAULO
	}],
	["91", {
		cidade: "Belém",
		estado: "PA",
		fuso: SAO_PAULO
	}],
	["92", {
		cidade: "Manaus",
		estado: "AM",
		fuso: MANAUS
	}],
	["93", {
		cidade: "Santarém",
		estado: "PA",
		fuso: SAO_PAULO
	}],
	["94", {
		cidade: "Marabá",
		estado: "PA",
		fuso: SAO_PAULO
	}],
	["95", {
		cidade: "Boa Vista",
		estado: "RR",
		fuso: MANAUS
	}],
	["96", {
		cidade: "Macapá",
		estado: "AP",
		fuso: SAO_PAULO
	}],
	["97", {
		cidade: "Tefé",
		estado: "AM",
		fuso: MANAUS
	}],
	["98", {
		cidade: "São Luís",
		estado: "MA",
		fuso: SAO_PAULO
	}],
	["99", {
		cidade: "Imperatriz",
		estado: "MA",
		fuso: SAO_PAULO
	}]
]).keys());
//#endregion
//#region supabase/functions/_shared/whatsapp/zapi.ts
const PROVEDOR_DO_WHATSAPP = "whatsapp";
const CHAVES_DA_ZAPI = [
	"instance_id",
	"token",
	"client_token"
];
const URL_DA_ZAPI = "https://api.z-api.io";
function base(credenciais) {
	return `${URL_DA_ZAPI}/instances/${encodeURIComponent(credenciais.instance_id.trim())}/token/${encodeURIComponent(credenciais.token.trim())}`;
}
function cabecalhos(credenciais) {
	return {
		"client-token": credenciais.client_token.trim(),
		"content-type": "application/json"
	};
}
function pedidoDoEstado(credenciais) {
	return {
		url: `${base(credenciais)}/status`,
		init: {
			method: "GET",
			headers: cabecalhos(credenciais)
		},
		endpoint: "status"
	};
}
function pedidosDosWebhooks(credenciais, endereco) {
	return ["update-webhook-received", "update-webhook-message-status"].map((caminho) => ({
		url: `${base(credenciais)}/${caminho}`,
		init: {
			method: "PUT",
			headers: cabecalhos(credenciais),
			body: JSON.stringify({ value: endereco })
		},
		endpoint: caminho
	}));
}
function objeto(valor) {
	return valor !== null && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
}
function lerEstadoDaInstancia(corpo) {
	const dado = objeto(corpo);
	if (dado === null || typeof dado.connected !== "boolean") return null;
	return {
		conectada: dado.connected,
		celularConectado: typeof dado.smartphoneConnected === "boolean" ? dado.smartphoneConnected : null
	};
}
const CODIGO_DA_INSTANCIA_DESCONECTADA = "whatsapp_not_connected";
//#endregion
//#region supabase/functions/_shared/whatsapp/envio.ts
const LIMITE_DO_ENVIO_MS = 1e4;
//#endregion
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
const DO_PROVEDOR = new Set(["provedor_indisponivel", "sem_resposta"]);
function eFalhaDoProvedor(motivo) {
	return DO_PROVEDOR.has(motivo);
}
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
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
}
//#endregion
//#region supabase/functions/_shared/segredo-de-ferramenta.ts
async function derivarSegredoDeFerramenta(chaveDoServidor, contaId) {
	const chave = chaveDoServidor.trim();
	const conta = contaId.trim();
	if (chave === "") throw new Error("chave do servidor ausente");
	if (conta === "") throw new Error("conta ausente");
	const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(chave), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	const assinatura = await crypto.subtle.sign("HMAC", material, new TextEncoder().encode(conta));
	return [...new Uint8Array(assinatura)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
function derivarSegredo(chaveDoServidor, accountId) {
	return derivarSegredoDeFerramenta(chaveDoServidor, accountId);
}
//#endregion
//#region supabase/functions/_shared/whatsapp/endereco.ts
const FUNCAO_DE_ENTRADA = "whatsapp-inbound";
const PARAMETRO_DA_CONTA = "conta";
const PARAMETRO_DA_CHAVE = "chave";
function textoDaConta(contaId) {
	return `whatsapp:${contaId}`;
}
function derivarChaveDoWhatsapp(chaveDoServidor, contaId) {
	const conta = contaId.trim().toLowerCase();
	if (conta === "") throw new Error("conta ausente");
	return derivarSegredo(chaveDoServidor, textoDaConta(conta));
}
async function enderecoDoWebhookDoWhatsapp(base, chaveDoServidor, contaId) {
	const raiz = base.replace(/\/+$/, "");
	const conta = contaId.trim().toLowerCase();
	const chave = await derivarChaveDoWhatsapp(chaveDoServidor, conta);
	return `${raiz}/${FUNCAO_DE_ENTRADA}?${PARAMETRO_DA_CONTA}=${encodeURIComponent(conta)}&${PARAMETRO_DA_CHAVE}=${chave}`;
}
//#endregion
//#region supabase/functions/integrations-status/sondas.ts
const LIMITE_DA_SONDA_MS = 8e3;
const buscarComPrazo = (endereco, init) => fetch(endereco, {
	...init,
	signal: AbortSignal.timeout(LIMITE_DA_SONDA_MS)
});
const SONDAS = {
	voz: (credenciais, buscar) => sondarVoz(credenciais.api_key ?? "", buscar),
	telefonia: (credenciais, buscar) => sondarTelefonia(credenciais.account_sid ?? "", credenciais.auth_token ?? "", buscar),
	calendario: (credenciais, buscar) => sondarCalendario(credenciais, buscar),
	email: (credenciais, buscar) => sondarEmail(credenciais.api_key ?? "", buscar),
	whatsapp: (credenciais, buscar) => sondarWhatsapp(credenciais, buscar)
};
function sondarProvedor(provedor, credenciais, buscar = buscarComPrazo) {
	return SONDAS[provedor](credenciais, buscar);
}
async function sondarVoz(chave, buscar) {
	const resposta = await buscar("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": chave } });
	if (!resposta.ok) return await recusaDoProvedor(resposta);
	const corpo = await resposta.json();
	const usados = corpo.character_count ?? 0;
	const limite = corpo.character_limit ?? null;
	return {
		ok: true,
		credito: limite === null ? null : {
			restante: Math.max(limite - usados, 0),
			total: limite,
			unidade: "caracteres"
		},
		cota: typeof corpo.max_concurrency === "number" ? {
			rotulo: "sessões simultâneas",
			emUso: corpo.current_concurrency ?? 0,
			limite: corpo.max_concurrency
		} : null
	};
}
async function sondarTelefonia(sid, token, buscar) {
	const resposta = await buscar(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Balance.json`, { headers: { authorization: `Basic ${btoa(`${sid}:${token}`)}` } });
	if (!resposta.ok) return await recusaDoProvedor(resposta);
	const corpo = await resposta.json();
	const saldo = Number.parseFloat(corpo.balance ?? "");
	return {
		ok: true,
		credito: Number.isFinite(saldo) ? {
			restante: saldo,
			total: null,
			unidade: corpo.currency?.toUpperCase() || "USD"
		} : null,
		cota: null
	};
}
async function sondarCalendario(credenciais, buscar) {
	const resposta = await buscar("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: credenciais.client_id ?? "",
			client_secret: credenciais.client_secret ?? "",
			refresh_token: credenciais.refresh_token ?? "",
			grant_type: "refresh_token"
		})
	});
	if (!resposta.ok) return await recusaDoProvedor(resposta);
	return {
		ok: true,
		credito: null,
		cota: null
	};
}
async function sondarEmail(chave, buscar) {
	const resposta = await buscar("https://api.resend.com/domains", { headers: { authorization: `Bearer ${chave}` } });
	if (!resposta.ok) return await recusaDoProvedor(resposta);
	return {
		ok: true,
		credito: null,
		cota: null
	};
}
async function sondarWhatsapp(credenciais, buscar) {
	const pedido = pedidoDoEstado({
		instance_id: credenciais.instance_id ?? "",
		token: credenciais.token ?? "",
		client_token: credenciais.client_token ?? ""
	});
	const resposta = await buscar(pedido.url, pedido.init);
	if (!resposta.ok) return await recusaDoProvedor(resposta);
	let corpo = null;
	try {
		corpo = await resposta.json();
	} catch {}
	const estado = lerEstadoDaInstancia(corpo);
	if (estado === null) return {
		ok: false,
		codigo: null,
		status: resposta.status
	};
	if (!estado.conectada) return {
		ok: false,
		codigo: CODIGO_DA_INSTANCIA_DESCONECTADA,
		status: resposta.status
	};
	return {
		ok: true,
		credito: null,
		cota: null
	};
}
async function recusaDoProvedor(resposta) {
	let codigo = null;
	try {
		const corpo = await resposta.json();
		const detalhe = corpo.error ?? corpo.detail ?? corpo;
		codigo = typeof detalhe === "string" ? detalhe : detalhe.status ?? detalhe.code ?? detalhe.name ?? detalhe.message ?? null;
	} catch {}
	return {
		ok: false,
		codigo: codigo === null ? null : String(codigo),
		status: resposta.status
	};
}
//#endregion
//#region supabase/functions/whatsapp-connect/conexao.ts
const PAPEIS_QUE_CONECTAM = new Set(["owner", "admin"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MENSAGENS_DA_CONEXAO = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	pedido_invalido: "O pedido chegou sem a conta a conectar.",
	sem_sessao: "Entre na sua conta para conectar o WhatsApp.",
	sem_acesso: "Só quem administra a conta conecta o WhatsApp. Peça a um administrador.",
	falha_interna: "Não foi possível conectar o WhatsApp agora. Tente de novo em alguns minutos."
};
const STATUS_DA_CONEXAO = {
	metodo_invalido: 405,
	pedido_invalido: 400,
	sem_sessao: 401,
	sem_acesso: 403,
	falha_interna: 500
};
const FRASES_DO_ESTADO = {
	conectado: "WhatsApp conectado. As mensagens que chegarem ao número vão para a assistente.",
	nao_configurado: "Cadastre o ID da instância, o token da instância e o token de segurança da Z-API para conectar.",
	webhooksFalharam: "A Z-API não aceitou o cadastro do endereço de mensagens. Confira as chaves e tente de novo."
};
function recusa(motivo) {
	return {
		status: STATUS_DA_CONEXAO[motivo],
		corpo: {
			ok: false,
			motivo,
			mensagem: MENSAGENS_DA_CONEXAO[motivo]
		}
	};
}
async function atenderConexao(pedido, porta, ambiente) {
	if (pedido.metodo !== "POST") return recusa("metodo_invalido");
	const jwt = /^Bearer\s+(.+)$/i.exec(pedido.autorizacao ?? "")?.[1]?.trim() ?? "";
	if (jwt === "") return recusa("sem_sessao");
	const corpo = pedido.corpo !== null && typeof pedido.corpo === "object" ? pedido.corpo : {};
	const contaId = typeof corpo.account_id === "string" ? corpo.account_id.trim().toLowerCase() : "";
	if (!UUID.test(contaId)) return recusa("pedido_invalido");
	try {
		const usuario = await porta.usuarioDaSessao(jwt);
		if (usuario === null) return recusa("sem_sessao");
		const papel = await porta.papelNaConta(contaId, usuario.id);
		if (papel === null || !PAPEIS_QUE_CONECTAM.has(papel)) return recusa("sem_acesso");
		const credenciais = await porta.credenciais(contaId);
		if (credenciais === null) return {
			status: 200,
			corpo: {
				ok: true,
				estado: "nao_configurado",
				webhooks: "nao_registrados",
				mensagem: FRASES_DO_ESTADO.nao_configurado
			}
		};
		if (ambiente.chaveDoServidor.trim() === "") return recusa("falha_interna");
		const endereco = await enderecoDoWebhookDoWhatsapp(ambiente.base, ambiente.chaveDoServidor, contaId);
		let registrados = true;
		for (const cadastro of pedidosDosWebhooks(credenciais, endereco)) try {
			if (!(await ambiente.buscar(cadastro.url, cadastro.init)).ok) registrados = false;
		} catch {
			registrados = false;
		}
		const sonda = await sondarProvedor("whatsapp", credenciais, ambiente.buscar).catch(() => ({
			ok: false,
			codigo: "timeout"
		}));
		let estado = "conectado";
		let mensagem = FRASES_DO_ESTADO.conectado;
		if (!sonda.ok) {
			const traduzido = traduzirErroDoProvedor(sonda.codigo, "status" in sonda ? sonda.status : null);
			estado = eFalhaDoProvedor(traduzido.motivo) ? "indisponivel" : "erro";
			mensagem = traduzido.mensagem;
		} else if (!registrados) mensagem = FRASES_DO_ESTADO.webhooksFalharam;
		const resposta = {
			ok: true,
			estado,
			webhooks: registrados ? "registrados" : "nao_registrados",
			mensagem
		};
		conferirQueNaoVazou(resposta, [
			credenciais.instance_id,
			credenciais.token,
			credenciais.client_token,
			new URL(endereco).searchParams.get("chave") ?? ""
		], "whatsapp-connect: credencial no corpo da resposta");
		return {
			status: 200,
			corpo: resposta
		};
	} catch {
		return recusa("falha_interna");
	}
}
//#endregion
//#region supabase/functions/whatsapp-connect/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const BASE_DAS_FUNCOES = Deno.env.get("SARAH_URL_DAS_FUNCOES") ?? `${URL_DO_SUPABASE.replace(/\/+$/, "")}/functions/v1`;
const CHAVE_DO_SERVIDOR = await segredoDaInstalacao({
	definido: Deno.env.get("SARAH_TOOL_SERVER_KEY"),
	chaveDeServico: CHAVE_DE_SERVICO,
	rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS
});
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
	async credenciais(contaId) {
		for (const chave of CHAVES_DA_ZAPI) cofre.invalidar(contaId, PROVEDOR_DO_WHATSAPP, chave);
		const valores = await Promise.all(CHAVES_DA_ZAPI.map((chave) => cofre.resolveSecret(contaId, PROVEDOR_DO_WHATSAPP, chave)));
		if (valores.some((valor) => !valor.ok)) return null;
		const [instance_id, token, client_token] = valores.map((valor) => valor.ok ? valor.valor : "");
		return {
			instance_id,
			token,
			client_token
		};
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
	const resposta = await atenderConexao({
		metodo: requisicao.method,
		autorizacao: requisicao.headers.get("authorization"),
		corpo
	}, porta, {
		base: BASE_DAS_FUNCOES,
		chaveDoServidor: CHAVE_DO_SERVIDOR,
		buscar: (url, init) => fetch(url, {
			...init,
			signal: AbortSignal.timeout(LIMITE_DO_ENVIO_MS)
		})
	});
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
