// Um candidato: ler, corrigir o cadastro e apagar (US-008/US-013).
//
// O `GET` traz o candidato **e as fontes dele** porque é o mesmo pedido que a tela do candidato faz a
// cada três segundos enquanto a pesquisa na web corre (US-012): duas rotas sondadas juntas seriam
// duas viagens para desenhar a mesma tela. As fontes vão sem o conteúdo (`listarFontesResumidas`) —
// a tela mostra título, resumo e link, e o conteúdo de quatro páginas são 80 KB por sondagem.
//
// O `PATCH` é o cadastro (nome, e-mail, termo de busca, texto do currículo colado); a ficha campo a
// campo tem porta própria (`PATCH /api/candidatos/[id]/ficha`), porque lá quem decide o que vence é
// `lib/ficha.ts`.
import { obter, apagar, atualizar, listarFontesResumidas, validarMudancasCandidato } from "@/lib/candidatos";
import { origensDaFicha } from "@/lib/ficha";
import { apagar as apagarResultado } from "@/lib/historico";

export const dynamic = "force-dynamic";

const SUMIU = { error: "Esse candidato não existe mais." };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const candidato = obter(id);
  if (!candidato) return Response.json(SUMIU, { status: 404 });
  // `origens` sai daqui, e não do navegador: quais chips a ficha mostra ("CV", "Web", "Editado por
  // você") é leitura da D5, e ela mora em `lib/ficha.ts` como todo o resto dela.
  return Response.json({ candidato, fontes: listarFontesResumidas(id), origens: origensDaFicha(candidato.ficha) });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json(SUMIU, { status: 404 });

  const corpo = await req.json().catch(() => ({}));
  const validacao = validarMudancasCandidato(corpo);
  if (!validacao.ok) return Response.json({ error: validacao.erro }, { status: 400 });
  return Response.json({ candidato: atualizar(id, validacao.campos) });
}

/**
 * Apagar o candidato leva tudo que é dele: ficha, currículo, fontes, entrevistas e pareceres.
 *
 * É o pedido de apagamento da D12, e por isso o parecer vai junto — ao contrário da vaga apagada, em
 * que o parecer fica no histórico porque ele é sobre uma pessoa que continua cadastrada. Os pareceres
 * são apagados **depois** da transação: `lib/historico.ts` tem conexão própria para o mesmo arquivo e
 * encontraria o banco ocupado se fosse chamado de dentro dela.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!obter(id)) return Response.json(SUMIU, { status: 404 });

  const { resultadosOrfaos } = apagar(id);
  for (const resultadoId of resultadosOrfaos) apagarResultado(resultadoId);
  return Response.json({ ok: true, pareceresApagados: resultadosOrfaos.length });
}
