// Configuração de exemplo (para o app já funcionar ao abrir, sem nenhuma chave configurada) e
// resposta local sem IA: uma busca simples na base de conhecimento, reformulada no tom configurado
// em vez de devolver o trecho da base copiado ao pé da letra.
import { ASSUNTO_OUTROS, assuntosDoObjetivo, semAcento } from "./assuntos";
import type { MotivoTransferencia } from "./transferencia";
import { MODELOS_GRATUITOS } from "./modelos";
import { FERRAMENTAS_PADRAO, MIDIA_PADRAO, type Config, type DetalhesResposta, type Objetivo, type PapelMensagem, type StatusConversa, type TipoAnexo, type Tom } from "./types";

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
  return semAcento(texto)
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
    case "profissional":
      return "";
    case "personalizado":
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
/**
 * O trecho da base de conhecimento mais parecido com a pergunta, por palavras em comum, e se ele é
 * parecido o BASTANTE para responder (metade das palavras relevantes da pergunta, no mínimo uma — sem
 * isso, uma palavra comum por acaso em outro assunto casaria).
 *
 * Duas coisas diferentes usam esta escolha: `respostaLocal`, que responde por ela quando não há IA, e
 * o bloco "Por que respondeu assim" (lib/atendente.ts), que mostra o trecho mais parecido para a
 * pessoa saber ONDE mexer na base. No segundo caso ele NÃO é uma afirmação sobre o que o modelo usou
 * (a base vai inteira no prompt): é o pedaço que tem a ver com a pergunta.
 */
export function trechoMaisParecido(base: string, pergunta: string): { trecho: string | null; bastante: boolean } {
  const candidatos = trechos(base);
  const tokensPergunta = normalizar(pergunta);
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
  return { trecho: melhor, bastante: Boolean(melhor) && melhorScore >= limite };
}

export function respostaLocal(texto: string, config: Config): { resposta: string; transferir: boolean; trecho?: string } {
  const { trecho: melhor, bastante } = trechoMaisParecido(config.baseConhecimento, texto);
  if (!melhor || !bastante) {
    return { resposta: mensagemNaoSei(config), transferir: true };
  }
  // O trecho escolhido volta junto: sem IA, é ele a única "fonte" da resposta, e é o que o bloco
  // "Por que respondeu assim" mostra (lib/atendente.ts).
  return { resposta: reformular(melhor, config.tom), transferir: false, trecho: melhor };
}

// --- Assunto da conversa sem IA ---------------------------------------------------------------
// A mesma ideia da resposta local: com a chave da IA configurada quem separa por assunto é
// lib/atendente.ts:classificarConversa; sem ela, estas palavras. A lista de assuntos vem de
// lib/assuntos.ts, derivada do objetivo escolhido em Configurações.

/**
 * O que costuma aparecer na mensagem de quem está falando de cada assunto, sem acento e em
 * minúsculas (é assim que o texto do cliente chega para a comparação). Cada palavra é procurada no
 * COMEÇO de uma palavra da mensagem, e o fim dela fica solto de propósito: "parcel" cobre parcelar,
 * parcelado e parcelamento, e "marcar" não casa dentro de "remarcar". Assuntos de objetivos
 * diferentes convivem aqui; só entram na conta os que estiverem na lista do objetivo escolhido.
 */
const PALAVRAS_DO_ASSUNTO: Record<string, string[]> = {
  Preços: ["preco", "quanto custa", "quanto fica", "quanto sai", "quanto voces cobram", "cobram", "custa", "custo", "valor", "orcamento", "reais"],
  "Horário de atendimento": [
    "horario de atendimento",
    "horario de funcionamento",
    "que horas",
    "abre",
    "abrem",
    "fecha",
    "fecham",
    "aberto",
    "funcionam",
    "sabado",
    "domingo",
    "feriado",
    "plantao",
  ],
  "Produtos e serviços": ["servico", "produto", "voces fazem", "fazem ", "faz ", "oferecem", "vendem", "trabalham com", "tratamento", "modelo", "tamanho", "como funciona"],
  "Localização e contato": ["endereco", "onde fica", "onde voces", "localiza", "como chego", "como chegar", "estacionamento", "bairro", "rua ", "telefone", "mail", "mapa"],
  Reclamações: ["reclama", "problema", "defeito", "insatisfeit", "pessimo", "nao funciona", "nao chegou", "atraso", "demora", "quero meu dinheiro", "doendo", "mal atendid"],
  "Formas de pagamento": ["pagamento", "pagar", "parcel", "cartao", "pix", "boleto", "dinheiro", "convenio", "debito", "credito", "a vista", "juros"],
  Promoções: ["promoc", "desconto", "oferta", "cupom", "liquidacao", "black friday", "combo", "condicao especial"],
  Agendamentos: ["agendar", "agendamento", "marcar", "tem horario", "horario para", "disponibilidade", "encaixe", "vaga", "reservar"],
  Remarcações: ["remarcar", "remarcac", "desmarcar", "adiar", "mudar o horario", "trocar o horario", "cancelar a consulta", "cancelar o horario"],
};

/**
 * O assunto da conversa sem IA: ganha o assunto cujas palavras mais aparecem nas mensagens do
 * cliente, e só quem não tem nenhuma palavra em comum cai em "Outros". Empate fica com o primeiro
 * da lista, que é o assunto mais comum.
 */
export function classificarLocal(textos: string[], objetivo: Objetivo): string {
  // Pontuação vira espaço e a frase inteira ganha espaço nas pontas: assim procurar " marcar"
  // encontra a palavra no começo dela, e não no meio de "remarcar".
  const texto = ` ${semAcento(textos.join(" ")).replace(/[^a-z0-9]+/g, " ")} `;
  let melhor = ASSUNTO_OUTROS;
  let melhorScore = 0;
  for (const assunto of assuntosDoObjetivo(objetivo)) {
    let score = 0;
    for (const palavra of PALAVRAS_DO_ASSUNTO[assunto] ?? []) if (texto.includes(` ${palavra}`)) score++;
    if (score > melhorScore) {
      melhorScore = score;
      melhor = assunto;
    }
  }
  return melhor;
}

/**
 * Perguntas de cliente que a empresa de exemplo oferece como atalho: uma que a base responde (preço),
 * uma sobre horário e uma de propósito fora do que a clínica faz, para mostrar o que acontece quando o
 * atendente não sabe. Elas são as `perguntasSugeridas` de `configExemplo` — quem configurou o próprio
 * atendente tem as dele, e o passo 2 só cai nestas quando a configuração não traz nenhuma.
 */
export const PERGUNTAS_EXEMPLO = ["Quanto custa o clareamento dental?", "Vocês atendem aos sábados?", "Fazem cirurgia cardíaca?"];

export const configExemplo: Config = {
  negocio: "Sorriso Pleno Odontologia",
  atendente: "Bia",
  objetivo: "atendimento",
  tom: "profissional",
  saudacao: "Olá! Eu sou Bia, da Sorriso Pleno Odontologia. Posso falar sobre tratamentos, preços e horários. Como posso ajudar?",
  perguntasSugeridas: [...PERGUNTAS_EXEMPLO],
  horario: "segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia",
  naoSei: "humano",
  midia: { ...MIDIA_PADRAO },
  ferramentas: { ...FERRAMENTAS_PADRAO },
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

/**
 * Mesmo aviso depois que o número já está conectado: a demonstração continua na tela até o primeiro
 * cliente escrever (é a primeira mensagem real que apaga os exemplos, ver semearExemplosSeVazio), e sem
 * esta frase o app parecia não ter saído da demonstração mesmo com o número ligado.
 */
export const AVISO_CONVERSAS_EXEMPLO_CONECTADO =
  "O número da empresa já está conectado. Estas conversas ainda são de exemplo: elas somem sozinhas quando o primeiro cliente escrever, ou você pode apagá-las agora.";

/** Ação dos avisos de modo demonstração: onde a pessoa conecta o número da empresa. */
export const ACAO_CONECTAR_NUMERO = { rotulo: "Conectar o número da empresa", url: "/setup#whatsapp" };

/** Rótulo e pergunta de confirmação de quem apaga a demonstração pela própria tela (o mesmo que o link do cartão do WhatsApp em Configurações faz). */
export const ROTULO_APAGAR_EXEMPLOS = "Apagar as conversas de exemplo";
export const CONFIRMAR_APAGAR_EXEMPLOS = "Apagar as conversas de exemplo? Elas não voltam, e as telas ficam vazias até o primeiro cliente escrever.";

/**
 * O áudio ou a foto de uma conversa de exemplo. O arquivo mora em `public/exemplos` e a demonstração
 * nunca baixa nada de fora: o endereço guardado é o do próprio app (lib/conversas.ts:semearExemplosSeVazio).
 */
export interface AnexoExemplo {
  tipo: TipoAnexo;
  /** Endereço do arquivo dentro do app, como "/exemplos/audio-cliente.ogg". */
  arquivo: string;
  mime: string;
  nome: string;
  /** Duração do áudio, em segundos. */
  segundos?: number;
  /** Legenda escrita pelo cliente; quando existe, ela é o texto da mensagem. */
  legenda?: string;
  /** O que o atendente ouviu ou viu neste anexo (lib/midia.ts): a demonstração já mostra o recurso. */
  transcricao?: string;
}

export interface MensagemExemplo {
  papel: PapelMensagem;
  texto: string;
  /** O que veio junto desta mensagem quando ela não foi só texto. */
  anexo?: AnexoExemplo;
  /** Quantos minutos antes de "agora" a mensagem chegou: é o que espalha as conversas pelos últimos 7 dias. */
  atras: number;
  /**
   * Como esta resposta foi montada (o bloco "Por que respondeu assim" da bolha). Só em algumas
   * respostas de exemplo: a demonstração mostra o recurso antes de existir qualquer chave de IA.
   */
  detalhes?: DetalhesResposta;
  /**
   * Quanto o atendente levou para escrever esta resposta, em milissegundos (só nas respostas). É o que
   * alimenta o "tempo médio de resposta" de lib/metricas.ts no modo demonstração: `atras` é contado em
   * minutos e não daria para expressar os poucos segundos que a IA leva. A resposta escrita por uma
   * pessoa leva minutos, de propósito.
   */
  respostaMs?: number;
}

export interface ConversaExemplo {
  numero: string;
  nome: string;
  /** Status gravado. Uma conversa `ia` parada há mais de 24 h é LIDA como resolvida (lib/conversas.ts). */
  status: StatusConversa;
  /** Por que a IA passou a conversa para uma pessoa (só nas de status `atencao`). */
  motivo?: MotivoTransferencia;
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
/** O modelo que o app usa quando ninguém escolheu outro: é o que a demonstração mostra na linha do fim. */
const MODELO_DEMONSTRACAO = MODELOS_GRATUITOS[0]!.valor;

/**
 * Os detalhes de uma resposta de exemplo ("Por que respondeu assim"). As conversas de exemplo existem
 * para mostrar o app funcionando antes de qualquer chave: sem isto, o recurso só apareceria depois de
 * a pessoa conectar a IA e receber a primeira mensagem de verdade.
 */
function detalhesExemplo({ trecho, tempoMs, motivo }: { trecho: string; tempoMs: number; motivo?: MotivoTransferencia }): DetalhesResposta {
  return {
    modelo: MODELO_DEMONSTRACAO,
    tempoMs,
    fontes: [{ tipo: "base", nome: "Base de conhecimento do Assistente", trecho }],
    ferramentas: [],
    ...(motivo ? { transferencia: { motivo } } : {}),
    rajada: 1,
  };
}

export function conversasExemplo(): ConversaExemplo[] {
  return [
    {
      numero: "5511988761234",
      nome: "Mariana Costa",
      status: "ia",
      assunto: "Agendamentos",
      mensagens: [
        { papel: "cliente", texto: "Oi! Vocês têm horário para limpeza esta semana?", atras: 50 },
        { papel: "atendente", texto: "Claro! Temos quinta às 9h e sexta às 14h. Qual fica melhor para você?", atras: 49, respostaMs: 2400 },
        { papel: "cliente", texto: "Quinta às 9h está ótimo.", atras: 46 },
        {
          papel: "atendente",
          texto: "Perfeito, Mariana. Anotei quinta às 9h para a limpeza. Se precisar mudar, avise com pelo menos 4 horas de antecedência.",
          atras: 45,
          respostaMs: 3100,
          detalhes: detalhesExemplo({
            trecho: "Cancelamento e remarcação: pedimos aviso com pelo menos 4 horas de antecedência. Faltas sem aviso podem gerar cobrança de 50% do valor da consulta.",
            tempoMs: 3100,
          }),
        },
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
        { papel: "atendente", texto: "Sinto muito, Ana Paula. Avaliamos sim: a consulta de avaliação custa R$ 120 e fica gratuita para quem fechar tratamento.", atras: 1 * DIA + 2 * HORA - 1, respostaMs: 4200 },
        { papel: "cliente", texto: "Consigo hoje? A dor aumentou à noite.", atras: 4 * HORA },
        {
          papel: "cliente",
          texto: "[Áudio de 7 s]",
          atras: 4 * HORA - 2,
          anexo: {
            tipo: "audio",
            arquivo: "/exemplos/audio-cliente.ogg",
            mime: "audio/ogg",
            nome: "audio-cliente.ogg",
            segundos: 7,
            transcricao: "Oi, é a Ana Paula. A dor piorou muito à noite, quase não dormi. Consigo passar aí hoje ainda, mesmo que seja no fim da tarde?",
          },
        },
        { papel: "humano", texto: "Oi, Ana Paula, aqui é a recepção. Consigo te encaixar hoje às 17h30 com a Dra. Helena.", atras: 3 * HORA, respostaMs: 480000 },
        // A nota interna da demonstração: o cliente nunca a vê, e ela é o que a equipe combina entre si.
        { papel: "nota", texto: "Encaixei às 17h30 com a Dra. Helena. Avisar a Dra. que o implante é de outra clínica. — Recepção", atras: 3 * HORA - 1 },
        { papel: "cliente", texto: "Perfeito, obrigada! Vou levar a radiografia que fiz na outra clínica.", atras: 2 * HORA },
      ],
    },
    {
      numero: "5511987654321",
      nome: "Carlos Menezes",
      status: "atencao",
      motivo: "sem_informacao",
      assunto: "Preços",
      mensagens: [
        { papel: "cliente", texto: "Bom dia! Quanto custa o clareamento?", atras: 3 * DIA },
        { papel: "atendente", texto: "Bom dia! O clareamento dental a laser sai por R$ 900, em 3 sessões.", atras: 3 * DIA - 1, respostaMs: 2800 },
        { papel: "cliente", texto: "E dá para parcelar em 10 vezes no boleto?", atras: 3 * HORA + 10 },
        {
          papel: "atendente",
          texto: "Essa pergunta é melhor respondida por alguém da equipe. Já vou encaminhar para um atendente humano falar com você (segunda a sexta, das 8h às 18h).",
          atras: 3 * HORA,
          respostaMs: 5200,
          detalhes: detalhesExemplo({
            trecho: "Formas de pagamento: dinheiro, PIX, cartão de crédito em até 12x sem juros e convênios odontológicos (Odontoprev e Amil Dental).",
            tempoMs: 5200,
            motivo: "sem_informacao",
          }),
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
        {
          papel: "atendente",
          texto: "Sim! Aos sábados atendemos das 8h ao meio-dia.",
          atras: 6 * HORA,
          respostaMs: 3500,
          detalhes: detalhesExemplo({
            trecho: "Horário de atendimento humano: segunda a sexta, das 8h às 18h, e aos sábados das 8h ao meio-dia.",
            tempoMs: 3500,
          }),
        },
      ],
    },
    {
      numero: "5511993456789",
      nome: "Fernanda Alves",
      status: "ia",
      assunto: "Agendamentos",
      mensagens: [
        { papel: "cliente", texto: "Oi, preciso remarcar minha consulta de terça.", atras: 5 * DIA },
        { papel: "atendente", texto: "Sem problema, Fernanda. Consigo remarcar para quinta às 10h ou sexta às 16h.", atras: 5 * DIA - 2, respostaMs: 2600 },
        { papel: "cliente", texto: "Pode ser sexta às 16h.", atras: 13 * HORA },
        { papel: "atendente", texto: "Combinado. Sua consulta ficou para sexta às 16h.", atras: 12 * HORA, respostaMs: 4800 },
      ],
    },
    {
      numero: "5511992345678",
      nome: "João Pedro",
      status: "ia",
      assunto: "Preços",
      mensagens: [
        { papel: "cliente", texto: "Quanto fica o aparelho invisível?", atras: 20 * HORA + 6 },
        { papel: "atendente", texto: "O aparelho invisível começa em R$ 6.500, parcelado em até 12x sem juros.", atras: 20 * HORA + 5, respostaMs: 3900 },
        { papel: "cliente", texto: "Precisa de avaliação antes?", atras: 20 * HORA + 1 },
        { papel: "atendente", texto: "Precisa sim: a avaliação inicial custa R$ 120 e fica gratuita para quem fechar tratamento.", atras: 20 * HORA, respostaMs: 3300 },
      ],
    },
    {
      numero: "5511995678901",
      nome: "Eduardo Santos",
      status: "ia",
      assunto: "Outros",
      mensagens: [
        { papel: "cliente", texto: "Tem estacionamento aí?", atras: 22 * HORA + 3 },
        { papel: "atendente", texto: "Tem sim: no prédio ao lado, conveniado, com desconto para pacientes.", atras: 22 * HORA, respostaMs: 2400 },
      ],
    },
    {
      numero: "5511994567890",
      nome: "Luciana Ferraz",
      status: "atencao",
      motivo: "sem_informacao",
      assunto: "Tratamentos",
      mensagens: [
        { papel: "cliente", texto: "Faço clareamento tendo restauração na frente?", atras: 2 * DIA + 5 * HORA },
        { papel: "atendente", texto: "Depende do caso: isso é avaliado na consulta inicial.", atras: 2 * DIA + 5 * HORA - 1, respostaMs: 3100 },
        { papel: "cliente", texto: "E se a restauração for de porcelana? Meu dentista antigo disse que mancha.", atras: 2 * DIA + 3 * HORA },
        {
          papel: "atendente",
          texto: "Essa pergunta é melhor respondida por alguém da equipe. Já vou encaminhar para um atendente humano falar com você (segunda a sexta, das 8h às 18h).",
          atras: 2 * DIA + 3 * HORA - 1,
          respostaMs: 4200,
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
        { papel: "atendente", texto: "Boa tarde! Atendemos odontopediatria a partir dos 2 anos de idade.", atras: 6 * DIA - 2, respostaMs: 2800 },
        {
          papel: "cliente",
          texto: "Esse é o convênio do meu filho, vocês atendem?",
          atras: 3 * DIA + 50,
          anexo: {
            tipo: "imagem",
            arquivo: "/exemplos/foto-carteirinha.jpg",
            mime: "image/jpeg",
            nome: "foto-carteirinha.jpg",
            legenda: "Esse é o convênio do meu filho, vocês atendem?",
            transcricao: "Foto de uma carteirinha de plano odontológico, com o nome do titular, o número da carteirinha e a validade legíveis.",
          },
        },
        { papel: "atendente", texto: "Atendemos esse plano sim, Camila. Na primeira consulta é só levar a carteirinha e um documento com foto.", atras: 3 * DIA + 49, respostaMs: 4100 },
        { papel: "cliente", texto: "Ótimo. Consigo marcar para a terça da semana que vem?", atras: 3 * DIA + 40 },
        { papel: "atendente", texto: "Consigo sim: terça às 15h com a odontopediatra. Posso confirmar?", atras: 3 * DIA + 39, respostaMs: 5200 },
        { papel: "cliente", texto: "Obrigado pelo atendimento!", atras: 3 * DIA + 35 },
        { papel: "atendente", texto: "Nós que agradecemos, Camila. Até terça!", atras: 3 * DIA + 34, respostaMs: 3500 },
      ],
    },
  ];
}

/** O que o atendente lembra de um cliente de exemplo (lib/memoria.ts), para o painel do contato. */
export interface ContatoExemplo {
  numero: string;
  nomeInformado?: string;
  email?: string;
  telefoneRetorno?: string;
  memoria: string;
}

/**
 * Duas das nove conversas de exemplo já nascem com o que o atendente lembra do cliente: a demonstração
 * precisa mostrar o recurso antes de existir qualquer chave de IA. Os textos são o que uma recepção
 * anotaria — preferência de horário, o que ficou combinado, como falar com a pessoa — e nunca o que o
 * prompt de lib/memoria.ts proíbe (saúde, documento, senha, cartão, opinião sobre o cliente).
 */
export function contatosExemplo(): ContatoExemplo[] {
  return [
    {
      numero: "5511988761234",
      nomeInformado: "Mariana Costa",
      memoria:
        "Se apresentou como Mariana. Prefere horários de manhã e agendou uma limpeza para quinta às 9h. Já sabe que remarcações precisam de aviso com 4 horas de antecedência.",
    },
    {
      numero: "5511997654321",
      nomeInformado: "Camila Souza",
      email: "camila.souza@exemplo.com.br",
      memoria:
        "Marca as consultas para o filho, de 4 anos. Tem plano odontológico e já enviou a carteirinha. Prefere terça à tarde e pediu para ser avisada por e-mail.",
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
