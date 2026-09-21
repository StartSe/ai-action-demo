import { api, body } from "@/lib/api";
import { salvarConexoes, statusConexoes } from "@/lib/conexoes";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(() => statusConexoes(new URL(req.url).searchParams.get("provider") || undefined));
}
export async function PUT(req: Request) {
  return api(async () => {
    const b = await body(req);
    await salvarConexoes(b);
    return statusConexoes(typeof b.provider === "string" ? b.provider : undefined);
  });
}
