# Revisão de UI e UX — Simulador de Vendas

Data: 18/09/2026. Trabalho isolado na branch `feat/simulador-vendas-ux`.

## Análise e ajustes

| Atrito observado | Ajuste |
| --- | --- |
| Falha no resumo inicial aparecia como carregamento permanente | Mensagem de erro e nova tentativa explícita |
| Falha na lista parecia ausência de treinos; atualizar apagava dados já carregados | Separação entre falha, carregamento e vazio; preservação da lista e ação de atualização |
| Treinos pausados não tinham filtro; busca sem resultado exigia desfazer filtros manualmente | Filtro de pausados, alvos de toque maiores e botão para limpar filtros |
| Compartilhar o link exigia abrir o menu | Copiar link diretamente no cartão, com confirmação anunciada |
| Nomes longos eram cortados no celular | Quebra de linha nos títulos e produtos |
| Menu declarava semântica de menu sem implementar navegação de menu | Botões nativos com Tab, fechamento ao perder foco e Escape devolvendo foco ao acionador |
| Troca de etapa podia deixar foco e rolagem no fim da tela anterior | Foco no título da etapa e reposicionamento da rolagem |
| Seletor de produto misturava nome e descrição longa | Nome no seletor; estado do conhecimento logo abaixo |
| Formulário continuava editável durante criação | Campos bloqueados durante envio; erro junto à ação, mantendo valores |
| Regras estavam espalhadas pelo formulário | Resumo antes da criação; instrução de compartilhamento respeita feedback oculto |
| Falha ao preparar conversa não oferecia recuperação | Nova tentativa na própria tela |
| Mensagem em campo de uma linha, sem rótulo; histórico inacessível durante a conversa | Campo multilinha rotulado, Enter/Shift+Enter, respeito à composição de texto e histórico expansível |
| Envio ainda podia ser acionado durante encerramento; ações apertadas no celular | Guarda síncrona de estado e encerramento; ações com quebra de linha |

## Validação

- `npm install --no-audit --no-fund` sem alterações de dependências.
- `npm run lint`: zero erros; um aviso preexistente de `img` em `components/setup.tsx`.
- `npm run build`: compilação, TypeScript e geração de páginas concluídos.
- `node scripts/verificar-jargao.mjs simulador-vendas` e `node scripts/verificar-paleta.mjs`: aprovados.
- Servidor standalone com dados temporários, sem credenciais reais.
- Chrome via Playwright: fluxo em 1400×1000 e 390×844, 42 verificações aprovadas e nenhum erro JavaScript de página. Inclui falhas HTTP induzidas no início, lista, criação e preparação; recuperação; preservação do formulário; foco; cópia; pausa/reativação; filtros; criação; conversa; feedback e configuração.
- Capturas revisadas das etapas, lista, conversa e configuração, sem transbordamento horizontal.
- Saúde, status, configuração, produtos, equipe, resultados e histórico responderam 200. Criação inválida respondeu 400; identificação com link inexistente respondeu 404.
- Configuração: chave fictícia da IA salva, status atualizado, teste recusado com mensagem clara, chave removida e demonstração restaurada. Integrações sem credenciais retornaram orientação de configuração.

## Limites

Validação funcional em demonstração. Reconhecimento de voz com microfone real, agente ElevenLabs, CRM e envio de e-mail não foram exercitados com contas reais. A infraestrutura compartilhada e os contratos das rotas não foram alterados.
