import { availableTools } from "@/lib/flow-runtime";
import { api } from "@/lib/flow-api";
export async function GET() {
  return api(availableTools);
}
