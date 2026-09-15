// Rascunhos semanais de posts: a rotina "rascunhos-semanais" gera um post por rede para o próximo tema
// do trimestre e entrega, por notificação, um link de formulário de aprovação (lib/formularios.ts,
// tipo "aprovacao-posts"). Responder ao link (aprovar/pedir ajuste/descartar) marca o resultado salvo
// via o callback registrado abaixo. Próprio deste app: registrarExecutor é lido por lib/rotinas-do-app.ts
// (executor no boot) e registrarCallback por app/api/f/[token]/route.ts (callback ao responder o link).
import type { Meta } from "./ai";
import { criar, registrarCallback, type CampoFormulario } from "./formularios";
import { atualizarSaida, obter } from "./historico";
import { gerarPosts, REDES } from "./posts";
import { registrarExecutor } from "./rotinas";
import { enderecoPublico } from "./setup-comum";
import { proximoTema } from "./temas";
import type { Aprovacao, DadosPosts, Rede, ResultadoPosts } from "./types";

const TIPO_APROVACAO = "aprovacao-posts";

function criarFormularioAprovacao(resultadoId: string, tema: string): string {
  const campos: CampoFormulario[] = [
    { chave: "decisao", rotulo: `O que fazer com os rascunhos de "${tema}"?`, tipo: "decisao", obrigatorio: true },
    { chave: "comentario", rotulo: "Comentário (se pediu ajuste)", tipo: "textarea" },
  ];
  const parametros = {
    marca: "S",
    nome: "Posts em Minutos",
    titulo: `Aprovar rascunhos: ${tema}`,
    descricao: "Aprove, peça ajuste com um comentário ou descarte os rascunhos desta semana.",
    resultadoId,
  };
  return criar({ tipo: TIPO_APROVACAO, campos, parametros, expiraEmDias: 14 });
}

registrarExecutor("rascunhos-semanais", async () => {
  const titulo = "Rascunhos semanais de posts";
  const tema = proximoTema();
  if (!tema) {
    return { titulo, texto: "Cadastre pelo menos um tema em 'Temas do trimestre' (/setup) para começar a receber rascunhos toda semana." };
  }

  const redes: Rede[] = ["linkedin", "instagram", "x"];
  const dados: DadosPosts = { empresa: "", tema: tema.tema, objetivo: "fortalecer marca", tom: tema.tom, redes };
  const { resultado, id } = await gerarPosts(dados);

  const tokenAprovacao = criarFormularioAprovacao(id, tema.tema);
  atualizarSaida(id, { ...resultado, aprovacao: { status: "pendente" } });

  const base = enderecoPublico();
  if (!base) console.error("Rascunhos semanais de posts: endereço público desconhecido, link omitido do aviso.");
  const redesTexto = resultado.posts.map((p) => REDES[p.rede] || p.rede).join(", ");
  const acao = base ? `Aprove, peça ajuste ou descarte pelo link: ${base}/f/${tokenAprovacao}` : "Abra o app para aprovar, pedir ajuste ou descartar (endereço público ainda não configurado).";
  const texto = `${resultado.posts.length} rascunho${resultado.posts.length === 1 ? "" : "s"} para o tema "${tema.tema}" (${redesTexto}). ${acao}`;

  return { titulo: `Rascunhos da semana: ${tema.tema}`, texto, resultadoId: id };
});

registrarCallback(TIPO_APROVACAO, async ({ dados, parametros }) => {
  const { resultadoId } = (parametros as { resultadoId?: string }) || {};
  if (!resultadoId) return;
  const resultado = obter<DadosPosts, ResultadoPosts, Meta>(resultadoId);
  if (!resultado) return;

  const status: Aprovacao["status"] = dados.decisao === "aprovar" ? "aprovado" : dados.decisao === "ajustar" ? "ajuste" : "descartado";
  const comentario = dados.comentario?.trim() || undefined;
  atualizarSaida(resultadoId, { ...resultado.saida, aprovacao: { status, comentario } });
  return { resultadoId };
});
