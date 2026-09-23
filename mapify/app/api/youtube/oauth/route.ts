import { api } from "@/lib/api";
import {
  youtubeIntegration,
  youtubeOrigin,
  YOUTUBE_COOKIE,
} from "@/lib/youtube-oauth";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  let cookie = "";
  const response = await api(async () => {
    const origin = youtubeOrigin(req);
    const login = (await youtubeIntegration()).begin(origin);
    cookie = `${YOUTUBE_COOKIE}=${login.browser}; HttpOnly; SameSite=Lax; Path=/api/youtube/oauth; Max-Age=600${origin.startsWith("https:") ? "; Secure" : ""}`;
    return { url: login.url };
  });
  if (cookie) response.headers.set("Set-Cookie", cookie);
  return response;
}
