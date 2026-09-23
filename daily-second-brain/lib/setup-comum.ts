export function baseUrl(req: Request) {
  return new URL(req.url).origin;
}
