import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@compartilhado': fileURLToPath(
        new URL('../supabase/functions/_shared', import.meta.url),
      ),
      // A parte portável da função `leads-import`: a tela de importação lê dali
      // os campos do lead, o palpite de mapeamento e o formato da prévia e do
      // relatório, em vez de manter uma segunda versão do contrato.
      '@importacao': fileURLToPath(
        new URL('../supabase/functions/leads-import', import.meta.url),
      ),
      // A parte portável da função `voice-catalog`: a tela de voz lê dali o
      // formato em que `agents.voice_settings` é gravado e lido, em vez de
      // manter uma segunda tabela de nomes de campo do provedor.
      '@voz': fileURLToPath(
        new URL('../supabase/functions/voice-catalog', import.meta.url),
      ),
      // A parte portável da função `agent-publish`: a tela de playbooks lê
      // dali o relatório dos quatro propósitos, e o dublê de teste atende a
      // publicação pelo mesmo código que a borda roda.
      '@publicacao': fileURLToPath(
        new URL('../supabase/functions/agent-publish', import.meta.url),
      ),
      // A parte portável da função `knowledge-sync`: a tela da base de
      // conhecimento lê dali o relatório por entrada, as frases de cada falha
      // e o hash do documento, e o dublê sincroniza pelo mesmo código da borda.
      '@conhecimento': fileURLToPath(
        new URL('../supabase/functions/knowledge-sync', import.meta.url),
      ),
      // A parte portável da função `call-review`: o painel de evolução dentro
      // da ficha da chamada lê dali os cinco passos do ciclo, a forma de cada
      // proposta e as frases de cada recusa, em vez de manter uma segunda
      // versão do contrato que envelheceria sozinha.
      '@revisao': fileURLToPath(
        new URL('../supabase/functions/call-review', import.meta.url),
      ),
      // A parte portável da função `rehearsal-session`: a tela de ensaio lê
      // dali os modos de conversa e as frases de cada recusa, em vez de manter
      // uma segunda versão do contrato.
      // A parte portável da função `onboarding-suggest`: o assistente de
      // abertura lê dali as etapas, os campos que cada uma aceita e o formato
      // das sugestões, e o dublê sugere pelo mesmo código da borda.
      // A parte portável da função `onboarding-interview`: o dublê atende a
      // entrevista pelo mesmo código da borda.
      '@entrevista': fileURLToPath(
        new URL('../supabase/functions/onboarding-interview', import.meta.url),
      ),
      // A parte portável da função `environment-reset`: o dublê da conta
      // atende o pedido pelo mesmo código da borda.
      '@reset': fileURLToPath(
        new URL('../supabase/functions/environment-reset', import.meta.url),
      ),
      '@sugestoes': fileURLToPath(
        new URL('../supabase/functions/onboarding-suggest', import.meta.url),
      ),
      '@ensaio': fileURLToPath(
        new URL('../supabase/functions/rehearsal-session', import.meta.url),
      ),
      // A parte portável da função `call-diagnose`: o cartão de diagnóstico da
      // ficha da chamada lê dali os achados, as propostas e a lista fechada de
      // alvos, e o dublê analisa pelo mesmo código da borda.
      '@diagnostico': fileURLToPath(
        new URL('../supabase/functions/call-diagnose', import.meta.url),
      ),
      // A parte portável da função `saude`: a tela de conexão e o aviso de
      // versão leem dali o formato da resposta, em vez de manter uma segunda
      // versão dele.
      '@saude': fileURLToPath(
        new URL('../supabase/functions/saude', import.meta.url),
      ),
    },
  },
  server: {
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
