// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/leads-import/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
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
//#region supabase/functions/leads-import/previa.ts
const CAMPOS_DO_LEAD = [
	"nome",
	"telefone",
	"email",
	"empresa",
	"cidade",
	"estado",
	"origem"
];
const DIACRITICOS = /[\u0300-\u036f]/g;
const NAO_ALFANUMERICO = /[^a-z0-9]+/g;
function normalizarNomeDeColuna(nome) {
	return nome.normalize("NFD").replace(DIACRITICOS, "").toLowerCase().replace(NAO_ALFANUMERICO, "");
}
const APELIDOS = {
	nome: [
		"nome",
		"nome completo",
		"nome do lead",
		"nome do contato",
		"contato",
		"lead",
		"cliente",
		"name",
		"full name"
	],
	telefone: [
		"telefone",
		"telefone 1",
		"telefone de contato",
		"telefone/whatsapp",
		"fone",
		"celular",
		"whatsapp",
		"tel",
		"phone",
		"mobile",
		"número",
		"número de telefone"
	],
	email: [
		"email",
		"e-mail",
		"mail",
		"correio eletrônico",
		"endereço de e-mail"
	],
	empresa: [
		"empresa",
		"organização",
		"razão social",
		"company",
		"negócio",
		"estabelecimento"
	],
	cidade: [
		"cidade",
		"município",
		"localidade",
		"city"
	],
	estado: [
		"estado",
		"uf",
		"unidade federativa",
		"state"
	],
	origem: [
		"origem",
		"fonte",
		"canal",
		"source",
		"de onde veio"
	]
};
const DESTINO_POR_APELIDO = new Map(CAMPOS_DO_LEAD.flatMap((campo) => APELIDOS[campo].map((apelido) => [normalizarNomeDeColuna(apelido), campo])));
async function montarPrevia(pedido, porta) {
	const { colunas, linhas } = pedido.planilha;
	const mapeamento = resolverMapeamento(colunas, pedido.mapeamento);
	const normalizadas = linhas.map((linha) => normalizarLinha(linha, mapeamento, pedido.paisPadrao));
	const candidatos = [...new Set(normalizadas.flatMap((linha) => linha.e164 === null ? [] : [linha.e164]))];
	const naBase = new Set(candidatos.length === 0 ? [] : await porta.telefonesExistentes(pedido.contaId, candidatos));
	const primeiraPor164 = new Map();
	const resultado = [];
	let validos = 0;
	let duplicadosNoArquivo = 0;
	let duplicadosNaBase = 0;
	for (const linha of normalizadas) {
		if (linha.e164 === null) {
			resultado.push({
				numero: linha.numero,
				situacao: "invalido",
				lead: null,
				recusa: linha.recusa,
				local: null,
				primeiraOcorrencia: null
			});
			continue;
		}
		const local = resolverFusoDoTelefone(linha.e164);
		const lead = montarLead(linha, linha.e164, local);
		const primeira = primeiraPor164.get(linha.e164);
		if (primeira !== void 0) {
			duplicadosNoArquivo += 1;
			resultado.push({
				numero: linha.numero,
				situacao: "duplicado_no_arquivo",
				lead,
				recusa: null,
				local,
				primeiraOcorrencia: primeira
			});
			continue;
		}
		primeiraPor164.set(linha.e164, linha.numero);
		if (naBase.has(linha.e164)) {
			duplicadosNaBase += 1;
			resultado.push({
				numero: linha.numero,
				situacao: "duplicado_na_base",
				lead,
				recusa: null,
				local,
				primeiraOcorrencia: null
			});
			continue;
		}
		validos += 1;
		resultado.push({
			numero: linha.numero,
			situacao: "valido",
			lead,
			recusa: null,
			local,
			primeiraOcorrencia: null
		});
	}
	return {
		totalDeLinhas: linhas.length,
		validos,
		invalidos: linhas.length - validos - duplicadosNoArquivo - duplicadosNaBase,
		duplicados: duplicadosNoArquivo + duplicadosNaBase,
		duplicadosNoArquivo,
		duplicadosNaBase,
		mapeamento,
		colunasSemDestino: colunasSemDestino(colunas, mapeamento),
		linhas: resultado
	};
}
function resolverMapeamento(colunas, escolhas = {}) {
	const mapa = {
		nome: null,
		telefone: null,
		email: null,
		empresa: null,
		cidade: null,
		estado: null,
		origem: null
	};
	for (const coluna of colunas) {
		const campo = DESTINO_POR_APELIDO.get(normalizarNomeDeColuna(coluna));
		if (campo === void 0 || mapa[campo] !== null) continue;
		mapa[campo] = coluna;
	}
	for (const campo of CAMPOS_DO_LEAD) {
		const escolha = escolhas[campo];
		if (escolha === void 0) continue;
		mapa[campo] = escolha !== null && colunas.includes(escolha) ? escolha : null;
	}
	return mapa;
}
function colunasSemDestino(colunas, mapeamento) {
	const usadas = new Set(CAMPOS_DO_LEAD.flatMap((campo) => {
		const coluna = mapeamento[campo];
		return coluna === null ? [] : [coluna];
	}));
	return colunas.filter((coluna) => !usadas.has(coluna));
}
function normalizarLinha(linha, mapeamento, paisPadrao) {
	const base = {
		numero: linha.numero,
		celulas: linha.celulas,
		mapeamento
	};
	const coluna = mapeamento.telefone;
	if (coluna === null) return {
		...base,
		e164: null,
		recusa: {
			numero: linha.numero,
			coluna: null,
			motivo: "coluna_nao_mapeada"
		}
	};
	const telefone = normalizarTelefone(linha.celulas[coluna], { paisPadrao });
	if (!telefone.ok) return {
		...base,
		e164: null,
		recusa: {
			numero: linha.numero,
			coluna,
			motivo: telefone.motivo
		}
	};
	return {
		...base,
		e164: telefone.e164,
		recusa: null
	};
}
function montarLead(linha, e164, local) {
	const valor = (campo) => {
		const coluna = linha.mapeamento[campo];
		if (coluna === null) return null;
		return (linha.celulas[coluna] ?? "").trim() || null;
	};
	return {
		name: valor("nome"),
		phone_e164: e164,
		email: valor("email"),
		company: valor("empresa"),
		city: valor("cidade") ?? local?.cidade ?? null,
		state: valor("estado") ?? local?.estado ?? null,
		timezone: local?.fuso ?? null,
		source: valor("origem")
	};
}
//#endregion
//#region supabase/functions/leads-import/respostas.ts
const MENSAGENS = {
	previa_pronta: "Prévia pronta. Nada foi gravado ainda.",
	importado: "Importação concluída. O relatório mostra o que entrou em cada linha.",
	metodo_invalido: "Este endereço aceita apenas POST.",
	acao_invalida: "Informe a ação do pedido: previa ou confirmar.",
	conta_ausente: "O pedido chegou sem a conta em que a importação deve gravar.",
	planilha_invalida: "Não foi possível ler a planilha do pedido. Envie o arquivo outra vez.",
	arquivo_ausente: "A confirmação precisa do nome e do hash do arquivo, para registrar de onde cada lead veio.",
	escolha_invalida: "A escolha para telefone já cadastrado é ignorar, atualizar ou criar.",
	falha_interna: "Não foi possível concluir a importação agora. Tente de novo em alguns minutos."
};
const STATUS = {
	previa_pronta: 200,
	importado: 200,
	metodo_invalido: 405,
	acao_invalida: 400,
	conta_ausente: 400,
	planilha_invalida: 400,
	arquivo_ausente: 400,
	escolha_invalida: 400,
	falha_interna: 500
};
const MENSAGENS_DA_LINHA = {
	vazio: "A célula de telefone está em branco.",
	sem_digitos: "A célula de telefone não tem nenhum dígito.",
	comprimento_invalido: "O telefone não tem a quantidade de dígitos de um número brasileiro.",
	ddd_invalido: "O código de área informado não existe no Brasil.",
	celular_sem_nono_digito: "Falta o nono dígito neste celular. Confira o número na origem da lista.",
	pais_nao_suportado: "Este número é de outro país. A importação aceita apenas números do Brasil.",
	coluna_nao_mapeada: "A planilha não tem coluna de telefone. Escolha uma no mapeamento e envie de novo.",
	duplicado_no_arquivo: "Este telefone já aparece em uma linha anterior da planilha. Só a primeira entrou.",
	duplicado_na_base: "Este telefone já estava cadastrado nesta conta.",
	telefone_invalido: "O banco recusou este telefone. Confira o número na planilha e importe outra vez.",
	duplicado_por_telefone: "Já existe lead com este telefone nesta conta. Escolha ignorar ou atualizar para seguir.",
	sem_permissao: "Seu papel nesta conta não permite gravar lead. Peça acesso a quem administra a conta.",
	etapa_invalida: "A etapa escolhida não pertence ao funil desta conta.",
	lead_invalido: "O banco não aceitou o formato desta linha.",
	opcao_invalida: "O banco não reconheceu a escolha para telefone já cadastrado.",
	falha_ao_gravar: "A gravação desta linha falhou. Importe o arquivo de novo para tentar as que restaram."
};
function frasesDosMotivos(motivos) {
	const frases = {};
	for (const motivo of new Set(motivos)) frases[motivo] = MENSAGENS_DA_LINHA[motivo];
	return frases;
}
const ACOES = ["previa", "confirmar"];
const ESCOLHAS_DE_DUPLICATA = [
	"ignorar",
	"atualizar",
	"criar"
];
const MOTIVOS_DO_BANCO = [
	"telefone_invalido",
	"duplicado_por_telefone",
	"sem_permissao",
	"etapa_invalida",
	"lead_invalido",
	"opcao_invalida"
];
async function confirmarImportacao(pedido, porta) {
	const aoDuplicar = pedido.aoDuplicar ?? "ignorar";
	const previa = await montarPrevia({
		contaId: pedido.contaId,
		planilha: pedido.planilha,
		mapeamento: pedido.mapeamento,
		paisPadrao: pedido.paisPadrao
	}, porta);
	const resolvidas = previa.linhas.map(() => null);
	const pendentes = [];
	previa.linhas.forEach((linha, posicao) => {
		if (linha.lead === null) {
			resolvidas[posicao] = {
				numero: linha.numero,
				resultado: "erro",
				leadId: null,
				motivo: linha.recusa?.motivo ?? "lead_invalido"
			};
			return;
		}
		if (linha.situacao === "duplicado_no_arquivo") {
			resolvidas[posicao] = {
				numero: linha.numero,
				resultado: "ignorado",
				leadId: null,
				motivo: "duplicado_no_arquivo"
			};
			return;
		}
		pendentes.push({
			posicao,
			numero: linha.numero,
			lead: linha.lead
		});
	});
	const semRegistro = [];
	for (let inicio = 0; inicio < pendentes.length; inicio += 100) {
		const lote = pendentes.slice(inicio, inicio + 100);
		await Promise.all(lote.map(async (item) => {
			resolvidas[item.posicao] = await gravarLinha(item.numero, item.lead, {
				contaId: pedido.contaId,
				arquivo: pedido.arquivo,
				aoDuplicar
			}, porta, semRegistro);
		}));
	}
	const linhas = resolvidas.map((linha, posicao) => {
		if (linha === null) throw new Error(`relatório da importação: a linha na posição ${posicao} ficou sem resultado`);
		return linha;
	});
	return {
		arquivo: pedido.arquivo,
		aoDuplicar,
		totalDeLinhas: linhas.length,
		criados: quantas(linhas, "criado"),
		ignorados: quantas(linhas, "ignorado"),
		atualizados: quantas(linhas, "atualizado"),
		erros: quantas(linhas, "erro"),
		semRegistroDeImportacao: [...semRegistro].sort((um, outro) => um - outro),
		linhas
	};
}
async function gravarLinha(numero, lead, contexto, porta, semRegistro) {
	let gravado;
	try {
		gravado = await porta.registrarLead(contexto.contaId, lead, contexto.aoDuplicar);
	} catch (erro) {
		return {
			numero,
			resultado: "erro",
			leadId: null,
			motivo: motivoDoBanco(erro)
		};
	}
	if (gravado.resultado === "criado") try {
		await porta.registrarImportacao(gravado.leadId, contexto.arquivo);
	} catch {
		semRegistro.push(numero);
	}
	return {
		numero,
		resultado: gravado.resultado,
		leadId: gravado.leadId,
		motivo: gravado.resultado === "ignorado" ? "duplicado_na_base" : null
	};
}
function quantas(linhas, resultado) {
	return linhas.filter((linha) => linha.resultado === resultado).length;
}
function motivoDoBanco(erro) {
	const palavras = new Set(textoDoErro(erro).toLowerCase().match(/[a-z_]+/g) ?? []);
	for (const motivo of MOTIVOS_DO_BANCO) if (palavras.has(motivo)) return motivo;
	return "falha_ao_gravar";
}
function textoDoErro(erro) {
	if (typeof erro === "string") return erro;
	if (typeof erro === "object" && erro !== null && "message" in erro) {
		const mensagem = erro.message;
		if (typeof mensagem === "string") return mensagem;
	}
	return "";
}
async function atenderImportacao(pedido, porta) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const corpo = objetoDe(pedido.corpo);
	if (corpo === null) return recusa("acao_invalida");
	const acao = lerAcao(corpo.acao);
	if (acao === null) return recusa("acao_invalida");
	const contaId = lerTexto(corpo.contaId);
	if (contaId === null) return recusa("conta_ausente");
	const planilha = lerPlanilha(corpo.planilha);
	if (planilha === null) return recusa("planilha_invalida");
	const mapeamento = lerMapeamento(corpo.mapeamento);
	const paisPadrao = lerTexto(corpo.paisPadrao) ?? void 0;
	if (acao === "previa") try {
		const previa = await montarPrevia({
			contaId,
			planilha,
			mapeamento,
			paisPadrao
		}, porta);
		return {
			status: STATUS.previa_pronta,
			corpo: {
				ok: true,
				motivo: "previa_pronta",
				mensagem: MENSAGENS.previa_pronta,
				previa,
				frases: frasesDosMotivos(motivosDaPrevia(previa))
			}
		};
	} catch {
		return recusa("falha_interna");
	}
	const arquivo = lerArquivo(corpo.arquivo);
	if (arquivo === null) return recusa("arquivo_ausente");
	const aoDuplicar = lerAoDuplicar(corpo.aoDuplicar);
	if (aoDuplicar === null) return recusa("escolha_invalida");
	try {
		const relatorio = await confirmarImportacao({
			contaId,
			planilha,
			mapeamento,
			paisPadrao,
			arquivo,
			aoDuplicar
		}, porta);
		return {
			status: STATUS.importado,
			corpo: {
				ok: true,
				motivo: "importado",
				mensagem: MENSAGENS.importado,
				relatorio,
				frases: frasesDosMotivos(relatorio.linhas.flatMap((linha) => linha.motivo === null ? [] : [linha.motivo]))
			}
		};
	} catch {
		return recusa("falha_interna");
	}
}
function motivosDaPrevia(previa) {
	return previa.linhas.flatMap((linha) => {
		if (linha.recusa !== null) return [linha.recusa.motivo];
		if (linha.situacao === "duplicado_no_arquivo") return ["duplicado_no_arquivo"];
		if (linha.situacao === "duplicado_na_base") return ["duplicado_na_base"];
		return [];
	});
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
function objetoDe(valor) {
	if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return null;
	return valor;
}
function lerTexto(valor) {
	if (typeof valor !== "string") return null;
	return valor.trim() || null;
}
function lerAcao(valor) {
	const texto = lerTexto(valor);
	return ACOES.find((acao) => acao === texto) ?? null;
}
function lerAoDuplicar(valor) {
	if (valor === void 0 || valor === null) return void 0;
	const texto = lerTexto(valor);
	return ESCOLHAS_DE_DUPLICATA.find((escolha) => escolha === texto) ?? null;
}
function lerArquivo(valor) {
	const objeto = objetoDe(valor);
	if (objeto === null) return null;
	const nome = lerTexto(objeto.nome);
	const hash = lerTexto(objeto.hash);
	if (nome === null || hash === null) return null;
	return {
		nome,
		hash
	};
}
function lerPlanilha(valor) {
	const objeto = objetoDe(valor);
	if (objeto === null) return null;
	const cru = objeto.colunas;
	if (!Array.isArray(cru) || cru.some((coluna) => typeof coluna !== "string")) return null;
	const colunas = cru;
	const crus = objeto.linhas;
	if (!Array.isArray(crus)) return null;
	const linhas = [];
	for (const linhaCrua of crus) {
		const linha = objetoDe(linhaCrua);
		if (linha === null) return null;
		if (typeof linha.numero !== "number" || !Number.isInteger(linha.numero)) return null;
		const celulas = objetoDe(linha.celulas);
		if (celulas === null) return null;
		linhas.push({
			numero: linha.numero,
			celulas: Object.fromEntries(Object.entries(celulas).flatMap(([coluna, celula]) => typeof celula === "string" ? [[coluna, celula]] : []))
		});
	}
	return {
		colunas,
		linhas
	};
}
function lerMapeamento(valor) {
	const objeto = objetoDe(valor);
	if (objeto === null) return void 0;
	const escolhas = {};
	for (const campo of CAMPOS_DO_LEAD) {
		const coluna = objeto[campo];
		if (coluna === null) escolhas[campo] = null;
		else if (typeof coluna === "string") escolhas[campo] = coluna;
	}
	return escolhas;
}
//#endregion
//#region supabase/functions/leads-import/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_PUBLICA = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"access-control-allow-origin": "*",
	"access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
	"access-control-allow-methods": "POST, OPTIONS"
};
const TELEFONES_POR_CONSULTA = 200;
function montarPorta(autorizacao) {
	const cliente = createClient(URL_DO_SUPABASE, CHAVE_PUBLICA, {
		global: { headers: { Authorization: autorizacao } },
		auth: {
			persistSession: false,
			autoRefreshToken: false
		}
	});
	return {
		async telefonesExistentes(_contaId, telefones) {
			const achados = [];
			for (let inicio = 0; inicio < telefones.length; inicio += TELEFONES_POR_CONSULTA) {
				const fatia = telefones.slice(inicio, inicio + TELEFONES_POR_CONSULTA);
				const { data, error } = await cliente.from("leads").select("phone_e164").is("merged_into_id", null).in("phone_e164", fatia);
				if (error) throw new Error(error.message);
				for (const linha of data ?? []) achados.push(linha.phone_e164);
			}
			return achados;
		},
		async registrarLead(contaId, lead, aoDuplicar) {
			const { data, error } = await cliente.rpc("registrar_lead", {
				p_account_id: contaId,
				p_lead: lead,
				p_ao_duplicar: aoDuplicar
			});
			if (error) throw new Error(error.message);
			const linha = Array.isArray(data) ? data[0] : data;
			if (!linha) throw new Error("registrar_lead não devolveu linha");
			return {
				leadId: linha.lead_id,
				resultado: linha.resultado
			};
		},
		async registrarImportacao(leadId, arquivo) {
			const { error } = await cliente.rpc("registrar_evento_de_lead", {
				p_lead_id: leadId,
				p_kind: "lead_imported",
				p_payload: {
					arquivo: arquivo.nome,
					hash: arquivo.hash
				}
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
	const resposta = await atenderImportacao({
		metodo: requisicao.method,
		corpo
	}, montarPorta(requisicao.headers.get("authorization") ?? ""));
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
