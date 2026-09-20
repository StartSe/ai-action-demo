# Unificação visual do observatório

Solicitação: revisar configurações e alinhar todas as telas à identidade do painel do gestor.

1. Compartilhar navegação, marca e tokens; redesenhar configurações com integrações, assistentes, rotinas e opções técnicas no mesmo espaço.
2. Alinhar histórico, entrada, criação de conta, estados de indisponibilidade e impressão; manter os fluxos de negócio.
3. Conferir navegação, ações de configuração, acessibilidade e responsividade em navegador; executar regressão e registrar commits por etapa.

A validação usa armazenamento temporário e não altera as contas ou conexões do usuário. Alterações no projeto vizinho build-agentflows ficam fora dos commits desta revisão.

## Entregue

- Navegação compartilhada em painel, diagnósticos, configurações e histórico. Atalhos para as abas do painel funcionam entre rotas; configurações, histórico e saída continuam acessíveis no celular.
- Configurações com resumo das conexões, integrações, acesso do assistente, rotinas e opções técnicas no mesmo layout. Cores, campos, botões, ícones e espaçamento seguem o observatório.
- Login e criação de conta, biblioteca com busca e estados vazio/erro, páginas de link inexistente/expirado, erro de rota, impressão e ícone da aplicação alinhados à mesma identidade.
- Falhas de carregamento, geração/revogação de acesso e operações de rotina mostram avisos e preservam o estado anterior. Cadastro sinaliza os campos inválidos de forma acessível.

## Validação

- ESLint sem erros ou avisos; build de produção com TypeScript aprovado.
- 10 testes de unidade e 12 testes de navegador, incluindo a regressão completa do gestor.
- Verificação automática de acessibilidade WCAG A/AA em cadastro, login, configurações, histórico, impressão, páginas indisponíveis e fluxos do observatório.
- Conferência visual em 1440×1000 e 390×844. Verificação de navegação e campos em 1366×768, 1024×768, 768×1024, 360×800 e 320×720.
- Integrações externas simuladas nos testes; armazenamento temporário isolado. Não foram enviados e-mails, mensagens ou comandos para serviços externos.

Commits por etapa: `6b31099` (estrutura e configurações), `2b8cf2c` (demais telas), seguido do commit de validação e estados de falha.
