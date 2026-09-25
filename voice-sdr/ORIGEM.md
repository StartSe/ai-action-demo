# De onde veio esta pasta

A Voice SDR nasceu no repositório `StartSe/toolkit-sarah-voice-sdr` e entrou na suíte IA para Executivos como cópia dos arquivos versionados de lá.

- Repositório: `StartSe/toolkit-sarah-voice-sdr`
- Ref: `main`
- Commit: `16c965647424ddf03669a92c5371db0629700c9b`
- Copiado em: 2026-09-25

## Daqui em diante

Decisão do dono: o desenvolvimento pode acontecer **aqui**, nesta pasta, e a versão sobe pelo padrão da suíte (`version` do `package.json` desta pasta, `versao` da entrada `voice-sdr` do `catalogo.json` e uma entrada no `CHANGELOG.md`, no mesmo commit, no estilo `feat(voice-sdr): lança v0.2.0 com ...`).

O instalador do painel da StartSe (`StartSe/ai-hub`) ainda lê `instalacao.json` e `instalacao/` do repositório de origem (`StartSe/toolkit-<id>`, na `main`; ver `docs/instalacao.md` §7). Enquanto isso não mudar, uma alteração em `supabase/` feita só aqui não chega ao Supabase de nenhum cliente, e a tela passa a mostrar a faixa de versão (`AvisoDeVersao`) quando esperar um banco que o instalador ainda não entrega. Mudança de banco ou função precisa chegar também à origem, ou o painel precisa passar a ler daqui.

## O que difere da origem

| Arquivo | Por quê |
|---|---|
| `README.md` | No formato da suíte. O README da origem está em `docs/desenvolvimento.md`. |
| `render.yaml` | Gerado por `scripts/gerar-deploy.mjs` da suíte: imagem `ghcr.io/startse/voice-sdr`, não site estático. |
| `Dockerfile`, `.dockerignore`, `server.mjs`, `docker-compose.yml`, `.env.example` | Publicação por imagem, no padrão da suíte. |
| `testes/estatica/imagem-da-suite.test.ts` | Substitui `testes/estatica/blueprint-do-render.test.ts`, que conferia o Blueprint de site estático. |
| `CHANGELOG.md` | Notas de versão da suíte. |
| `version` em `package.json` e `package-lock.json` | Versão da suíte (a origem está em `0.0.0`). |
| `prd*.json`, `progress.txt` | Ficaram de fora: estado do Ralph na origem, não produto. |

## Sincronizar de novo

```bash
voice-sdr/scripts/sincronizar-da-origem.sh [caminho-do-clone] [ref]
# padrão: ../toolkit-sarah-voice-sdr (irmão deste repositório) e main
```

O script copia só os arquivos versionados no ref (`git archive`), aplica a tabela acima, preserva a versão e atualiza o commit neste arquivo. **Ele sobrescreve o que mudou aqui** fora da lista `PROPRIOS` do próprio script: se já houve desenvolvimento nesta pasta, confira o `git diff` antes de commitar, ou traga a mudança à mão.
