import { publishCanvas } from "@/lib/flow/share";

export async function POST(req: Request) {
  try {
    const { projectId } = await req.json();
    if (typeof projectId !== "string" || !/^[\w-]{1,80}$/.test(projectId))
      throw new Error("Projeto inválido.");
    return Response.json(publishCanvas(projectId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : "Não foi possível compartilhar.",
      },
      { status: 400 },
    );
  }
}
