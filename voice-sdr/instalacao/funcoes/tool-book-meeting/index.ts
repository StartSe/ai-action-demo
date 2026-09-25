// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/tool-book-meeting/index.ts. Não edite à mão: rode `npm run pacote`.
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
const DIA = 864e5;
const DIAS_DA_SEMANA = [
	"domingo",
	"segunda-feira",
	"terça-feira",
	"quarta-feira",
	"quinta-feira",
	"sexta-feira",
	"sábado"
];
const MESES = [
	"janeiro",
	"fevereiro",
	"março",
	"abril",
	"maio",
	"junho",
	"julho",
	"agosto",
	"setembro",
	"outubro",
	"novembro",
	"dezembro"
];
function rotularInstante(instante, fuso) {
	const ts = typeof instante === "number" ? instante : instanteDe(instante, "instante");
	const partes = partesEm(fuso, ts);
	const nomeDoDia = DIAS_DA_SEMANA[diaDaSemanaDe(partes)];
	const nomeDoMes = MESES[partes.mes - 1];
	if (!nomeDoDia || !nomeDoMes) throw new Error(`instante fora do calendário: ${ts}`);
	return `${nomeDoDia}, ${partes.dia} de ${nomeDoMes} de ${partes.ano}, ${dois(partes.hora)}h${dois(partes.minuto)}`;
}
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
function diaDaSemanaDe(data) {
	return ((Math.floor(Date.UTC(data.ano, data.mes - 1, data.dia) / DIA) + 4) % 7 + 7) % 7;
}
function instanteDe(iso, campo) {
	const ts = Date.parse(iso);
	if (Number.isNaN(ts)) throw new Error(`${campo} não é instante ISO-8601: ${iso}`);
	return ts;
}
function dois(valor) {
	return String(valor).padStart(2, "0");
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
		const data = dataValida(Number(ano), Number(mes), Number(dia));
		if (!data || Number(hora) > 23 || Number(minuto) > 59) return null;
		const ts = relogioEmFuso(fuso, data, Number(hora) * 60 + Number(minuto));
		return ts === null ? null : paraUtc(ts + Number(segundo ?? "0") * 1e3);
	}
	const somenteData = SO_DATA.exec(horario.data?.trim() ?? "");
	if (!somenteData) return null;
	const data = dataValida(Number(somenteData[1]), Number(somenteData[2]), Number(somenteData[3]));
	if (!data) return null;
	const ts = relogioEmFuso(fuso, data, 0);
	return ts === null ? null : paraUtc(ts);
}
function sobrepoe(a, b) {
	return Date.parse(a.inicio) < Date.parse(b.fim) && Date.parse(b.inicio) < Date.parse(a.fim);
}
function dataValida(ano, mes, dia) {
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
//#region supabase/functions/_shared/email/email.ts
const MOTIVOS_DE_CONFIGURACAO = new Set(["nao_configurado", "remetente_invalido"]);
const MENSAGENS_DO_EMAIL = {
	chave_invalida: "O provedor de e-mail recusou a chave cadastrada. Gere uma nova no painel dele e substitua em Integrações.",
	sem_permissao: "O provedor de e-mail recusou o envio por permissão. Confira se o domínio de envio está verificado no painel dele.",
	sem_credito: "A conta no provedor de e-mail está sem saldo. Recarregue no painel dele para voltar a enviar.",
	limite_de_taxa: "O provedor de e-mail recusou por excesso de envios. O convite sai sozinho na próxima tentativa.",
	provedor_indisponivel: "O provedor de e-mail está fora do ar. O convite sai sozinho na próxima tentativa.",
	sem_resposta: "O provedor de e-mail não respondeu no tempo esperado. O convite sai sozinho na próxima tentativa.",
	falha_do_provedor: "O provedor de e-mail recusou o envio e não informou o motivo. Confira a configuração em Integrações se a falha continuar.",
	sessao_desconectada: "O provedor de e-mail recusou o envio e não informou o motivo. Confira a configuração em Integrações se a falha continuar.",
	destinatario_recusado: "O provedor de e-mail recusou o endereço do destinatário. Confira o e-mail cadastrado.",
	nao_configurado: "Convite não enviado: configure o e-mail em Integrações, com a chave do provedor e o remetente num domínio verificado nele. O convite sai sozinho depois disso.",
	remetente_invalido: "Convite não enviado: o remetente cadastrado em Integrações não é um endereço de e-mail. Use o formato Nome <agenda@seudominio.com.br>, com o domínio verificado no provedor."
};
function falhaDoEmail(motivo) {
	return {
		ok: false,
		motivo,
		mensagem: MENSAGENS_DO_EMAIL[motivo]
	};
}
const DO_EMAIL = [[/invalid[_\-\s]?(to|recipient)(?![a-z])/i, "destinatario_recusado"]];
function traduzirErroDoEmail(codigo, status) {
	const texto = codigo?.trim() ?? "";
	if (texto) {
		for (const [padrao, motivo] of DO_EMAIL) if (padrao.test(texto)) return falhaDoEmail(motivo);
	}
	return falhaDoEmail(traduzirErroDoProvedor(texto, status).motivo);
}
function protegerPortaDeEmail(porta) {
	return { async enviar(mensagem) {
		try {
			return await porta.enviar(mensagem);
		} catch {
			return falhaDoEmail("sem_resposta");
		}
	} };
}
function base64DoTexto(texto) {
	const bytes = new TextEncoder().encode(texto);
	let binario = "";
	for (const byte of bytes) binario += String.fromCharCode(byte);
	return btoa(binario);
}
//#endregion
//#region supabase/functions/_shared/discagem/janela.ts
const NOMES_DE_FUSO = {
	"America/Sao_Paulo": "São Paulo",
	"America/Manaus": "Manaus",
	"America/Rio_Branco": "Rio Branco",
	"America/Campo_Grande": "Campo Grande",
	"America/Cuiaba": "Cuiabá",
	"America/Noronha": "Fernando de Noronha",
	"America/Belem": "Belém",
	"America/Fortaleza": "Fortaleza",
	"America/Recife": "Recife",
	"America/Bahia": "Salvador"
};
function nomeDoFuso(fuso) {
	const conhecido = NOMES_DE_FUSO[fuso];
	if (conhecido) return conhecido;
	return (fuso.split("/").pop() ?? fuso).replace(/_/g, " ");
}
//#endregion
//#region supabase/functions/_shared/speech/convite.ts
const NOME_DA_MODALIDADE$1 = {
	video: "Vídeo",
	telefone: "Telefone",
	presencial: "Presencial"
};
function horarioNoFuso(instante, fuso) {
	return `${rotularInstante(instante, fuso)} (horário de ${nomeDoFuso(fuso)})`;
}
function duracaoEmMinutos(inicio, fim) {
	return Math.round((Date.parse(fim) - Date.parse(inicio)) / 6e4);
}
function caminhoDoLead(dados) {
	const quem = dados.especialista.nome;
	if (dados.modalidade === "video") return dados.especialista.sala ? `É por vídeo, e o link pra entrar é este: ${dados.especialista.sala}` : `É por vídeo, e ${quem} te manda o link da sala antes de começar.`;
	if (dados.modalidade === "telefone") return `É por telefone: ${quem} te liga no número em que a gente conversou.`;
	return dados.especialista.sala ? `É presencial, neste endereço: ${dados.especialista.sala}` : `É presencial, e ${quem} te confirma o endereço antes do dia.`;
}
function textoDoConviteDoLead(dados) {
	const nome = dados.lead.nome?.trim();
	const quem = dados.especialista.nome;
	const saudacao = nome ? `Oi, ${nome}!` : "Oi!";
	const assistente = dados.assistente?.trim() || null;
	const corpo = [
		saudacao,
		"",
		`${assistente ? `Aqui é ${assistente}, da ${dados.empresa}.` : `Aqui é a assistente da ${dados.empresa}.`} Como a gente combinou, sua conversa com ${quem} ficou marcada pra ${horarioNoFuso(dados.inicio, dados.lead.fuso)}.`,
		"",
		caminhoDoLead(dados),
		"",
		"O convite vai anexado, é só abrir pra salvar na sua agenda.",
		"",
		"Até lá!",
		assistente ?? dados.empresa
	];
	return {
		assunto: `Sua conversa com ${quem} está marcada`,
		corpo: corpo.join("\n")
	};
}
const NOME_DA_ORIGEM = new Map([
	["import", "importação de planilha"],
	["intake", "formulário"],
	["manual", "cadastro manual"],
	["whatsapp", "conversa pelo WhatsApp"]
]);
function historicoDoLead(dados) {
	const lead = dados.lead;
	const fuso = dados.especialista.fuso;
	const local = [lead.cidade?.trim(), lead.estado?.trim()].filter(Boolean).join("/");
	const origem = lead.origem ? NOME_DA_ORIGEM.get(lead.origem) ?? lead.origem : null;
	return [
		...lead.empresa?.trim() ? [`Empresa: ${lead.empresa.trim()}`] : [],
		...local ? [`Local: ${local}`] : [],
		...origem ? [`Origem: ${origem}`] : [],
		...lead.temperatura ? [`Temperatura: ${lead.temperatura}`] : [],
		...lead.entrouEm ? [`Entrou em: ${rotularInstante(lead.entrouEm, fuso)}`] : [],
		...lead.ultimaAtividade ? [`Última atividade: ${rotularInstante(lead.ultimaAtividade, fuso)}`] : []
	];
}
function textoDoConviteDoEspecialista(dados) {
	const nome = dados.lead.nome?.trim() || "Lead sem nome";
	const sala = dados.especialista.sala?.trim() || null;
	const historico = historicoDoLead(dados);
	const corpo = [
		"Reunião marcada pela assistente.",
		"",
		`Lead: ${nome}`,
		`Quando: ${horarioNoFuso(dados.inicio, dados.especialista.fuso)}`,
		`Duração: ${duracaoEmMinutos(dados.inicio, dados.fim)} min`,
		`Modalidade: ${NOME_DA_MODALIDADE$1[dados.modalidade]}`,
		...sala ? [`${dados.modalidade === "presencial" ? "Endereço" : "Sala"}: ${sala}`] : [],
		...dados.modalidade === "telefone" && dados.lead.telefone ? [`Telefone do lead: ${dados.lead.telefone}`] : [],
		"",
		"Resumo de passagem:",
		dados.resumo ?? "Sem resumo de passagem registrado.",
		...historico.length > 0 ? [
			"",
			"Histórico do lead:",
			...historico
		] : [],
		...dados.notas ? [
			"",
			"Notas da marcação:",
			dados.notas
		] : []
	];
	return {
		assunto: `Reunião marcada com ${nome}: ${rotularInstante(dados.inicio, dados.especialista.fuso)}`,
		corpo: corpo.join("\n")
	};
}
//#endregion
//#region supabase/functions/_shared/agenda/evento-da-reuniao.ts
const RECUO_EM_MINUTOS$1 = [
	1,
	5,
	15,
	60
];
const TETO_DE_TENTATIVAS$1 = RECUO_EM_MINUTOS$1.length + 1;
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
	const espera = tentativas < TETO_DE_TENTATIVAS$1 ? RECUO_EM_MINUTOS$1[tentativas - 1] : void 0;
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
//#endregion
//#region supabase/functions/_shared/agenda/convite-de-reuniao.ts
const RECUO_EM_MINUTOS = [
	1,
	5,
	15,
	60
];
const TETO_DE_TENTATIVAS = RECUO_EM_MINUTOS.length + 1;
const MENSAGEM_SEM_EMAIL = "O lead não tem e-mail cadastrado. Cadastre o e-mail na ficha do lead e o convite sai na próxima passagem.";
const SELECAO_DA_REUNIAO_PARA_CONVITE = "id, account_id, starts_at, ends_at, modality, notes, handoff_summary, lead_invite_sent_at, lead_invite_attempts, lead_invite_error, lead_invite_retry_at, specialist_invite_sent_at, specialist_invite_attempts, specialist_invite_error, specialist_invite_retry_at, leads(name, email, phone_e164, timezone, company, city, state, source, temperature, created_at, last_activity_at), specialists(name, email, timezone, room_url), accounts(name, timezone, agents(name))";
function lerReuniaoParaConvite(linha) {
	const embutido = (chave) => {
		const valor = linha[chave];
		const objeto = Array.isArray(valor) ? valor[0] : valor;
		return objeto && typeof objeto === "object" ? objeto : {};
	};
	const texto = (origem, chave) => {
		const valor = origem[chave];
		return typeof valor === "string" && valor.trim() !== "" ? valor : null;
	};
	const numero = (chave) => typeof linha[chave] === "number" ? linha[chave] : 0;
	const entrega = (lado) => {
		const colunas = colunasDoConvite(lado);
		return {
			enviadoEm: texto(linha, colunas.enviadoEm),
			tentativas: numero(colunas.tentativas),
			erro: texto(linha, colunas.erro),
			proximaTentativa: texto(linha, colunas.proximaTentativa)
		};
	};
	const lead = embutido("leads");
	const especialista = embutido("specialists");
	const conta = embutido("accounts");
	const agentes = conta.agents;
	const agente = Array.isArray(agentes) ? agentes[0] : agentes;
	return {
		id: String(linha.id),
		account_id: String(linha.account_id),
		starts_at: String(linha.starts_at),
		ends_at: String(linha.ends_at),
		modality: linha.modality,
		notes: texto(linha, "notes"),
		handoff_summary: linha.handoff_summary ?? null,
		empresa: texto(conta, "name") ?? "",
		assistente: agente && typeof agente === "object" ? texto(agente, "name") : null,
		fusoDaConta: texto(conta, "timezone") ?? "America/Sao_Paulo",
		lead: {
			nome: texto(lead, "name"),
			email: texto(lead, "email"),
			telefone: texto(lead, "phone_e164"),
			fuso: texto(lead, "timezone"),
			empresa: texto(lead, "company"),
			cidade: texto(lead, "city"),
			estado: texto(lead, "state"),
			origem: texto(lead, "source"),
			temperatura: texto(lead, "temperature"),
			entrouEm: texto(lead, "created_at"),
			ultimaAtividade: texto(lead, "last_activity_at")
		},
		especialista: {
			nome: texto(especialista, "name") ?? "Especialista",
			email: texto(especialista, "email") ?? "",
			fuso: texto(especialista, "timezone") ?? texto(conta, "timezone") ?? "America/Sao_Paulo",
			sala: texto(especialista, "room_url")
		},
		entregaDoLead: entrega("lead"),
		entregaDoEspecialista: entrega("especialista")
	};
}
function fusoDoLead(reuniao) {
	return reuniao.lead.fuso?.trim() || reuniao.fusoDaConta;
}
function dadosDoConvite(reuniao) {
	return {
		inicio: reuniao.starts_at,
		fim: reuniao.ends_at,
		modalidade: reuniao.modality,
		empresa: reuniao.empresa,
		assistente: reuniao.assistente,
		especialista: {
			nome: reuniao.especialista.nome,
			sala: reuniao.especialista.sala,
			fuso: reuniao.especialista.fuso
		},
		lead: {
			...reuniao.lead,
			fuso: fusoDoLead(reuniao)
		},
		resumo: textoDoResumo(reuniao.handoff_summary),
		notas: reuniao.notes?.trim() || null
	};
}
function escaparTextoDoIcs(texto) {
	return texto.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}
function dobrarLinhaDoIcs(linha) {
	const codificador = new TextEncoder();
	const partes = [];
	let atual = "";
	let bytes = 0;
	for (const caractere of linha) {
		const tamanho = codificador.encode(caractere).length;
		const limite = partes.length === 0 ? 75 : 74;
		if (bytes + tamanho > limite) {
			partes.push(atual);
			atual = "";
			bytes = 0;
		}
		atual += caractere;
		bytes += tamanho;
	}
	partes.push(atual);
	return partes.join("\r\n ");
}
function instanteDoIcs(instante) {
	const ms = Date.parse(instante);
	if (!Number.isFinite(ms)) throw new Error(`instante inválido para o convite: ${instante}`);
	return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}
function uidDoConvite(reuniaoId) {
	return `reuniao-${reuniaoId}@sarah`;
}
function montarIcs(evento) {
	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//Sarah Voice SDR//Convite de reunião//PT-BR",
		"CALSCALE:GREGORIAN",
		"METHOD:PUBLISH",
		"BEGIN:VEVENT",
		`UID:${uidDoConvite(evento.reuniaoId)}`,
		`DTSTAMP:${instanteDoIcs(evento.carimbo)}`,
		`DTSTART:${instanteDoIcs(evento.inicio)}`,
		`DTEND:${instanteDoIcs(evento.fim)}`,
		`SUMMARY:${escaparTextoDoIcs(evento.titulo)}`,
		`DESCRIPTION:${escaparTextoDoIcs(evento.descricao)}`,
		...evento.local ? [`LOCATION:${escaparTextoDoIcs(evento.local)}`] : [],
		"END:VEVENT",
		"END:VCALENDAR"
	].map(dobrarLinhaDoIcs).join("\r\n") + "\r\n";
}
function chaveDoConvite(reuniaoId, lado, tentativa) {
	return `convite-${reuniaoId}-${lado}-${tentativa}`;
}
function montarConvite(reuniao, lado, para, agoraMs) {
	const dados = dadosDoConvite(reuniao);
	const texto = lado === "lead" ? textoDoConviteDoLead(dados) : textoDoConviteDoEspecialista(dados);
	const nomeDoLead = reuniao.lead.nome?.trim() || "lead sem nome";
	const ics = montarIcs({
		reuniaoId: reuniao.id,
		inicio: reuniao.starts_at,
		fim: reuniao.ends_at,
		titulo: lado === "lead" ? `Conversa com ${reuniao.especialista.nome}` : `Reunião com ${nomeDoLead}`,
		descricao: texto.corpo,
		local: reuniao.especialista.sala,
		carimbo: new Date(agoraMs).toISOString()
	});
	const entrega = lado === "lead" ? reuniao.entregaDoLead : reuniao.entregaDoEspecialista;
	return {
		para,
		assunto: texto.assunto,
		texto: texto.corpo,
		anexos: [{
			nome: "convite.ics",
			tipo: "text/calendar; charset=utf-8; method=PUBLISH",
			conteudo: ics
		}],
		chaveDeIdempotencia: chaveDoConvite(reuniao.id, lado, entrega.tentativas + 1)
	};
}
function pendenciaDepoisDe(tentativas, erro, agoraMs) {
	const espera = tentativas < TETO_DE_TENTATIVAS ? RECUO_EM_MINUTOS[tentativas - 1] : void 0;
	return {
		tentativas,
		erro,
		proximaTentativa: espera === void 0 ? null : new Date(agoraMs + espera * 6e4).toISOString()
	};
}
function ladoPendente(entrega, agoraMs) {
	if (entrega.enviadoEm !== null) return false;
	if (entrega.tentativas >= TETO_DE_TENTATIVAS) return false;
	return entrega.proximaTentativa === null || Date.parse(entrega.proximaTentativa) <= agoraMs;
}
new Set([...MOTIVOS_DE_CONFIGURACAO].map((motivo) => MENSAGENS_DO_EMAIL[motivo]));
function colunasDoConvite(lado) {
	const prefixo = lado === "lead" ? "lead" : "specialist";
	return {
		enviadoEm: `${prefixo}_invite_sent_at`,
		tentativas: `${prefixo}_invite_attempts`,
		erro: `${prefixo}_invite_error`,
		proximaTentativa: `${prefixo}_invite_retry_at`
	};
}
function atualizacaoDoEnvio(lado, enviadoEm) {
	const colunas = colunasDoConvite(lado);
	return {
		[colunas.enviadoEm]: enviadoEm,
		[colunas.erro]: null,
		[colunas.proximaTentativa]: null
	};
}
function atualizacaoDaPendencia(lado, pendencia) {
	const colunas = colunasDoConvite(lado);
	return {
		[colunas.tentativas]: pendencia.tentativas,
		[colunas.erro]: pendencia.erro,
		[colunas.proximaTentativa]: pendencia.proximaTentativa
	};
}
async function enviarUmLado(pedido, lado, para, agoraMs) {
	const { reuniao, email, porta } = pedido;
	const entrega = lado === "lead" ? reuniao.entregaDoLead : reuniao.entregaDoEspecialista;
	if (entrega.enviadoEm !== null) return { situacao: "ja_enviado" };
	if (!ladoPendente(entrega, agoraMs)) return { situacao: "aguardando" };
	if (para === null) {
		const pendencia = {
			tentativas: entrega.tentativas,
			erro: MENSAGEM_SEM_EMAIL,
			proximaTentativa: new Date(agoraMs + 36e5).toISOString()
		};
		await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia);
		return {
			situacao: "sem_email",
			pendencia
		};
	}
	if ("ok" in email && MOTIVOS_DE_CONFIGURACAO.has(email.motivo)) {
		const pendencia = {
			tentativas: entrega.tentativas,
			erro: email.mensagem,
			proximaTentativa: new Date(agoraMs + 36e5).toISOString()
		};
		await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia);
		return {
			situacao: "email_nao_configurado",
			pendencia
		};
	}
	const resultado = "ok" in email ? email : await email.enviar(montarConvite(reuniao, lado, para, agoraMs)).catch(() => falhaDoEmail("sem_resposta"));
	if (resultado.ok) {
		await porta.gravarEnvioDoConvite(reuniao.account_id, reuniao.id, lado, new Date(agoraMs).toISOString());
		return { situacao: "enviado" };
	}
	const pendencia = pendenciaDepoisDe(entrega.tentativas + 1, resultado.mensagem, agoraMs);
	await porta.registrarPendenciaDoConvite(reuniao.account_id, reuniao.id, lado, pendencia);
	return {
		situacao: "falhou",
		pendencia
	};
}
async function enviarConvitesDaReuniao(pedido) {
	const agoraMs = pedido.agora();
	const destinatarioDoLead = pedido.reuniao.lead.email?.trim() || null;
	const destinatarioDoEspecialista = pedido.reuniao.especialista.email.trim() || null;
	const [especialista, lead] = await Promise.allSettled([enviarUmLado(pedido, "especialista", destinatarioDoEspecialista, agoraMs), enviarUmLado(pedido, "lead", destinatarioDoLead, agoraMs)]);
	if (especialista.status === "rejected") throw especialista.reason;
	if (lead.status === "rejected") throw lead.reason;
	return {
		lead: lead.value,
		especialista: especialista.value
	};
}
//#endregion
//#region supabase/functions/_shared/email/email-resend.ts
const ENDERECO_DE_ENVIO = "https://api.resend.com/emails";
function lerJson$1(texto) {
	try {
		const valor = JSON.parse(texto);
		return valor && typeof valor === "object" ? valor : null;
	} catch {
		return null;
	}
}
function corpoDoResend(mensagem, remetente) {
	return {
		from: remetente,
		to: [mensagem.para],
		subject: mensagem.assunto,
		text: mensagem.texto,
		attachments: mensagem.anexos.map((anexo) => ({
			filename: anexo.nome,
			content: base64DoTexto(anexo.conteudo),
			content_type: anexo.tipo
		}))
	};
}
function criarEmailDoResend(opcoes) {
	const prazoMs = opcoes.prazoMs ?? 5e3;
	return protegerPortaDeEmail({ async enviar(mensagem) {
		const controle = new AbortController();
		const temporizador = setTimeout(() => controle.abort(), prazoMs);
		try {
			const resposta = await opcoes.buscar(ENDERECO_DE_ENVIO, {
				method: "POST",
				headers: {
					authorization: `Bearer ${opcoes.chave}`,
					"content-type": "application/json",
					"idempotency-key": mensagem.chaveDeIdempotencia
				},
				body: JSON.stringify(corpoDoResend(mensagem, opcoes.remetente)),
				signal: controle.signal
			});
			const corpo = lerJson$1(await resposta.text());
			if (resposta.status >= 200 && resposta.status < 300) return {
				ok: true,
				idDoEnvio: typeof corpo?.id === "string" ? corpo.id : null
			};
			return traduzirErroDoEmail(typeof corpo?.name === "string" ? corpo.name : null, resposta.status);
		} finally {
			clearTimeout(temporizador);
		}
	} });
}
const SEGREDO_DO_EMAIL = {
	provedor: "email",
	chave: "api_key"
};
const REMETENTE_DO_EMAIL = {
	provedor: "email",
	chave: "remetente"
};
const ENDERECO = String.raw`[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+`;
const SO_ENDERECO = new RegExp(`^${ENDERECO}$`);
const COM_NOME = new RegExp(String.raw`^([^<>"]*?)\s*<(` + ENDERECO + ")>$");
function lerRemetente(texto) {
	const limpo = texto.trim();
	if (SO_ENDERECO.test(limpo)) return limpo;
	const casamento = COM_NOME.exec(limpo);
	if (!casamento) return null;
	const nome = casamento[1].trim();
	return nome === "" ? casamento[2] : `${nome} <${casamento[2]}>`;
}
async function abrirEmailDaConta(cofre, contaId, opcoes) {
	const [chave, remetente] = await Promise.all([cofre.resolveSecret(contaId, SEGREDO_DO_EMAIL.provedor, SEGREDO_DO_EMAIL.chave), cofre.resolveSecret(contaId, REMETENTE_DO_EMAIL.provedor, REMETENTE_DO_EMAIL.chave)]);
	if (!chave.ok || !remetente.ok || remetente.valor.trim() === "") return falhaDoEmail("nao_configurado");
	const lido = lerRemetente(remetente.valor);
	if (lido === null) return falhaDoEmail("remetente_invalido");
	return criarEmailDoResend({
		...opcoes,
		chave: chave.valor,
		remetente: lido
	});
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
//#region supabase/functions/_shared/agenda/modalidades.ts
const MODALIDADES_DA_REUNIAO = [
	"video",
	"telefone",
	"presencial"
];
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
//#region supabase/functions/_shared/speech/todos-os-propositos.ts
const FALAS_DE_TODO_PROPOSITO = {
	avisoDeGravacao: "Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Antes da gente começar: essa ligação é gravada, tudo bem?",
	avisoDeGravacaoSemNome: "Oi! Aqui é a {nome_do_agente}, da {empresa}. Antes da gente começar: essa ligação é gravada, tudo bem?",
	aberturaSemGravacao: "Oi, {nome_do_lead}? Aqui é a {nome_do_agente}, da {empresa}. Tudo bem?",
	aberturaSemGravacaoESemNome: "Oi! Aqui é a {nome_do_agente}, da {empresa}. Tudo bem?",
	recusaDeAfirmar: ["Isso eu não arrisco te falar, pra não te passar informação errada.", "Quem fecha esse número é o especialista, e ele te fala certinho."]
};
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
const FERRAMENTA_DE_AGENDA = "tool-availability";
FALAS_DE_TODO_PROPOSITO.avisoDeGravacao, [...FALAS_DE_TODO_PROPOSITO.recusaDeAfirmar], [...FALAS_DAS_REGRAS_TRAVADAS.naoPerturbe], [...FALAS_DAS_REGRAS_TRAVADAS.pedidoDeHumano], [...FALAS_DAS_REGRAS_TRAVADAS.pessoaErrada];
[...FALAS_DA_QUALIFICACAO.antesDeEncerrar];
[...FALAS_DE_DESCOBERTA.fechamento.sem_agenda], [...FALAS_DE_DESCOBERTA.fechamento.com_agenda];
//#endregion
//#region supabase/functions/_shared/agente/compilador.ts
const CATALOGO_DE_FERRAMENTAS = [
	{
		nome: "tool-transfer",
		entraNa: "F3",
		propositos: [...PROPOSITOS],
		dependeDeAgenda: false
	},
	{
		nome: "tool-dnc",
		entraNa: "F3",
		propositos: [...PROPOSITOS],
		dependeDeAgenda: false
	},
	{
		nome: DESCRITOR_DA_QUALIFICACAO.nome,
		entraNa: "F4",
		propositos: DESCRITOR_DA_QUALIFICACAO.propositos,
		dependeDeAgenda: false
	},
	{
		nome: FERRAMENTA_DE_AGENDA,
		entraNa: "F5",
		propositos: [...PROPOSITOS],
		fatiaPorProposito: {
			reminder: "F6",
			rescue: "F6"
		},
		dependeDeAgenda: true
	},
	{
		nome: "tool-book-meeting",
		entraNa: "F5",
		propositos: ["discovery", "followup"],
		dependeDeAgenda: true
	},
	{
		nome: "tool-confirm-meeting",
		entraNa: "F6",
		propositos: ["reminder"],
		dependeDeAgenda: true
	},
	{
		nome: "tool-reschedule",
		entraNa: "F6",
		propositos: ["reminder", "rescue"],
		dependeDeAgenda: true
	}
];
DESCRITOR_DA_QUALIFICACAO.nome, DESCRITOR_DA_QUALIFICACAO.descricao, DESCRITOR_DA_QUALIFICACAO.campos;
const VARIAVEIS_DA_CHAMADA = [...[
	"nome_do_lead",
	"empresa_do_lead",
	"cidade_do_lead",
	"nome_do_especialista"
], "contexto_do_lead"];
[
	"# Dados desta ligação",
	"Estes dados chegam no começo de cada ligação. Campo em branco é dado que a conta não tem: não invente, não pergunte só para preencher e nunca diga em voz alta o nome de um campo. Sem o nome de quem atende, fale sem nome.",
	"- Nome de quem atende: {nome_do_lead}",
	"- Empresa de quem atende: {empresa_do_lead}",
	"- Cidade: {cidade_do_lead}",
	"- O que se sabe do lead: {contexto_do_lead}"
].join("\n");
new Set(VARIAVEIS_DA_CHAMADA);
//#endregion
//#region supabase/functions/_shared/speech/ferramentas.ts
const FALAS_DAS_FERRAMENTAS = {
	falha: "Deixa eu confirmar isso com o time e já te retorno.",
	propositoErrado: "Isso eu não consigo resolver por aqui agora, mas deixo anotado pro time.",
	campoFaltando: "Só um instante, me conta de novo pra eu anotar certinho?"
};
//#endregion
//#region supabase/functions/_shared/provedor/assinatura-de-webhook.ts
const JANELA_DE_ROTACAO_EM_SEGUNDOS = 86400;
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
//#region supabase/functions/_shared/tools/esqueleto.ts
const CABECALHO_DA_CONVERSA = "x-conversation-id";
const ORCAMENTO_PADRAO_MS = 4e3;
const DIRECAO_DE_ENSAIO = "rehearsal";
var EscritaNaLeitura = class extends Error {
	constructor(membro) {
		super(`a leitura tocou a porta de escrita: ${membro}`);
		this.name = "EscritaNaLeitura";
	}
};
function escritaQueLevanta() {
	const levantar = (membro) => {
		throw new EscritaNaLeitura(String(membro));
	};
	return new Proxy({}, {
		get: (_alvo, membro) => levantar(membro),
		set: (_alvo, membro) => levantar(membro),
		has: (_alvo, membro) => levantar(membro),
		apply: () => levantar("chamada")
	});
}
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ESTOUROU = Symbol("estourou");
function esperarPadrao(ms) {
	return new Promise((resolver) => setTimeout(resolver, ms));
}
function logPadrao(evento, detalhe) {
	console.error(`[ferramenta] ${evento}`, detalhe);
}
function resposta(status, ok, data, speech) {
	return {
		status,
		corpo: {
			ok,
			data,
			speech
		}
	};
}
const FALHA = () => resposta(200, false, null, FALAS_DAS_FERRAMENTAS.falha);
function comoObjeto(corpo) {
	return typeof corpo === "object" && corpo !== null && !Array.isArray(corpo) ? corpo : {};
}
function preenchido(valor) {
	if (valor === void 0 || valor === null) return false;
	return typeof valor !== "string" || valor.trim() !== "";
}
function falaComIdentificador(fala, chamada) {
	if (UUID.test(fala)) return true;
	return [
		chamada.id,
		chamada.account_id,
		chamada.lead_id
	].filter((id) => typeof id === "string" && id !== "").some((id) => fala.includes(id));
}
function mensagemDe(erro) {
	const texto = erro instanceof Error ? erro.message : String(erro);
	return texto.trim() === "" ? "sem mensagem" : texto.trim();
}
function criarFerramenta(definicao) {
	const doCatalogo = CATALOGO_DE_FERRAMENTAS.find((item) => item.nome === definicao.nome);
	if (doCatalogo === void 0) throw new Error(`Ferramenta fora do catálogo: ${definicao.nome}`);
	const esperados = [...doCatalogo.propositos].sort();
	const declarados = [...new Set(definicao.propositos)].sort();
	if (esperados.join(",") !== declarados.join(",")) throw new Error(`Os propósitos de ${definicao.nome} divergem do catálogo: ${declarados.join(", ")} contra ${esperados.join(", ")}`);
	const propositos = new Set(declarados);
	const obrigatorios = definicao.obrigatorios ?? [];
	return async function tratar(pedido, ambiente) {
		const agora = ambiente.agora ?? Date.now;
		const esperar = ambiente.esperar ?? esperarPadrao;
		const orcamento = ambiente.orcamentoMs ?? ORCAMENTO_PADRAO_MS;
		const log = ambiente.log ?? logPadrao;
		const inicio = agora();
		if (pedido.metodo !== "POST") return resposta(405, false, null, FALAS_DAS_FERRAMENTAS.falha);
		const conferencia = await conferirSegredo({
			cabecalho: pedido.segredo,
			chaves: ambiente.chaves,
			contas: await ambiente.porta.contasCandidatas(),
			agora
		});
		if (!conferencia.ok) {
			log("segredo_recusado", {
				ferramenta: definicao.nome,
				motivo: conferencia.motivo
			});
			return resposta(401, false, null, FALAS_DAS_FERRAMENTAS.falha);
		}
		const contaId = conferencia.contaId;
		if (conferencia.chave === "anterior") log("segredo_da_chave_anterior", {
			ferramenta: definicao.nome,
			contaId
		});
		const conversa = (pedido.conversa ?? "").trim();
		const chamada = conversa === "" ? null : await ambiente.porta.chamadaDaConversa(contaId, conversa);
		if (chamada === null || chamada.account_id !== contaId) {
			log("conversa_nao_encontrada", { ferramenta: definicao.nome });
			return resposta(404, false, null, FALAS_DAS_FERRAMENTAS.falha);
		}
		const entrada = comoObjeto(pedido.corpo);
		const registrar = async (saida, erro) => {
			try {
				await ambiente.porta.registrarInvocacao({
					account_id: contaId,
					call_id: chamada.id,
					tool: definicao.nome,
					request: entrada,
					response: { ...saida.corpo },
					latency_ms: Math.max(0, Math.round(agora() - inicio)),
					error: erro,
					at: new Date(inicio).toISOString()
				});
			} catch (falha) {
				log("registro_falhou", {
					ferramenta: definicao.nome,
					chamadaId: chamada.id,
					erro: mensagemDe(falha)
				});
			}
			return saida;
		};
		if (!propositos.has(chamada.purpose)) return registrar(resposta(409, false, null, FALAS_DAS_FERRAMENTAS.propositoErrado), `proposito_errado: ${chamada.purpose}`);
		const faltando = obrigatorios.find((campo) => !preenchido(entrada[campo.chave]));
		if (faltando !== void 0) return registrar(resposta(400, false, {
			campo: faltando.nome,
			chave: faltando.chave
		}, FALAS_DAS_FERRAMENTAS.campoFaltando), `campo_faltando: ${faltando.chave}`);
		const ensaio = chamada.direction === DIRECAO_DE_ENSAIO;
		const base = {
			contaId,
			chamada,
			entrada,
			agora,
			ensaio
		};
		const executar = async () => {
			let leitura;
			try {
				leitura = await definicao.executar.ler({
					...base,
					escrita: escritaQueLevanta()
				});
			} catch (falha) {
				return falha instanceof EscritaNaLeitura ? { erro: `escrita_na_leitura: ${mensagemDe(falha)}` } : { erro: `falha_do_executor: ${mensagemDe(falha)}` };
			}
			const conferirFala = (bruta) => {
				const fala = typeof bruta === "string" ? bruta.trim() : "";
				if (fala === "") return { erro: "fala_vazia" };
				if (falaComIdentificador(fala, chamada)) return { erro: "identificador_na_fala" };
				return fala;
			};
			let final = leitura;
			let fala = conferirFala(leitura.speech);
			if (typeof fala !== "string") return fala;
			if (definicao.executar.memoria !== void 0) try {
				await definicao.executar.memoria({
					...base,
					escrita: ambiente.escrita
				}, leitura);
			} catch (falha) {
				return { erro: `falha_da_memoria: ${mensagemDe(falha)}` };
			}
			if (!ensaio && definicao.executar.efeitos !== void 0) {
				try {
					const doEfeito = await definicao.executar.efeitos({
						...base,
						escrita: ambiente.escrita
					}, leitura);
					if (doEfeito) final = doEfeito;
				} catch (falha) {
					return { erro: `falha_do_efeito: ${mensagemDe(falha)}` };
				}
				if (final !== leitura) {
					fala = conferirFala(final.speech);
					if (typeof fala !== "string") return fala;
				}
			}
			const ok = final.ok ?? true;
			const erro = ok ? null : final.erro?.trim() || "recusa_da_ferramenta";
			return {
				saida: resposta(200, ok, final.data ?? null, fala),
				erroRegistrado: erro
			};
		};
		const execucao = executar();
		execucao.catch(() => void 0);
		const resultado = await Promise.race([execucao, esperar(orcamento).then(() => ESTOUROU)]);
		if (resultado === ESTOUROU) return registrar(FALHA(), `prazo_estourado: ${orcamento} ms`);
		if ("erro" in resultado) return registrar(FALHA(), resultado.erro);
		return registrar(resultado.saida, resultado.erroRegistrado);
	};
}
function criarPortaDeFerramentas(cliente, agora = Date.now) {
	let contasEmCache = null;
	return {
		async contasCandidatas() {
			const instante = agora();
			if (contasEmCache && instante - contasEmCache.lidasEm < 6e4) return contasEmCache.ids;
			const { data, error } = await cliente.from("accounts").select("id");
			if (error) throw new Error(error.message);
			const ids = (data ?? []).map((linha) => linha.id);
			contasEmCache = {
				lidasEm: instante,
				ids
			};
			return ids;
		},
		async chamadaDaConversa(contaId, conversaId) {
			const { data, error } = await cliente.from("calls").select("id, account_id, purpose, direction, lead_id").eq("account_id", contaId).eq("provider_conversation_id", conversaId).maybeSingle();
			if (error) throw new Error(error.message);
			return data ?? null;
		},
		async registrarInvocacao(invocacao) {
			const { error } = await cliente.from("call_tool_invocations").insert(invocacao);
			if (error) throw new Error(error.message);
		}
	};
}
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
function falarConfirmacao(horario, agora) {
	return `Fechado, ficou marcado pra ${falarHorario(horario, agora)}. Vou te mandar o convite por e-mail.`;
}
const FALAS_DA_AGENDA = {
	horarioTomado: "Esse horário acabou de ser preenchido, deixa eu ver outro.",
	falha: FALAS_DAS_FERRAMENTAS.falha,
	agendaCheia: "Poxa, a agenda está bem cheia nos próximos dias. Deixa eu pedir pro time te chamar com uma opção, tá bom?",
	ofertaSemValidade: "Deixa eu olhar a agenda de novo pra te passar os horários certinhos.",
	diaLotado: "Esse dia acabou de lotar, deixa eu ver outro dia pra você.",
	emCimaDaHora: "Esse horário ficou em cima da hora pra marcar, deixa eu ver um pouco mais pra frente.",
	longeDemais: "Esse horário ficou longe demais na agenda, deixa eu ver uma data mais próxima.",
	jaTemReuniao: "Vi aqui que você já tem uma conversa marcada com a gente, então vou manter essa, tá bom?",
	especialistaSaiu: "Essa agenda acabou de sair do ar, deixa eu ver outro horário com o time.",
	qualModalidade: "Você prefere fazer por vídeo, por telefone ou presencial?"
};
//#endregion
//#region supabase/functions/tool-book-meeting/agendamento.ts
const MODALIDADES = MODALIDADES_DA_REUNIAO;
const FALAS_DOS_CODIGOS = new Map([
	["horario_ocupado", FALAS_DA_AGENDA.horarioTomado],
	["fora_da_disponibilidade", FALAS_DA_AGENDA.horarioTomado],
	["teto_diario", FALAS_DA_AGENDA.diaLotado],
	["antecedencia_minima", FALAS_DA_AGENDA.emCimaDaHora],
	["antecedencia_maxima", FALAS_DA_AGENDA.longeDemais],
	["lead_com_reuniao_ativa", FALAS_DA_AGENDA.jaTemReuniao],
	["especialista_inativo", FALAS_DA_AGENDA.especialistaSaiu]
]);
const POSICAO = /^[1-4]$/;
function lerPosicao(valor) {
	if (typeof valor === "number") return Number.isInteger(valor) && valor >= 1 && valor <= 4 ? valor : null;
	if (typeof valor === "string" && POSICAO.test(valor.trim())) return Number(valor.trim());
	return null;
}
function lerModalidade(valor) {
	if (typeof valor !== "string") return null;
	const limpa = valor.trim().toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
	return MODALIDADES.find((modalidade) => modalidade === limpa) ?? null;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function lerEmail(valor) {
	if (typeof valor !== "string") return null;
	const limpo = valor.trim().toLowerCase();
	return EMAIL.test(limpo) ? limpo : null;
}
function lerNotas(valor) {
	if (typeof valor !== "string") return null;
	const limpas = valor.trim();
	return limpas === "" ? null : limpas;
}
function recusa(motivo, speech) {
	return {
		ok: false,
		data: { reason: motivo },
		speech,
		erro: motivo
	};
}
function criarToolBookMeeting(leitura) {
	return criarFerramenta({
		nome: "tool-book-meeting",
		propositos: ["discovery", "followup"],
		obrigatorios: [{
			chave: "slot_position",
			nome: "posição do horário"
		}, {
			chave: "modality",
			nome: "modalidade"
		}],
		executar: executorDoAgendamento(leitura)
	});
}
function executorDoAgendamento(leitura) {
	return {
		async ler(contexto) {
			const agoraMs = contexto.agora();
			const agora = new Date(agoraMs).toISOString();
			const modalidade = lerModalidade(contexto.entrada.modality);
			if (modalidade === null) return recusa("modalidade_desconhecida", FALAS_DA_AGENDA.qualModalidade);
			const leadId = contexto.chamada.lead_id;
			if (leadId === null) return recusa("chamada_sem_lead", FALAS_DA_AGENDA.falha);
			const posicao = lerPosicao(contexto.entrada.slot_position);
			const oferta = posicao === null ? null : await leitura.ofertaDaChamada(contexto.contaId, contexto.chamada.id, posicao);
			if (oferta === null) return recusa("posicao_nao_oferecida", FALAS_DA_AGENDA.ofertaSemValidade);
			if (Date.parse(oferta.expires_at) <= agoraMs) return recusa("oferta_expirada", FALAS_DA_AGENDA.ofertaSemValidade);
			const calendario = await leitura.calendarioDoEspecialista(contexto.contaId, oferta.specialist_id);
			if (calendario !== null) {
				const conferencia = await calendario.conferirHorario(oferta.starts_at, oferta.ends_at);
				if (conferencia.ok && !conferencia.valor.livre) return recusa("horario_ocupado_no_calendario", FALAS_DA_AGENDA.horarioTomado);
			}
			const horario = {
				inicio: oferta.starts_at,
				fusoDoLead: await leitura.fusoDoLead(contexto.contaId, leadId),
				fusoDoEspecialista: oferta.fusoDoEspecialista
			};
			return {
				data: {
					meeting_id: null,
					starts_at: oferta.starts_at
				},
				speech: falarConfirmacao(horario, agora),
				plano: {
					pedido: {
						p_account_id: contexto.contaId,
						p_lead_id: leadId,
						p_specialist_id: oferta.specialist_id,
						p_starts_at: oferta.starts_at,
						p_ends_at: oferta.ends_at,
						p_modality: modalidade,
						p_notes: lerNotas(contexto.entrada.notes),
						p_booked_call_id: contexto.chamada.id
					},
					email: lerEmail(contexto.entrada.email)
				}
			};
		},
		async efeitos(contexto, leitura) {
			const plano = leitura.plano;
			if (leitura.ok === false || plano === void 0) return;
			const { resultado, reuniao_id } = await contexto.escrita.agendarReuniao(plano.pedido);
			if (resultado !== "agendada") {
				const fala = FALAS_DOS_CODIGOS.get(resultado);
				if (fala === void 0) throw new Error(`código desconhecido de agendar_reuniao: ${resultado}`);
				return {
					ok: false,
					data: { reason: resultado },
					speech: fala,
					erro: resultado
				};
			}
			if (reuniao_id === null) throw new Error("agendar_reuniao agendou sem devolver o id");
			await contexto.escrita.consumirOfertas(contexto.contaId, contexto.chamada.id);
			if (plano.email !== null) await contexto.escrita.preencherEmailDoLead(contexto.contaId, plano.pedido.p_lead_id, plano.email);
			await Promise.all([criarEventoSemDesfazer(contexto, reuniao_id), enviarConvitesSemDesfazer(contexto, reuniao_id)]);
			return {
				data: {
					meeting_id: reuniao_id,
					starts_at: plano.pedido.p_starts_at
				},
				speech: leitura.speech
			};
		}
	};
}
async function criarEventoSemDesfazer(contexto, reuniaoId) {
	const escrita = contexto.escrita;
	try {
		const reuniao = await escrita.reuniaoParaEvento(contexto.contaId, reuniaoId);
		if (reuniao === null) return;
		await criarEventoDaReuniao({
			reuniao,
			calendario: await escrita.calendarioParaEvento(contexto.contaId, reuniao.specialist_id),
			porta: escrita,
			agora: contexto.agora
		});
	} catch (erro) {
		escrita.registrarNoLog?.({
			funcao: "tool-book-meeting",
			passo: "evento_da_reuniao",
			reuniao: reuniaoId,
			erro: erro instanceof Error ? erro.message : String(erro)
		});
	}
}
async function enviarConvitesSemDesfazer(contexto, reuniaoId) {
	const escrita = contexto.escrita;
	try {
		const reuniao = await escrita.reuniaoParaConvite(contexto.contaId, reuniaoId);
		if (reuniao === null) return;
		await enviarConvitesDaReuniao({
			reuniao,
			email: await escrita.emailParaConvite(contexto.contaId),
			porta: escrita,
			agora: contexto.agora
		});
	} catch (erro) {
		escrita.registrarNoLog?.({
			funcao: "tool-book-meeting",
			passo: "convite_da_reuniao",
			reuniao: reuniaoId,
			erro: erro instanceof Error ? erro.message : String(erro)
		});
	}
}
//#endregion
//#region supabase/functions/tool-book-meeting/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CHAVE_DE_FERRAMENTAS = await segredoDaInstalacao({
	definido: Deno.env.get("SARAH_TOOL_SERVER_KEY"),
	chaveDeServico: CHAVE_DE_SERVICO,
	rotulo: ROTULO_DA_CHAVE_DE_FERRAMENTAS
});
const CHAVE_ANTERIOR = Deno.env.get("SARAH_TOOL_SERVER_KEY_ANTERIOR") ?? null;
const ROTACIONADA_EM = (() => {
	const bruto = Deno.env.get("SARAH_TOOL_SERVER_KEY_ROTACIONADA_EM") ?? "";
	const instante = Date.parse(bruto);
	return Number.isFinite(instante) ? instante : null;
})();
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const CLIENTE_ID = Deno.env.get("SARAH_GOOGLE_CLIENT_ID") ?? "";
const CLIENTE_SEGREDO = Deno.env.get("SARAH_GOOGLE_CLIENT_SECRET") ?? "";
const PRAZO_DO_CALENDARIO_MS = 1500;
const PRAZO_DO_EVENTO_MS = 1500;
const PRAZO_DO_CONVITE_MS = 1500;
const CABECALHOS = {
	"content-type": "application/json; charset=utf-8",
	"cache-control": "no-store"
};
const servico = createClient(URL_DO_SUPABASE, CHAVE_DE_SERVICO, { auth: {
	persistSession: false,
	autoRefreshToken: false
} });
const porta = criarPortaDeFerramentas(servico);
function falhou(error) {
	if (error) throw new Error(error.message);
}
const contaDoCalendario = new Map();
const lerPlataforma = criarLeitorDaPlataforma(Deno.env.toObject());
const cofre = criarCofreDeCredenciais({
	porta: {
		async segredoDaConta(contaId, provedor, chave) {
			const { data, error } = await servico.rpc("get_account_secret", {
				p_account_id: contaId,
				p_provider: provedor,
				p_key_name: chave
			});
			falhou(error);
			return typeof data === "string" ? data : null;
		},
		async segredoDoRecurso(recurso) {
			if (recurso.tipo !== "specialist_calendars") return null;
			const contaId = contaDoCalendario.get(recurso.id);
			if (!contaId) return null;
			const { data, error } = await servico.rpc("token_do_calendario", {
				p_account_id: contaId,
				p_calendar_id: recurso.id
			});
			falhou(error);
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
const leitura = {
	async ofertaDaChamada(contaId, chamadaId, posicao) {
		const { data, error } = await servico.from("call_slot_offers").select("position, specialist_id, starts_at, ends_at, expires_at, specialists(timezone)").eq("account_id", contaId).eq("call_id", chamadaId).eq("position", posicao).maybeSingle();
		falhou(error);
		const linha = data;
		if (linha === null || linha.specialists === null) return null;
		return {
			position: linha.position,
			specialist_id: linha.specialist_id,
			starts_at: linha.starts_at,
			ends_at: linha.ends_at,
			expires_at: linha.expires_at,
			fusoDoEspecialista: linha.specialists.timezone
		};
	},
	async fusoDoLead(contaId, leadId) {
		const [lead, conta] = await Promise.all([servico.from("leads").select("timezone").eq("account_id", contaId).eq("id", leadId).maybeSingle(), servico.from("accounts").select("timezone").eq("id", contaId).single()]);
		falhou(lead.error);
		falhou(conta.error);
		return lead.data?.timezone?.trim() || conta.data.timezone;
	},
	async calendarioDoEspecialista(contaId, especialistaId) {
		const aberto = await abrirCalendario(contaId, especialistaId, PRAZO_DO_CALENDARIO_MS);
		return aberto === null || "ok" in aberto ? null : aberto;
	}
};
async function abrirCalendario(contaId, especialistaId, prazoMs) {
	const { data, error } = await servico.from("specialist_calendars").select("id, provider, external_id, specialists(timezone)").eq("account_id", contaId).eq("specialist_id", especialistaId).eq("provider", "google").maybeSingle();
	falhou(error);
	const linha = data;
	if (linha === null) return null;
	if (!CLIENTE_ID || !CLIENTE_SEGREDO) return falhaDoCalendario("sem_permissao_de_calendario");
	contaDoCalendario.set(linha.id, contaId);
	const token = await resolverTokenDoCalendario(cofre, {
		id: linha.id,
		contaId
	});
	if (!token.ok) return token;
	return protegerPorta(criarCalendarioDoGoogle({
		buscar: fetch,
		clienteId: CLIENTE_ID,
		clienteSegredo: CLIENTE_SEGREDO,
		tokenDeAtualizacao: token.token,
		agendaId: linha.external_id,
		fuso: linha.specialists?.timezone ?? "America/Sao_Paulo",
		prazoMs
	}));
}
const escrita = {
	async agendarReuniao(pedido) {
		const { data, error } = await servico.rpc("agendar_reuniao", { ...pedido });
		falhou(error);
		const [linha] = data ?? [];
		if (!linha) throw new Error("agendar_reuniao não devolveu linha");
		return linha;
	},
	async consumirOfertas(contaId, chamadaId) {
		const { error } = await servico.from("call_slot_offers").delete().eq("account_id", contaId).eq("call_id", chamadaId);
		falhou(error);
	},
	async preencherEmailDoLead(contaId, leadId, email) {
		const { error } = await servico.from("leads").update({ email }).eq("account_id", contaId).eq("id", leadId).is("email", null);
		falhou(error);
	},
	async reuniaoParaEvento(contaId, reuniaoId) {
		const { data, error } = await servico.from("meetings").select(SELECAO_DA_REUNIAO_PARA_EVENTO).eq("account_id", contaId).eq("id", reuniaoId).maybeSingle();
		falhou(error);
		return data === null ? null : lerReuniaoParaEvento(data);
	},
	async reuniaoParaConvite(contaId, reuniaoId) {
		const { data, error } = await servico.from("meetings").select(SELECAO_DA_REUNIAO_PARA_CONVITE).eq("account_id", contaId).eq("id", reuniaoId).maybeSingle();
		falhou(error);
		return data === null ? null : lerReuniaoParaConvite(data);
	},
	emailParaConvite(contaId) {
		return abrirEmailDaConta(cofre, contaId, {
			buscar: fetch,
			prazoMs: PRAZO_DO_CONVITE_MS
		});
	},
	async gravarEnvioDoConvite(contaId, reuniaoId, lado, enviadoEm) {
		const { error } = await servico.from("meetings").update(atualizacaoDoEnvio(lado, enviadoEm)).eq("account_id", contaId).eq("id", reuniaoId).is(colunasDoConvite(lado).enviadoEm, null);
		falhou(error);
	},
	async registrarPendenciaDoConvite(contaId, reuniaoId, lado, pendencia) {
		const { error } = await servico.from("meetings").update(atualizacaoDaPendencia(lado, pendencia)).eq("account_id", contaId).eq("id", reuniaoId).is(colunasDoConvite(lado).enviadoEm, null);
		falhou(error);
	},
	calendarioParaEvento(contaId, especialistaId) {
		return abrirCalendario(contaId, especialistaId, PRAZO_DO_EVENTO_MS);
	},
	async gravarEvento(contaId, reuniaoId, externalEventId) {
		const { error } = await servico.from("meetings").update({
			external_event_id: externalEventId,
			event_error: null,
			event_retry_at: null
		}).eq("account_id", contaId).eq("id", reuniaoId).is("external_event_id", null);
		falhou(error);
	},
	async registrarFalhaDoEvento(contaId, reuniaoId, falha) {
		const { error } = await servico.from("meetings").update({
			event_attempts: falha.tentativas,
			event_error: falha.erro,
			event_retry_at: falha.proximaTentativa
		}).eq("account_id", contaId).eq("id", reuniaoId).is("external_event_id", null);
		falhou(error);
	},
	async esquecerEvento(contaId, reuniaoId) {
		const { error } = await servico.from("meetings").update({ external_event_id: null }).eq("account_id", contaId).eq("id", reuniaoId);
		falhou(error);
	},
	registrarNoLog(evento) {
		console.warn(JSON.stringify(evento));
	}
};
const tratar = criarToolBookMeeting(leitura);
const ambiente = {
	porta,
	escrita,
	chaves: {
		vigente: CHAVE_DE_FERRAMENTAS,
		anterior: CHAVE_ANTERIOR,
		rotacionadaEm: ROTACIONADA_EM
	}
};
Deno.serve(async (requisicao) => {
	let corpo = null;
	try {
		corpo = await requisicao.json();
	} catch {
		corpo = null;
	}
	const resposta = await tratar({
		metodo: requisicao.method,
		segredo: requisicao.headers.get("x-tool-secret"),
		conversa: requisicao.headers.get(CABECALHO_DA_CONVERSA),
		corpo
	}, ambiente);
	return new Response(JSON.stringify(resposta.corpo), {
		status: resposta.status,
		headers: CABECALHOS
	});
});
//#endregion
