# Predictive Harness — v0.1.0

Análise de dados por conversa em que o modelo de linguagem pensa e escreve e o **Jev** (System One model da TypeSafe, servido pelo OpenRouter) toma as decisões rápidas e tipadas do caminho: o que a pessoa quer, se a planilha responde, se os números da resposta batem com os dados, que gráfico cabe, quando pedir validação humana. Aplicação independente da suíte **IA para Executivos**, com as conexões no padrão do Build Agentflows. A proposta completa está em [PLANO.md](PLANO.md).

[Publicar no Render](https://render.com/deploy?repo=https://github.com/StartSe/ai-action-app-deploy/tree/deploy-predictive-harness)

## O que faz nesta versão

1. Crie a conta desta instalação ao abrir o app. Uma planilha de exemplo (vendas por região e canal, 24 meses) já vem pronta, com três perguntas cujas respostas são calculadas localmente e marcadas como exemplo.
2. Envie uma planilha em CSV ou JSON (até 20 MB, 200 mil linhas). O app lê no servidor, calcula o perfil (tipos, período, vazios, duplicados) e, com o OpenRouter conectado, classifica cada coluna com o Jev em **uma chamada**: tipo semântico (data, moeda, quantidade, percentual, categoria, identificador, local, texto livre), se é um alvo plausível de previsão e se contém dado pessoal, cada uma com confiança.
3. Pergunte em português. Cada mensagem percorre o laço do harness:
   - **Triagem (Jev)**: intenção, se as colunas respondem, se precisa de cálculo linha a linha, se precisa de contexto externo, ambiguidade, complexidade e dado pessoal.
   - **Roteamento (código)**: caminho da resposta e modelo (padrão ou o "modelo para análises complexas", quando a complexidade é alta).
   - **Resposta (ChatGPT ou modelo do OpenRouter)**: escrita só a partir do perfil e dos agregados (totais por mês, por categoria e variação entre janelas). As linhas nunca vão para a IA.
   - **Verificação (Jev)**: a resposta responde à pergunta? Os números batem com os agregados? Se não batem, o modelo reescreve uma vez. Que gráfico ajudaria? Pede validação humana?
   - **Próximas perguntas**: o modelo propõe cinco, o Jev ranqueia, ficam três.
4. A coluna **Harness** mostra, para cada resposta, todas as decisões com probabilidade e confiança, o número de chamadas ao Jev, tempo e custo. Decisões abaixo da confiança mínima levam ao caminho conservador e ficam marcadas.

Fica para as próximas versões (ver PLANO.md): execução de código em sandbox, busca na web, gráficos, geração de imagem para slides, previsões com intervalo, XLSX, MCP e formulário público.

## Conexões

A tela **Configurações** tem o mesmo desenho do Build Agentflows:

- **ChatGPT**: assinatura conectada por código de dispositivo pelo [Codex App Server](https://learn.chatgpt.com/docs/app-server) oficial (`@openai/codex` fixado em 0.155.1), com os limites de uso da conta. Sessão privada em `DATA_DIR/chatgpt`; nunca herda credenciais da máquina.
- **OpenRouter** (obrigatório): conexão em um clique (OAuth PKCE) ou chave colada, gravada cifrada. É onde vive o Jev (`typesafe/jev-1.13`, `POST /api/v1/systemone`, em beta) e também oferece modelos de conversa. O botão **Testar decisão** faz uma chamada real e pequena e mostra endereço que respondeu, latência, custo e a resposta bruta.
- **Modelo da conversa**: ChatGPT ou OpenRouter, escolhido explicitamente; nunca há fallback silencioso entre provedores. Opcionalmente um segundo modelo para análises complexas.

Sem o OpenRouter, o harness não roda: a planilha de exemplo responde só às perguntas sugeridas e as demais planilhas só mostram o perfil.

## Rodar localmente

Node 22.13+ para o servidor; Node 24 para os testes TypeScript.

```sh
npm ci
npm run dev -- --port 3022
```

Abra http://localhost:3022, crie a conta e, em Configurações, conecte o ChatGPT e o OpenRouter. `/?exemplo=1` abre a planilha de exemplo e envia a primeira pergunta sugerida.

```sh
npm test        # contratos do Jev (sem crédito), leitura e perfil de planilhas, protocolo do ChatGPT (fixture)
npm run lint
npm run build
```

## Rodar com Docker

```sh
docker compose up --build
```

Abra `http://localhost:3022`. O volume `dados` preserva banco, chave mestra, planilhas e a sessão ChatGPT. Faça backup de **todo** o diretório, inclusive `chave-mestra`.

## Publicar imagem e deploy no Render

O push na `main` publica `ghcr.io/startse/predictive-harness:latest` pelo workflow da suíte e gera a prévia do catálogo. O `render.yaml`, gerado a partir de `catalogo.json`, usa plano Starter e disco persistente de 1 GB em `/app/data`. A imagem precisa estar pública para a instalação sem autenticação no registro. Não use `CONTA_DESLIGADA` em produção.

## Variáveis de ambiente (todas opcionais)

Nada é obrigatório: as conexões são feitas na tela. Variáveis, quando definidas, têm prioridade sobre o que foi salvo.

| Variável | Descrição |
|---|---|
| `DATA_DIR` | Diretório de dados (padrão `./data`; no Docker `/app/data`). |
| `OPENROUTER_API_KEY` | Chave do OpenRouter ([obter](https://openrouter.ai/keys)). Liga o Jev e os modelos do OpenRouter. |
| `AI_PROVIDER` | `chatgpt` (padrão) ou `openrouter`: quem escreve as respostas. |
| `AI_MODEL` / `AI_MODEL_FORTE` | Modelo padrão e modelo para análises complexas (vazio = automático). |
| `CHAVE_MESTRA` | 32 bytes em base64 para cifrar segredos; sem ela, gerada em `DATA_DIR/chave-mestra`. |
| `NOVA_SENHA_ADMIN` | Troca a senha da conta na subida; remova depois. |
| `CONTA_DESLIGADA` | `1` só no contêiner efêmero de captura de prévia. |

## Estrutura

- `lib/jev.ts`: cliente do Jev (três primitivas, normalização tolerante à beta, caminho alternativo, leitura com confiança como segundo eixo).
- `lib/conversa.ts`: o laço do harness, turno a turno, com registro de cada decisão.
- `lib/planilhas.ts`: leitura de CSV e JSON, perfil, agregados para o LLM, classificação pelo Jev e persistência.
- `lib/ai.ts`: o modelo de linguagem (ChatGPT pelo Codex App Server ou OpenRouter), sem fallback entre provedores.
- `lib/chatgpt.ts`, `lib/store.ts`, `lib/conta.ts`, `proxy.ts`: infraestrutura da suíte, copiada do Mapify.
- `lib/demo.ts`: planilha de exemplo e respostas de demonstração calculadas a partir dela.
- `components/Workspace.tsx`, `Dados.tsx`, `Conversa.tsx`, `Harness.tsx`: a tela de três colunas.
- `components/Configuracoes.tsx`, `app/api/conexoes/*`, `app/api/chatgpt/*`: conexões.

## Referências

- [Building a harness with Jev (LangChain)](https://www.langchain.com/blog/building-a-harness-with-jev)
- [TypeSafe: primitivas](https://docs.typesafe.ai/primitives) e [padrões](https://docs.typesafe.ai/patterns)
- [Jev no OpenRouter](https://openrouter.ai/typesafe/jev-1.13) e [SDK TypeSafe pelo OpenRouter](https://openrouter.ai/docs/guides/community/typesafe-sdk)
