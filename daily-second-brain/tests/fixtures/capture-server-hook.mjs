import { appendFileSync } from "node:fs";
import { captureProviders } from "./capture-providers.mjs";
const fixture = captureProviders();
globalThis.fetch = async (input, init) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.startsWith("https://mcp.zapier.com/") && init?.body) {
    const request = JSON.parse(String(init.body));
    if (request.method === "tools/call") {
      if (process.env.BRAIN_TEST_TRACE)
        appendFileSync(
          process.env.BRAIN_TEST_TRACE,
          JSON.stringify({
            tool: request.params.name,
            args: request.params.arguments,
          }) + "\n",
        );
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  return fixture.fetch(input, init);
};
