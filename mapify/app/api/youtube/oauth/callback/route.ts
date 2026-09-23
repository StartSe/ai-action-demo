import { NextRequest, NextResponse } from "next/server";
import { AppError } from "@/lib/api";
import {
  youtubeIntegration,
  youtubeOrigin,
  YOUTUBE_COOKIE,
} from "@/lib/youtube-oauth";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const target = new URL("/", youtubeOrigin(req));
  target.searchParams.set("settings", "youtube");
  try {
    const params = req.nextUrl.searchParams;
    await (
      await youtubeIntegration()
    ).complete(
      params.get("state") || "",
      req.cookies.get(YOUTUBE_COOKIE)?.value || "",
      params.get("code") || "",
      params.has("error"),
    );
    target.searchParams.set("youtube", "connected");
  } catch (error) {
    target.searchParams.set(
      "youtube_error",
      error instanceof AppError
        ? error.message
        : "Não foi possível conectar o YouTube. Tente novamente.",
    );
  }
  const response = NextResponse.redirect(target, 303);
  response.cookies.set(YOUTUBE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: target.protocol === "https:",
    path: "/api/youtube/oauth",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
