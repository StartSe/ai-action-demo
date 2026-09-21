import { chatGPT } from "@/lib/chatgpt";
import { api } from "@/lib/flow-api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(() => chatGPT().usage());
}
