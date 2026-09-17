// Configuração de exemplo (para o app já funcionar ao abrir, sem nenhuma chave configurada) e
// resposta local sem IA: uma busca simples na base de conhecimento, reformulada no tom configurado
// em vez de devolver o trecho da base copiado ao pé da letra.
import type { Config, PapelMensagem, StatusConversa, Tom } from "./types";

export function esperar(ms = 900) {
  return new Promise((r) => setTimeout(r, ms));
}

const STOPWORDS = new Set(
  `a o as os de da do das dos e é um uma uns umas para com que em no na nos nas por se como qual quais quanto
   quanta quantos quantas tem têm voce voces você vocês seu sua seus suas meu minha meus minhas ao aos à às ou
   mas também muito mais menos este esta esses essas isso isto aquele aquela aqueles aquelas eu tu ele ela nós
   eles elas me te lhe nos vos lhes ja já ainda ate até quando onde porque pq the sim nao não ta tá pra pro dá
   pode posso poderia gostaria queria quero preciso favor obrigado obrigada oi ola olá bom dia boa tarde noite`
    .split(/\s+/)
    .filter(Boolean)
);

function normalizar(texto: string): string[] {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function trechos(base: string): string[] {
  const blocos = String(base || "")
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const lista: string[] = [];
  for (const bloco of blocos) {
    const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
    if (linhas.length > 1 && linhas.some((l) => l.startsWith("-"))) {
      for (const linha of linhas) {
        const semTraco = linha.replace(/^-+\s*/, "");
        if (semTraco) lista.push(semTraco);
      }
    } else {
      lista.push(bloco.replace(/\s*\n\s*/g, " "));
    }
  }
  return lista;
}

function prefixoTom(tom: Tom): string {
  switch (tom) {
    case "direto":
      return "";
    case "descontraido":
      return "Boa pergunta! ";
    default:
      return "Claro! ";
  }
}

function mensagemNaoSei(config: Config): string {
  const horario = config.horario || "nosso horário de atendimento";
  switch (config.naoSei) {
    case "contato":
      return "Essa eu preciso confirmar com calma. Pode me passar seu e-mail e telefone que alguém da equipe retorna em breve?";
    case "site":
      return "Essa informação está com mais detalhes no nosso site. Dá uma olhada por lá, e qualquer dúvida é só chamar de novo!";
    default:
      return `Essa pergunta é melhor respondida por alguém da equipe. Já vou encaminhar para um atendente humano falar com você (${horario}).`;
  }
}

/**
 * Reformula um trecho da base de conhecimento em algo parecido com uma resposta falada, em vez de
 * devolver o trecho copiado ao pé da letra: perguntas frequentes ("Pergunta? Resposta") viram só a
 * resposta, e fatos no formato "Rótulo: valor" ganham uma frase de ligação antes do valor.
 */
function reformular(trecho: string, tom: Tom): string {
  const pontoDeInterrogacao = trecho.indexOf("?");
  if (pontoDeInterrogacao > -1 && pontoDeInterrogacao < trecho.length - 1) {
    return `${prefixoTom(tom)}${trecho.slice(pontoDeInterrogacao + 1).trim()}`;
  }
  const doisPontos = trecho.indexOf(":");
  if (doisPontos > -1) {
    const rotulo = trecho.slice(0, doisPontos).trim();
    const valor = trecho.slice(doisPontos + 1).trim();
    const rotuloMinusculo = rotulo.charAt(0).toLowerCase() + rotulo.slice(1);
    return `${prefixoTom(tom)}Sobre ${rotuloMinusculo}: ${valor}`;
  }
  return `${prefixoTom(tom)}${trecho}`;
}

/** Resposta sem IA: busca o trecho da base de conhecimento com mais palavras em comum com a pergunta. */
export function respostaLocal(texto: string, config: Config): { resposta: string; transferir: boolean } {
  const candidatos = trechos(config.baseConhecimento);
  const tokensPergunta = normalizar(texto);
  // Exige que ao menos metade das palavras relevantes da pergunta apareçam no trecho,
  // para não casar por uma única palavra comum (ex.: "cirurgia" aparecendo por acaso em outro assunto).
  const limite = Math.max(1, Math.ceil(tokensPergunta.length * 0.5));
  let melhor: string | null = null;
  let melhorScore = 0;
  for (const trecho of candidatos) {
    const tokensTrecho = new Set(normalizar(trecho));
    let score = 0;
    for (const t of tokensPergunta) if (tokensTrecho.has(t)) score++;
    if (score > melhorScore) {
      melhorScore = score;
      melhor = trecho;
    }
  }
  if (!melhor || melhorScore < limite) {
    return { resposta: mensagemNaoSei(config), transferir: true };
  }
  return { resposta: reformular(melhor, config.tom), transferir: false };
}

export const configExemplo: Config = {
  negocio: "Sorriso Pleno Odontologia",
  atendente: "Bia",
  tom: "cordial",
  horario: "segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia",
  naoSei: "humano",
  baseConhecimento: `Sobre a clínica: a Sorriso Pleno Odontologia fica na Rua das Flores, 120, no Jardim América, em São Paulo. Atendemos há 12 anos com foco em odontologia geral, estética e ortodontia.

Horário de atendimento humano: segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia. Fora desse horário, o atendente automático continua respondendo.

Serviços e preços:
- Consulta e avaliação inicial: R$ 120 (fica gratuita para quem fechar tratamento)
- Limpeza (profilaxia): R$ 150
- Clareamento dental a laser: R$ 900 em 3 sessões
- Aparelho ortodôntico metálico: a partir de R$ 2.400, mais manutenção mensal de R$ 180
- Aparelho invisível (alinhador): a partir de R$ 6.500, parcelado em até 12x
- Extração de dente do siso: R$ 450 por unidade
- Implante dentário: a partir de R$ 3.200 por unidade, com avaliação obrigatória antes do orçamento fechado

Prazos:
- O resultado do clareamento aparece depois da 2ª sessão, em cerca de 2 semanas
- O tratamento ortodôntico dura de 18 a 30 meses, dependendo do caso
- Implantes levam de 4 a 6 meses entre a cirurgia e a prótese final

Formas de pagamento: dinheiro, PIX, cartão de crédito em até 12x sem juros e convênios odontológicos (Odontoprev e Amil Dental). Não trabalhamos com reembolso de plano de saúde.

Cancelamento e remarcação: pedimos aviso com pelo menos 4 horas de antecedência. Faltas sem aviso podem gerar cobrança de 50% do valor da consulta.

Perguntas frequentes:
- Vocês atendem urgência? Sim, todos os dias, inclusive fins de semana, mediante confirmação por telefone.
- Tem estacionamento? Sim, conveniado no prédio ao lado, com desconto para pacientes.
- Posso levar meu filho? Sim, atendemos odontopediatria a partir dos 2 anos de idade.
- Fazem clareamento em quem tem restauração? Depende do caso, é avaliado na consulta inicial.`,
};

// --- Conversas de exemplo (modo demonstração) -------------------------------------------------
// Sem número da empresa conectado e sem nenhuma conversa real, o app se abre com estas nove
// conversas, gravadas uma única vez (lib/conversas.ts:semearExemplosSeVazio). Elas são apagadas
// sozinhas na primeira mensagem real do WhatsApp, e à mão pelo link do cartão em Configurações.
// São da mesma clínica de `configExemplo`, para as respostas combinarem com a base de conhecimento.

export const AVISO_CONVERSAS_EXEMPLO = "Você está vendo conversas de exemplo. Conecte o número da empresa para ver as reais.";

/** Ação dos avisos de modo demonstração: onde a pessoa conecta o número da empresa. */
export const ACAO_CONECTAR_NUMERO = { rotulo: "Conectar o número da empresa", url: "/setup#whatsapp" };

export interface MensagemExemplo {
  papel: PapelMensagem;
  texto: string;
  /** Quantos minutos antes de "agora" a mensagem chegou: é o que espalha as conversas pelos últimos 7 dias. */
  atras: number;
}

export interface ConversaExemplo {
  numero: string;
  nome: string;
  /** Status gravado. Uma conversa `ia` parada há mais de 24 h é LIDA como resolvida (lib/conversas.ts). */
  status: StatusConversa;
  assunto: string;
  naoLidas?: number;
  mensagens: MensagemExemplo[];
}

const HORA = 60;
const DIA = 24 * HORA;

/**
 * As nove conversas de exemplo, da mais recente para a mais antiga. Seis ficam gravadas como `ia`:
 * cinco com mensagem do cliente nas últimas 24 h (aparecem como "Atendida pela IA") e a da Camila
 * Souza parada há três dias, que a leitura mostra como "Resolvida". As outras três são duas
 * "Precisa de atenção" e uma "Em atendimento humano", com uma mensagem ainda não lida.
 */
export function conversasExemplo(): ConversaExemplo[] {
  return [
    {
      numero: "5511988761234",
      nome: "Mariana Costa",
      status: "ia",
      assunto: "Agendamentos",
      mensagens: [
        { papel: "cliente", texto: "Oi! Vocês têm horário para limpeza esta semana?", atras: 50 },
        { papel: "atendente", texto: "Claro! Temos quinta às 9h e sexta às 14h. Qual fica melhor para você?", atras: 49 },
        { papel: "cliente", texto: "Quinta às 9h está ótimo.", atras: 46 },
        { papel: "atendente", texto: "Perfeito, Mariana. Anotei quinta às 9h para a limpeza. Se precisar mudar, avise com pelo menos 4 horas de antecedência.", atras: 45 },
      ],
    },
    {
      numero: "5511991234567",
      nome: "Ana Paula",
      status: "humano",
      assunto: "Tratamentos",
      naoLidas: 1,
      mensagens: [
        { papel: "cliente", texto: "Fiz um implante em outra clínica e está doendo. Vocês avaliam?", atras: 1 * DIA + 2 * HORA },
        { papel: "atendente", texto: "Sinto muito, Ana Paula. Avaliamos sim: a consulta de avaliação custa R$ 120 e fica gratuita para quem fechar tratamento.", atras: 1 * DIA + 2 * HORA - 1 },
        { papel: "cliente", texto: "Consigo hoje? A dor aumentou à noite.", atras: 4 * HORA },
        { papel: "humano", texto: "Oi, Ana Paula, aqui é a recepção. Consigo te encaixar hoje às 17h30 com a Dra. Helena.", atras: 3 * HORA },
        { papel: "cliente", texto: "Perfeito, obrigada! Vou levar a radiografia que fiz na outra clínica.", atras: 2 * HORA },
      ],
    },
    {
      numero: "5511987654321",
      nome: "Carlos Menezes",
      status: "atencao",
      assunto: "Preços",
      mensagens: [
        { papel: "cliente", texto: "Bom dia! Quanto custa o clareamento?", atras: 3 * DIA },
        { papel: "atendente", texto: "Bom dia! O clareamento dental a laser sai por R$ 900, em 3 sessões.", atras: 3 * DIA - 1 },
        { papel: "cliente", texto: "E dá para parcelar em 10 vezes no boleto?", atras: 3 * HORA + 10 },
        {
          papel: "atendente",
          texto: "Essa pergunta é melhor respondida por alguém da equipe. Já vou encaminhar para um atendente humano falar com você (segunda a sexta, das 8h às 18h).",
          atras: 3 * HORA,
        },
      ],
    },
    {
      numero: "5511996543210",
      nome: "Ricardo Lima",
      status: "ia",
      assunto: "Horário de atendimento",
      mensagens: [
        { papel: "cliente", texto: "Vocês abrem no sábado?", atras: 6 * HORA + 2 },
        { papel: "atendente", texto: "Sim! Aos sábados atendemos das 8h ao meio-dia.", atras: 6 * HORA },
      ],
    },
    {
      numero: "5511993456789",
      nome: "Fernanda Alves",
      status: "ia",
      assunto: "Agendamentos",
      mensagens: [
        { papel: "cliente", texto: "Oi, preciso remarcar minha consulta de terça.", atras: 5 * DIA },
        { papel: "atendente", texto: "Sem problema, Fernanda. Consigo remarcar para quinta às 10h ou sexta às 16h.", atras: 5 * DIA - 2 },
        { papel: "cliente", texto: "Pode ser sexta às 16h.", atras: 13 * HORA },
        { papel: "atendente", texto: "Combinado. Sua consulta ficou para sexta às 16h.", atras: 12 * HORA },
      ],
    },
    {
      numero: "5511992345678",
      nome: "João Pedro",
      status: "ia",
      assunto: "Preços",
      mensagens: [
        { papel: "cliente", texto: "Quanto fica o aparelho invisível?", atras: 20 * HORA + 6 },
        { papel: "atendente", texto: "O aparelho invisível começa em R$ 6.500, parcelado em até 12x sem juros.", atras: 20 * HORA + 5 },
        { papel: "cliente", texto: "Precisa de avaliação antes?", atras: 20 * HORA + 1 },
        { papel: "atendente", texto: "Precisa sim: a avaliação inicial custa R$ 120 e fica gratuita para quem fechar tratamento.", atras: 20 * HORA },
      ],
    },
    {
      numero: "5511995678901",
      nome: "Eduardo Santos",
      status: "ia",
      assunto: "Outros",
      mensagens: [
        { papel: "cliente", texto: "Tem estacionamento aí?", atras: 22 * HORA + 3 },
        { papel: "atendente", texto: "Tem sim: no prédio ao lado, conveniado, com desconto para pacientes.", atras: 22 * HORA },
      ],
    },
    {
      numero: "5511994567890",
      nome: "Luciana Ferraz",
      status: "atencao",
      assunto: "Tratamentos",
      mensagens: [
        { papel: "cliente", texto: "Faço clareamento tendo restauração na frente?", atras: 2 * DIA + 5 * HORA },
        { papel: "atendente", texto: "Depende do caso: isso é avaliado na consulta inicial.", atras: 2 * DIA + 5 * HORA - 1 },
        { papel: "cliente", texto: "E se a restauração for de porcelana? Meu dentista antigo disse que mancha.", atras: 2 * DIA + 3 * HORA },
        {
          papel: "atendente",
          texto: "Essa pergunta é melhor respondida por alguém da equipe. Já vou encaminhar para um atendente humano falar com você (segunda a sexta, das 8h às 18h).",
          atras: 2 * DIA + 3 * HORA - 1,
        },
      ],
    },
    {
      numero: "5511997654321",
      nome: "Camila Souza",
      status: "ia",
      assunto: "Agendamentos",
      mensagens: [
        { papel: "cliente", texto: "Boa tarde! Meu filho tem 4 anos, vocês atendem crianças?", atras: 6 * DIA },
        { papel: "atendente", texto: "Boa tarde! Atendemos odontopediatria a partir dos 2 anos de idade.", atras: 6 * DIA - 2 },
        { papel: "cliente", texto: "Ótimo. Consigo marcar para a terça da semana que vem?", atras: 3 * DIA + 40 },
        { papel: "atendente", texto: "Consigo sim: terça às 15h com a odontopediatra. Posso confirmar?", atras: 3 * DIA + 39 },
        { papel: "cliente", texto: "Obrigado pelo atendimento!", atras: 3 * DIA + 35 },
        { papel: "atendente", texto: "Nós que agradecemos, Camila. Até terça!", atras: 3 * DIA + 34 },
      ],
    },
  ];
}

/**
 * true quando a lista tem só conversas de exemplo — é quando as telas mostram o aviso acima. Recebe
 * qualquer lista com o campo `exemplo` (registros antigos de `/r/[id]` não têm o campo e contam como
 * conversas reais, que é o que eram).
 */
export function soConversasDeExemplo(conversas: { exemplo?: boolean }[]): boolean {
  return conversas.length > 0 && conversas.every((c) => c.exemplo === true);
}
