// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/cron-credit-watch/index.ts. Não edite à mão: rode `npm run pacote`.
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
const URL_DA_ZAPI = "https://api.z-api.io";
function base$1(credenciais) {
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
		url: `${base$1(credenciais)}/status`,
		init: {
			method: "GET",
			headers: cabecalhos(credenciais)
		},
		endpoint: "status"
	};
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
function conferirQueNaoVazou(corpo, valores, mensagem) {
	const dignos = valores.filter((valor) => valor.length >= 8);
	if (dignos.length === 0) return;
	const serializado = JSON.stringify(corpo);
	for (const valor of dignos) if (serializado.includes(valor)) throw new Error(mensagem);
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
//#endregion
//#region supabase/functions/integrations-status/provedores.ts
const PROVEDORES = [
	{
		id: "voz",
		rotulo: "Voz conversacional",
		fornecedor: "ElevenLabs",
		chaves: ["api_key"],
		rotulosDeChave: { api_key: "chave da API" },
		caminhoDeConfiguracao: "/config/integracoes#voz",
		bloqueia: "A assistente não fala: sem este provedor não há agente publicado nem ligação."
	},
	{
		id: "telefonia",
		rotulo: "Telefonia",
		fornecedor: "Twilio",
		chaves: ["account_sid", "auth_token"],
		rotulosDeChave: {
			account_sid: "identificador da conta",
			auth_token: "token de autenticação"
		},
		caminhoDeConfiguracao: "/config/integracoes#telefonia",
		bloqueia: "Não há número nem linha: nenhuma chamada sai e nenhuma entra."
	},
	{
		id: "calendario",
		rotulo: "Calendário",
		fornecedor: "Google Calendar, acesso avançado",
		chaves: [
			"client_id",
			"client_secret",
			"refresh_token"
		],
		rotulosDeChave: {
			client_id: "identificador do aplicativo",
			client_secret: "segredo do aplicativo",
			refresh_token: "autorização do calendário"
		},
		caminhoDeConfiguracao: "/config/integracoes#calendario",
		bloqueia: "Só o acesso avançado pelo Google. A agenda de cada especialista se lê pelo endereço iCal colado na ficha dele, sem estas chaves."
	},
	{
		id: "email",
		rotulo: "E-mail transacional",
		fornecedor: "Resend",
		chaves: ["api_key", "remetente"],
		rotulosDeChave: {
			api_key: "chave da API",
			remetente: "remetente (nome e e-mail)"
		},
		caminhoDeConfiguracao: "/config/integracoes#email",
		bloqueia: "O convite da reunião não sai: a reunião fica marcada, com o convite não enviado até o e-mail ser configurado."
	},
	{
		id: "whatsapp",
		rotulo: "WhatsApp (Z-API)",
		fornecedor: "Z-API",
		chaves: [
			"instance_id",
			"token",
			"client_token"
		],
		rotulosDeChave: {
			instance_id: "ID da instância",
			token: "Token da instância",
			client_token: "Token de segurança da conta"
		},
		caminhoDeConfiguracao: "/config/integracoes#whatsapp",
		bloqueia: "A assistente não conversa pelo WhatsApp: nenhuma mensagem é respondida nem enviada."
	}
];
new Map(PROVEDORES.map((provedor) => [provedor.id, provedor]));
function rotuloDaChave(provedor, chave) {
	return provedor.rotulosDeChave[chave] ?? chave;
}
//#endregion
//#region supabase/functions/integrations-status/respostas.ts
const MENSAGENS_DA_AUSENCIA = {
	sem_chave: "Nenhuma chave cadastrada para este provedor. Cadastre a chave para ligar a integração.",
	chave_incompleta: "A configuração está pela metade.",
	plataforma_bloqueada: "Existe uma chave da plataforma, mas esta conta precisa usar a própria. Cadastre a chave desta conta."
};
function mensagemDaFalha(motivo, faltando = []) {
	if (motivo === "chave_incompleta") {
		const lista = faltando.length > 0 ? ` Falta cadastrar: ${faltando.join(", ")}.` : "";
		return `${MENSAGENS_DA_AUSENCIA.chave_incompleta}${lista}`;
	}
	if (motivo === "sem_chave" || motivo === "plataforma_bloqueada") return MENSAGENS_DA_AUSENCIA[motivo];
	return MENSAGENS_DO_PROVEDOR[motivo];
}
async function medirProvedores(contaId, porta, escolhidos = PROVEDORES) {
	const valores = [];
	const provedores = [];
	for (const provedor of escolhidos) provedores.push(await estadoDoProvedor(contaId, provedor, porta, valores));
	return {
		provedores,
		valores
	};
}
async function estadoDoProvedor(contaId, provedor, porta, valores) {
	const credenciais = {};
	const faltando = [];
	const origens = [];
	let bloqueada = false;
	for (const chave of provedor.chaves) {
		const resolucao = await porta.credencial(contaId, provedor.id, chave);
		if (resolucao.ok) {
			credenciais[chave] = resolucao.valor;
			origens.push(resolucao.origem);
			valores.push(resolucao.valor);
			continue;
		}
		if (resolucao.motivo === "plataforma_bloqueada") bloqueada = true;
		faltando.push(chave);
	}
	if (faltando.length > 0) return semChave(provedor, bloqueada ? "plataforma_bloqueada" : faltando.length === provedor.chaves.length ? "sem_chave" : "chave_incompleta", faltando);
	const resposta = await sondarComSeguranca(porta, provedor.id, credenciais);
	const origem = origemMaisArriscada(origens);
	if (!resposta.ok) {
		const { motivo, mensagem } = traduzirErroDoProvedor(resposta.codigo, resposta.status);
		return {
			...base(provedor),
			estado: eFalhaDoProvedor(motivo) ? "indisponivel" : "erro",
			configurado: true,
			conectado: false,
			credito: null,
			cota: null,
			erro: {
				motivo,
				mensagem
			},
			chaves: chavesDo(provedor, []),
			chavesFaltando: [],
			origem
		};
	}
	const credito = lerCredito(resposta.credito);
	const cota = lerCota(resposta.cota);
	const semSaldo = credito !== null && credito.restante <= 0;
	const erro = semSaldo ? {
		motivo: "sem_credito",
		mensagem: mensagemDaFalha("sem_credito")
	} : null;
	return {
		...base(provedor),
		estado: semSaldo ? "erro" : "conectado",
		configurado: true,
		conectado: !semSaldo,
		credito,
		cota,
		erro,
		chaves: chavesDo(provedor, []),
		chavesFaltando: [],
		origem
	};
}
async function sondarComSeguranca(porta, provedor, credenciais) {
	try {
		return await porta.sondar(provedor, credenciais);
	} catch {
		return {
			ok: false,
			codigo: "timeout"
		};
	}
}
function semChave(provedor, motivo, faltando) {
	return {
		...base(provedor),
		estado: "nao_configurado",
		configurado: false,
		conectado: false,
		credito: null,
		cota: null,
		erro: {
			motivo,
			mensagem: mensagemDaFalha(motivo, faltando.map((chave) => rotuloDaChave(provedor, chave)))
		},
		chaves: chavesDo(provedor, faltando),
		chavesFaltando: faltando,
		origem: null
	};
}
function chavesDo(provedor, faltando) {
	return provedor.chaves.map((nome) => ({
		nome,
		rotulo: rotuloDaChave(provedor, nome),
		preenchida: !faltando.includes(nome)
	}));
}
function base(provedor) {
	return {
		provedor: provedor.id,
		rotulo: provedor.rotulo,
		fornecedor: provedor.fornecedor,
		caminhoDeConfiguracao: provedor.caminhoDeConfiguracao,
		bloqueia: provedor.bloqueia
	};
}
function lerCredito(bruto) {
	if (!bruto || !Number.isFinite(bruto.restante)) return null;
	const total = typeof bruto.total === "number" && Number.isFinite(bruto.total) ? bruto.total : null;
	const baixo = bruto.restante <= 0 || total !== null && total > 0 && bruto.restante / total < .1;
	return {
		restante: bruto.restante,
		total,
		unidade: bruto.unidade?.trim() || "créditos",
		baixo
	};
}
function lerCota(bruto) {
	if (!bruto || !Number.isFinite(bruto.emUso) || !Number.isFinite(bruto.limite)) return null;
	return {
		rotulo: bruto.rotulo,
		emUso: bruto.emUso,
		limite: bruto.limite,
		esgotada: bruto.limite > 0 && bruto.emUso >= bruto.limite
	};
}
function origemMaisArriscada(origens) {
	if (origens.includes("plataforma")) return "plataforma";
	if (origens.includes("recurso")) return "recurso";
	return origens[0] ?? null;
}
//#endregion
//#region supabase/functions/cron-credit-watch/credito.ts
const NOME_DA_ROTINA = "cron-credit-watch";
const LIMIAR_DA_COTA = .9;
const MOEDA = /^[A-Z]{3}$/;
function lerProvedor(estado, conta) {
	if (estado.estado !== "conectado" && estado.estado !== "erro") return [];
	const leituras = [];
	const nome = `${estado.rotulo} (${estado.fornecedor})`;
	const efeito = minusculaInicial(estado.bloqueia);
	const credito = estado.credito;
	const limiar = conta.credit_alert_cents;
	if (credito !== null && limiar !== null) {
		const unidade = credito.unidade.trim().toUpperCase();
		if (MOEDA.test(unidade)) {
			const centavos = Math.round(credito.restante * 100);
			leituras.push({
				provedor: estado.provedor,
				tipo: "credito",
				alerta: centavos < limiar,
				frase: `Crédito baixo em ${nome}: restam ${dinheiro(centavos, unidade)}, abaixo do aviso de ${dinheiro(limiar, unidade)}. Quando acabar, ${efeito}`,
				observado: {
					restante_cents: centavos,
					unidade,
					limiar_cents: limiar
				}
			});
		} else {
			const total = credito.total === null ? "" : ` de ${numero(credito.total)}`;
			leituras.push({
				provedor: estado.provedor,
				tipo: "credito",
				alerta: credito.baixo,
				frase: `Crédito baixo em ${nome}: restam ${numero(credito.restante)}${total} ${credito.unidade}. Quando acabar, ${efeito}`,
				observado: {
					restante: credito.restante,
					total: credito.total,
					unidade: credito.unidade,
					regra: "fracao_do_total"
				}
			});
		}
	}
	const cota = estado.cota;
	if (cota !== null && cota.limite > 0) leituras.push({
		provedor: estado.provedor,
		tipo: "cota",
		alerta: cota.emUso / cota.limite >= LIMIAR_DA_COTA,
		frase: `Cota perto do limite em ${nome}: ${numero(cota.emUso)} de ${numero(cota.limite)} ${cota.rotulo} em uso. Quando esgotar, ${efeito}`,
		observado: {
			em_uso: cota.emUso,
			limite: cota.limite,
			rotulo: cota.rotulo,
			limiar: LIMIAR_DA_COTA
		}
	});
	return leituras;
}
function decidirAvisos(conta, estados, abertos) {
	const aberto = new Set(abertos.map((aviso) => chaveDoAviso(aviso.provider, aviso.kind)));
	const abrir = [];
	const rearmar = [];
	for (const estado of estados) for (const leitura of lerProvedor(estado, conta)) {
		const estaAberto = aberto.has(chaveDoAviso(leitura.provedor, leitura.tipo));
		if (leitura.alerta && !estaAberto) abrir.push({
			account_id: conta.account_id,
			provider: leitura.provedor,
			kind: leitura.tipo,
			message: leitura.frase,
			observed: leitura.observado
		});
		else if (!leitura.alerta && estaAberto) rearmar.push({
			provider: leitura.provedor,
			kind: leitura.tipo
		});
	}
	return {
		abrir,
		rearmar
	};
}
function vigiarCredito(pedido) {
	const { porta, sondagem } = pedido;
	const agora = pedido.agora ?? Date.now;
	return executarRotina({
		nome: NOME_DA_ROTINA,
		porta: pedido.execucao,
		agora,
		trabalho: {
			async reivindicar(limite, instante) {
				return (await porta.reivindicarContas(limite, instante)).map((conta) => ({
					chave: conta.account_id,
					conta
				}));
			},
			async processar(item, instante) {
				await vigiarConta(porta, sondagem, item.conta, instante);
			}
		}
	});
}
async function vigiarConta(porta, sondagem, conta, instante) {
	const { provedores, valores } = await medirProvedores(conta.account_id, sondagem);
	if (provedores.every((estado) => estado.estado === "nao_configurado")) return;
	const decisao = decidirAvisos(conta, provedores, await porta.avisosAbertos(conta.account_id));
	conferirQueNaoVazou(decisao, valores, "o aviso de crédito carregava o valor de uma credencial");
	for (const aviso of decisao.rearmar) await porta.rearmarAviso(conta.account_id, aviso.provider, aviso.kind, instante);
	for (const aviso of decisao.abrir) if (await porta.abrirAviso(aviso, instante) && porta.abrirExcecao) await porta.abrirExcecao(aviso);
}
function chaveDoAviso(provedor, tipo) {
	return `${provedor}:${tipo}`;
}
function minusculaInicial(frase) {
	return frase.charAt(0).toLocaleLowerCase("pt-BR") + frase.slice(1);
}
function dinheiro(centavos, moeda) {
	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: moeda
	}).format(centavos / 100);
}
function numero(valor) {
	return new Intl.NumberFormat("pt-BR").format(valor);
}
async function atenderRotina(pedido, vigia, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return {
		status: 405,
		corpo: { ok: false }
	};
	if (!await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno)) return {
		status: 401,
		corpo: { ok: false }
	};
	const resultado = await vigiarCredito(vigia);
	return {
		status: resultado.ok ? 200 : 500,
		corpo: { ...resultado }
	};
}
//#endregion
//#region supabase/functions/cron-credit-watch/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
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
const sondagem = {
	credencial(contaId, provedor, chave) {
		return cofre.resolveSecret(contaId, provedor, chave);
	},
	sondar(provedor, credenciais) {
		return sondarProvedor(provedor, credenciais);
	}
};
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
	async reivindicarContas(limite, instante) {
		const { data, error } = await servico.rpc("reivindicar_vigia_de_credito", {
			p_limite: limite,
			p_instante: instante
		});
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async avisosAbertos(contaId) {
		const { data, error } = await servico.from("provider_alerts").select("provider, kind").eq("account_id", contaId).is("rearmed_at", null);
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async abrirAviso(aviso, instante) {
		const { data, error } = await servico.rpc("abrir_aviso_de_provedor", {
			p_account_id: aviso.account_id,
			p_provider: aviso.provider,
			p_kind: aviso.kind,
			p_message: aviso.message,
			p_observed: aviso.observed,
			p_instante: instante
		});
		if (error) throw new Error(error.message);
		return data === true;
	},
	async rearmarAviso(contaId, provedor, tipo, instante) {
		const { data, error } = await servico.rpc("rearmar_aviso_de_provedor", {
			p_account_id: contaId,
			p_provider: provedor,
			p_kind: tipo,
			p_instante: instante
		});
		if (error) throw new Error(error.message);
		return data === true;
	}
};
Deno.serve(async (requisicao) => {
	const resposta = await atenderRotina({
		metodo: requisicao.method,
		segredo: requisicao.headers.get(CABECALHO_DA_ROTINA)
	}, {
		porta,
		sondagem,
		execucao
	}, { segredoInterno: await segredoInterno() });
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: { "content-type": "application/json; charset=utf-8" }
	});
});
//#endregion
