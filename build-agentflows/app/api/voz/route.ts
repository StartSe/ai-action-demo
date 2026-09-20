import { falaDisponivel, ligacaoDisponivel } from "@/lib/elevenlabs";
import { api } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(() => ({ voz: falaDisponivel(), ligacao: ligacaoDisponivel() }));
}
