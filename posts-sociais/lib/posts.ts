// Lógica de geração de posts, compartilhada entre a rota HTTP (app/api/posts/route.ts)
// e a ferramenta MCP (lib/ferramentas.ts), para não duplicar o prompt nem a gravação no histórico.
import { aiEnabled, askJSON, meta, type Meta } from "./ai";
import { esperar, postsDemo } from "./demo";
import { salvar } from "./historico";
import type { DadosPosts, Post, Rede, ResultadoPosts } from "./types";

export const REDES: Record<Rede, string> = { linkedin: "LinkedIn", instagram: "Instagram", x: "X" };

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
  const insumo = "dados da empresa, o tema e o público-alvo informados";
  const titulo = `Posts de ${empresa?.trim() || "sua empresa"}`;

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
