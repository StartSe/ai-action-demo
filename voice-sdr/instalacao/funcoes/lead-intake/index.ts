// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/lead-intake/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/_shared/chave-de-entrada.ts
function hashDaChaveDeEntrada(chave) {
	return hashEmHexadecimal(chave);
}
function chaveConfereComOHash(hashDaChave, hashGuardado) {
	return hashesIguais(hashDaChave, hashGuardado);
}
//#endregion
//#region supabase/functions/_shared/ddd.ts
const SAO_PAULO = "America/Sao_Paulo";
const MANAUS = "America/Manaus";
const RIO_BRANCO = "America/Rio_Branco";
const CAMPO_GRANDE = "America/Campo_Grande";
const CUIABA = "America/Cuiaba";
const LOCAIS_POR_DDD = new Map([
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
]);
const DDDS_VALIDOS = new Set(LOCAIS_POR_DDD.keys());
function dddEhValido(ddd) {
	return DDDS_VALIDOS.has(ddd);
}
function resolverDdd(ddd) {
	return LOCAIS_POR_DDD.get(ddd) ?? null;
}
const TELEFONE_BRASILEIRO = /^\+55(\d{10,11})$/;
function resolverFusoDoTelefone(e164) {
	const nacional = TELEFONE_BRASILEIRO.exec(e164)?.[1];
	if (nacional === void 0) return null;
	return resolverDdd(nacional.slice(0, 2));
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
//#region supabase/functions/lead-intake/respostas.ts
const MENSAGENS = {
	lead_criado: "Lead recebido.",
	lead_atualizado: "Lead recebido. O contato já existia e os campos em branco foram preenchidos.",
	lead_conhecido: "Lead recebido. Este telefone já estava cadastrado e nada mudou.",
	metodo_invalido: "Este endereço aceita apenas POST.",
	chave_invalida: "A chave deste endereço não foi aceita. Confira o cabeçalho x-intake-key com quem administra a conta.",
	limite_excedido: "Este endereço recebeu pedidos demais em pouco tempo. Aguarde o tempo indicado em Retry-After e envie de novo.",
	corpo_invalido: "O pedido precisa de um corpo JSON com os campos do lead.",
	telefone_invalido: "O telefone não foi aceito.",
	falha_interna: "Não foi possível registrar o lead agora. Envie o pedido de novo em alguns minutos."
};
const STATUS = {
	lead_criado: 201,
	lead_atualizado: 200,
	lead_conhecido: 200,
	metodo_invalido: 405,
	chave_invalida: 401,
	limite_excedido: 429,
	corpo_invalido: 400,
	telefone_invalido: 422,
	falha_interna: 500
};
const MENSAGENS_DO_TELEFONE = {
	vazio: "Informe o telefone do lead. Sem ele não há para onde ligar.",
	sem_digitos: "O telefone enviado não tem nenhum dígito.",
	comprimento_invalido: "O telefone não tem a quantidade de dígitos de um número brasileiro. Envie o código de área e o número.",
	ddd_invalido: "O código de área informado não existe no Brasil.",
	celular_sem_nono_digito: "Falta um dígito neste celular. Confira o número com quem preencheu o formulário.",
	pais_nao_suportado: "Este número é de outro país. O endereço aceita apenas números do Brasil."
};
//#endregion
//#region supabase/functions/lead-intake/entrada.ts
const CABECALHO_DA_CHAVE = "x-intake-key";
const FORMATO_DA_CHAVE = /^[A-Za-z0-9_-]{32,256}$/;
const ORIGEM = "intake";
const APELIDOS = {
	nome: [
		"nome",
		"name",
		"fullname",
		"full_name"
	],
	telefone: [
		"telefone",
		"phone",
		"phone_e164",
		"celular",
		"whatsapp",
		"tel"
	],
	email: [
		"email",
		"e-mail",
		"e_mail",
		"mail"
	],
	empresa: [
		"empresa",
		"company",
		"organizacao",
		"organization"
	],
	cidade: ["cidade", "city"],
	estado: [
		"estado",
		"state",
		"uf"
	],
	origem: ["origem", "source"],
	referencia: [
		"referencia",
		"source_ref",
		"ref",
		"form_id"
	]
};
async function receberLead(pedido, porta, limite) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const chave = (pedido.chave ?? "").trim();
	if (!FORMATO_DA_CHAVE.test(chave)) return recusa("chave_invalida");
	try {
		const hash = await hashDaChaveDeEntrada(chave);
		const conta = await porta.contaPorHashDaChave(hash);
		if (conta === null) return recusa("chave_invalida");
		if (!chaveConfereComOHash(hash, conta.intakeKeyHash)) return recusa("chave_invalida");
		const decisao = limite.registrar(conta.id);
		if (!decisao.permitido) return recusa("limite_excedido", { "retry-after": String(decisao.esperarSegundos) });
		const campos = lerCampos(pedido.corpo);
		if (campos === null) return recusa("corpo_invalido");
		const telefone = normalizarTelefone(campos.telefone);
		if (!telefone.ok) return {
			status: STATUS.telefone_invalido,
			corpo: {
				ok: false,
				motivo: "telefone_invalido",
				mensagem: MENSAGENS_DO_TELEFONE[telefone.motivo]
			},
			cabecalhos: {}
		};
		const local = resolverFusoDoTelefone(telefone.e164);
		const lead = montarLead(campos, telefone.e164, local);
		const gravado = await porta.registrarLead(conta.id, lead);
		return {
			status: STATUS[MOTIVO_DO_RESULTADO[gravado.resultado]],
			corpo: {
				ok: true,
				motivo: MOTIVO_DO_RESULTADO[gravado.resultado],
				mensagem: MENSAGENS[MOTIVO_DO_RESULTADO[gravado.resultado]],
				lead: {
					id: gravado.leadId,
					telefone: lead.phone_e164,
					cidade: lead.city,
					estado: lead.state,
					fuso: lead.timezone
				}
			},
			cabecalhos: {}
		};
	} catch {
		return recusa("falha_interna");
	}
}
const MOTIVO_DO_RESULTADO = {
	criado: "lead_criado",
	ignorado: "lead_conhecido",
	atualizado: "lead_atualizado"
};
function lerCampos(corpo) {
	if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) return null;
	const porChave = new Map();
	for (const [chave, valor] of Object.entries(corpo)) {
		const texto = textoDoValor(valor);
		if (texto === null) continue;
		const normalizada = chave.trim().toLowerCase();
		if (!porChave.has(normalizada)) porChave.set(normalizada, texto);
	}
	const campos = {};
	for (const campo of Object.keys(APELIDOS)) {
		const apelidos = APELIDOS[campo];
		let achado = null;
		for (const apelido of apelidos) {
			const valor = porChave.get(apelido);
			if (valor !== void 0) {
				achado = valor;
				break;
			}
		}
		campos[campo] = achado;
	}
	return campos;
}
function textoDoValor(valor) {
	if (typeof valor === "string") return valor.trim() || null;
	if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
	return null;
}
function montarLead(campos, e164, local) {
	return {
		name: campos.nome,
		phone_e164: e164,
		email: campos.email,
		company: campos.empresa,
		city: campos.cidade ?? local?.cidade ?? null,
		state: campos.estado ?? local?.estado ?? null,
		timezone: local?.fuso ?? null,
		source: ORIGEM,
		source_ref: campos.referencia ?? campos.origem
	};
}
function recusa(motivo, cabecalhos = {}) {
	return {
		status: STATUS[motivo],
		corpo: {
			ok: false,
			motivo,
			mensagem: MENSAGENS[motivo]
		},
		cabecalhos
	};
}
const CHAVES_ANTES_DA_VARREDURA = 1e3;
function criarLimiteDeTaxa(opcoes = {}) {
	const agora = opcoes.agora ?? Date.now;
	const teto = opcoes.pedidosPorJanela ?? 60;
	const janela = opcoes.janelaEmMs ?? 6e4;
	const instantes = new Map();
	return {
		registrar(chave) {
			const momento = agora();
			const inicioDaJanela = momento - janela;
			if (instantes.size > CHAVES_ANTES_DA_VARREDURA) varrer(instantes, inicioDaJanela);
			const dentro = (instantes.get(chave) ?? []).filter((instante) => instante > inicioDaJanela);
			if (dentro.length >= teto) {
				const maisAntigo = dentro[0] ?? momento;
				instantes.set(chave, dentro);
				return {
					permitido: false,
					esperarSegundos: Math.max(1, Math.ceil((maisAntigo + janela - momento) / 1e3))
				};
			}
			dentro.push(momento);
			instantes.set(chave, dentro);
			return { permitido: true };
		},
		chavesGuardadas() {
			return instantes.size;
		}
	};
}
function varrer(instantes, inicioDaJanela) {
	for (const [chave, guardados] of instantes) {
		const dentro = guardados.filter((instante) => instante > inicioDaJanela);
		if (dentro.length === 0) instantes.delete(chave);
		else instantes.set(chave, dentro);
	}
}
//#endregion
//#region supabase/functions/lead-intake/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": `content-type, ${CABECALHO_DA_CHAVE}`,
	"access-control-allow-methods": "POST, OPTIONS"
};
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const limite = criarLimiteDeTaxa();
const porta = {
	async contaPorHashDaChave(hash) {
		const { data, error } = await servico.from("accounts").select("id, intake_key_hash").eq("intake_key_hash", hash).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const linha = data;
		if (!linha.intake_key_hash) return null;
		return {
			id: linha.id,
			intakeKeyHash: linha.intake_key_hash
		};
	},
	async registrarLead(contaId, lead) {
		const { data, error } = await servico.rpc("registrar_lead", {
			p_account_id: contaId,
			p_lead: lead,
			p_ao_duplicar: "atualizar"
		});
		if (error) throw new Error(error.message);
		const linha = Array.isArray(data) ? data[0] : data;
		if (!linha) throw new Error("registrar_lead não devolveu linha");
		return {
			leadId: linha.lead_id,
			resultado: linha.resultado
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
	const resposta = await receberLead({
		metodo: requisicao.method,
		chave: requisicao.headers.get(CABECALHO_DA_CHAVE),
		corpo
	}, porta, limite);
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: {
			...CABECALHOS,
			...resposta.cabecalhos
		}
	});
});
//#endregion
