import { vozes, falaDisponivel } from "@/lib/elevenlabs";
import { api } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(async () => (falaDisponivel() ? vozes() : []));
}
