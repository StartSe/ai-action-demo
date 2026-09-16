// Lógica de geração e reescrita de posts, compartilhada entre as rotas HTTP (app/api/posts, app/api/reescrever),
// a ferramenta MCP (lib/ferramentas.ts) e a rotina semanal (lib/rascunhos.ts), para não duplicar prompt nem gravação.
import { aiEnabled, askJSON, askText, meta, type Meta } from "./ai";
import { esperar, postsDemo, reescreverDemo } from "./demo";
import { atualizarSaida, obter, salvar } from "./historico";
import { registrarUltimaEmpresa } from "./temas";
import type { DadosPosts, Post, Rede, ResultadoPosts } from "./types";

export const REDES: Record<Rede, string> = { linkedin: "LinkedIn", instagram: "Instagram", x: "X" };
export const LIMITES: Record<Rede, number> = { linkedin: 1300, instagram: 2200, x: 280 };

export const SYSTEM_POSTS = `Você é um redator sênior de conteúdo para redes sociais que atende empresas brasileiras.
Sua tarefa é transformar um briefing curto em posts prontos para publicar, um por rede solicitada, com uma sugestão de imagem para cada um.
Regras:
- Escreva em português do Brasil, com naturalidade, sem clichês de marketing e sem promessas vazias.
- Respeite o tom pedido e fale com o público-alvo indicado.
- LinkedIn: até 1300 caracteres, parágrafos curtos separados por linha em branco, abertura forte na primeira linha, pode usar lista com hífen, sem hashtags dentro do texto (vão no campo próprio), no máximo 5 hashtags.
- Instagram: legenda de 400 a 900 caracteres, mais próxima e visual, pode usar até 3 emojis, entre 6 e 10 hashtags no campo próprio.
- X: até 280 caracteres no total (texto), direto e memorável, até 2 hashtags no campo próprio.
- Cada post deve ter um chamado para ação coerente com o objetivo.
- prompt_imagem: em inglês, descritivo (cena, estilo, luz, paleta, enquadramento), sem pedir texto, letras ou logotipos na imagem. Instagram é quadrado; LinkedIn e X são horizontais.
- melhor_horario: sugestão curta em português, por exemplo "terça ou quarta, entre 8h e 9h".
Formato de saída (JSON):
{
  "ideia_central": "1 a 2 frases com a mensagem única que todos os posts compartilham",
  "posts": [
    { "rede": "linkedin|instagram|x", "texto": "", "hashtags": ["#exemplo"], "melhor_horario": "", "prompt_imagem": "" }
  ]
}`;

/** dados.empresa pode vir vazio (ex.: ferramenta MCP escrever_posts, que só recebe um briefing livre); nesse caso o prompt omite a linha "Empresa ou marca" e o título salvo usa um rótulo genérico. */
export async function gerarPosts(dados: DadosPosts): Promise<{ resultado: ResultadoPosts; meta: Meta; id: string }> {
  const { empresa, tema, objetivo, tom, redes, publico } = dados;
  const lista = (Array.isArray(redes) ? redes : []).filter((r) => REDES[r as Rede]) as Rede[];
  const insumo = "o briefing informado";
  const titulo = `Posts de ${empresa?.trim() || "sua empresa"}`;
  if (empresa?.trim()) registrarUltimaEmpresa(empresa);

  if (!aiEnabled()) {
    await esperar(1300);
    const resultado = postsDemo({ empresa, tema, redes: lista });
    const metaGerada = meta({ demo: true, insumo });
    const id = salvar({ tipo: "posts", titulo, entrada: dados, saida: resultado, meta: metaGerada });
    return { resultado, meta: metaGerada, id };
  }
  const prompt = `${empresa ? `Empresa ou marca: ${empresa}\n` : ""}Tema ou novidade:\n${tema}\n\nObjetivo: ${objetivo || "fortalecer marca"}\nTom: ${tom || "executivo"}\nPúblico-alvo: ${publico || "não informado"}\nRedes solicitadas (gere exatamente um post para cada, nesta ordem): ${lista.map((r) => REDES[r]).join(", ")}`;
  const resultado = await askJSON<ResultadoPosts>({ system: SYSTEM_POSTS, prompt });
  resultado.posts = (resultado.posts || []).map((p: Post) => ({ ...p, rede: String(p.rede || "").toLowerCase() as Rede, hashtags: Array.isArray(p.hashtags) ? p.hashtags : [] }));
  const metaGerada = meta({ demo: false, insumo });
  const id = salvar({ tipo: "posts", titulo, entrada: dados, saida: resultado, meta: metaGerada });
  return { resultado, meta: metaGerada, id };
}

/** Reescreve o texto de um post seguindo uma instrução (mais curto, caber no limite, comentário de quem aprova). */
export async function reescreverPost({ texto, rede, instrucao }: { texto: string; rede?: Rede; instrucao?: string }): Promise<{ demo: boolean; texto: string }> {
  const redeValida: Rede = rede && REDES[rede] ? rede : "linkedin";
  if (!aiEnabled()) {
    await esperar(900);
    return { demo: true, texto: reescreverDemo({ texto, rede: redeValida }) };
  }
  const limite = LIMITES[redeValida];
  const system = `Você reescreve posts de redes sociais em português do Brasil mantendo a mensagem, o tom e as quebras de linha adequadas à rede ${REDES[redeValida]} (limite de ${limite} caracteres). Responda somente com o novo texto, sem título, sem aspas e sem comentários.`;
  const novo = await askText({ system, prompt: `Instrução: ${instrucao || "Reescreva mais curto, com cerca de metade do tamanho."}\n\nTexto atual:\n${texto}`, maxTokens: 1500 });
  return { demo: false, texto: novo.trim() };
}

/** Reescreve todos os posts de um rascunho salvo com o comentário de quem pediu ajuste e regrava o resultado
 * aguardando nova aprovação (o link de aprovação continua válido). Devolve null quando o id não existe. */
export async function reescreverRascunhos(id: string, comentario: string): Promise<ResultadoPosts | null> {
  const registro = obter<DadosPosts, ResultadoPosts, Meta>(id);
  if (!registro || registro.tipo !== "posts") return null;
  const instrucao = `Ajuste pedido por quem aprova os posts: "${comentario.trim()}". Reescreva atendendo a esse pedido, mantendo a ideia central e o chamado para ação.`;
  const posts: Post[] = [];
  for (const p of registro.saida.posts) {
    const { texto } = await reescreverPost({ texto: p.texto, rede: p.rede, instrucao });
    posts.push({ ...p, texto });
  }
  const saida: ResultadoPosts = { ...registro.saida, posts, aprovacao: { status: "pendente", comentario: comentario.trim() || undefined } };
  atualizarSaida(id, saida);
  return saida;
}
