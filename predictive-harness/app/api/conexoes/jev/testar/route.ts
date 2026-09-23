import { api } from "@/lib/api";
import { testarJev } from "@/lib/conexoes";
export const dynamic = "force-dynamic";
export async function POST() {
  return api(() => testarJev());
}
