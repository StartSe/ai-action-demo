import { listar } from "@/lib/rotinas";
export async function GET() { return Response.json({ itens: listar() }); }
export async function POST() { return Response.json({ error: "Cadastre o acompanhamento automático dentro de um radar, em Temas, fontes e páginas." }, { status: 410 }); }
