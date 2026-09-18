// Criar simulação (US-009) e listar as simulações do gestor (US-012). Os passos 1 e 2 de "Novo treino"
// vivem inteiros no navegador — nada é salvo enquanto o gestor volta e mexe — e o passo 3 só existe
// depois que o POST devolve o link.
//
// As regras do que é um treino aceitável moram em `lib/nova-simulacao.ts`, e não aqui: a ferramenta
// `criar_simulacao` do assistente (US-029) cria o mesmo tipo de treino e tem de recusar as mesmas coisas.
import { listarTodos as listarTodosProdutos } from "@/lib/produtos";
import { criarSimulacao } from "@/lib/nova-simulacao";
import { notaMediaPorSimulacao, resumoPorSimulacao } from "@/lib/sessoes";
import { baseUrl, registrarEnderecoPublico } from "@/lib/setup-comum";
import { listar } from "@/lib/simulacoes";

/**
 * A lista de treinos do gestor (US-012). Cada cartão mostra o produto, o que o treino já rendeu e a
 * nota média — as três contagens saem de **uma consulta agregada cada**, nunca de uma por cartão.
 *
 * O link absoluto vem daqui, e não montado no navegador: é o mesmo endereço que o POST devolveu ao
 * criar o treino, e é o que o gestor cola no grupo do time pelo menu "Copiar link".
 */
export async function GET(req: Request) {
  // `listarTodos` (e não `listar`) porque o produto de exemplo fica escondido da biblioteca assim que
  // existe um produto de verdade, mas as simulações migradas das salas antigas continuam apontando
  // para ele — sem isso os treinos do exemplo ficariam sem nome de produto.
  const nomes = new Map(listarTodosProdutos(500).map((p) => [p.id, p.nome]));
  const resumo = resumoPorSimulacao();
  const notas = notaMediaPorSimulacao();
  const base = baseUrl(req);

  const itens = listar().map((s) => ({
    ...s,
    produtoNome: nomes.get(s.produtoId) ?? "Produto apagado",
    participantes: resumo[s.codigo]?.participantes ?? 0,
    sessoes: resumo[s.codigo]?.sessoes ?? 0,
    ultimaSessao: resumo[s.codigo]?.ultimaSessao ?? null,
    notaMedia: notas[s.codigo]?.nota ?? null,
    url: `${base}/simular/${s.codigo}`,
  }));
  return Response.json({ itens });
}

export async function POST(req: Request) {
  const corpo = await req.json().catch(() => ({}));

  const resultado = criarSimulacao(corpo);
  if ("erro" in resultado) {
    return Response.json({ error: resultado.erro, acao: resultado.acao }, { status: 400 });
  }

  // O link que o gestor manda no grupo é o primeiro endereço público real deste app; guardá-lo aqui é
  // o que permite o e-mail do resultado (US-020) montar link absoluto sem adivinhar o domínio.
  registrarEnderecoPublico(req);
  return Response.json({ simulacao: resultado.simulacao, url: `${baseUrl(req)}/simular/${resultado.simulacao.codigo}` });
}
