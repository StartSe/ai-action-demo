import { readFileSync } from "node:fs";
import { captureProviders } from "./capture-providers.mjs";
const fixture = captureProviders(() => {
  throw Error("Unexpected external request");
});
globalThis.fetch = async (input, init) => {
  const control = JSON.parse(
    readFileSync(process.env.BRAIN_TEST_CONTROL, "utf8"),
  );
  const request = init?.body ? JSON.parse(String(init.body)) : {};
  if (request.messages?.[0]?.content.includes("Organize a fonte")) {
    await new Promise((resolve) => setTimeout(resolve, control.delay || 0));
    fixture.state.failOrganization =
      !!control.fail &&
      request.messages[1].content.includes("Falha controlada");
  }
  return fixture.fetch(input, init);
};
