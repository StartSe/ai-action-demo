// @ts-nocheck
// Gerado por scripts/pacote-de-instalacao.ts a partir de
// supabase/functions/cron-meeting-invite/index.ts. Não edite à mão: rode `npm run pacote`.
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
function dois(valor) {
	return String(valor).padStart(2, "0");
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
const NOME_DA_MODALIDADE = {
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
		`Modalidade: ${NOME_DA_MODALIDADE[dados.modalidade]}`,
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
function lerJson(texto) {
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
			const corpo = lerJson(await resposta.text());
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
//#region supabase/functions/cron-meeting-invite/reenvio.ts
const NOME_DA_ROTINA = "cron-meeting-invite";
function reenviarConvites(pedido) {
	const { porta } = pedido;
	return executarRotina({
		nome: NOME_DA_ROTINA,
		porta: pedido.execucao,
		agora: pedido.agora,
		trabalho: {
			async reivindicar(limite, instante) {
				return (await porta.reivindicarReunioes(limite, instante, TETO_DE_TENTATIVAS)).map((id) => ({ chave: id }));
			},
			async processar(item, instante) {
				const reuniao = await porta.reuniaoParaConvite(item.chave);
				if (reuniao === null) return;
				await enviarConvitesDaReuniao({
					reuniao,
					email: await porta.emailParaConvite(reuniao.account_id),
					porta,
					agora: () => Date.parse(instante)
				});
			}
		}
	});
}
async function atenderRotina(pedido, reenvio, opcoes) {
	if (pedido.metodo.toUpperCase() !== "POST") return {
		status: 405,
		corpo: { ok: false }
	};
	if (!await segredoDaRotinaConfere(pedido.segredo, opcoes.segredoInterno)) return {
		status: 401,
		corpo: { ok: false }
	};
	const resultado = await reenviarConvites(reenvio);
	return {
		status: resultado.ok ? 200 : 500,
		corpo: { ...resultado }
	};
}
//#endregion
//#region supabase/functions/cron-meeting-invite/index.ts
const URL_DO_SUPABASE = Deno.env.get("SUPABASE_URL") ?? "";
const CHAVE_DE_SERVICO = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AMBIENTE = lerAmbiente(Deno.env.get("SARAH_AMBIENTE"));
const segredoInterno = leitorDoSegredoInterno({
	definido: Deno.env.get("SARAH_INTERNAL_SECRET"),
	lerDoCofre: () => lerSegredoDoCofre(servico)
});
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
	async reivindicarReunioes(limite, instante, teto) {
		const { data, error } = await servico.rpc("reivindicar_convites_para_enviar", {
			p_limite: limite,
			p_instante: instante,
			p_teto: teto
		});
		if (error) throw new Error(error.message);
		return (data ?? []).map((linha) => typeof linha === "string" ? linha : String(linha.reivindicar_convites_para_enviar));
	},
	async reuniaoParaConvite(reuniaoId) {
		const { data, error } = await servico.from("meetings").select(SELECAO_DA_REUNIAO_PARA_CONVITE).eq("id", reuniaoId).maybeSingle();
		if (error) throw new Error(error.message);
		return data === null ? null : lerReuniaoParaConvite(data);
	},
	emailParaConvite(contaId) {
		return abrirEmailDaConta(cofre, contaId, {
			buscar: fetch,
			prazoMs: PRAZO_DO_PROVEDOR_MS
		});
	},
	async gravarEnvioDoConvite(contaId, reuniaoId, lado, enviadoEm) {
		const { error } = await servico.from("meetings").update(atualizacaoDoEnvio(lado, enviadoEm)).eq("account_id", contaId).eq("id", reuniaoId).is(colunasDoConvite(lado).enviadoEm, null);
		if (error) throw new Error(error.message);
	},
	async registrarPendenciaDoConvite(contaId, reuniaoId, lado, pendencia) {
		const { error } = await servico.from("meetings").update(atualizacaoDaPendencia(lado, pendencia)).eq("account_id", contaId).eq("id", reuniaoId).is(colunasDoConvite(lado).enviadoEm, null);
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
