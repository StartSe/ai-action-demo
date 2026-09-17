import { toNextJsHandler } from "better-auth/next-js";

import { requestMeta } from "@/lib/audit";
import { getAuth } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";

// getAuth() é lazy para não abrir o arquivo SQLite durante o build
const handler = toNextJsHandler((request) => getAuth().handler(request));

export const GET = handler.GET;

// POSTs de auth (login, cadastro, reset) limitados por IP contra força bruta.
// O corpo dessas rotas é validado pelo próprio Better Auth (schemas Zod internos).
export async function POST(request: Request) {
  const { ip } = requestMeta(request.headers);
  const rateLimited = await enforceRateLimit("auth", ip ?? "unknown", {
    limit: 30,
    windowSec: 60,
  });
  if (rateLimited) return rateLimited;
  return handler.POST(request);
}
