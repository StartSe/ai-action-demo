import { chatgptLogin } from "@/lib/chatgpt-login";
import { WorkspaceError } from "@/lib/workspace-schema";
import { baseUrl } from "@/lib/setup-comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };

export async function GET() {
  return Response.json(chatgptLogin().status(), { headers });
}
export async function POST(request: Request) {
  // This login belongs to the authenticated workspace administrator. Reject cross-site triggers.
  const origin = request.headers.get("origin");
  if (origin && origin !== baseUrl(request))
    return Response.json(
      { error: "Origem de login inválida." },
      { status: 403, headers },
    );
  try {
    return Response.json(await chatgptLogin().start(), { headers });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof WorkspaceError
            ? error.message
            : "Não foi possível iniciar o login.",
      },
      { status: error instanceof WorkspaceError ? error.status : 502, headers },
    );
  }
}
export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== baseUrl(request))
    return Response.json(
      { error: "Origem de login inválida." },
      { status: 403, headers },
    );
  return Response.json(await chatgptLogin().cancel(), { headers });
}
