// "Ler o currículo de novo" (US-009): monta a ficha a partir do texto do currículo já guardado.
//
// Existe por causa de dois caminhos que o cadastro deixa em aberto de propósito: a leitura que
// estourou o prazo de 20 s e o currículo cujo texto só chegou depois, colado à mão. Nos dois o
// candidato já está salvo — falta a ficha, e pedir isso não pode custar refazer o cadastro.
//
// O resultado é MESCLADO com o que já existia (`mesclar`, lib/ficha.ts), nunca gravado por cima: o
// que o gestor corrigiu à mão e o que a pesquisa na web encontrou continuam lá. É a D5 inteira, e é o
// motivo de a regra morar no módulo em vez de aqui.
//
// O `PATCH` é a outra ponta: a ficha corrigida à mão (US-013). O que o gestor escreve vira origem
// `gestor` e não é sobrescrito por nenhuma leitura seguinte — e a escolha entre o currículo e a web,
// no bloco de divergências, entra pela mesma porta porque é a mesma coisa: uma pessoa decidindo o
// valor de um campo.
import { atualizar, obter, obterCvTexto } from "@/lib/candidatos";
import { editarFicha, fichaDoCurriculo, mesclar, resolverDivergencia, validarEdicaoFicha } from "@/lib/ficha";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidato = obter(id);
  if (!candidato) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });

  const cvTexto = obterCvTexto(id) ?? "";
  if (!cvTexto.trim()) {
    return Response.json(
      { error: "Não há texto de currículo guardado para este candidato. Envie o currículo de novo ou cole o texto dele." },
      { status: 400 },
    );
  }

  const { ficha, aviso } = await fichaDoCurriculo({ candidatoId: id, nome: candidato.nome, cvTexto });
  if (!ficha) return Response.json({ error: aviso ?? "Não foi possível montar a ficha agora. Tente de novo em um minuto." }, { status: 502 });

  return Response.json({ candidato: atualizar(id, { ficha: mesclar(candidato.ficha, ficha, "cv") }) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidato = obter(id);
  if (!candidato) return Response.json({ error: "Esse candidato não existe mais." }, { status: 404 });

  const corpo = await req.json().catch(() => ({}));

  // "Manter o currículo" / "Usar o da web": o gestor escolheu entre dois valores que já estão na
  // ficha, então não há nada para validar de tamanho — só qual dos dois lados vale.
  const divergencia = corpo?.divergencia;
  if (divergencia) {
    const campo = typeof divergencia.campo === "string" ? divergencia.campo : "";
    const escolha = divergencia.escolha;
    if (!campo || (escolha !== "cv" && escolha !== "web")) {
      return Response.json({ error: "Diga se vale o que está no currículo ou o que a pesquisa encontrou." }, { status: 400 });
    }
    return Response.json({ candidato: atualizar(id, { ficha: resolverDivergencia(candidato.ficha, campo, escolha) }) });
  }

  const validacao = validarEdicaoFicha(corpo?.campos);
  if (!validacao.ok) return Response.json({ error: validacao.erro }, { status: 400 });
  return Response.json({ candidato: atualizar(id, { ficha: editarFicha(candidato.ficha, validacao.campos) }) });
}
