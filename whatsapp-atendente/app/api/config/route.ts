import { getConfig, setConfig, temConfigSalva } from "@/lib/estado";
import { lerAvisoEspera } from "@/lib/espera";
import { FERRAMENTAS_PADRAO, LIMITE_PERGUNTA, LIMITE_SAUDACAO, MAX_PERGUNTAS, MIDIA_PADRAO, type Config, type ConfigFerramentas, type ConfigMidia } from "@/lib/types";

export const dynamic = "force-dynamic";

const OBJETIVOS: Config["objetivo"][] = ["atendimento", "vendas", "agendamentos", "outro"];
const TONS: Config["tom"][] = ["profissional", "amigavel", "personalizado"];
const NAO_SEI: Config["naoSei"][] = ["humano", "contato", "site"];

// `salvo` acompanha a configuração (e não substitui nada dela): as telas que só mostram os dados
// continuam recebendo a empresa de exemplo quando ninguém configurou, e só o Assistente usa o campo
// para abrir com o modelo da base no lugar do exemplo.
export async function GET() {
  return Response.json({ ...getConfig(), salvo: temConfigSalva() });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Partial<Config>;
  const { negocio, atendente, objetivo, objetivoTexto, tom, tomTexto, saudacao, perguntasSugeridas, horario, baseConhecimento, naoSei, fraseFalha, midia, ferramentas, avisoEsperaMin, fraseSemMidia } = body;
  if (!negocio || !String(negocio).trim() || !atendente || !String(atendente).trim() || !baseConhecimento || !String(baseConhecimento).trim()) {
    return Response.json({ error: "Preencha ao menos o nome do negócio, o nome do atendente e a base de conhecimento." }, { status: 400 });
  }
  // Objetivo e tom ausentes valem como o padrão (configuração antiga ou tela que ainda não pergunta);
  // um valor que não está na lista é erro, para nunca salvar em silêncio algo que a IA não entende.
  if (objetivo !== undefined && !OBJETIVOS.includes(objetivo)) {
    return Response.json({ error: "Escolha o que o atendente deve fazer: atendimento, vendas, agendamentos ou outro." }, { status: 400 });
  }
  if (tom !== undefined && !TONS.includes(tom)) {
    return Response.json({ error: "Escolha o tom de resposta: profissional, amigável ou personalizado." }, { status: 400 });
  }
  if (objetivo === "outro" && !String(objetivoTexto || "").trim()) {
    return Response.json({ error: "Escreva em uma linha o que o atendente deve fazer." }, { status: 400 });
  }
  // A saudação e as perguntas de teste são opcionais, mas têm teto: o campo da tela mostra o contador e
  // a rota confia nele tanto quanto em quem chama por fora (a persona gerada, por exemplo).
  const textoSaudacao = String(saudacao || "").trim();
  if (textoSaudacao.length > LIMITE_SAUDACAO) {
    return Response.json({ error: `A saudação precisa ter até ${LIMITE_SAUDACAO} caracteres.` }, { status: 400 });
  }
  const perguntas = Array.isArray(perguntasSugeridas) ? perguntasSugeridas.map((p) => String(p ?? "").trim()).filter(Boolean) : [];
  if (perguntas.length > MAX_PERGUNTAS) {
    return Response.json({ error: `Deixe no máximo ${MAX_PERGUNTAS} perguntas de teste.` }, { status: 400 });
  }
  if (perguntas.some((p) => p.length > LIMITE_PERGUNTA)) {
    return Response.json({ error: `Cada pergunta de teste precisa ter até ${LIMITE_PERGUNTA} caracteres.` }, { status: 400 });
  }
  const objetivoEscolhido = objetivo ?? "atendimento";
  const tomEscolhido = tom ?? "profissional";
  const textoTom = String(tomTexto || "").trim();
  // A frase de reserva para quando a IA falha é opcional: vazia, vale a padrão (lib/transferencia.ts).
  const textoFalha = String(fraseFalha || "").trim();
  // O mesmo vale para os interruptores de áudio, foto e arquivo: ausentes, o atendente entende tudo.
  const midiaEscolhida: ConfigMidia = {
    audio: typeof midia?.audio === "boolean" ? midia.audio : MIDIA_PADRAO.audio,
    imagem: typeof midia?.imagem === "boolean" ? midia.imagem : MIDIA_PADRAO.imagem,
    documento: typeof midia?.documento === "boolean" ? midia.documento : MIDIA_PADRAO.documento,
  };
  // E para os interruptores da seção Ferramentas: ausentes, vale o padrão (o atendente usa o que já
  // estiver conectado e não pede dados do cliente por conta própria).
  const ferramentasEscolhidas: ConfigFerramentas = {
    coletarContato: typeof ferramentas?.coletarContato === "boolean" ? ferramentas.coletarContato : FERRAMENTAS_PADRAO.coletarContato,
    agenda: typeof ferramentas?.agenda === "boolean" ? ferramentas.agenda : FERRAMENTAS_PADRAO.agenda,
    sistemas: typeof ferramentas?.sistemas === "boolean" ? ferramentas.sistemas : FERRAMENTAS_PADRAO.sistemas,
  };
  // O limite de espera é um select fechado: ausente (tela antiga, persona gerada) e valor fora da lista
  // caem no padrão, nunca em 400 — errar esse campo não pode impedir alguém de salvar o atendente.
  const limiteEspera = lerAvisoEspera(avisoEsperaMin);
  const textoSemMidia = String(fraseSemMidia || "").trim();
  const novo: Config = {
    negocio: String(negocio).trim(),
    atendente: String(atendente).trim(),
    objetivo: objetivoEscolhido,
    ...(objetivoEscolhido === "outro" ? { objetivoTexto: String(objetivoTexto).trim() } : {}),
    tom: tomEscolhido,
    ...(tomEscolhido === "personalizado" && textoTom ? { tomTexto: textoTom } : {}),
    ...(textoSaudacao ? { saudacao: textoSaudacao } : {}),
    ...(perguntas.length ? { perguntasSugeridas: perguntas } : {}),
    horario: String(horario || "").trim(),
    baseConhecimento: String(baseConhecimento).trim(),
    naoSei: NAO_SEI.includes(naoSei as Config["naoSei"]) ? (naoSei as Config["naoSei"]) : "humano",
    ...(textoFalha ? { fraseFalha: textoFalha } : {}),
    midia: midiaEscolhida,
    ferramentas: ferramentasEscolhidas,
    avisoEsperaMin: limiteEspera,
    ...(textoSemMidia ? { fraseSemMidia: textoSemMidia } : {}),
  };
  return Response.json(setConfig(novo));
}
