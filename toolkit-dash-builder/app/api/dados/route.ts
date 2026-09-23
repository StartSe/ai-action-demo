// POST envia uma planilha (CSV/TSV) e devolve o id guardado mais o resumo das colunas.
// A tela usa o resumo para mostrar o que foi lido ANTES de gerar o painel: a pessoa confere se as
// colunas foram entendidas (tipo e quantidade) em vez de descobrir no gráfico errado.
import { guardarDados } from "@/lib/dados-store";
import { detectarFormato, ErroPlanilha, lerPlanilha, resumoDeDados, TAMANHO_MAXIMO } from "@/lib/planilha";

export async function POST(req: Request) {
  let arquivo: File | null = null;
  try {
    const form = await req.formData();
    const campo = form.get("arquivo");
    if (campo instanceof File) arquivo = campo;
  } catch {
    return Response.json({ error: "Não consegui ler o arquivo enviado." }, { status: 400 });
  }
  if (!arquivo) return Response.json({ error: "Escolha um arquivo .csv para enviar." }, { status: 400 });
  if (arquivo.size === 0) return Response.json({ error: "O arquivo está vazio." }, { status: 400 });
  if (arquivo.size > TAMANHO_MAXIMO) {
    return Response.json({ error: `O arquivo passa de ${Math.round(TAMANHO_MAXIMO / 1024 / 1024)} MB. Envie um recorte menor.` }, { status: 413 });
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const incompativel = detectarFormato(arquivo.name, bytes);
  if (incompativel) return Response.json({ error: incompativel }, { status: 415 });

  try {
    const texto = new TextDecoder("utf-8").decode(bytes);
    const dados = lerPlanilha(texto, arquivo.name);
    const id = guardarDados(dados);
    return Response.json({
      id,
      nome: dados.nome,
      linhas: dados.linhas.length,
      totalLinhas: dados.totalLinhas,
      truncado: dados.truncado,
      resumo: resumoDeDados(dados),
      // Só o perfil das colunas volta para a tela: as linhas ficam no servidor.
      colunas: dados.colunas.map((c) => ({ chave: c.chave, rotulo: c.rotulo, tipo: c.tipo, preenchidos: c.preenchidos, distintos: c.distintos, descartados: c.descartados, identificador: c.identificador ?? false })),
    });
  } catch (err) {
    if (err instanceof ErroPlanilha) return Response.json({ error: err.message }, { status: 422 });
    console.error("Falha ao ler planilha:", err);
    return Response.json({ error: "Não consegui ler esta planilha. Confira se é um CSV com cabeçalho na primeira linha." }, { status: 422 });
  }
}
