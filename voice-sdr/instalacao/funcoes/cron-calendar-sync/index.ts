// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/cron-calendar-sync/index.ts. Não edite à mão: rode `npm run pacote`.
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
//#region supabase/functions/_shared/agenda/horarios.ts
function instanteDoRelogio(fuso, data, minutos) {
	if (!Number.isInteger(minutos) || minutos < 0 || minutos > 1440) throw new Error(`minutos fora do dia: ${minutos}`);
	return instanteDeHoraLocal(fuso, {
		ano: data.ano,
		mes: data.mes,
		dia: data.dia
	}, minutos);
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
function relogioLocal(fuso, instante) {
	const p = partesEm(fuso, instante);
	return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
}
function instanteDeHoraLocal(fuso, data, minutos) {
	const alvo = Date.UTC(data.ano, data.mes - 1, data.dia, Math.floor(minutos / 60), minutos % 60);
	const primeiro = alvo - (relogioLocal(fuso, alvo) - alvo);
	const segundo = alvo - (relogioLocal(fuso, primeiro) - primeiro);
	if (relogioLocal(fuso, segundo) === alvo) return segundo;
	return Math.max(primeiro, segundo);
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
function protegerPorta(porta) {
	const proteger = async (ida) => {
		try {
			return await ida();
		} catch {
			return falhaDoCalendario("sem_resposta");
		}
	};
	return {
		lerOcupacao: (janela) => {
			const conferida = janelaAbsoluta(janela.inicio, janela.fim);
			return proteger(() => porta.lerOcupacao(conferida));
		},
		conferirHorario: (inicio, fim) => {
			const conferida = janelaAbsoluta(inicio, fim);
			return proteger(() => porta.conferirHorario(conferida.inicio, conferida.fim));
		},
		criarEvento: (reuniao) => {
			const conferida = janelaAbsoluta(reuniao.inicio, reuniao.fim);
			return proteger(() => porta.criarEvento({
				...reuniao,
				inicio: conferida.inicio,
				fim: conferida.fim
			}));
		},
		apagarEvento: (id) => proteger(() => porta.apagarEvento(id))
	};
}
const SEGREDO_DO_CALENDARIO = {
	provedor: "google_calendar",
	chave: "refresh_token"
};
const RECURSO_DO_CALENDARIO = "specialist_calendars";
async function resolverTokenDoCalendario(cofre, calendario) {
	const resolucao = await cofre.resolveSecret(calendario.contaId, SEGREDO_DO_CALENDARIO.provedor, SEGREDO_DO_CALENDARIO.chave, { recurso: {
		tipo: RECURSO_DO_CALENDARIO,
		id: calendario.id
	} });
	return resolucao.ok ? {
		ok: true,
		token: resolucao.valor
	} : falhaDoCalendario("nao_conectado");
}
const COM_DESLOCAMENTO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/i;
const SEM_DESLOCAMENTO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/;
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;
function eInstanteAbsoluto(valor) {
	return COM_DESLOCAMENTO.test(valor) && !Number.isNaN(Date.parse(valor));
}
function janelaAbsoluta(inicio, fim) {
	if (!eInstanteAbsoluto(inicio)) throw new Error(`início da janela sem deslocamento: ${inicio}`);
	if (!eInstanteAbsoluto(fim)) throw new Error(`fim da janela sem deslocamento: ${fim}`);
	if (Date.parse(fim) <= Date.parse(inicio)) throw new Error(`janela sem duração: ${inicio} a ${fim}`);
	return {
		inicio: paraUtc(Date.parse(inicio)),
		fim: paraUtc(Date.parse(fim))
	};
}
function normalizarHorarioDoProvedor(horario, fusoDaAgenda) {
	const fuso = horario.fuso?.trim() || fusoDaAgenda;
	const instante = horario.instante?.trim();
	if (instante) {
		if (COM_DESLOCAMENTO.test(instante)) {
			const ts = Date.parse(instante);
			return Number.isNaN(ts) ? null : paraUtc(ts);
		}
		const local = SEM_DESLOCAMENTO.exec(instante);
		if (!local) return null;
		const [, ano, mes, dia, hora, minuto, segundo] = local;
		const data = dataValida$1(Number(ano), Number(mes), Number(dia));
		if (!data || Number(hora) > 23 || Number(minuto) > 59) return null;
		const ts = relogioEmFuso(fuso, data, Number(hora) * 60 + Number(minuto));
		return ts === null ? null : paraUtc(ts + Number(segundo ?? "0") * 1e3);
	}
	const somenteData = SO_DATA.exec(horario.data?.trim() ?? "");
	if (!somenteData) return null;
	const data = dataValida$1(Number(somenteData[1]), Number(somenteData[2]), Number(somenteData[3]));
	if (!data) return null;
	const ts = relogioEmFuso(fuso, data, 0);
	return ts === null ? null : paraUtc(ts);
}
function sobrepoe(a, b) {
	return Date.parse(a.inicio) < Date.parse(b.fim) && Date.parse(b.inicio) < Date.parse(a.fim);
}
function dataValida$1(ano, mes, dia) {
	const ts = Date.UTC(ano, mes - 1, dia);
	const conferida = new Date(ts);
	if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return null;
	return {
		ano,
		mes,
		dia
	};
}
function relogioEmFuso(fuso, data, minutos) {
	try {
		return instanteDoRelogio(fuso, data, minutos);
	} catch {
		return null;
	}
}
function paraUtc(ts) {
	return new Date(ts).toISOString().replace(".000Z", "Z");
}
//#endregion
//#region supabase/functions/_shared/agenda/calendario-google.ts
const ENDERECO_DO_TOKEN = "https://oauth2.googleapis.com/token";
const BASE_DA_API = "https://www.googleapis.com/calendar/v3";
function idDoEvento(reuniaoId) {
	const hex = reuniaoId.toLowerCase().replace(/-/g, "");
	if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`id de reunião não é uuid: ${reuniaoId}`);
	return `sarah${hex}`;
}
function criarCalendarioDoGoogle(opcoes) {
	const prazoMs = opcoes.prazoMs ?? 3e3;
	const agora = opcoes.agora ?? Date.now;
	const agenda = encodeURIComponent(opcoes.agendaId);
	let acesso = null;
	async function ir(url, pedido) {
		const resposta = await opcoes.buscar(url, {
			...pedido,
			signal: AbortSignal.timeout(prazoMs)
		});
		const texto = await resposta.text();
		return {
			status: resposta.status,
			corpo: lerJson(texto)
		};
	}
	async function tokenDeAcesso() {
		if (acesso && acesso.expiraEm > agora()) return {
			ok: true,
			token: acesso.token
		};
		const { status, corpo } = await ir(ENDERECO_DO_TOKEN, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: opcoes.clienteId,
				client_secret: opcoes.clienteSegredo,
				refresh_token: opcoes.tokenDeAtualizacao,
				grant_type: "refresh_token"
			}).toString()
		});
		const token = texto(campo(corpo, "access_token"));
		if (status !== 200 || !token) return traduzirErroDoCalendario(codigoDoErro(corpo), status);
		const validadeS = numero(campo(corpo, "expires_in")) ?? 3600;
		acesso = {
			token,
			expiraEm: agora() + Math.max(0, validadeS - 60) * 1e3
		};
		return {
			ok: true,
			token
		};
	}
	async function comAcesso(ida) {
		const credencial = await tokenDeAcesso();
		if (!credencial.ok) return credencial;
		return ida({
			authorization: `Bearer ${credencial.token}`,
			"content-type": "application/json"
		});
	}
	return protegerPorta({
		lerOcupacao: (janela) => comAcesso(async (headers) => {
			const ocupacao = [];
			let pagina = null;
			for (let volta = 0; volta < 20; volta++) {
				const consulta = new URLSearchParams({
					timeMin: janela.inicio,
					timeMax: janela.fim,
					singleEvents: "true",
					showDeleted: "false",
					maxResults: "250"
				});
				if (pagina) consulta.set("pageToken", pagina);
				const { status, corpo } = await ir(`${BASE_DA_API}/calendars/${agenda}/events?${consulta}`, {
					method: "GET",
					headers
				});
				if (status !== 200) return traduzirErroDoCalendario(codigoDoErro(corpo), status);
				const fusoDaAgenda = texto(campo(corpo, "timeZone")) ?? opcoes.fuso;
				const itens = campo(corpo, "items");
				for (const item of Array.isArray(itens) ? itens : []) {
					const lido = ocupacaoDe(item, fusoDaAgenda);
					if (lido && sobrepoe(lido, janela)) ocupacao.push(lido);
				}
				pagina = texto(campo(corpo, "nextPageToken"));
				if (!pagina) return {
					ok: true,
					valor: ocupacao
				};
			}
			return falhaDoCalendario("falha_do_calendario");
		}),
		conferirHorario: (inicio, fim) => comAcesso(async (headers) => {
			const janela = {
				inicio,
				fim
			};
			const { status, corpo } = await ir(`${BASE_DA_API}/freeBusy`, {
				method: "POST",
				headers,
				body: JSON.stringify({
					timeMin: janela.inicio,
					timeMax: janela.fim,
					items: [{ id: opcoes.agendaId }]
				})
			});
			if (status !== 200) return traduzirErroDoCalendario(codigoDoErro(corpo), status);
			const daAgenda = campo(campo(corpo, "calendars"), opcoes.agendaId);
			const erros = campo(daAgenda, "errors");
			if (Array.isArray(erros) && erros.length > 0) return traduzirErroDoCalendario(texto(campo(erros[0], "reason")), null);
			const ocupado = campo(daAgenda, "busy");
			if (!Array.isArray(ocupado)) return falhaDoCalendario("falha_do_calendario");
			return {
				ok: true,
				valor: { livre: !ocupado.some((trecho) => {
					const de = normalizarHorarioDoProvedor({ instante: texto(campo(trecho, "start")) }, opcoes.fuso);
					const ate = normalizarHorarioDoProvedor({ instante: texto(campo(trecho, "end")) }, opcoes.fuso);
					return !de || !ate || sobrepoe({
						inicio: de,
						fim: ate
					}, janela);
				}) }
			};
		}),
		criarEvento: (reuniao) => comAcesso(async (headers) => {
			const id = idDoEvento(reuniao.reuniaoId);
			const { status, corpo } = await ir(`${BASE_DA_API}/calendars/${agenda}/events?sendUpdates=none`, {
				method: "POST",
				headers,
				body: JSON.stringify(corpoDoEvento(id, reuniao))
			});
			if (status === 200 || status === 409) return {
				ok: true,
				valor: { externalEventId: id }
			};
			return traduzirErroDoCalendario(codigoDoErro(corpo), status);
		}),
		apagarEvento: (externalEventId) => comAcesso(async (headers) => {
			const { status, corpo } = await ir(`${BASE_DA_API}/calendars/${agenda}/events/${encodeURIComponent(externalEventId)}?sendUpdates=none`, {
				method: "DELETE",
				headers
			});
			if (status === 204 || status === 200 || status === 404 || status === 410) return {
				ok: true,
				valor: { apagado: true }
			};
			return traduzirErroDoCalendario(codigoDoErro(corpo), status);
		})
	});
}
function corpoDoEvento(id, reuniao) {
	return {
		id,
		summary: reuniao.titulo,
		description: reuniao.descricao,
		...reuniao.local ? { location: reuniao.local } : {},
		start: { dateTime: reuniao.inicio },
		end: { dateTime: reuniao.fim },
		guestsCanInviteOthers: false,
		extendedProperties: { private: { sarah_meeting_id: reuniao.reuniaoId } }
	};
}
function ocupacaoDe(item, fusoDaAgenda) {
	const externalId = texto(campo(item, "id"));
	if (!externalId) return null;
	if (texto(campo(item, "status")) === "cancelled") return null;
	if (texto(campo(item, "transparency")) === "transparent") return null;
	const inicio = normalizarHorarioDoProvedor(horarioDe(campo(item, "start")), fusoDaAgenda);
	const fim = normalizarHorarioDoProvedor(horarioDe(campo(item, "end")), fusoDaAgenda);
	if (!inicio || !fim || Date.parse(fim) <= Date.parse(inicio)) return null;
	return {
		externalId,
		inicio,
		fim
	};
}
function horarioDe(valor) {
	return {
		instante: texto(campo(valor, "dateTime")),
		data: texto(campo(valor, "date")),
		fuso: texto(campo(valor, "timeZone"))
	};
}
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
function numero(valor) {
	return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}
//#endregion
//#region supabase/functions/_shared/agenda/calendario-ical.ts
const PROVEDOR_ICAL = "ical";
const TETO_DE_VOLTAS = 5e3;
function desdobrar(texto) {
	return texto.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}
function lerPropriedade(linha) {
	let aspas = false;
	let corte = -1;
	for (let indice = 0; indice < linha.length; indice++) {
		const caractere = linha[indice];
		if (caractere === "\"") aspas = !aspas;
		else if (caractere === ":" && !aspas) {
			corte = indice;
			break;
		}
	}
	if (corte <= 0) return null;
	const [nome = "", ...partes] = linha.slice(0, corte).split(";");
	const parametros = {};
	for (const parte of partes) {
		const igual = parte.indexOf("=");
		if (igual <= 0) continue;
		parametros[parte.slice(0, igual).toUpperCase()] = parte.slice(igual + 1).replace(/^"|"$/g, "");
	}
	return {
		nome: nome.toUpperCase(),
		parametros,
		valor: linha.slice(corte + 1).trim()
	};
}
const FUSOS_DO_WINDOWS = new Map([
	["e. south america standard time", "America/Sao_Paulo"],
	["sa eastern standard time", "America/Fortaleza"],
	["bahia standard time", "America/Bahia"],
	["tocantins standard time", "America/Araguaina"],
	["central brazilian standard time", "America/Cuiaba"],
	["sa western standard time", "America/Manaus"],
	["sa pacific standard time", "America/Rio_Branco"],
	["argentina standard time", "America/Argentina/Buenos_Aires"],
	["utc", "UTC"],
	["gmt standard time", "Europe/London"],
	["w. europe standard time", "Europe/Berlin"],
	["romance standard time", "Europe/Paris"],
	["eastern standard time", "America/New_York"],
	["central standard time", "America/Chicago"],
	["mountain standard time", "America/Denver"],
	["pacific standard time", "America/Los_Angeles"]
]);
function fusoValido(fuso) {
	try {
		new Intl.DateTimeFormat("en-US", { timeZone: fuso });
		return true;
	} catch {
		return false;
	}
}
function resolverFuso(tzid) {
	const limpo = tzid?.trim().replace(/^\/+/, "") ?? "";
	if (limpo === "") return null;
	const doWindows = FUSOS_DO_WINDOWS.get(limpo.toLowerCase());
	if (doWindows) return doWindows;
	return fusoValido(limpo) ? limpo : null;
}
function dataValida(ano, mes, dia) {
	const conferida = new Date(Date.UTC(ano, mes - 1, dia));
	if (conferida.getUTCFullYear() !== ano || conferida.getUTCMonth() !== mes - 1 || conferida.getUTCDate() !== dia) return null;
	return {
		ano,
		mes,
		dia
	};
}
function lerHorario(valor, parametros) {
	const casamento = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/i.exec(valor.trim());
	if (!casamento) return null;
	const [, ano, mes, dia, hora, minuto, segundo, utc] = casamento;
	const data = dataValida(Number(ano), Number(mes), Number(dia));
	if (!data) return null;
	if (hora === void 0) return {
		tipo: "data",
		data,
		segundos: 0,
		fuso: null
	};
	if (Number(hora) > 23 || Number(minuto) > 59 || Number(segundo ?? "0") > 60) return null;
	const segundos = Number(hora) * 3600 + Number(minuto) * 60 + Math.min(59, Number(segundo ?? "0"));
	if (utc) return {
		tipo: "utc",
		data,
		segundos,
		fuso: null
	};
	return {
		tipo: "local",
		data,
		segundos,
		fuso: resolverFuso(parametros.TZID)
	};
}
function instanteDe(horario, fusoPadrao) {
	if (horario.tipo === "utc") return Date.UTC(horario.data.ano, horario.data.mes - 1, horario.data.dia) + horario.segundos * 1e3;
	const fuso = horario.fuso ?? fusoPadrao;
	try {
		const minutos = Math.floor(horario.segundos / 60);
		return instanteDoRelogio(fuso, horario.data, minutos) + horario.segundos % 60 * 1e3;
	} catch {
		return null;
	}
}
function naData(horario, data) {
	return {
		...horario,
		data
	};
}
function lerDuracao(valor) {
	const casamento = /^\+?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(valor.trim());
	if (!casamento || valor.trim().toUpperCase() === "P" || /T$/i.test(valor.trim())) return null;
	const [, semanas, dias, horas, minutos, segundos] = casamento;
	return (Number(semanas ?? 0) * 7 * 86400 + Number(dias ?? 0) * 86400 + Number(horas ?? 0) * 3600 + Number(minutos ?? 0) * 60 + Number(segundos ?? 0)) * 1e3;
}
const DIAS_DA_SEMANA = [
	"SU",
	"MO",
	"TU",
	"WE",
	"TH",
	"FR",
	"SA"
];
function lerRegra(valor) {
	const partes = new Map(valor.split(";").map((parte) => {
		const [chave = "", conteudo = ""] = parte.split("=");
		return [chave.trim().toUpperCase(), conteudo.trim()];
	}));
	const frequencia = partes.get("FREQ")?.toUpperCase();
	if (frequencia !== "DAILY" && frequencia !== "WEEKLY" && frequencia !== "MONTHLY" && frequencia !== "YEARLY") return null;
	const intervalo = Number(partes.get("INTERVAL") ?? "1");
	const contagem = partes.has("COUNT") ? Number(partes.get("COUNT")) : null;
	const ate = partes.has("UNTIL") ? lerHorario(partes.get("UNTIL") ?? "", {}) : null;
	if (!Number.isInteger(intervalo) || intervalo < 1) return null;
	if (contagem !== null && (!Number.isInteger(contagem) || contagem < 1)) return null;
	if (partes.has("UNTIL") && ate === null) return null;
	const dias = [];
	for (const bruto of (partes.get("BYDAY") ?? "").split(",").filter(Boolean)) {
		const casamento = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/i.exec(bruto.trim());
		if (!casamento) return null;
		dias.push({
			semana: DIAS_DA_SEMANA.indexOf(casamento[2].toUpperCase()),
			ordem: casamento[1] ? Number(casamento[1]) : null
		});
	}
	const diasDoMes = (partes.get("BYMONTHDAY") ?? "").split(",").filter(Boolean).map(Number);
	if (diasDoMes.some((dia) => !Number.isInteger(dia) || dia === 0 || Math.abs(dia) > 31)) return null;
	return {
		frequencia,
		intervalo,
		contagem,
		ate,
		dias,
		diasDoMes
	};
}
function somarDias(data, dias) {
	const ts = new Date(Date.UTC(data.ano, data.mes - 1, data.dia + dias));
	return {
		ano: ts.getUTCFullYear(),
		mes: ts.getUTCMonth() + 1,
		dia: ts.getUTCDate()
	};
}
function diaDaSemana(data) {
	return new Date(Date.UTC(data.ano, data.mes - 1, data.dia)).getUTCDay();
}
function diasNoMes(ano, mes) {
	return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}
function comparar(a, b) {
	return a.ano - b.ano || a.mes - b.mes || a.dia - b.dia;
}
function datasDoMes(ano, mes, regra, diaDoInicio) {
	const total = diasNoMes(ano, mes);
	const escolhidos = new Set();
	for (const dia of regra.diasDoMes) {
		const real = dia > 0 ? dia : total + dia + 1;
		if (real >= 1 && real <= total) escolhidos.add(real);
	}
	for (const { semana, ordem } of regra.dias) {
		const ocorrencias = [];
		for (let dia = 1; dia <= total; dia++) if (diaDaSemana({
			ano,
			mes,
			dia
		}) === semana) ocorrencias.push(dia);
		if (ordem === null) ocorrencias.forEach((dia) => escolhidos.add(dia));
		else {
			const escolhido = ordem > 0 ? ocorrencias[ordem - 1] : ocorrencias[ocorrencias.length + ordem];
			if (escolhido !== void 0) escolhidos.add(escolhido);
		}
	}
	if (regra.diasDoMes.length === 0 && regra.dias.length === 0 && diaDoInicio <= total) escolhidos.add(diaDoInicio);
	return [...escolhidos].sort((a, b) => a - b).map((dia) => ({
		ano,
		mes,
		dia
	}));
}
function* datasDaRegra(inicio, regra, limite) {
	let voltas = 0;
	const cedo = (data) => comparar(data, inicio) < 0;
	const tarde = (data) => comparar(data, limite) > 0;
	if (regra.frequencia === "DAILY") {
		for (let data = inicio; !tarde(data) && voltas < 5e3; data = somarDias(data, regra.intervalo), voltas++) yield data;
		return;
	}
	if (regra.frequencia === "WEEKLY") {
		const dias = regra.dias.length > 0 ? [...new Set(regra.dias.map((dia) => dia.semana))] : [diaDaSemana(inicio)];
		const segunda = somarDias(inicio, -((diaDaSemana(inicio) + 6) % 7));
		for (let semana = segunda; !tarde(semana) && voltas < 5e3; semana = somarDias(semana, 7 * regra.intervalo), voltas++) {
			const daSemana = dias.map((dia) => somarDias(semana, (dia + 6) % 7)).sort(comparar);
			for (const data of daSemana) if (!cedo(data) && !tarde(data)) yield data;
		}
		return;
	}
	for (let passo = 0; voltas < TETO_DE_VOLTAS; passo += regra.intervalo, voltas++) {
		const meses = regra.frequencia === "MONTHLY" ? passo : passo * 12;
		const indice = inicio.mes - 1 + meses;
		const ano = inicio.ano + Math.floor(indice / 12);
		const mes = indice % 12 + 1;
		if (comparar({
			ano,
			mes,
			dia: 1
		}, limite) > 0) return;
		for (const data of datasDoMes(ano, mes, regra, inicio.dia)) if (!cedo(data) && !tarde(data)) yield data;
	}
}
function eventoVazio() {
	return {
		uid: "",
		inicio: null,
		fim: null,
		duracaoMs: null,
		regra: null,
		regraInvalida: false,
		excecoes: [],
		recorrencia: null,
		livre: false
	};
}
function lerEventos(texto) {
	const eventos = [];
	let atual = null;
	let profundidade = 0;
	for (const linha of desdobrar(texto)) {
		const propriedade = lerPropriedade(linha);
		if (!propriedade) continue;
		const { nome, parametros, valor } = propriedade;
		if (nome === "BEGIN") {
			if (valor.toUpperCase() === "VEVENT" && atual === null) atual = eventoVazio();
			else if (atual !== null) profundidade++;
			continue;
		}
		if (nome === "END") {
			if (atual !== null && profundidade > 0) profundidade--;
			else if (atual !== null && valor.toUpperCase() === "VEVENT") {
				eventos.push(atual);
				atual = null;
			}
			continue;
		}
		if (atual === null || profundidade > 0) continue;
		switch (nome) {
			case "UID":
				atual.uid = valor;
				break;
			case "DTSTART":
				atual.inicio = lerHorario(valor, parametros);
				break;
			case "DTEND":
				atual.fim = lerHorario(valor, parametros);
				break;
			case "DURATION":
				atual.duracaoMs = lerDuracao(valor);
				break;
			case "RRULE":
				atual.regra = lerRegra(valor);
				atual.regraInvalida = atual.regra === null;
				break;
			case "EXDATE":
				for (const item of valor.split(",")) {
					const horario = lerHorario(item, parametros);
					if (horario) atual.excecoes.push(horario);
				}
				break;
			case "RECURRENCE-ID":
				atual.recorrencia = lerHorario(valor, parametros);
				break;
			case "STATUS":
				if (valor.toUpperCase() === "CANCELLED") atual.livre = true;
				break;
			case "TRANSP": if (valor.toUpperCase() === "TRANSPARENT") atual.livre = true;
		}
	}
	return eventos;
}
function paraIso(ts) {
	return new Date(ts).toISOString().replace(".000Z", "Z");
}
function duracaoDe(evento, inicioTs, fusoPadrao) {
	if (evento.fim) {
		const fimTs = instanteDe(evento.fim, fusoPadrao);
		return fimTs === null ? null : fimTs - inicioTs;
	}
	if (evento.duracaoMs !== null) return evento.duracaoMs;
	return evento.inicio?.tipo === "data" ? 864e5 : 0;
}
function ocupacaoDoIcal(texto, janela, fusoPadrao) {
	const eventos = lerEventos(texto);
	const inicioDaJanela = Date.parse(janela.inicio);
	const fimDaJanela = Date.parse(janela.fim);
	const chave = (ts) => paraIso(ts);
	const trocadas = new Map();
	for (const evento of eventos) {
		if (!evento.recorrencia || !evento.uid) continue;
		const ts = instanteDe(evento.recorrencia, fusoPadrao);
		if (ts === null) continue;
		const doUid = trocadas.get(evento.uid) ?? new Set();
		doUid.add(chave(ts));
		trocadas.set(evento.uid, doUid);
	}
	const ocupacao = [];
	const acrescentar = (id, inicioTs, duracao) => {
		const fimTs = inicioTs + duracao;
		if (!(duracao > 0) || !(fimTs > inicioDaJanela) || !(inicioTs < fimDaJanela)) return;
		ocupacao.push({
			externalId: id,
			inicio: paraIso(inicioTs),
			fim: paraIso(fimTs)
		});
	};
	for (const evento of eventos) {
		if (!evento.inicio || evento.livre) continue;
		const inicioTs = instanteDe(evento.inicio, fusoPadrao);
		if (inicioTs === null) continue;
		const duracao = duracaoDe(evento, inicioTs, fusoPadrao);
		if (duracao === null) continue;
		const uid = evento.uid || `sem-uid:${chave(inicioTs)}`;
		if (evento.recorrencia) {
			acrescentar(`${uid}:${chave(instanteDe(evento.recorrencia, fusoPadrao) ?? inicioTs)}`, inicioTs, duracao);
			continue;
		}
		if (!evento.regra) {
			acrescentar(uid, inicioTs, duracao);
			continue;
		}
		const excluidas = new Set(evento.excecoes.map((excecao) => instanteDe(excecao.tipo === "data" ? naData(evento.inicio, excecao.data) : excecao, fusoPadrao)).filter((ts) => ts !== null).map(chave));
		const trocadasDoUid = trocadas.get(evento.uid) ?? new Set();
		const ateBruto = evento.regra.ate ? instanteDe(evento.regra.ate, fusoPadrao) : null;
		const ate = ateBruto !== null && evento.regra.ate?.tipo === "data" ? ateBruto + 864e5 - 1 : ateBruto;
		const limite = somarDias(civilDe(fimDaJanela), 1);
		let contadas = 0;
		for (const data of datasDaRegra(evento.inicio.data, evento.regra, limite)) {
			const ocorrencia = instanteDe(naData(evento.inicio, data), fusoPadrao);
			if (ocorrencia === null) continue;
			if (ate !== null && ocorrencia > ate) break;
			contadas++;
			if (evento.regra.contagem !== null && contadas > evento.regra.contagem) break;
			if (ocorrencia >= fimDaJanela) break;
			const id = chave(ocorrencia);
			if (excluidas.has(id) || trocadasDoUid.has(id)) continue;
			acrescentar(`${uid}:${id}`, ocorrencia, duracao);
		}
	}
	return ocupacao;
}
function civilDe(ts) {
	const data = new Date(ts);
	return {
		ano: data.getUTCFullYear(),
		mes: data.getUTCMonth() + 1,
		dia: data.getUTCDate()
	};
}
function eIcal(texto) {
	return /^\s*BEGIN:VCALENDAR/i.test(texto.replace(/^\uFEFF/, ""));
}
function falhaDoStatus(status) {
	if (status === 401 || status === 403 || status === 404 || status === 410) return falhaDoCalendario("endereco_ical_recusado");
	if (status === 429) return falhaDoCalendario("limite_de_taxa");
	if (status >= 500) return falhaDoCalendario("provedor_indisponivel");
	return falhaDoCalendario("falha_do_calendario");
}
function criarCalendarioIcal(opcoes) {
	const prazoMs = opcoes.prazoMs ?? 1e4;
	async function ler(janela) {
		const resposta = await opcoes.buscar(opcoes.endereco, {
			method: "GET",
			headers: { accept: "text/calendar, text/plain;q=0.8" },
			signal: AbortSignal.timeout(prazoMs)
		});
		if (resposta.status !== 200) return falhaDoStatus(resposta.status);
		const texto = await resposta.text();
		if (texto.length > 5e6 || !eIcal(texto)) return falhaDoCalendario("ical_invalido");
		return {
			ok: true,
			valor: ocupacaoDoIcal(texto, janela, opcoes.fuso)
		};
	}
	const soLeitura = async () => falhaDoCalendario("calendario_so_de_leitura");
	return {
		lerOcupacao: ler,
		async conferirHorario(inicio, fim) {
			const lida = await ler({
				inicio,
				fim
			});
			if (!lida.ok) return lida;
			return {
				ok: true,
				valor: { livre: !lida.valor.some((item) => sobrepoe(item, {
					inicio,
					fim
				})) }
			};
		},
		criarEvento: soLeitura,
		apagarEvento: soLeitura
	};
}
//#endregion
//#region supabase/functions/_shared/agenda/evento-da-reuniao.ts
const RECUO_EM_MINUTOS = [
	1,
	5,
	15,
	60
];
const TETO_DE_TENTATIVAS = RECUO_EM_MINUTOS.length + 1;
const SELECAO_DA_REUNIAO_PARA_EVENTO = "id, account_id, specialist_id, starts_at, ends_at, modality, notes, handoff_summary, external_event_id, event_attempts, leads(name), specialists(room_url)";
function lerReuniaoParaEvento(linha) {
	const embutido = (chave, campo) => {
		const valor = linha[chave];
		const objeto = Array.isArray(valor) ? valor[0] : valor;
		const lido = objeto && typeof objeto === "object" ? objeto[campo] : null;
		return typeof lido === "string" ? lido : null;
	};
	const texto = (chave) => typeof linha[chave] === "string" ? linha[chave] : null;
	return {
		id: String(linha.id),
		account_id: String(linha.account_id),
		specialist_id: String(linha.specialist_id),
		starts_at: String(linha.starts_at),
		ends_at: String(linha.ends_at),
		modality: linha.modality,
		notes: texto("notes"),
		handoff_summary: linha.handoff_summary ?? null,
		external_event_id: texto("external_event_id"),
		event_attempts: typeof linha.event_attempts === "number" ? linha.event_attempts : 0,
		nomeDoLead: embutido("leads", "name"),
		salaDoEspecialista: embutido("specialists", "room_url")
	};
}
const NOME_DA_MODALIDADE = {
	video: "Vídeo",
	telefone: "Telefone",
	presencial: "Presencial"
};
function textoDoResumo(resumo) {
	if (typeof resumo === "string") return resumo.trim() || null;
	if (resumo && typeof resumo === "object") for (const chave of [
		"resumo",
		"texto",
		"summary"
	]) {
		const valor = resumo[chave];
		if (typeof valor === "string" && valor.trim()) return valor.trim();
	}
	return null;
}
function montarEventoDaReuniao(reuniao) {
	const nome = reuniao.nomeDoLead?.trim() || "lead sem nome";
	const sala = reuniao.salaDoEspecialista?.trim() || null;
	const resumo = textoDoResumo(reuniao.handoff_summary);
	const notas = reuniao.notes?.trim() || null;
	const linhas = [
		`Modalidade: ${NOME_DA_MODALIDADE[reuniao.modality]}`,
		...sala ? [`Sala: ${sala}`] : [],
		...resumo ? [
			"",
			"Resumo de passagem:",
			resumo
		] : [],
		...notas ? [
			"",
			"Notas da marcação:",
			notas
		] : [],
		"",
		"Marcada pela assistente."
	];
	return {
		reuniaoId: reuniao.id,
		inicio: reuniao.starts_at,
		fim: reuniao.ends_at,
		titulo: `Reunião com ${nome}`,
		descricao: linhas.join("\n"),
		local: sala
	};
}
function falhaDepoisDe(tentativas, erro, agoraMs) {
	const espera = tentativas < TETO_DE_TENTATIVAS ? RECUO_EM_MINUTOS[tentativas - 1] : void 0;
	return {
		tentativas,
		erro,
		proximaTentativa: espera === void 0 ? null : new Date(agoraMs + espera * 6e4).toISOString()
	};
}
async function criarEventoDaReuniao(pedido) {
	const { reuniao, calendario, porta } = pedido;
	if (reuniao.external_event_id !== null) return {
		situacao: "ja_existia",
		externalEventId: reuniao.external_event_id
	};
	if (calendario === null) return { situacao: "sem_calendario" };
	const resultado = "ok" in calendario ? calendario : await protegerPorta(calendario).criarEvento(montarEventoDaReuniao(reuniao));
	if (resultado.ok) {
		await porta.gravarEvento(reuniao.account_id, reuniao.id, resultado.valor.externalEventId);
		return {
			situacao: "criado",
			externalEventId: resultado.valor.externalEventId
		};
	}
	const falha = falhaDepoisDe(reuniao.event_attempts + 1, resultado.mensagem, pedido.agora());
	await porta.registrarFalhaDoEvento(reuniao.account_id, reuniao.id, falha);
	return {
		situacao: "falhou",
		falha
	};
}
async function apagarEventoDaReuniao(pedido) {
	const { reuniao, calendario, porta } = pedido;
	if (reuniao.external_event_id === null) return {
		ok: true,
		situacao: "sem_evento"
	};
	if (calendario === null) return falhaDoCalendario("nao_conectado");
	if ("ok" in calendario) return calendario;
	const resultado = await protegerPorta(calendario).apagarEvento(reuniao.external_event_id);
	if (!resultado.ok) return resultado;
	await porta.esquecerEvento(reuniao.account_id, reuniao.id);
	return {
		ok: true,
		situacao: "apagado"
	};
}
//#endregion
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
		const mensagem = mensagemDe$1(erro);
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
function mensagemDe$1(erro) {
	const texto = erro instanceof Error ? erro.message : String(erro);
	return (texto.trim() === "" ? "erro sem mensagem" : texto).slice(0, TAMANHO_DO_ERRO);
}
//#endregion
//#region supabase/functions/cron-calendar-sync/sincronizacao.ts
const NOME_DA_ROTINA = "cron-calendar-sync";
const FALHA_AO_GRAVAR = "A ocupação lida do calendário não pôde ser gravada. A leitura se repete sozinha na próxima passagem.";
function janelaDaPassagem(instante) {
	const inicio = Date.parse(instante);
	return janelaAbsoluta(new Date(inicio).toISOString(), new Date(inicio + 2592e6).toISOString());
}
function blocosDaOcupacao(ocupacao) {
	const vistos = new Set();
	const blocos = [];
	for (const item of ocupacao) {
		const chave = item.externalId.trim();
		if (!chave || vistos.has(chave)) continue;
		if (!(Date.parse(item.fim) > Date.parse(item.inicio))) continue;
		vistos.add(chave);
		blocos.push({
			external_id: chave,
			starts_at: item.inicio,
			ends_at: item.fim
		});
	}
	return blocos;
}
function sincronizarCalendarios(pedido) {
	const { porta } = pedido;
	return executarRotina({
		nome: NOME_DA_ROTINA,
		porta: pedido.execucao,
		agora: pedido.agora,
		trabalho: {
			async reivindicar(limite, instante) {
				return (await porta.reivindicarCalendarios(limite, instante)).map((calendario) => ({
					chave: calendario.id,
					calendario
				}));
			},
			async processar(item, instante) {
				await sincronizarUm(porta, item.calendario, instante);
			}
		}
	});
}
const PROVEDORES_SO_DE_LEITURA = new Set([PROVEDOR_ICAL]);
async function sincronizarUm(porta, calendario, instante) {
	let aberto;
	try {
		aberto = await porta.abrirCalendario(calendario);
	} catch {
		aberto = falhaDoCalendario("sem_resposta");
	}
	await sincronizarOcupacao(porta, calendario, aberto, instante);
	if (PROVEDORES_SO_DE_LEITURA.has(calendario.provider)) return;
	await reenviarEventos(porta, calendario, aberto, instante);
	await apagarEventosCancelados(porta, calendario, aberto);
}
async function sincronizarOcupacao(porta, calendario, aberto, instante) {
	if ("ok" in aberto) {
		await porta.registrarFalha(calendario.id, aberto.mensagem);
		return;
	}
	const lida = await protegerPorta(aberto).lerOcupacao(janelaDaPassagem(instante));
	if (!lida.ok) {
		await porta.registrarFalha(calendario.id, lida.mensagem);
		return;
	}
	try {
		await porta.gravarOcupacao({
			calendarioId: calendario.id,
			blocos: blocosDaOcupacao(lida.valor),
			instante
		});
	} catch (erro) {
		porta.registrarNoLog?.({
			funcao: NOME_DA_ROTINA,
			passo: "gravar_ocupacao",
			calendario: calendario.id,
			erro: mensagemDe(erro)
		});
		await porta.registrarFalha(calendario.id, FALHA_AO_GRAVAR);
	}
}
async function reenviarEventos(porta, calendario, aberto, instante) {
	let pendentes;
	try {
		pendentes = await porta.reunioesSemEvento(calendario, {
			instante,
			teto: TETO_DE_TENTATIVAS,
			limite: 10
		});
	} catch (erro) {
		porta.registrarNoLog?.({
			funcao: NOME_DA_ROTINA,
			passo: "reunioes_sem_evento",
			calendario: calendario.id,
			erro: mensagemDe(erro)
		});
		return;
	}
	const agora = () => Date.parse(instante);
	for (const reuniao of pendentes) try {
		await criarEventoDaReuniao({
			reuniao,
			calendario: aberto,
			porta,
			agora
		});
	} catch (erro) {
		porta.registrarNoLog?.({
			funcao: NOME_DA_ROTINA,
			passo: "evento_da_reuniao",
			reuniao: reuniao.id,
			erro: mensagemDe(erro)
		});
	}
}
async function apagarEventosCancelados(porta, calendario, aberto) {
	let cancelados;
	try {
		cancelados = await porta.reunioesCanceladasComEvento(calendario, { limite: 10 });
	} catch (erro) {
		porta.registrarNoLog?.({
			funcao: NOME_DA_ROTINA,
			passo: "reunioes_canceladas",
			calendario: calendario.id,
			erro: mensagemDe(erro)
		});
		return;
	}
	for (const reuniao of cancelados) try {
		const desfecho = await apagarEventoDaReuniao({
			reuniao,
			calendario: aberto,
			porta
		});
		if (!desfecho.ok) porta.registrarNoLog?.({
			funcao: NOME_DA_ROTINA,
			passo: "apagar_evento",
			reuniao: reuniao.id,
			erro: desfecho.motivo
		});
	} catch (erro) {
		porta.registrarNoLog?.({
			funcao: NOME_DA_ROTINA,
			passo: "apagar_evento",
			reuniao: reuniao.id,
			erro: mensagemDe(erro)
		});
	}
}
function mensagemDe(erro) {
	return erro instanceof Error ? erro.message : String(erro);
}
async function atenderRotina(pedido, sincronizacao, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return {
		status: 405,
		corpo: { ok: false }
	};
	if (!await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno)) return {
		status: 401,
		corpo: { ok: false }
	};
	const resultado = await sincronizarCalendarios(sincronizacao);
	return {
		status: resultado.ok ? 200 : 500,
		corpo: { ...resultado }
	};
}
//#endregion
//#region supabase/functions/cron-calendar-sync/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
const CLIENTE_ID = Deno.env.get("SARAH_GOOGLE_CLIENT_ID") ?? "";
const CLIENTE_SEGREDO = Deno.env.get("SARAH_GOOGLE_CLIENT_SECRET") ?? "";
const PRAZO_DO_PROVEDOR_MS = 1e4;
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
		async segredoDoRecurso(recurso) {
			if (recurso.tipo !== "specialist_calendars") return null;
			const calendario = calendariosDaPassagem.get(recurso.id);
			if (!calendario) return null;
			const { data, error } = await servico.rpc("token_do_calendario", {
				p_account_id: calendario.account_id,
				p_calendar_id: calendario.id
			});
			if (error) throw new Error(error.message);
			return typeof data === "string" ? data : null;
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
const calendariosDaPassagem = new Map();
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
	async reivindicarCalendarios(limite, instante) {
		const { data, error } = await servico.rpc("reivindicar_calendarios_para_sincronizar", {
			p_limite: limite,
			p_instante: instante
		});
		if (error) throw new Error(error.message);
		const calendarios = data ?? [];
		for (const calendario of calendarios) calendariosDaPassagem.set(calendario.id, calendario);
		return calendarios;
	},
	async abrirCalendario(calendario) {
		if (calendario.provider === "ical") {
			const { data, error } = await servico.rpc("token_do_calendario", {
				p_account_id: calendario.account_id,
				p_calendar_id: calendario.id
			});
			if (error) throw new Error(error.message);
			if (typeof data !== "string" || data.trim() === "") return falhaDoCalendario("nao_conectado");
			return criarCalendarioIcal({
				buscar: fetch,
				endereco: data,
				fuso: calendario.timezone,
				prazoMs: PRAZO_DO_PROVEDOR_MS
			});
		}
		if (calendario.provider !== "google") return falhaDoCalendario("falha_do_calendario");
		if (!CLIENTE_ID || !CLIENTE_SEGREDO) return falhaDoCalendario("sem_permissao_de_calendario");
		const token = await resolverTokenDoCalendario(cofre, {
			id: calendario.id,
			contaId: calendario.account_id
		});
		if (!token.ok) return token;
		return criarCalendarioDoGoogle({
			buscar: fetch,
			clienteId: CLIENTE_ID,
			clienteSegredo: CLIENTE_SEGREDO,
			tokenDeAtualizacao: token.token,
			agendaId: calendario.external_id,
			fuso: calendario.timezone,
			prazoMs: PRAZO_DO_PROVEDOR_MS
		});
	},
	async gravarOcupacao(ocupacao) {
		const { error } = await servico.rpc("gravar_ocupacao_do_calendario", {
			p_calendar_id: ocupacao.calendarioId,
			p_blocos: ocupacao.blocos,
			p_instante: ocupacao.instante
		});
		if (error) throw new Error(error.message);
	},
	async registrarFalha(calendarioId, mensagem) {
		const { error } = await servico.rpc("registrar_falha_de_sincronizacao", {
			p_calendar_id: calendarioId,
			p_mensagem: mensagem
		});
		if (error) throw new Error(error.message);
	},
	async reunioesSemEvento(calendario, { instante, teto, limite }) {
		const { data, error } = await servico.from("meetings").select(SELECAO_DA_REUNIAO_PARA_EVENTO).eq("account_id", calendario.account_id).eq("specialist_id", calendario.specialist_id).is("external_event_id", null).in("status", ["scheduled", "confirmed"]).gt("starts_at", instante).lt("event_attempts", teto).or(`event_retry_at.is.null,event_retry_at.lte."${instante}"`).order("starts_at", { ascending: true }).limit(limite);
		if (error) throw new Error(error.message);
		return (data ?? []).map(lerReuniaoParaEvento);
	},
	async reunioesCanceladasComEvento(calendario, { limite }) {
		const { data, error } = await servico.from("meetings").select("id, account_id, external_event_id").eq("account_id", calendario.account_id).eq("specialist_id", calendario.specialist_id).eq("status", "canceled").not("external_event_id", "is", null).limit(limite);
		if (error) throw new Error(error.message);
		return (data ?? []).map((linha) => ({
			id: String(linha.id),
			account_id: String(linha.account_id),
			external_event_id: String(linha.external_event_id)
		}));
	},
	async gravarEvento(contaId, reuniaoId, externalEventId) {
		const { error } = await servico.from("meetings").update({
			external_event_id: externalEventId,
			event_error: null,
			event_retry_at: null
		}).eq("account_id", contaId).eq("id", reuniaoId).is("external_event_id", null);
		if (error) throw new Error(error.message);
	},
	async registrarFalhaDoEvento(contaId, reuniaoId, falha) {
		const { error } = await servico.from("meetings").update({
			event_attempts: falha.tentativas,
			event_error: falha.erro,
			event_retry_at: falha.proximaTentativa
		}).eq("account_id", contaId).eq("id", reuniaoId).is("external_event_id", null);
		if (error) throw new Error(error.message);
	},
	async esquecerEvento(contaId, reuniaoId) {
		const { error } = await servico.from("meetings").update({ external_event_id: null }).eq("account_id", contaId).eq("id", reuniaoId);
		if (error) throw new Error(error.message);
	},
	registrarNoLog(evento) {
		console.warn(JSON.stringify(evento));
	}
};
Deno.serve(async (requisicao) => {
	calendariosDaPassagem.clear();
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
