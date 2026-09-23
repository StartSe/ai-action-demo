import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, extname } from 'node:path';
import ts from 'typescript';
const raiz = fileURLToPath(new URL('../', import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    let url;
    if (specifier.startsWith('@/')) url = pathToFileURL(resolve(raiz, specifier.slice(2)));
    else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) url = new URL(specifier, context.parentURL);
    if (url && !extname(url.pathname) && existsSync(fileURLToPath(url) + '.ts')) return next(url.href + '.ts', context);
    if (url && specifier.startsWith('@/')) return next(url.href, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.startsWith('file:') && url.endsWith('.ts') && !url.includes('/node_modules/')) {
      return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    }
    return next(url, context);
  },
});
