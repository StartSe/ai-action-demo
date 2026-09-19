# Análise e revisão do Clone de Site

Revisão feita na worktree `feat/clone-site-ux`, a partir de `0ef652e`, em 18/09/2026.

## Referência e diagnóstico

Foi consultado o [screenshot-to-code](https://github.com/abi/screenshot-to-code), commit `d026163f586dfa8c5c10d28c36edd59a9d3b0e88`, incluindo `frontend/src/components/unified-input/tabs/UploadTab.tsx` e `frontend/src/components/preview/PreviewPane.tsx`. Seu fluxo separa escolha da referência, geração e inspeção; a prévia oferece controles de dispositivo, código e versões. Esses princípios orientaram a revisão, sem incorporar código ou dependências do projeto externo.

O app local já adapta a referência para a marca, gera HTML, permite editar por instrução, restaura versões e compartilha páginas. A revisão encontrou obstáculos concretos no percurso:

| Observação no app local | Ajuste implementado |
| --- | --- |
| Referências aparecem só em miniaturas sem interação | Ampliação acessível da imagem completa, com rolagem |
| Prévia fica restrita à coluna do formulário | Tela cheia com computador/celular e isolamento do conteúdo preservado |
| Moldura branca enquanto carrega recursos | Mensagem de carregamento até o evento de carga da prévia |
| Exemplo dispara geração imediatamente | Preenche primeiro; a pessoa revisa e usa “Gerar a página” |
| Arquivo inválido apaga a referência existente | Preserva a captura anterior e explica o problema |
| Leitura assíncrona pode sobrescrever uma escolha posterior | Controle da leitura vigente e bloqueio durante preparação/geração |
| Falha de consulta parece histórico vazio | Mensagem de indisponibilidade e caminho para abrir o histórico |
| Respostas HTML de erro vazam como erro de interpretação no editor | Tratamento pelo leitor de erros da suíte, mantendo a instrução |
| Alternador usa papel de rádio sem navegação de rádio | Botões nativos com estado `aria-pressed` e acesso por teclado |

O formulário também informa a dependência do serviço de captura para URLs de sites, valida cores antes do envio e explica o modo demonstração antes de gerar. Diálogos usam foco inicial, fechamento por Escape/botão/área externa, bloqueio da rolagem de fundo e retorno de foco ao acionador.

## Validação

- `npm ci`: instalação concluída, auditoria sem vulnerabilidades.
- `npm run lint`: zero erros; aviso preexistente sobre imagem em `components/setup.tsx`.
- `npm run build` e TypeScript: aprovados.
- Jargão e paleta: aprovados.
- Verificador de padrão: `clone-site` aprovado. O verificador global já falha na main por divergências em entrevista-ia, radar-sinais e videos-campanha; a revisão não modifica esses apps nem arquivos compartilhados.
- Chromium: exemplo sem geração automática, arquivo inválido preservando referência, geração demonstrativa, ampliação, Escape e retorno de foco, edição, restauração, resultado salvo, viewport de 390 px sem transbordamento horizontal e prévia em 1400×900. Testes adicionais simulam falha de geração com nova tentativa e resposta HTML de erro na edição.

### Reproduzir o teste de navegador

Use uma instância local descartável, sem chaves de IA, com banco separado. O teste cria páginas e versões demonstrativas. Playwright é uma ferramenta externa de verificação; não é dependência do app.

```sh
# Na pasta clone-site, em um terminal
CONTA_DESLIGADA=1 DATA_DIR=/tmp/clone-site-ux-test npm run dev -- --port 3118

# Em outro terminal, com Playwright/Chromium já instalados
PLAYWRIGHT_MODULE=/caminho/node_modules/playwright node scripts/verificar-ux.mjs
```

O teste salva capturas em `/tmp/clone-site-desktop.png`, `/tmp/clone-site-mobile.png` e `/tmp/clone-site-mobile-dialog.png`. `TEST_URL` permite apontar para outra instância descartável.

## Limites observados

Gerar uma página a partir de qualquer site público depende de acesso ao site, do serviço de captura e de um modelo com visão configurados. Sites autenticados ou que bloqueiam captura podem exigir envio manual de imagem. Não houve chamada paga de IA ou captura externa nesta revisão; os testes de geração usaram o modo demonstrativo, e os de erro usaram respostas controladas.

A geração atual ainda mantém uma requisição aberta. A tela agora informa que a aba deve permanecer aberta. A PRD de projetos em segundo plano (`tasks/prd-clone-site-projetos.md`) é um plano existente e separado; não se afirma que ela tenha sido implementada nesta revisão de UI/UX.
