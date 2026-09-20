import { listTools } from "@/lib/tools";
import { api } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(listTools);
}
