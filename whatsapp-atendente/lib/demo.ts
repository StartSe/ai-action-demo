// Configuração de exemplo (para o app já funcionar ao abrir, sem nenhuma chave configurada) e
// resposta local sem IA: uma busca simples na base de conhecimento, reformulada no tom configurado
// em vez de devolver o trecho da base copiado ao pé da letra.
import type { Config, Tom } from "./types";

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
