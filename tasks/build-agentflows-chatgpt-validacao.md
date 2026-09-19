# Build Agentflows: editor e ChatGPT

Implementação própria inspirada no Flowise Agentflows v2 (referência e commit no README). Foco em biblioteca de fluxos, canvas completo e execuções. Configuração genérica retirada; endpoints antigos retornam 410. Integração publicada no próprio editor; ferramentas opcionais configuradas no bloco.

IA exclusivamente por login ChatGPT no Codex App Server 0.155.1. Nenhuma chave de IA ou fallback automático. Demonstração selecionada explicitamente. Autenticação da conta administrativa permanece separada da conexão ChatGPT.

Validação em 18/09/2026:

- 19 testes passam: grafos, versões, aprovação, ciclos, cancelamento, ferramentas permitidas, falhas sem fallback, conexão e protocolo do subprocesso.
- Lint e build de produção passam.
- Verificadores de padrão, paleta e jargão passam; exceções de infraestrutura documentadas.
- Navegador Chrome em standalone com conta administrativa temporária: biblioteca, editor, diálogo do bloco, simulação, publicação, código de integração, conexão ChatGPT e histórico. Sem erros de página.
- Capturas conferidas em 1400×1000 e 390×844; sem overflow horizontal no celular.
- Binário oficial incluído no standalone e leitura de conta sem autenticação verificada. O Linux usa o binário musl distribuído pelo pacote oficial; imagem Docker não foi construída localmente.

Limite de validação: testes de autenticação e turnos usam o protocolo simulado. Não houve login em conta ChatGPT real nem consumo de assinatura. A execução real exige a conexão da conta pelo usuário. Importação/exportação usa formato próprio; não há compatibilidade com arquivos Flowise.
