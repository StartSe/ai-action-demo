import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import ipaddr from "ipaddr.js";
import { AppError } from "./api";

export function publicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
export function publicUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new AppError("Cole um endereço completo, começando com https://.");
  }
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !["80", "443"].includes(url.port))
  )
    throw new AppError(
      "Use um link público HTTP ou HTTPS, sem senha nem porta personalizada.",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    (ipaddr.isValid(host) && !publicAddress(host))
  )
    throw new AppError("Esse endereço não é público.");
  return url;
}
// Resolve and pin a public address for every redirect, preventing DNS rebinding and SSRF.
export async function download(
  input: string,
  signal?: AbortSignal,
  redirects = 0,
): Promise<{ bytes: Buffer; type: string; url: string }> {
  const url = publicUrl(input);
  if (redirects > 4)
    throw new AppError(
      "A página redirecionou muitas vezes. Cole o endereço final.",
    );
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw new AppError("Esse endereço não é público.");
  const address = addresses[0];
  const result = await new Promise<{
    bytes: Buffer;
    type: string;
    redirect?: string;
  }>((resolve, reject) => {
    const request = (url.protocol === "https:" ? https : http).request(
      url,
      {
        method: "GET",
        family: address.family,
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
          : AbortSignal.timeout(25000),
        headers: {
          "User-Agent": "Mapify/1.0 (+public-content-reader)",
          Accept: "text/html,application/pdf,text/plain",
          "Accept-Encoding": "identity",
        },
        lookup: (_hostname, _options, cb) =>
          cb(null, address.address, address.family),
      },
      (response) => {
        if (
          [301, 302, 303, 307, 308].includes(response.statusCode || 0) &&
          response.headers.location
        ) {
          response.resume();
          resolve({
            bytes: Buffer.alloc(0),
            type: "",
            redirect: new URL(response.headers.location, url).href,
          });
          return;
        }
        if ((response.statusCode || 500) >= 400) {
          response.resume();
          reject(
            new AppError(
              "A página não permitiu a leitura. Tente outro link ou cole o texto.",
            ),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk) => {
          size += chunk.length;
          if (size > 15 * 1024 * 1024) {
            request.destroy(
              new AppError("A fonte ultrapassa 15 MB. Use um arquivo menor."),
            );
          } else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            bytes: Buffer.concat(chunks),
            type: response.headers["content-type"] || "",
          }),
        );
        response.on("error", reject);
      },
    );
    request.on("error", reject);
    request.end();
  });
  if (result.redirect) return download(result.redirect, signal, redirects + 1);
  return { ...result, url: url.href };
}
