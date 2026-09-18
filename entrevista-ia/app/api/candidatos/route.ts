// A lista de candidatos e o cadastro de um candidato novo (US-008). Privada, como toda rota do
// painel.
//
// O `POST` recebe `formData` (e não JSON) porque o currículo vem junto com os campos. O que é regra
// de negócio não mora aqui: `validarCandidato` (lib/candidatos.ts) sabe o que é um nome grande demais
// e `lerCurriculo` (lib/curriculo.ts) sabe o que é um arquivo aceitável — a mesma regra precisa valer
// para esta rota, para o assistente (MCP) e para qualquer porta que venha depois.
import { criar, validarCandidato } from "@/lib/candidatos";
import { lerCurriculo } from "@/lib/curriculo";
import { listarCandidatosNoPainel } from "@/lib/painel";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const busca = new URL(req.url).searchParams.get("busca") ?? undefined;
  return Response.json({ itens: listarCandidatosNoPainel({ busca }) });
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Não recebemos o cadastro. Tente enviar de novo." }, { status: 400 });
  }

  const validacao = validarCandidato({
    nome: form.get("nome"),
    email: form.get("email"),
    telefone: form.get("telefone"),
    cidade: form.get("cidade"),
    linkedinUrl: form.get("linkedinUrl"),
    termoBusca: form.get("termoBusca"),
  });
  if (!validacao.ok) return Response.json({ error: validacao.erro }, { status: 400 });

  const arquivo = form.get("curriculo");
  let curriculo: { cvNome: string; cvTipo: string; cvTexto: string; cvArquivo: Uint8Array } | undefined;
  let aviso: string | undefined;

  if (arquivo instanceof File && arquivo.size > 0) {
    const leitura = await lerCurriculo(arquivo);
    // Recusa só o que não dá para guardar (tamanho, formato). Arquivo sem texto legível ENTRA: o
    // aviso viaja com o candidato criado e a tela oferece colar o texto.
    if (!leitura.ok) return Response.json({ error: leitura.erro }, { status: 400 });
    curriculo = {
      cvNome: leitura.leitura.nome,
      cvTipo: leitura.leitura.tipo,
      cvTexto: leitura.leitura.texto,
      cvArquivo: leitura.leitura.dados,
    };
    aviso = leitura.leitura.aviso;
  }

  return Response.json({ candidato: criar({ ...validacao.campos, ...curriculo }), aviso });
}
