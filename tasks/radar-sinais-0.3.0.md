# Radar de Sinais 0.3.0

Implementação e verificação em 20/09/2026. Escopo: notificações, StartSe, SearchAPI, chat contextual, tela cheia, páginas monitoradas e organização dos radares.

## Requisitos e evidências

| Requisito | Implementação | Verificação |
| --- | --- | --- |
| Remover notificações | Cartões/canais e OAuth de e-mail removidos; `rotinas.ts` nunca envia; módulos antigos vazios | `tests/fluxo.test.ts` verifica zero envios mesmo com credenciais legadas; navegador verifica ausência do cartão e agenda interna |
| StartSe como fonte | Fonte pública direcionada a `startse.com/artigos`, site incluído no cadastro inicial e migração | `tests/fontes-paginas-chat.test.ts` valida query e veículo; `tests/pesquisa.test.ts` verifica fonte na síntese |
| SearchAPI | Chave cifrada pelo setup; Google com recorte temporal/site e normalização de evidências | Teste de cabeçalho, filtro, URLs privadas e rejeição da chave; fluxo completo no navegador com API simulada |
| Chat especialista | `ChatRadar`, `/api/radar/chat`, contexto salvo recuperado por ID no servidor, foco do nó e referências validadas | Teste de contexto isolado, exemplo recusado, limites e referências inventadas; conversa, fontes e botão “Ver no mapa” no navegador |
| Tela cheia | Grafo ocupa a área principal, painel translúcido sobre ele, botão ocultar/exibir; rótulos visíveis em grafos pequenos | Desktop 1440×1000 e celular 390×844; dimensões do grafo, posição absoluta do painel, ESC e conversa |
| Páginas específicas | Até oito URLs por radar, Bright Data MCP ou Firecrawl, leitura por rodada sem depender de resultados da busca | Testes de URL completa, conteúdo chegando à síntese, páginas inativas, falha parcial, chave ausente e ferramentas MCP |
| Alternar radares | Cadastros nomeados com configuração, agenda e análises próprias; migração por temas/setor; rascunhos por cadastro na sessão | Migração transacional, rotina semanal sem período, resultados filtrados antes do limite, troca e recarga no navegador |
| Nova versão | 0.3.0 em pacote, lockfile, catálogo e `/api/health` | Build e health check de produção |

## Comandos e resultados

- `npm test`: 39 testes aprovados. Execução sequencial mantém a medição de 300 ms do layout sem disputa com outros testes; não houve relaxamento do limite.
- `npm run lint` e `npx tsc --noEmit`: aprovados.
- `npm run build -- --webpack`: aprovado. O build padrão com Turbopack foi impedido por restrição do ambiente ao abrir processo/porta. O Webpack mantém um aviso anterior de análise estática de `createRequire` no conector ChatGPT; os testes do protocolo passaram.
- `bash scripts/verificar-padrao.sh radar-sinais`, `node scripts/verificar-jargao.mjs radar-sinais` e `git diff --check`: aprovados. Exceções registram a remoção explícita das notificações e o cliente MCP Streamable HTTP já existente.
- Navegador: criação da conta e proteção das APIs, criação de dois radares, salvar tema/página, geração e proveniência, alternância com histórico isolado, recarga, tela cheia, painéis, chat/foco, monitoramento interno e configuração sem notificações. Nenhum erro de página nem overflow horizontal nas larguras verificadas.

## Reproduzir a validação visual

Use um diretório temporário de dados, chaves fictícias e o preload `tests/fixtures/services.mjs`, que simula apenas os serviços externos. **Nunca habilite esse preload em uma instância real.** Construa o app normalmente e execute a saída de produção com `NODE_OPTIONS='--import /caminho/absoluto/tests/fixtures/services.mjs'`. O roteiro `tests/browser.mjs` usa `RADAR_BASE_URL` (padrão `http://127.0.0.1:3123`) e Playwright/Chromium. `PLAYWRIGHT_MODULE` pode apontar para uma instalação existente de Playwright.

Capturas locais da validação: `/tmp/radar-03-fullscreen-desktop.png`, `/tmp/radar-03-chat-desktop.png`, `/tmp/radar-03-fullscreen-mobile.png`, `/tmp/radar-03-chat-mobile.png` e `/tmp/radar-03-setup-mobile.png`.

## Limites

As integrações pagas e as respostas de IA foram simuladas para verificar o fluxo completo sem consumir contas reais. O comportamento remoto depende da chave, cota e disponibilidade de cada fornecedor. As páginas representam retratos de cada coleta; esta versão não calcula diferenças de texto entre coletas. Conversas são mantidas somente enquanto a análise permanece aberta.
