import { chatGPT } from "@/lib/chatgpt";
import { api } from "@/lib/api";
export const dynamic = "force-dynamic";
export async function GET() {
  return api(() => chatGPT().usage());
}
