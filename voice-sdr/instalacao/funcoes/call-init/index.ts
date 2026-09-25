// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/call-init/index.ts. Não edite à mão: rode `npm run pacote`.
//
// É o que o instalador do painel publica: a função com os módulos de que ela
// depende num arquivo só, porque o deploy dele manda a pasta da função sem
// subpastas. O código de verdade, testado, está em supabase/functions/.
import { createClient } from "npm:@supabase/supabase-js@2";
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
//#region supabase/functions/_shared/agenda/horarios.ts
const DIA = 864e5;
function relogioEm(instante, fuso) {
	const partes = partesEm(fuso, typeof instante === "number" ? instante : instanteDe(instante, "instante"));
	return {
		ano: partes.ano,
		mes: partes.mes,
		dia: partes.dia,
		diaDaSemana: diaDaSemanaDe(partes),
		hora: partes.hora,
		minuto: partes.minuto,
		diaCivil: Math.floor(Date.UTC(partes.ano, partes.mes - 1, partes.dia) / DIA)
	};
}
const FORMATADORES = new Map();
function formatador(fuso) {
	const guardado = FORMATADORES.get(fuso);
	if (guardado) return guardado;
	const novo = new Intl.DateTimeFormat("en-US", {
		timeZone: fuso,
		hourCycle: "h23",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit"
	});
	FORMATADORES.set(fuso, novo);
	return novo;
}
function partesEm(fuso, instante) {
	const partes = formatador(fuso).formatToParts(instante);
	const valor = (tipo) => {
		const parte = partes.find((p) => p.type === tipo);
		if (!parte) throw new Error(`o fuso ${fuso} não devolveu ${tipo}`);
		return Number(parte.value);
	};
	return {
		ano: valor("year"),
		mes: valor("month"),
		dia: valor("day"),
		hora: valor("hour") % 24,
		minuto: valor("minute"),
		segundo: valor("second")
	};
}
function diaDaSemanaDe(data) {
	return ((Math.floor(Date.UTC(data.ano, data.mes - 1, data.dia) / DIA) + 4) % 7 + 7) % 7;
}
function instanteDe(iso, campo) {
	const ts = Date.parse(iso);
	if (Number.isNaN(ts)) throw new Error(`${campo} não é instante ISO-8601: ${iso}`);
	return ts;
}
//#endregion
//#region supabase/functions/_shared/speech/ferramentas.ts
const FALAS_DAS_FERRAMENTAS = {
	falha: "Deixa eu confirmar isso com o time e já te retorno.",
	propositoErrado: "Isso eu não consigo resolver por aqui agora, mas deixo anotado pro time.",
	campoFaltando: "Só um instante, me conta de novo pra eu anotar certinho?"
};
//#endregion
//#region supabase/functions/_shared/speech/agenda.ts
const DIAS_FALADOS = [
	"domingo",
	"segunda",
	"terça",
	"quarta",
	"quinta",
	"sexta",
	"sábado"
];
const LUGARES_DOS_FUSOS = new Map([
	["America/Sao_Paulo", "aqui em São Paulo"],
	["America/Manaus", "aqui em Manaus"],
	["America/Rio_Branco", "aqui em Rio Branco"],
	["America/Campo_Grande", "aqui em Campo Grande"],
	["America/Cuiaba", "aqui em Cuiabá"],
	["America/Belem", "aqui em Belém"],
	["America/Fortaleza", "aqui em Fortaleza"],
	["America/Recife", "aqui em Recife"],
	["America/Bahia", "aqui em Salvador"],
	["America/Noronha", "aqui em Noronha"]
]);
function falarHora(hora, minuto) {
	if (hora === 0 && minuto === 0) return "meia-noite";
	if (hora === 12 && minuto === 0) return "meio-dia";
	if (hora === 0 && minuto === 30) return "meia-noite e meia";
	if (hora === 12 && minuto === 30) return "meio-dia e meia";
	return minuto === 0 ? `${hora}h` : `${hora}h${String(minuto).padStart(2, "0")}`;
}
function falarDia(relogio, hoje) {
	const distancia = relogio.diaCivil - hoje.diaCivil;
	if (distancia === 0) return "hoje";
	if (distancia === 1) return "amanhã";
	const nome = DIAS_FALADOS[relogio.diaDaSemana] ?? "";
	return distancia > 1 && distancia < 7 ? nome : `${nome}, dia ${relogio.dia},`;
}
function preposicao(hora) {
	if (hora.startsWith("meio-dia")) return `ao ${hora}`;
	if (hora.startsWith("meia-noite")) return `à ${hora}`;
	return `às ${hora}`;
}
function falarHorario(horario, agora) {
	const doLead = relogioEm(horario.inicio, horario.fusoDoLead);
	const hojeDoLead = relogioEm(agora, horario.fusoDoLead);
	const horaDoLead = falarHora(doLead.hora, doLead.minuto);
	const base = `${falarDia(doLead, hojeDoLead)} ${preposicao(horaDoLead)}`;
	const doEspecialista = relogioEm(horario.inicio, horario.fusoDoEspecialista);
	if (doEspecialista.diaCivil === doLead.diaCivil && doEspecialista.hora === doLead.hora && doEspecialista.minuto === doLead.minuto) return base;
	const lugar = LUGARES_DOS_FUSOS.get(horario.fusoDoEspecialista) ?? "no horário do especialista";
	return `${base} no seu horário, ${falarHora(doEspecialista.hora, doEspecialista.minuto)}${doEspecialista.diaCivil === doLead.diaCivil ? "" : ` de ${DIAS_FALADOS[doEspecialista.diaDaSemana] ?? ""}`} ${lugar}`;
}
FALAS_DAS_FERRAMENTAS.falha;
//#endregion
//#region supabase/functions/_shared/speech/lembrete.ts
const MODALIDADES_FALADAS = {
	video: "por vídeo",
	telefone: "por telefone",
	presencial: "presencial"
};
function comQuem$1(nome) {
	const limpo = nome?.trim() ?? "";
	return limpo === "" ? "com o nosso especialista" : `com ${limpo}`;
}
function como(modalidade) {
	const falada = MODALIDADES_FALADAS[modalidade];
	return falada === void 0 ? "" : `, ${falada}`;
}
function montarFalaDeLembrete(reuniao, agora) {
	return `Tô ligando pra lembrar da sua conversa ${comQuem$1(reuniao.nomeDoEspecialista)} ${falarHorario(reuniao, agora)}${como(reuniao.modalidade)}. Tá tudo certo pra você participar, ou prefere que eu veja outro horário?`;
}
FALAS_DAS_FERRAMENTAS.falha;
//#endregion
//#region supabase/functions/_shared/speech/resgate.ts
function comQuem(nome) {
	const limpo = nome?.trim() ?? "";
	return limpo === "" ? "com o nosso especialista" : `com ${limpo}`;
}
function montarFalaDeResgate(reuniao, agora) {
	return `A gente tinha uma conversa marcada ${comQuem(reuniao.nomeDoEspecialista)} ${falarHorario(reuniao, agora)}, e eu queria saber como ficou pra você. Se ainda fizer sentido, eu já vejo um horário novo, pode ser?`;
}
//#endregion
//#region supabase/functions/_shared/agente/reuniao-em-jogo.ts
function texto$1(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor : null;
}
function instante(valor, campo) {
	const bruto = typeof valor === "string" ? valor : valor instanceof Date ? valor.toISOString() : "";
	const ms = Date.parse(bruto);
	if (Number.isNaN(ms)) throw new Error(`reuniao_em_jogo devolveu ${campo} ilegível`);
	return new Date(ms).toISOString();
}
function lerReuniaoEmJogo(linha) {
	if (!linha) return null;
	const id = texto$1(linha.meeting_id);
	const contaId = texto$1(linha.account_id);
	const especialistaId = texto$1(linha.specialist_id);
	const status = texto$1(linha.status);
	const fusoDoLead = texto$1(linha.lead_timezone);
	const fusoDoEspecialista = texto$1(linha.specialist_timezone);
	if (!id || !contaId || !especialistaId || !status || !fusoDoLead || !fusoDoEspecialista) throw new Error("reuniao_em_jogo devolveu linha incompleta");
	return {
		id,
		contaId,
		leadId: texto$1(linha.lead_id),
		status,
		inicio: instante(linha.starts_at, "starts_at"),
		fim: instante(linha.ends_at, "ends_at"),
		modalidade: texto$1(linha.modality) ?? "",
		especialistaId,
		nomeDoEspecialista: texto$1(linha.specialist_name),
		fusoDoLead,
		fusoDoEspecialista
	};
}
const PROPOSITOS_DE_REUNIAO = ["reminder", "rescue"];
function propositoDeReuniao(proposito) {
	return PROPOSITOS_DE_REUNIAO.includes(proposito);
}
function contextoDaReuniao(proposito, reuniao, agora) {
	if (proposito === "reminder") return `Motivo da ligação, para dizer logo depois da abertura: ${montarFalaDeLembrete(reuniao, agora)}`;
	if (proposito === "rescue") return `Motivo da ligação, para dizer logo depois da abertura: ${montarFalaDeResgate(reuniao, agora)}`;
	return null;
}
//#endregion
//#region supabase/functions/_shared/hash-de-segredo.ts
const HASH_HEXADECIMAL = /^[0-9a-f]{64}$/;
function pareceHashEmHexadecimal(valor) {
	return HASH_HEXADECIMAL.test(valor);
}
function hashesIguais(a, b) {
	if (a.length !== b.length) return false;
	let diferenca = 0;
	for (let posicao = 0; posicao < a.length; posicao += 1) diferenca |= a.charCodeAt(posicao) ^ b.charCodeAt(posicao);
	return diferenca === 0;
}
const PREFIXO_DO_INSTANTE = "t=";
const PREFIXO_DA_ASSINATURA = "v0=";
function lerAssinaturaDoProvedor(cabecalho) {
	const texto = cabecalho?.trim() ?? "";
	if (texto === "") return null;
	let instante = null;
	let valor = null;
	for (const parte of texto.split(",")) {
		const pedaco = parte.trim();
		if (pedaco.startsWith(PREFIXO_DO_INSTANTE)) {
			const digitos = pedaco.slice(2);
			if (!/^[0-9]{1,15}$/.test(digitos)) return null;
			instante = Number(digitos);
		} else if (pedaco.startsWith(PREFIXO_DA_ASSINATURA)) valor = pedaco.slice(3);
	}
	if (instante === null || valor === null) return null;
	if (!pareceHashEmHexadecimal(valor)) return null;
	return {
		instante,
		valor
	};
}
async function assinaturaDoProvedor(segredo, instante, corpo) {
	if (segredo.length === 0) throw new Error("segredo de webhook do provedor vazio");
	const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), {
		name: "HMAC",
		hash: "SHA-256"
	}, false, ["sign"]);
	const resumo = await crypto.subtle.sign("HMAC", material, new TextEncoder().encode(`${instante}.${corpo}`));
	return [...new Uint8Array(resumo)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
const JANELA_DE_ROTACAO_EM_SEGUNDOS = 86400;
function lerInstanteDaRotacao(texto) {
	const valor = texto?.trim() ?? "";
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(valor)) return null;
	const milissegundos = Date.parse(valor);
	return Number.isFinite(milissegundos) ? Math.floor(milissegundos / 1e3) : null;
}
async function conferirAssinaturaDoProvedor(pedido) {
	const segredo = pedido.segredo?.trim() ?? "";
	if (segredo.length === 0) return false;
	const lida = lerAssinaturaDoProvedor(pedido.assinatura);
	if (!lida) return false;
	if (Math.abs(pedido.agoraEmSegundos - lida.instante) > 1800) return false;
	const esperada = await assinaturaDoProvedor(segredo, lida.instante, pedido.corpo);
	if (hashesIguais(lida.valor, esperada)) return true;
	const anterior = pedido.segredoAnterior?.trim() ?? "";
	if (anterior.length === 0 || anterior === segredo) return false;
	const rotacionadoEm = pedido.rotacionadoEmSegundos;
	if (typeof rotacionadoEm !== "number" || !Number.isFinite(rotacionadoEm)) return false;
	const desdeARotacao = pedido.agoraEmSegundos - rotacionadoEm;
	if (desdeARotacao < 0 || desdeARotacao > 86400) return false;
	const comOAnterior = await assinaturaDoProvedor(anterior, lida.instante, pedido.corpo);
	return hashesIguais(lida.valor, comOAnterior);
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
//#endregion
//#region supabase/functions/_shared/tools/segredo.ts
const JANELA_DE_ROTACAO_EM_MS = JANELA_DE_ROTACAO_EM_SEGUNDOS * 1e3;
const TAMANHO_EM_HEXADECIMAL = 64;
const SO_HEXADECIMAL = /^[0-9a-f]+$/;
function derivarSegredo(chaveDoServidor, accountId) {
	return derivarSegredoDeFerramenta(chaveDoServidor, accountId);
}
async function conferirSegredo(pedido) {
	const apresentado = (pedido.cabecalho ?? "").trim();
	if (apresentado === "") return {
		ok: false,
		motivo: "cabecalho_ausente"
	};
	if (!SO_HEXADECIMAL.test(apresentado)) return {
		ok: false,
		motivo: "segredo_malformado"
	};
	if (apresentado.length !== TAMANHO_EM_HEXADECIMAL) return {
		ok: false,
		motivo: "tamanho_diferente"
	};
	const recebidos = bytesDoHexadecimal(apresentado);
	const vigente = pedido.chaves.vigente.trim();
	const anterior = anteriorDentroDaJanela(pedido.chaves, vigente, (pedido.agora ?? Date.now)());
	let achada = null;
	for (const contaId of pedido.contas) {
		const casouVigente = bytesIguais(recebidos, bytesDoHexadecimal(await derivarSegredo(vigente, contaId)));
		const casouAnterior = anterior !== null && bytesIguais(recebidos, bytesDoHexadecimal(await derivarSegredo(anterior, contaId)));
		if (achada === null && (casouVigente || casouAnterior)) achada = {
			contaId,
			chave: casouVigente ? "vigente" : "anterior"
		};
	}
	return achada === null ? {
		ok: false,
		motivo: "sem_conta"
	} : {
		ok: true,
		...achada
	};
}
function anteriorDentroDaJanela(chaves, vigente, agora) {
	const anterior = chaves.anterior?.trim() ?? "";
	if (anterior === "" || anterior === vigente) return null;
	const rotacionadaEm = chaves.rotacionadaEm;
	if (typeof rotacionadaEm !== "number" || !Number.isFinite(rotacionadaEm)) return null;
	const desdeARotacao = agora - rotacionadaEm;
	if (desdeARotacao < 0 || desdeARotacao > JANELA_DE_ROTACAO_EM_MS) return null;
	return anterior;
}
function bytesDoHexadecimal(hexadecimal) {
	const bytes = new Uint8Array(hexadecimal.length / 2);
	for (let posicao = 0; posicao < bytes.length; posicao += 1) bytes[posicao] = Number.parseInt(hexadecimal.slice(posicao * 2, posicao * 2 + 2), 16);
	return bytes;
}
function bytesIguais(a, b) {
	if (a.length !== b.length) return false;
	let diferenca = 0;
	for (let posicao = 0; posicao < a.length; posicao += 1) diferenca |= a[posicao] ^ b[posicao];
	return diferenca === 0;
}
//#endregion
//#region supabase/functions/_shared/provedor/webhooks-da-conta.ts
const PARAMETRO_DA_CONTA = "conta";
const CABECALHO_DO_SEGREDO_DO_INICIO = "x-sarah-webhook-secret";
const FORMATO_DE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function textoDoInicio(contaId) {
	return `inicio:${contaId}`;
}
async function segredoDoInicioConfere(pedido) {
	if (pedido.chaves.vigente.trim() === "") return false;
	return (await conferirSegredo({
		cabecalho: pedido.cabecalho,
		chaves: pedido.chaves,
		contas: [textoDoInicio(pedido.contaId)],
		agora: pedido.agora
	})).ok;
}
function contaDoEndereco(endereco) {
	let valor;
	try {
		valor = new URL(endereco).searchParams.get(PARAMETRO_DA_CONTA);
	} catch {
		return null;
	}
	const conta = valor?.trim().toLowerCase() ?? "";
	return FORMATO_DE_UUID.test(conta) ? conta : null;
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
new Set(LOCAIS_POR_DDD.keys());
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
//#region supabase/functions/_shared/ensaio/perfis-de-lead.ts
const PERFIS_DE_LEAD = [
	{
		id: "interessado",
		rotulo: "Lead interessado",
		descricao: "Responde com calma, faz perguntas sobre a oferta e aceita seguir a conversa.",
		contexto: "Preencheu o formulário do site pedindo mais informações sobre a oferta."
	},
	{
		id: "apressado",
		rotulo: "Lead apressado",
		descricao: "Atende entre dois compromissos, responde curto e quer saber logo do que se trata.",
		contexto: "Baixou um material da empresa na semana passada e não respondeu o e-mail."
	},
	{
		id: "pede_pessoa",
		rotulo: "Lead que pede para falar com uma pessoa",
		descricao: "Ouve a apresentação e pede para ser atendido por alguém da equipe.",
		contexto: "Pediu um orçamento pelo site e deixou o telefone para contato."
	},
	{
		id: "pede_bloqueio",
		rotulo: "Lead que pede para não ser chamado",
		descricao: "Diz que não quer receber ligações e pede para ser tirado da lista.",
		contexto: "Está na base de contatos de um evento da empresa."
	},
	{
		id: "pessoa_errada",
		rotulo: "Pessoa errada",
		descricao: "Atende e diz que não é a pessoa procurada: o número é de outra pessoa.",
		contexto: "Preencheu o formulário do site pedindo mais informações sobre a oferta."
	}
];
function perfilPeloId(id) {
	if (typeof id !== "string") return null;
	return PERFIS_DE_LEAD.find((perfil) => perfil.id === id) ?? null;
}
//#endregion
//#region supabase/functions/_shared/speech/todos-os-propositos.ts
const FALAS_DE_TODO_PROPOSITO = {
	avisoDeGravacao: "Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Antes da gente começar: essa ligação é gravada, tudo bem?",
	avisoDeGravacaoSemNome: "Oi! Aqui é a {nome_do_agente}, da {empresa}. Antes da gente começar: essa ligação é gravada, tudo bem?",
	aberturaSemGravacao: "Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Tudo bem?",
	aberturaSemGravacaoESemNome: "Oi! Aqui é a {nome_do_agente}, da {empresa}. Tudo bem?",
	recusaDeAfirmar: ["Isso eu não arrisco te falar, pra não te passar informação errada.", "Quem fecha esse número é o especialista, e ele te fala certinho."]
};
//#endregion
//#region supabase/functions/_shared/qualificacao/etapa.ts
const CHAVES_CANONICAS = [
	"new",
	"contacted",
	"qualified",
	"meeting_booked",
	"won",
	"lost"
];
Object.freeze({
	atendeu_sem_qualificar: "contacted",
	qualificado: "qualified",
	reuniao_marcada: "meeting_booked",
	ganho: "won",
	sem_fit: "lost",
	sem_interesse: "lost",
	perdido: "lost"
});
//#endregion
//#region supabase/functions/_shared/qualificacao/pontuacao.ts
const TEMPERATURAS = [
	"frio",
	"morno",
	"quente"
];
const REGUA_DE_EXEMPLO = Object.freeze({
	criterios: Object.freeze([
		{
			key: "dor_confirmada",
			peso: 30
		},
		{
			key: "orcamento",
			peso: 25
		},
		{
			key: "decisor",
			peso: 25
		},
		{
			key: "prazo",
			peso: 20
		}
	]),
	cortes: Object.freeze({
		morno: 40,
		quente: 70
	})
});
const DESCRITOR_DA_QUALIFICACAO = {
	nome: "tool-qualify",
	propositos: [
		"discovery",
		"rescue",
		"followup"
	],
	prazoDeRespostaSegundos: 5,
	descricao: "Chame antes de encerrar, quando já souber em que pé a pessoa está. Registra a etapa do funil, os critérios confirmados e o resumo da conversa. Mande só o que a pessoa confirmou; o que ela não disse fica de fora. Leia a frase devolvida.",
	campos: [
		{
			chave: "stage_key",
			descricao: "A etapa em que a conversa deixou a pessoa.",
			obrigatorio: true,
			valores: CHAVES_CANONICAS.filter((chave) => chave !== "new")
		},
		{
			chave: "criterios",
			descricao: `Objeto com true quando a pessoa confirmou, false quando a resposta desqualifica e null quando não foi perguntado, para cada critério: ${REGUA_DE_EXEMPLO.criterios.map((criterio) => criterio.key).join(", ")}.`,
			obrigatorio: false,
			tipo: "object"
		},
		{
			chave: "temperature",
			descricao: "Sua impressão do quanto a pessoa serve. A pontuação final sai dos critérios.",
			obrigatorio: false,
			valores: TEMPERATURAS
		},
		{
			chave: "sentiment",
			descricao: "Como a conversa correu, de -1 (muito mal) a 1 (muito bem).",
			obrigatorio: false,
			tipo: "number"
		},
		{
			chave: "pain",
			descricao: "A dor que a pessoa descreveu, nas palavras dela.",
			obrigatorio: false
		},
		{
			chave: "fit",
			descricao: "Por que a oferta serve ou não serve, em uma frase.",
			obrigatorio: false
		},
		{
			chave: "objections",
			descricao: "As objeções que a pessoa levantou.",
			obrigatorio: false
		},
		{
			chave: "next_action",
			descricao: "O próximo passo combinado com a pessoa.",
			obrigatorio: false
		},
		{
			chave: "meeting_outcome",
			descricao: "Só em ligação depois de reunião: se a pessoa compareceu.",
			obrigatorio: false,
			valores: [
				"attended",
				"no_show",
				"unknown"
			]
		}
	]
};
DESCRITOR_DA_QUALIFICACAO.nome;
Object.freeze({
	key: "qualificacao_registrada",
	rotulo: "Registrou a qualificação antes de encerrar",
	obrigatorio: true,
	como: "registro"
});
//#endregion
//#region supabase/functions/_shared/speech/discovery.ts
const FALAS_DE_DESCOBERTA = {
	abertura: ["Fecho em dois. {oferta}", "E como vocês fazem isso aí no dia a dia?"],
	levantamentoDaDor: ["E isso trava vocês em quê? Tempo, custo, retrabalho?", "Quanto isso pesa no mês de vocês, mais ou menos?"],
	fechamento: {
		sem_agenda: [
			"Pelo que você me contou, acho que vale mesmo você falar com um especialista nosso.",
			"Prefere que ele te ligue ou que ele te chame no WhatsApp?",
			"E qual período do dia costuma ser mais tranquilo pra você atender?",
			"Fechado. Passo o seu contato pra ele e ele te procura. Obrigada pelo papo, {nome_do_lead}!"
		],
		com_agenda: [
			"Pelo que você me contou, acho que vale mesmo você falar com um especialista nosso.",
			"Tenho dois horários aqui: {opcao_um} ou {opcao_dois}. Qual fica melhor pra você?",
			"Fechado, deixei marcado. Você recebe a confirmação da reunião no seu e-mail."
		]
	}
};
//#endregion
//#region supabase/functions/_shared/speech/regras-travadas.ts
const FALAS_DAS_REGRAS_TRAVADAS = {
	naoPerturbe: ["Entendi, sem problema nenhum. Já tô tirando o seu número da nossa lista.", "Não te ligo mais. Obrigada, e desculpa o incômodo."],
	pedidoDeHumano: ["Claro, deixa eu ver aqui quem pode falar com você."],
	pessoaErrada: ["Ah, então eu falei com a pessoa errada. Me desculpa o incômodo!", "Vou corrigir aqui pra não te ligar de novo. Obrigada pela paciência, viu? Até mais."]
};
//#endregion
//#region supabase/functions/_shared/speech/qualificacao.ts
const FALAS_DA_QUALIFICACAO = {
	registrada: "Anotado, obrigada por me contar.",
	antesDeEncerrar: ["Deixa eu só anotar aqui o que você me contou, pra passar certinho pro especialista."]
};
//#endregion
//#region supabase/functions/_shared/playbook/camada-um.ts
const PROPOSITOS = [
	"discovery",
	"reminder",
	"rescue",
	"followup"
];
FALAS_DE_TODO_PROPOSITO.avisoDeGravacao, [...FALAS_DE_TODO_PROPOSITO.recusaDeAfirmar], [...FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe], [...FALAS_DAS_REGRAS_TRAVADAS.pedidoDeHumano], [...FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada];
[...FALAS_DA_QUALIFICACAO.antesDeEncerrar];
[...FALAS_DE_DESCOBERTA.fechamento.sem_agenda], [...FALAS_DE_DESCOBERTA.fechamento.com_agenda];
[...PROPOSITOS], [...PROPOSITOS], DESCRITOR_DA_QUALIFICACAO.nome, DESCRITOR_DA_QUALIFICACAO.propositos, [...PROPOSITOS];
DESCRITOR_DA_QUALIFICACAO.nome, DESCRITOR_DA_QUALIFICACAO.descricao, DESCRITOR_DA_QUALIFICACAO.campos;
const VARIAVEIS_DA_CHAMADA = [...[
	"nome_do_lead",
	"empresa_do_lead",
	"cidade_do_lead",
	"nome_do_especialista"
], "contexto_do_lead"];
const VALOR_INICIAL_DA_VARIAVEL = {
	nome_do_lead: "",
	empresa_do_lead: "",
	cidade_do_lead: "",
	nome_do_especialista: "",
	contexto_do_lead: ""
};
[
	"# Dados desta ligação",
	"Estes dados chegam no começo de cada ligação. Campo em branco é dado que a conta não tem: não invente, não pergunte só para preencher e nunca diga em voz alta o nome de um campo. Sem o nome de quem atende, fale sem nome.",
	"- Nome de quem atende: {nome_do_lead}",
	"- Empresa de quem atende: {empresa_do_lead}",
	"- Cidade: {cidade_do_lead}",
	"- O que se sabe do lead: {contexto_do_lead}"
].join("\n");
const MARCADOR = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}|\{([A-Za-z0-9_]+)\}/g;
new Set(VARIAVEIS_DA_CHAMADA);
function trocarMarcadores(texto, resolver) {
	return texto.replace(MARCADOR, (original, dupla, simples) => resolver((dupla ?? simples ?? "").toLowerCase(), original));
}
function interpolarFala(texto, valores) {
	return limparEspacos(trocarMarcadores(texto.replace(new RegExp(`\\s(?:${PREPOSICOES})\\s+(${MARCADOR.source})`, "gi"), (trecho, marcador) => valorDoMarcador(marcador, valores) === "" ? "" : trecho), (chave) => valores[chave] ?? ""));
}
const PREPOSICOES = "da|do|de|das|dos|em|no|na|nos|nas|para|pra|com";
function valorDoMarcador(marcador, valores) {
	return valores[marcador.replace(/[{}\s]/g, "").toLowerCase()]?.trim() ?? "";
}
function limparEspacos(texto) {
	return texto.replace(/[ \t]{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/,+\s*([,.;:!?])/g, "$1").replace(/([([])\s+/g, "$1").trim();
}
//#endregion
//#region supabase/functions/_shared/agente/abertura-da-chamada.ts
function limpo(valor) {
	return valor?.trim() ?? "";
}
function variaveisDaChamada(lead, contextoDoLead = "") {
	const doLead = {
		nome_do_lead: limpo(lead?.nome),
		empresa_do_lead: limpo(lead?.empresa),
		cidade_do_lead: limpo(lead?.cidade),
		nome_do_especialista: "",
		contexto_do_lead: limpo(contextoDoLead)
	};
	const variaveis = {};
	for (const chave of VARIAVEIS_DA_CHAMADA) variaveis[chave] = doLead[chave] !== "" ? doLead[chave] : VALOR_INICIAL_DA_VARIAVEL[chave];
	return variaveis;
}
function falaDeAbertura(gravacaoLigada, temNome) {
	if (gravacaoLigada) return temNome ? FALAS_DE_TODO_PROPOSITO.avisoDeGravacao : FALAS_DE_TODO_PROPOSITO.avisoDeGravacaoSemNome;
	return temNome ? FALAS_DE_TODO_PROPOSITO.aberturaSemGravacao : FALAS_DE_TODO_PROPOSITO.aberturaSemGravacaoESemNome;
}
function montarAbertura(pedido) {
	const { identidade, politica } = pedido;
	const daChamada = variaveisDaChamada(pedido.lead, pedido.contextoDoLead);
	const temNome = limpo(pedido.lead?.nome) !== "";
	const variaveis = {
		...daChamada,
		nome_do_agente: identidade.nome,
		empresa: identidade.empresa
	};
	const avisoDeGravacao = politica.gravacaoLigada ? interpolarFala(politica.avisoDeGravacao ?? falaDeAbertura(true, temNome), variaveis) : null;
	return {
		primeiraFala: interpolarFala(identidade.primeiraFala ?? falaDeAbertura(politica.gravacaoLigada, temNome), variaveis),
		avisoDeGravacao,
		variaveis
	};
}
//#endregion
//#region supabase/functions/call-init/formato-do-provedor.ts
const TIPO_DO_INICIO = "conversation_initiation_client_data";
const VARIAVEL_DA_CHAMADA = "call_id";
function lerPedidoDoProvedor(corpo) {
	if (typeof corpo !== "object" || corpo === null || Array.isArray(corpo)) return null;
	const campos = corpo;
	const variaveis = campos.dynamic_variables;
	return {
		chamadaId: texto((typeof variaveis === "object" && variaveis !== null && !Array.isArray(variaveis) ? variaveis : {})[VARIAVEL_DA_CHAMADA]),
		conversaId: texto(campos.conversation_id),
		agenteDoProvedorId: texto(campos.agent_id),
		numeroChamado: texto(campos.called_number),
		numeroDeQuemLigou: texto(campos.caller_id),
		chamadaDaTelefoniaId: texto(campos.call_sid)
	};
}
function corpoParaOProvedor(contexto) {
	return {
		type: TIPO_DO_INICIO,
		dynamic_variables: {
			...contexto.variaveis,
			[VARIAVEL_DA_CHAMADA]: contexto.chamadaId
		},
		conversation_config_override: { agent: { first_message: contexto.primeiraFala } }
	};
}
function texto(valor) {
	return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}
//#endregion
//#region supabase/functions/call-init/respostas.ts
const MENSAGENS = {
	metodo_invalido: "Este endereço aceita apenas POST.",
	assinatura_invalida: "Assinatura inválida.",
	corpo_invalido: "O webhook chegou sem um corpo JSON legível.",
	conversa_ausente: "O webhook de entrada chegou sem o identificador da conversa. Sem ele a ligação não pode ser registrada.",
	chamada_desconhecida: "Nenhuma ligação desta instalação corresponde a este identificador. Confira se o agente publicado é o desta instalação.",
	linha_desconhecida: "Nenhuma linha telefônica desta instalação atende este número. Registre o número em Números antes de recebê-lo.",
	conta_sem_agente: "Esta conta ainda não montou a assistente. Configure nome e empresa do agente antes de receber ligações.",
	falha_interna: "Não foi possível montar o contexto desta ligação agora."
};
const STATUS = {
	metodo_invalido: 405,
	assinatura_invalida: 401,
	corpo_invalido: 400,
	conversa_ausente: 400,
	chamada_desconhecida: 404,
	linha_desconhecida: 404,
	conta_sem_agente: 409,
	falha_interna: 500
};
//#endregion
//#region supabase/functions/call-init/contexto.ts
const PROPOSITO_DA_ENTRADA = "discovery";
const ORIGEM_DA_ENTRADA = "inbound";
const PREFIXO_DA_ENTRADA = "inbound";
const FORMATO_E164 = /^\+[1-9][0-9]{7,14}$/;
async function autenticar(pedido, opcoes) {
	const conta = pedido.contaDoEndereco ?? null;
	if (conta && opcoes.chavesDoServidor && pedido.segredoDoInicio) {
		if (await segredoDoInicioConfere({
			cabecalho: pedido.segredoDoInicio,
			contaId: conta,
			chaves: opcoes.chavesDoServidor,
			agora: () => opcoes.agoraEmSegundos * 1e3
		})) return {
			ok: true,
			conta
		};
	}
	return await conferirAssinaturaDoProvedor({
		segredo: opcoes.segredoDoWebhook,
		segredoAnterior: opcoes.segredoAnterior ?? null,
		rotacionadoEmSegundos: opcoes.rotacionadoEmSegundos ?? null,
		corpo: pedido.corpo,
		assinatura: pedido.assinatura,
		agoraEmSegundos: opcoes.agoraEmSegundos
	}) ? {
		ok: true,
		conta: null
	} : { ok: false };
}
var RecusaDoPedido = class extends Error {
	motivo;
	constructor(motivo) {
		super(motivo);
		this.motivo = motivo;
	}
};
async function iniciarChamada(pedido, porta, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return recusa("metodo_invalido");
	const autenticacao = await autenticar(pedido, opcoes);
	if (!autenticacao.ok) return recusa("assinatura_invalida");
	let corpo;
	try {
		corpo = JSON.parse(pedido.corpo);
	} catch {
		return recusa("corpo_invalido");
	}
	const entrada = lerPedidoDoProvedor(corpo);
	if (!entrada) return recusa("corpo_invalido");
	try {
		return {
			status: 200,
			corpo: entrada.chamadaId ? await contextoDaSaida(entrada.chamadaId, entrada, porta, autenticacao.conta, opcoes.agoraEmSegundos * 1e3) : await contextoDaEntrada(entrada, porta, autenticacao.conta)
		};
	} catch (erro) {
		if (erro instanceof RecusaDoPedido) return recusa(erro.motivo);
		return recusa("falha_interna");
	}
}
async function contextoDaSaida(chamadaId, entrada, porta, contaProvada, agoraMs) {
	const chamada = await porta.chamadaDeSaida(chamadaId);
	if (!chamada) throw new RecusaDoPedido("chamada_desconhecida");
	if (contaProvada !== null && chamada.account_id !== contaProvada) throw new RecusaDoPedido("chamada_desconhecida");
	if (entrada.conversaId && !chamada.provider_conversation_id) await porta.marcarConversa(chamada.id, entrada.conversaId);
	const lead = chamada.lead_id ? await porta.leadDaChamada(chamada.account_id, chamada.lead_id) : null;
	const ensaio = chamada.direction === "rehearsal";
	const perfil = ensaio ? perfilPeloId(await porta.perfilDoEnsaio(chamada.id)) : null;
	const reuniao = !ensaio && propositoDeReuniao(chamada.purpose) && porta.reuniaoDaChamada ? await porta.reuniaoDaChamada(chamada.id) : null;
	const daReuniao = reuniao ? contextoDaReuniao(chamada.purpose, reuniao, new Date(agoraMs).toISOString()) : null;
	return await montarContexto({
		chamadaId: chamada.id,
		contaId: chamada.account_id,
		proposito: chamada.purpose,
		sentido: ensaio ? "rehearsal" : "outbound",
		chamadaCriada: false,
		lead,
		contextoDoLead: perfil?.contexto ?? daReuniao ?? ""
	}, porta);
}
async function contextoDaEntrada(entrada, porta, contaProvada) {
	const conversaId = entrada.conversaId;
	if (!conversaId) throw new RecusaDoPedido("conversa_ausente");
	const chamado = entrada.numeroChamado ?? "";
	if (!FORMATO_E164.test(chamado)) throw new RecusaDoPedido("linha_desconhecida");
	const linha = await porta.linhaPeloNumero(chamado);
	if (!linha) throw new RecusaDoPedido("linha_desconhecida");
	if (contaProvada !== null && linha.account_id !== contaProvada) throw new RecusaDoPedido("linha_desconhecida");
	const contaId = linha.account_id;
	const publicacao = await escolherPublicacao(contaId, entrada.agenteDoProvedorId, porta);
	const proposito = publicacao?.purpose ?? "discovery";
	const versao = await porta.versaoPublicadaDoPlaybook(contaId, proposito);
	const lead = await resolverLeadDeQuemLigou(contaId, entrada.numeroDeQuemLigou, porta);
	const gravacao = await porta.gravarChamadaRecebida({
		account_id: contaId,
		lead_id: lead?.id ?? null,
		phone_line_id: linha.id,
		agent_publication_id: publicacao?.id ?? null,
		playbook_version_id: versao?.id ?? null,
		purpose: proposito,
		direction: "inbound",
		status: "in_progress",
		provider_conversation_id: conversaId,
		provider_call_sid: entrada.chamadaDaTelefoniaId,
		from_number: entrada.numeroDeQuemLigou ?? "",
		to_number: linha.e164,
		idempotency_key: `${PREFIXO_DA_ENTRADA}:${conversaId}`
	});
	return await montarContexto({
		chamadaId: gravacao.chamada.id,
		contaId,
		proposito: gravacao.chamada.purpose,
		sentido: "inbound",
		chamadaCriada: gravacao.criada,
		lead,
		contextoDoLead: ""
	}, porta);
}
async function escolherPublicacao(contaId, agenteDoProvedorId, porta) {
	if (agenteDoProvedorId) {
		const publicacao = await porta.publicacaoPeloAgenteDoProvedor(contaId, agenteDoProvedorId);
		if (publicacao) return publicacao;
	}
	return await porta.publicacaoDoProposito(contaId, PROPOSITO_DA_ENTRADA);
}
async function resolverLeadDeQuemLigou(contaId, numero, porta) {
	if (!numero || !FORMATO_E164.test(numero)) return null;
	const local = resolverFusoDoTelefone(numero);
	const gravado = await porta.registrarLead(contaId, {
		name: null,
		phone_e164: numero,
		city: local?.cidade ?? null,
		state: local?.estado ?? null,
		timezone: local?.fuso ?? null,
		source: ORIGEM_DA_ENTRADA,
		source_ref: null
	});
	return await porta.leadDaChamada(contaId, gravado.leadId);
}
async function montarContexto(miolo, porta) {
	const identidade = await porta.identidadeDaConta(miolo.contaId);
	if (!identidade) throw new RecusaDoPedido("conta_sem_agente");
	const abertura = montarAbertura({
		identidade,
		politica: await porta.politicaDaConta(miolo.contaId),
		lead: miolo.lead ? {
			nome: miolo.lead.name,
			empresa: miolo.lead.company,
			cidade: miolo.lead.city
		} : null,
		contextoDoLead: miolo.contextoDoLead
	});
	return {
		ok: true,
		chamadaId: miolo.chamadaId,
		contaId: miolo.contaId,
		proposito: miolo.proposito,
		sentido: miolo.sentido,
		chamadaCriada: miolo.chamadaCriada,
		lead: miolo.lead ? {
			id: miolo.lead.id,
			nome: miolo.lead.name,
			empresa: miolo.lead.company,
			cidade: miolo.lead.city,
			estado: miolo.lead.state
		} : null,
		reuniao: null,
		primeiraFala: abertura.primeiraFala,
		avisoDeGravacao: abertura.avisoDeGravacao,
		variaveis: abertura.variaveis
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
//#region supabase/functions/call-init/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SEGREDO_DO_WEBHOOK = Deno.env.get("SARAH_VOZ_WEBHOOK_SECRET") ?? null;
const SEGREDO_ANTERIOR = Deno.env.get("SARAH_VOZ_WEBHOOK_SECRET_ANTERIOR") ?? null;
const ROTACIONADO_EM = lerInstanteDaRotacao(Deno.env.get("SARAH_VOZ_WEBHOOK_ROTACIONADO_EM"));
const CABECALHO_DA_ASSINATURA = "elevenlabs-signature";
const CHAVE_DO_SERVIDOR = await segredoDaInstalacao({
	definido: Deno.env.get("SARAH_TOOL_SERVER_KEY"),
	chaveDeServico: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
	rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS
});
const CHAVE_ANTERIOR = Deno.env.get("SARAH_TOOL_SERVER_KEY_ANTERIOR") ?? null;
const CHAVE_ROTACIONADA_EM = (() => {
	const instante = lerInstanteDaRotacao(Deno.env.get("SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM"));
	return instante === null ? null : instante * 1e3;
})();
const CHAVES_DO_SERVIDOR = CHAVE_DO_SERVIDOR ? {
	vigente: CHAVE_DO_SERVIDOR,
	anterior: CHAVE_ANTERIOR,
	rotacionadaEm: CHAVE_ROTACIONADA_EM
} : null;
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const COLUNAS_DA_CHAMADA = "id, account_id, direction, lead_id, purpose, provider_conversation_id";
const COLUNAS_DO_LEAD = "id, name, company, city, state";
function comoChamada(linha) {
	return {
		id: String(linha.id ?? ""),
		account_id: String(linha.account_id ?? ""),
		direction: linha.direction,
		lead_id: linha.lead_id ?? null,
		purpose: linha.purpose,
		provider_conversation_id: linha.provider_conversation_id ?? null
	};
}
const porta = {
	async chamadaDeSaida(chamadaId) {
		const { data, error } = await servico.from("calls").select(COLUNAS_DA_CHAMADA).eq("id", chamadaId).maybeSingle();
		if (error) throw new Error(error.message);
		return data ? comoChamada(data) : null;
	},
	async marcarConversa(chamadaId, conversaId) {
		const { error } = await servico.from("calls").update({ provider_conversation_id: conversaId }).eq("id", chamadaId).is("provider_conversation_id", null);
		if (error) throw new Error(error.message);
	},
	async linhaPeloNumero(e164) {
		const { data, error } = await servico.from("phone_lines").select("id, account_id, e164").eq("e164", e164).eq("enabled", true).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const linha = data;
		return {
			id: String(linha.id ?? ""),
			account_id: String(linha.account_id ?? ""),
			e164: String(linha.e164 ?? "")
		};
	},
	async publicacaoPeloAgenteDoProvedor(contaId, agenteDoProvedorId) {
		const { data, error } = await servico.from("agent_publications").select("id, purpose").eq("account_id", contaId).eq("provider_agent_id", agenteDoProvedorId).eq("status", "publicado").maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const publicacao = data;
		return {
			id: String(publicacao.id ?? ""),
			purpose: publicacao.purpose
		};
	},
	async publicacaoDoProposito(contaId, proposito) {
		const { data, error } = await servico.from("agent_publications").select("id, purpose").eq("account_id", contaId).eq("purpose", proposito).eq("status", "publicado").maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const publicacao = data;
		return {
			id: String(publicacao.id ?? ""),
			purpose: publicacao.purpose
		};
	},
	async versaoPublicadaDoPlaybook(contaId, proposito) {
		const { data, error } = await servico.from("playbook_versions").select("id, playbooks!playbook_versions_do_playbook_da_conta!inner(purpose)").eq("account_id", contaId).eq("status", "published").eq("playbooks.purpose", proposito).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		return { id: String(data.id ?? "") };
	},
	async registrarLead(contaId, lead) {
		const { data, error } = await servico.rpc("registrar_lead", {
			p_account_id: contaId,
			p_lead: lead,
			p_ao_duplicar: "ignorar"
		});
		if (error) throw new Error(error.message);
		const linha = Array.isArray(data) ? data[0] : data;
		if (!linha) throw new Error("registrar_lead não devolveu linha");
		return {
			leadId: linha.lead_id,
			resultado: linha.resultado
		};
	},
	async leadDaChamada(contaId, leadId) {
		const { data, error } = await servico.from("leads").select(COLUNAS_DO_LEAD).eq("account_id", contaId).eq("id", leadId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const lead = data;
		return {
			id: String(lead.id ?? ""),
			name: lead.name ?? null,
			company: lead.company ?? null,
			city: lead.city ?? null,
			state: lead.state ?? null
		};
	},
	async gravarChamadaRecebida(linha) {
		const { data, error } = await servico.from("calls").insert(linha).select(COLUNAS_DA_CHAMADA).maybeSingle();
		if (error && error.code !== "23505") throw new Error(error.message);
		if (!error && data) return {
			criada: true,
			chamada: comoChamada(data)
		};
		const { data: existente, error: erroDaLeitura } = await servico.from("calls").select(COLUNAS_DA_CHAMADA).eq("provider_conversation_id", linha.provider_conversation_id).maybeSingle();
		if (erroDaLeitura) throw new Error(erroDaLeitura.message);
		if (!existente) throw new Error("conflito de conversa sem linha correspondente");
		return {
			criada: false,
			chamada: comoChamada(existente)
		};
	},
	async identidadeDaConta(contaId) {
		const { data, error } = await servico.from("agents").select("name, company_name, first_message").eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		if (!data) return null;
		const agente = data;
		return {
			nome: String(agente.name ?? ""),
			empresa: String(agente.company_name ?? ""),
			primeiraFala: agente.first_message ?? null
		};
	},
	async politicaDaConta(contaId) {
		const { data, error } = await servico.from("account_settings").select("recording_enabled, recording_notice_text").eq("account_id", contaId).maybeSingle();
		if (error) throw new Error(error.message);
		const politica = data ?? {};
		return {
			gravacaoLigada: politica.recording_enabled !== false,
			avisoDeGravacao: politica.recording_notice_text ?? null
		};
	},
	async perfilDoEnsaio(chamadaId) {
		const { data, error } = await servico.from("rehearsals").select("persona_profile").eq("call_id", chamadaId).maybeSingle();
		if (error) throw new Error(error.message);
		const perfil = data?.persona_profile;
		return typeof perfil?.perfil === "string" ? perfil.perfil : null;
	},
	async reuniaoDaChamada(chamadaId) {
		const { data, error } = await servico.rpc("reuniao_em_jogo", { p_call_id: chamadaId });
		if (error) throw new Error(error.message);
		const [linha] = data ?? [];
		return lerReuniaoEmJogo(linha);
	}
};
Deno.serve(async (requisicao) => {
	let corpo = "";
	if (requisicao.method.toUpperCase() === "POST") try {
		corpo = await requisicao.text();
	} catch {}
	const resposta = await iniciarChamada({
		metodo: requisicao.method,
		corpo,
		assinatura: requisicao.headers.get(CABECALHO_DA_ASSINATURA),
		contaDoEndereco: contaDoEndereco(requisicao.url),
		segredoDoInicio: requisicao.headers.get(CABECALHO_DO_SEGREDO_DO_INICIO)
	}, porta, {
		segredoDoWebhook: SEGREDO_DO_WEBHOOK,
		segredoAnterior: SEGREDO_ANTERIOR,
		rotacionadoEmSegundos: ROTACIONADO_EM,
		agoraEmSegundos: Math.floor(Date.now() / 1e3),
		chavesDoServidor: CHAVES_DO_SERVIDOR
	});
	const saida = resposta.corpo.ok ? corpoParaOProvedor(resposta.corpo) : resposta.corpo;
	return new Response(JSON.stringify(saida), {
		status: resposta.status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store"
		}
	});
});
//#endregion
