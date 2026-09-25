// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/cron-speed-to-lead/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/_shared/chamada/idempotencia.ts
const SEPARADOR = ":";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function chaveDeDiscagem(pedido) {
	switch (pedido.fonte) {
		case "manual": return juntar("manual", uuid(pedido.uuidDoCliente, "uuidDoCliente"));
		case "stl": return juntar("stl", uuid(pedido.leadId, "leadId"));
		case "rem": return juntar("rem", uuid(pedido.meetingId, "meetingId"));
		case "rescue": return juntar("rescue", uuid(pedido.meetingId, "meetingId"), ordinal(pedido.ordinal, "ordinal"));
		case "cad": return juntar("cad", uuid(pedido.enrollmentId, "enrollmentId"), ordinal(pedido.passo, "passo"));
		case "camp": return juntar("camp", uuid(pedido.targetId, "targetId"), ordinal(pedido.tentativa, "tentativa"));
	}
}
function juntar(...partes) {
	return partes.join(SEPARADOR);
}
function uuid(valor, campo) {
	if (!UUID.test(valor)) throw new Error(`${campo} não é uuid em forma canônica: ${valor}`);
	return valor;
}
function ordinal(valor, campo) {
	if (!Number.isInteger(valor) || valor < 1) throw new Error(`${campo} precisa ser inteiro a partir de 1: ${valor}`);
	return String(valor);
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
//#region supabase/functions/_shared/ddd.ts
const SAO_PAULO = "America/Sao_Paulo";
const MANAUS = "America/Manaus";
const RIO_BRANCO = "America/Rio_Branco";
const CAMPO_GRANDE = "America/Campo_Grande";
const CUIABA = "America/Cuiaba";
const DDDS_VALIDOS = new Set(new Map([
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
function dddEhValido(ddd) {
	return DDDS_VALIDOS.has(ddd);
}
//#endregion
//#region supabase/functions/_shared/telefone.ts
const BRASIL = "55";
const NAO_DIGITO = /\D/g;
function normalizarTelefone(entrada, opcoes = {}) {
	const bruto = (entrada ?? "").trim();
	if (bruto === "") return {
		ok: false,
		motivo: "vazio"
	};
	const digitos = bruto.replace(NAO_DIGITO, "");
	if (digitos === "") return {
		ok: false,
		motivo: "sem_digitos"
	};
	const nacional = extrairNumeroNacional(bruto.startsWith("+"), digitos, opcoes);
	if (nacional === null) return {
		ok: false,
		motivo: "pais_nao_suportado"
	};
	if (nacional.length !== 10 && nacional.length !== 11) return {
		ok: false,
		motivo: "comprimento_invalido"
	};
	const ddd = nacional.slice(0, 2);
	if (!dddEhValido(ddd)) return {
		ok: false,
		motivo: "ddd_invalido"
	};
	if (!assinanteTemONonoDigito(nacional.slice(2))) return {
		ok: false,
		motivo: "celular_sem_nono_digito"
	};
	return {
		ok: true,
		e164: `+${BRASIL}${nacional}`,
		ddd
	};
}
function extrairNumeroNacional(temMaisNaFrente, digitos, opcoes) {
	if (temMaisNaFrente) return digitos.startsWith(BRASIL) ? digitos.slice(2) : null;
	if (digitos.startsWith("00")) {
		const semPrefixo = digitos.slice(2);
		return semPrefixo.startsWith(BRASIL) ? semPrefixo.slice(2) : null;
	}
	if ((opcoes.paisPadrao ?? "BR") !== "BR") return null;
	const semOperadora = digitos.startsWith("0") ? digitos.slice(1) : digitos;
	if ((semOperadora.length === 12 || semOperadora.length === 13) && semOperadora.startsWith(BRASIL)) return semOperadora.slice(2);
	return semOperadora;
}
function assinanteTemONonoDigito(assinante) {
	const primeiro = assinante[0];
	if (primeiro === void 0) return false;
	return assinante.length === 9 ? primeiro === "9" : primeiro < "6";
}
//#endregion
//#region supabase/functions/cron-speed-to-lead/enfileiramento.ts
const NOME_DA_ROTINA = "cron-speed-to-lead";
const CODIGO_DO_MOTIVO = {
	mesclado: "merged",
	bloqueado: "blocked",
	telefone_invalido: "invalid_phone",
	fora_da_janela: "outside_window"
};
const ELEGIBILIDADE = [
	{
		motivo: "mesclado",
		recusa: (lead) => lead.mesclado ? "lead mesclado em outro; quem responde pelo número é o destino" : null
	},
	{
		motivo: "bloqueado",
		recusa: (lead) => lead.bloqueado ? "lead bloqueado ou número na lista de não perturbe" : null
	},
	{
		motivo: "telefone_invalido",
		recusa: (lead) => {
			const numero = normalizarTelefone(lead.phone_e164);
			return numero.ok ? null : `telefone não normaliza: ${numero.motivo}`;
		}
	}
];
function decidirLead(lead, instante) {
	if (!lead.speed_to_lead_enabled) return { tipo: "conta_desligada" };
	for (const regra of ELEGIBILIDADE) {
		const detalhe = regra.recusa(lead);
		if (detalhe !== null) return {
			tipo: "ignorar",
			motivo: regra.motivo,
			detalhe
		};
	}
	const criadoEm = Date.parse(lead.created_at);
	const agora = Date.parse(instante);
	if (Number.isNaN(criadoEm)) throw new Error(`lead ${lead.lead_id} com created_at ilegível: ${lead.created_at}`);
	if (agora > criadoEm + lead.speed_to_lead_minutes * 6e4) return {
		tipo: "ignorar",
		motivo: "fora_da_janela",
		detalhe: `examinado ${Math.round((agora - criadoEm) / 6e4)} min depois de chegar, com janela de resposta de ${lead.speed_to_lead_minutes} min`
	};
	chaveDeDiscagem({
		fonte: "stl",
		leadId: lead.lead_id
	});
	return {
		tipo: "enfileirar",
		linha: {
			account_id: lead.account_id,
			lead_id: lead.lead_id,
			purpose: "discovery",
			source: "stl",
			source_ref: lead.lead_id,
			attempt: 1
		}
	};
}
function enfileirarLeadsNovos(pedido) {
	const { porta } = pedido;
	return executarRotina({
		nome: NOME_DA_ROTINA,
		porta: pedido.execucao,
		agora: pedido.agora,
		trabalho: {
			async reivindicar(limite, instante) {
				return (await porta.candidatos(instante, limite)).map((lead) => ({
					chave: lead.lead_id,
					lead
				}));
			},
			async processar({ lead }, instante) {
				const decisao = decidirLead(lead, instante);
				switch (decisao.tipo) {
					case "conta_desligada": return;
					case "ignorar":
						await porta.registrarIgnorado({
							lead_id: lead.lead_id,
							account_id: lead.account_id,
							reason: CODIGO_DO_MOTIVO[decisao.motivo],
							detail: decisao.detalhe
						});
						return;
					case "enfileirar":
						await porta.enfileirar(decisao.linha);
						return;
				}
			}
		}
	});
}
async function atenderRotina(pedido, enfileiramento, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return {
		status: 405,
		corpo: { ok: false }
	};
	if (!await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno)) return {
		status: 401,
		corpo: { ok: false }
	};
	const resultado = await enfileirarLeadsNovos(enfileiramento);
	return {
		status: resultado.ok ? 200 : 500,
		corpo: { ...resultado }
	};
}
//#endregion
//#region supabase/functions/cron-speed-to-lead/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
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
	async candidatos(instante, limite) {
		const { data, error } = await servico.rpc("candidatos_do_fala_rapido", {
			p_instante: instante,
			p_limite: limite
		});
		if (error) throw new Error(error.message);
		return data ?? [];
	},
	async enfileirar(linha) {
		const { data, error } = await servico.from("dial_queue").upsert(linha, {
			onConflict: "account_id,source,source_ref,attempt",
			ignoreDuplicates: true
		}).select("id");
		if (error) throw new Error(error.message);
		return (data ?? []).length > 0 ? "criado" : "ja_existia";
	},
	async registrarIgnorado(linha) {
		const { error } = await servico.from("speed_to_lead_skips").upsert(linha, {
			onConflict: "lead_id",
			ignoreDuplicates: true
		});
		if (error) throw new Error(error.message);
	}
};
Deno.serve(async (requisicao) => {
	const resposta = await atenderRotina({
		metodo: requisicao.method,
		segredo: requisicao.headers.get(CABECALHO_DA_ROTINA)
	}, {
		porta,
		execucao
	}, { segredoInterno: await segredoInterno() });
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: { "content-type": "application/json; charset=utf-8" }
	});
});
//#endregion
