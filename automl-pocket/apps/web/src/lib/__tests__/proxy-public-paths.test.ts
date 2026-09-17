import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

function run(path: string) {
  return proxy(new NextRequest(`http://localhost:3000${path}`));
}

describe("proxy — rotas públicas", () => {
  it("redireciona `/` sem sessão para /login (sem home pública)", () => {
    const response = run("/");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("`/` preserva a query string ao redirecionar para /login", () => {
    const response = run("/?ref=teste");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?ref=teste",
    );
  });

  it("redireciona /projects sem sessão para /login", () => {
    const response = run("/projects");
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("não torna rotas arbitrárias públicas", () => {
    const response = run("/abc");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login",
    );
  });

  it("preserva a query string ao redirecionar rota protegida", () => {
    const response = run("/projects?ref=abc");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?ref=abc",
    );
  });
});
