// Usa o artefato standalone real, com os assets que também são copiados no Dockerfile.
// DATA_DIR é fornecido pelo Playwright e sempre aponta para um banco temporário.
import { cpSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const pasta = resolve(".next/standalone");
cpSync(".next/static", resolve(pasta, ".next/static"), { recursive: true });
if (existsSync("public")) cpSync("public", resolve(pasta, "public"), { recursive: true });
process.env.PORT = "3217";
process.env.HOSTNAME = "127.0.0.1";
await import(pathToFileURL(resolve(pasta, "server.js")).href);
