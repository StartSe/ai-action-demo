import type { ContextoRoteiro } from "./types";

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
/** Reconhece também perguntas transcritas sem pontuação, sem confundir pretensão
 * salarial ou disponibilidade declaradas pelo candidato com uma dúvida. */
export function temDuvidaSobreVaga(texto: string): boolean {
  const t = normalizar(texto).trim();
  if (!t || /^(?:nao|nenhuma|sem) (?:tenho |ha |mais )?(?:duvida|pergunta)/.test(t)) return false;
  return /\?/.test(t) || /(?:^|[.!;,]\s*|\b(?:e|mas)\s+)(?:qual|quais|quanto|como|onde|quando|por que)\b/.test(t)
    || /(?:queria|quero|gostaria de|posso|poderia|pode|preciso)\s+(?:saber|perguntar|entender|explicar|me dizer|me falar)|tenho (?:uma |outra |mais uma )?(?:duvida|pergunta)/.test(t)
    || /^(?:(?:e|sobre)\s+)?(?:o salario|a remuneracao|os beneficios|o horario|o modelo de trabalho)\b/.test(t)
    || /^(?:e|seria|sera|tem|oferece|existe|ha)\b.*(?:hibrid|remot|presencial|home office|benefici|vale|plano de saude|horario|salari|\bclt\b|\bpj\b)/.test(t)
    || /(?:a vaga|o trabalho|a posicao) (?:e|seria|sera) (?:hibrid[oa]|remot[oa]|presencial)/.test(t);
}

/** Respostas factuais não dependem da disponibilidade ou interpretação do modelo.
 * Condições não cadastradas nunca são deduzidas de cultura ou requisitos. */
export function responderDuvidaDaVaga(ctx: ContextoRoteiro, pergunta: string): string {
  const t = normalizar(pergunta);
  if (/^(?:eu )?(?:tenho (?:uma |outra |mais uma )?(?:duvida|pergunta)|posso (?:fazer uma pergunta|perguntar(?: uma coisa)?))[.!?]*$/.test(t.trim())) return "Claro. Qual é a sua dúvida sobre a vaga?";
  const respostas: string[] = [];
  if (/salari|remunera|faixa|quanto.*(?:pag|ganh)|valor.*vaga/.test(t)) {
    respostas.push(ctx.faixaSalarial && ctx.faixaSalarial !== "A combinar"
      ? `A faixa salarial cadastrada é ${ctx.faixaSalarial}.`
      : "O salário está a combinar com o time de recrutamento; não há um valor confirmado no cadastro.");
  }
  if (/hibrid|presencial|remot|home office|modelo|modalidade|casa|escritorio/.test(t)) {
    const modelo = ctx.modelo === "hibrido" ? "híbrido" : ctx.modelo;
    respostas.push(modelo ? `O modelo de trabalho cadastrado é ${modelo}.` : "O modelo de trabalho não foi informado; o time de recrutamento precisa confirmar se é presencial, híbrido ou remoto.");
    if (/quantos dias|quais dias|dias.*(?:casa|escritorio)/.test(t)) respostas.push("A distribuição dos dias entre casa e escritório precisa ser confirmada com o time de recrutamento.");
  }
  if (/cargo|funcao|titulo da vaga/.test(t)) respostas.push(`O cargo é ${ctx.cargo}.`);
  if (/area|departamento/.test(t)) respostas.push(ctx.area ? `A área informada é ${ctx.area}.` : "A área precisa ser confirmada com o time de recrutamento.");
  if (/senioridade|junior|pleno|senior/.test(t)) respostas.push(ctx.senioridade ? `A senioridade cadastrada é ${ctx.senioridade}.` : "A senioridade precisa ser confirmada com o time de recrutamento.");
  if (/duracao|dura|tempo.*(?:conversa|entrevista)/.test(t)) respostas.push(`Esta conversa tem duração estimada de ${ctx.duracaoMin} minutos.`);
  if (/local|onde|cidade|endereco/.test(t)) respostas.push(ctx.local ? `O local informado é ${ctx.local}.` : "O local de trabalho não foi informado; confirme com o time de recrutamento.");
  if (/requisit|precis[ao].*(?:saber|experiencia|formacao)/.test(t)) respostas.push(ctx.requisitos.length ? `Os requisitos cadastrados são: ${ctx.requisitos.join("; ")}.` : "Os requisitos precisam ser confirmados com o time de recrutamento.");
  if (/desafio|responsabilidad|atividad|dia a dia/.test(t)) respostas.push(ctx.desafios.length ? `Os desafios informados são: ${ctx.desafios.join("; ")}.` : "As atividades da vaga precisam ser confirmadas com o time de recrutamento.");
  const faltantes = [
    [/benefici|vale|plano de saude|convenio|\bplr\b|bonus/, "benefícios"],
    [/horario|jornada|escala/, "horários e jornada"],
    [/contrat|\bclt\b|\bpj\b/, "tipo de contratação"],
    [/etapa|prazo|retorno|resultado|quando|inicio/, "etapas e prazos do processo"],
  ] as const;
  for (const [padrao, assunto] of faltantes) if (padrao.test(t)) respostas.push(`Não tenho informações confirmadas sobre ${assunto}; o time de recrutamento poderá esclarecer.`);
  return respostas.join(" ") || "Não tenho essa informação confirmada no cadastro da vaga. O time de recrutamento poderá esclarecer essa dúvida.";
}
