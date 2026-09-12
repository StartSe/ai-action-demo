import { responder } from "@/lib/atendente";

// Simulador de conversa (celular na tela).
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { de?: string; texto?: string };
  const { de, texto } = body;
  if (!texto || !String(texto).trim()) {
    return Response.json({ error: "Digite uma mensagem para simular." }, { status: 400 });
  }
  const numero = de && String(de).trim() ? String(de).trim() : "simulador";
  try {
    const { resposta, transferir } = await responder({ numero, texto: String(texto).trim(), origem: "simulador" });
    return Response.json({ resposta, transferir });
  } catch (err) {
    console.error(err);
    const mensagem = err instanceof Error ? err.message : "Não foi possível gerar a resposta agora. Tente novamente.";
    return Response.json({ error: mensagem }, { status: 500 });
  }
}
