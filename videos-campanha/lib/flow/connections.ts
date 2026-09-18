import { getConfig } from "../store";

/** A configured credential exits demo; remote validity is checked separately. */
export function generationConnections() {
  const muapi = Boolean(getConfig("MUAPI_API_KEY")?.trim());
  const higgsfield = Boolean(getConfig("HIGGSFIELD_CODIGO")?.trim());
  return { muapi, higgsfield, demo: !muapi && !higgsfield };
}
