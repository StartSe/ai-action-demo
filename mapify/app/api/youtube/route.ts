import { api, body, string } from "@/lib/api";
import { youtubeIntegration, youtubeOrigin } from "@/lib/youtube-oauth";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  return api(async () =>
    (await youtubeIntegration()).status(youtubeOrigin(req)),
  );
}
export async function PUT(req: Request) {
  return api(async () => {
    const b = await body(req);
    const service = await youtubeIntegration();
    service.configure(string(b.clientId, 301), string(b.clientSecret, 1001));
    return service.status(youtubeOrigin(req));
  });
}
export async function POST() {
  return api(async () => (await youtubeIntegration()).test());
}
export async function DELETE() {
  return api(async () => (await youtubeIntegration()).disconnect());
}
