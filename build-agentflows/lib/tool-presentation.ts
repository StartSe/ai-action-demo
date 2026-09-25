const names: Record<string, string> = {
  calculadora: "Calculadora", read_file: "Ler arquivo", write_file: "Salvar arquivo", web_browser: "Ler página da web",
  request_get: "Consultar serviço", request_post: "Enviar dados a um serviço", openapi: "Conectar API da empresa", e2b: "Executar código com E2B",
};
export function toolTitle(tool: { name: string; label?: string }) { return names[tool.name] || tool.label || tool.name; }
