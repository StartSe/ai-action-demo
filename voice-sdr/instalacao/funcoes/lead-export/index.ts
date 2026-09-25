// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/lead-export/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
//#region supabase/functions/_shared/recorte-de-leads.ts
const ORDENACOES = [
	"nome",
	"atividade",
	"criacao"
];
const RECORTE_ABERTO = {};
const CAMPOS_DE_TEXTO = [
	"termo",
	"etapa",
	"temperatura",
	"origem"
];
function lerRecorteDeLeads(valor) {
	if (valor === void 0 || valor === null) return {
		ok: true,
		recorte: RECORTE_ABERTO
	};
	if (typeof valor !== "object" || Array.isArray(valor)) return {
		ok: false,
		motivo: "filtro_invalido",
		campo: "recorte"
	};
	const bruto = valor;
	const recorte = {};
	for (const campo of CAMPOS_DE_TEXTO) {
		const texto = lerTexto$1(bruto[campo]);
		if (texto === null) return {
			ok: false,
			motivo: "filtro_invalido",
			campo
		};
		if (texto !== void 0) recorte[campo] = texto;
	}
	const atividadeDesde = lerInstante(bruto.atividadeDesde);
	if (atividadeDesde === null) return {
		ok: false,
		motivo: "filtro_invalido",
		campo: "atividadeDesde"
	};
	if (atividadeDesde !== void 0) recorte.atividadeDesde = atividadeDesde;
	const bloqueado = lerBooleano(bruto.bloqueado);
	if (bloqueado === null) return {
		ok: false,
		motivo: "filtro_invalido",
		campo: "bloqueado"
	};
	if (bloqueado !== void 0) recorte.bloqueado = bloqueado;
	const ordenacao = lerOrdenacao(bruto.ordenacao);
	if (ordenacao === null) return {
		ok: false,
		motivo: "filtro_invalido",
		campo: "ordenacao"
	};
	if (ordenacao !== void 0) recorte.ordenacao = ordenacao;
	return {
		ok: true,
		recorte
	};
}
function lerTexto$1(valor) {
	if (valor === void 0 || valor === null) return void 0;
	if (typeof valor !== "string") return null;
	return valor.trim() || void 0;
}
function lerInstante(valor) {
	const texto = lerTexto$1(valor);
	if (texto === void 0 || texto === null) return texto;
	return Number.isFinite(Date.parse(texto)) ? texto : null;
}
function lerBooleano(valor) {
	if (valor === void 0 || valor === null) return void 0;
	if (typeof valor === "boolean") return valor;
	if (valor === "true") return true;
	if (valor === "false") return false;
	return null;
}
function lerOrdenacao(valor) {
	const texto = lerTexto$1(valor);
	if (texto === void 0 || texto === null) return texto;
	return ORDENACOES.find((ordenacao) => ordenacao === texto) ?? null;
}
//#endregion
//#region supabase/functions/lead-export/respostas.ts
const MENSAGENS = {
	exportado: "Exportação concluída. O arquivo tem os leads do recorte atual.",
	teto_atingido: "O recorte tem mais leads do que cabe em uma exportação. O arquivo traz os primeiros; estreite o recorte por etapa ou por período de atividade e exporte o restante.",
	metodo_invalido: "Este endereço aceita apenas POST.",
	conta_ausente: "O pedido chegou sem a conta de onde os leads seriam exportados.",
	filtro_invalido: "Um dos filtros do recorte chegou em formato que não dá para aplicar. Refaça a busca na lista e exporte de novo.",
	recorte_vazio: "Nenhum lead atende a este recorte. Ajuste os filtros na lista e exporte de novo.",
	sem_permissao: "Seu acesso não alcança os leads desta conta. Peça acesso a quem administra a conta.",
	falha_ao_registrar: "A exportação não foi registrada na trilha de auditoria e, por isso, não foi concluída. Tente de novo em alguns minutos.",
	falha_interna: "Não foi possível exportar agora. Tente de novo em alguns minutos."
};
const STATUS = {
	exportado: 200,
	teto_atingido: 200,
	metodo_invalido: 405,
	conta_ausente: 400,
	filtro_invalido: 400,
	recorte_vazio: 404,
	sem_permissao: 403,
	falha_ao_registrar: 500,
	falha_interna: 500
};
//#endregion
//#region supabase/functions/lead-export/exportacao.ts
const TETO_DE_LINHAS = 5e4;
const COLUNAS_DA_EXPORTACAO = [
	{
		titulo: "Nome",
		de: (lead) => lead.name
	},
	{
		titulo: "Telefone",
		de: (lead) => lead.phone_e164
	},
	{
		titulo: "E-mail",
		de: (lead) => lead.email
	},
	{
		titulo: "Empresa",
		de: (lead) => lead.company
	},
	{
		titulo: "Cidade",
		de: (lead) => lead.city
	},
	{
		titulo: "Estado",
		de: (lead) => lead.state
	},
	{
		titulo: "Fuso",
		de: (lead) => lead.timezone
	},
	{
		titulo: "Etapa",
		de: (lead) => lead.stage_label
	},
	{
		titulo: "Temperatura",
		de: (lead) => lead.temperature
	},
	{
		titulo: "Origem",
		de: (lead) => lead.source
	},
	{
		titulo: "Bloqueado em",
		de: (lead) => lead.blocked_at
	},
	{
		titulo: "Motivo do bloqueio",
		de: (lead) => lead.blocked_reason
	},
	{
		titulo: "Última atividade",
		de: (lead) => lead.last_activity_at
	},
	{
		titulo: "Criado em",
		de: (lead) => lead.created_at
	}
];
const QUEBRA = "\r\n";
const INICIO_DE_FORMULA = /^[=+\-@]/;
function protegerDeFormula(valor) {
	return INICIO_DE_FORMULA.test(valor) ? `'${valor}` : valor;
}
function celulaCsv(valor) {
	const texto = protegerDeFormula(valor ?? "");
	if (!/["\n\r,]/.test(texto) && texto.trim() === texto) return texto;
	return `"${texto.replaceAll("\"", "\"\"")}"`;
}
function montarCsv(leads) {
	return `﻿${[COLUNAS_DA_EXPORTACAO.map((coluna) => celulaCsv(coluna.titulo)).join(","), ...leads.map((lead) => COLUNAS_DA_EXPORTACAO.map((coluna) => celulaCsv(coluna.de(lead))).join(","))].join(QUEBRA)}${QUEBRA}`;
}
async function exportarLeads(pedido, porta) {
	const pagina = await porta.leadsDoRecorte(pedido.contaId, pedido.recorte, TETO_DE_LINHAS);
	const linhas = pagina.linhas.slice(0, TETO_DE_LINHAS);
	const total = Math.max(pagina.total, linhas.length);
	if (linhas.length > 0) await porta.registrarExportacao(pedido.contaId, linhas.length, pedido.recorte);
	return {
		csv: montarCsv(linhas),
		exportadas: linhas.length,
		total,
		ficaramDeFora: total - linhas.length,
		teto: TETO_DE_LINHAS
	};
}
async function atenderExportacao(pedido, porta, agora = Date.now) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const corpo = objetoDe(pedido.corpo);
	if (corpo === null) return recusa("conta_ausente");
	const contaId = lerTexto(corpo.contaId);
	if (contaId === null) return recusa("conta_ausente");
	const leitura = lerRecorteDeLeads(corpo.recorte);
	if (!leitura.ok) return recusa("filtro_invalido", leitura.campo);
	let exportacao;
	try {
		exportacao = await exportarLeads({
			contaId,
			recorte: leitura.recorte
		}, porta);
	} catch (erro) {
		return recusa(motivoDaFalha(erro));
	}
	if (exportacao.exportadas === 0) return recusa("recorte_vazio");
	const motivo = exportacao.ficaramDeFora > 0 ? "teto_atingido" : "exportado";
	return {
		status: STATUS[motivo],
		tipo: "csv",
		csv: exportacao.csv,
		nomeDoArquivo: nomeDoArquivo(agora()),
		cabecalhos: {
			"x-exportacao-motivo": motivo,
			"x-exportacao-linhas": String(exportacao.exportadas),
			"x-exportacao-total": String(exportacao.total),
			"x-exportacao-fora": String(exportacao.ficaramDeFora),
			"x-exportacao-teto": String(exportacao.teto)
		}
	};
}
function nomeDoArquivo(instante) {
	return `leads-${new Date(instante).toISOString().slice(0, 10)}.csv`;
}
function motivoDaFalha(erro) {
	const palavras = new Set(textoDoErro(erro).toLowerCase().match(/[a-z_]+/g) ?? []);
	if (palavras.has("sem_permissao") || palavras.has("sem_sessao")) return "sem_permissao";
	if (palavras.has("quantidade_invalida") || palavras.has("recorte_invalido")) return "falha_ao_registrar";
	return "falha_interna";
}
function textoDoErro(erro) {
	if (typeof erro === "string") return erro;
	if (typeof erro === "object" && erro !== null && "message" in erro) {
		const mensagem = erro.message;
		if (typeof mensagem === "string") return mensagem;
	}
	return "";
}
function recusa(motivo, campo) {
	return {
		status: STATUS[motivo],
		tipo: "json",
		corpo: campo === void 0 ? {
			ok: false,
			motivo,
			mensagem: MENSAGENS[motivo]
		} : {
			ok: false,
			motivo,
			mensagem: MENSAGENS[motivo],
			campo
		}
	};
}
function objetoDe(valor) {
	if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return null;
	return valor;
}
function lerTexto(valor) {
	if (typeof valor !== "string") return null;
	return valor.trim() || null;
}
//#endregion
//#region supabase/functions/lead-export/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_PUBLICA = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const COLUNAS = "name, phone_e164, email, company, city, state, timezone, temperature, source, blocked_at, blocked_reason, last_activity_at, created_at";
function colunas(recorte) {
	const juncao = recorte.etapa === void 0 ? "pipeline_stages(label)" : "pipeline_stages!inner(label)";
	return `${COLUNAS}, ${juncao}`;
}
const CABECALHOS = {
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
	"access-control-allow-methods": "POST, OPTIONS",
	"access-control-expose-headers": "x-exportacao-motivo, x-exportacao-linhas, x-exportacao-total, x-exportacao-fora, x-exportacao-teto"
};
function montarPorta(autorizacao) {
	const cliente = createClient(URL_DO_SUPABASE, CHAVE_PUBLICA, {
		global: { headers: { Authorization: autorizacao } },
		auth: {
			persistSession: false,
			autoRefreshToken: false
		}
	});
	return {
		async leadsDoRecorte(_contaId, recorte, teto) {
			let consulta = cliente.from("leads").select(colunas(recorte), { count: "exact" }).is("merged_into_id", null);
			if (recorte.termo !== void 0) {
				const termo = `%${recorte.termo}%`;
				consulta = consulta.or(`name.ilike.${termo},phone_e164.ilike.${termo},email.ilike.${termo}`);
			}
			if (recorte.etapa !== void 0) consulta = consulta.eq("pipeline_stages.key", recorte.etapa);
			if (recorte.temperatura !== void 0) consulta = consulta.eq("temperature", recorte.temperatura);
			if (recorte.origem !== void 0) consulta = consulta.eq("source", recorte.origem);
			if (recorte.atividadeDesde !== void 0) consulta = consulta.gte("last_activity_at", recorte.atividadeDesde);
			if (recorte.bloqueado === true) consulta = consulta.not("blocked_at", "is", null);
			if (recorte.bloqueado === false) consulta = consulta.is("blocked_at", null);
			if (recorte.ordenacao === "nome") consulta = consulta.order("name", { ascending: true });
			else if (recorte.ordenacao === "criacao") consulta = consulta.order("created_at", { ascending: false });
			else consulta = consulta.order("last_activity_at", {
				ascending: false,
				nullsFirst: false
			});
			const { data, count, error } = await consulta.range(0, teto - 1);
			if (error) throw new Error(error.message);
			const linhas = (data ?? []).map((linha) => ({
				name: linha.name ?? null,
				phone_e164: linha.phone_e164 ?? "",
				email: linha.email ?? null,
				company: linha.company ?? null,
				city: linha.city ?? null,
				state: linha.state ?? null,
				timezone: linha.timezone ?? null,
				stage_label: linha.pipeline_stages?.label ?? null,
				temperature: linha.temperature ?? null,
				source: linha.source ?? null,
				blocked_at: linha.blocked_at ?? null,
				blocked_reason: linha.blocked_reason ?? null,
				last_activity_at: linha.last_activity_at ?? null,
				created_at: linha.created_at ?? ""
			}));
			return {
				linhas,
				total: count ?? linhas.length
			};
		},
		async registrarExportacao(contaId, quantidade, recorte) {
			const { error } = await cliente.rpc("registrar_exportacao_de_leads", {
				p_account_id: contaId,
				p_quantidade: quantidade,
				p_recorte: recorte
			});
			if (error) throw new Error(error.message);
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
	const resposta = await atenderExportacao({
		metodo: requisicao.method,
		corpo
	}, montarPorta(requisicao.headers.get("authorization") ?? ""));
	if (resposta.tipo === "json") return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: {
			...CABECALHOS,
			"content-type": "application/json; charset=utf-8"
		}
	});
	return new Response(resposta.csv, {
		status: resposta.status,
		headers: {
			...CABECALHOS,
			...resposta.cabecalhos,
			"content-type": "text/csv; charset=utf-8",
			"content-disposition": `attachment; filename="${resposta.nomeDoArquivo}"`
		}
	});
});
//#endregion
