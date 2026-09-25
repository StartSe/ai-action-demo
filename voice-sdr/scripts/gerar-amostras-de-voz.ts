// Gera as amostras das seis vozes de exemplo do assistente de abertura.
//
// **FORA DE `npm run check`, E DE PROPÓSITO.** Este script fala com a
// ElevenLabs e gasta crédito de síntese (seis frases curtas, alguns centavos).
// Roda uma vez, à mão, por quem tem a chave, e o resultado é commitado: as
// amostras em `app/public/vozes/` e a lista em
// `app/src/configuracao-inicial/vozes-de-exemplo-geradas.ts`. Depois disso,
// ouvir as vozes no assistente não custa nada a conta nenhuma.
//
// Amostra que já está na pasta não é gerada de novo: rodar outra vez depois
// de trocar uma voz só paga a voz nova. A que saiu da lista é apagada.
//
// Uso, da raiz:
//
//   ELEVENLABS_API_KEY=sk_... node scripts/gerar-amostras-de-voz.ts
//
// Quem escolhe as seis é `escolherVozesDeExemplo` (voice-catalog), a mesma
// regra que o teste prova: três de cada gênero, as mais naturais do catálogo em
// português desta chave, completadas pelas vozes prontas da ElevenLabs quando
// faltar. A frase é `FRASE_DA_AMOSTRA`, com o modelo e os ajustes padrão da
// tela de voz.

import { access, mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import {
  corpoDaAmostra,
  eEmPortugues,
  lerCatalogoDoProvedor,
} from '../supabase/functions/voice-catalog/formato-do-provedor.ts'
import {
  FRASE_DA_AMOSTRA,
  ajustesPadrao,
  escolherVozesDeExemplo,
} from '../supabase/functions/voice-catalog/vozes-de-exemplo.ts'

const RAIZ = new URL('../', import.meta.url)
const PASTA_DAS_AMOSTRAS = fileURLToPath(new URL('app/public/vozes/', RAIZ))
const ARQUIVO_DA_LISTA = fileURLToPath(
  new URL('app/src/configuracao-inicial/vozes-de-exemplo-geradas.ts', RAIZ),
)
const API = 'https://api.elevenlabs.io'

async function principal() {
  const chave = process.env.ELEVENLABS_API_KEY?.trim()
  if (!chave) {
    console.error('Defina ELEVENLABS_API_KEY com a chave da ElevenLabs e rode de novo.')
    process.exitCode = 1
    return
  }

  const lista = await fetch(`${API}/v1/voices`, { headers: { 'xi-api-key': chave } })
  if (!lista.ok) throw new Error(`A ElevenLabs recusou a lista de vozes (${lista.status}).`)
  const catalogo = lerCatalogoDoProvedor(await lista.json())
  const emPortugues = catalogo.vozes.filter(eEmPortugues)
  // O catálogo inteiro: a regra filtra português, e a voz preferida pelo dono
  // entra mesmo que seja de outro idioma.
  const escolhidas = escolherVozesDeExemplo(catalogo.vozes)
  console.log(
    `Catálogo: ${catalogo.recebidas} vozes, ${emPortugues.length} em português. Escolhidas: ${escolhidas.map((voz) => voz.nome).join(', ')}.`,
  )

  await mkdir(PASTA_DAS_AMOSTRAS, { recursive: true })
  const corpo = corpoDaAmostra(FRASE_DA_AMOSTRA, ajustesPadrao())
  for (const voz of escolhidas) {
    // Amostra que já existe não se paga de novo.
    const arquivo = `${PASTA_DAS_AMOSTRAS}${voz.id}.mp3`
    if (await access(arquivo).then(() => true, () => false)) {
      console.log(`  ${voz.nome}: já gerada`)
      continue
    }
    const resposta = await fetch(
      `${API}/v1/text-to-speech/${encodeURIComponent(voz.id)}?output_format=mp3_44100_64`,
      {
        method: 'POST',
        headers: { 'xi-api-key': chave, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify(corpo),
      },
    )
    if (!resposta.ok) throw new Error(`A síntese de ${voz.nome} falhou (${resposta.status}).`)
    const audio = Buffer.from(await resposta.arrayBuffer())
    await writeFile(arquivo, audio)
    console.log(`  ${voz.nome}: ${Math.round(audio.byteLength / 1024)} KB`)
  }

  // A amostra de voz que saiu da lista sai da pasta junto.
  for (const nome of await readdir(PASTA_DAS_AMOSTRAS)) {
    if (nome.endsWith('.mp3') && !escolhidas.some((voz) => `${voz.id}.mp3` === nome)) {
      await unlink(`${PASTA_DAS_AMOSTRAS}${nome}`)
      console.log(`  ${nome}: removida`)
    }
  }

  const conteudo = `// GERADO por scripts/gerar-amostras-de-voz.ts. Não edite à mão: rode o script.
//
// As seis vozes de exemplo do assistente de abertura, com a amostra de cada uma
// em app/public/vozes/<id>.mp3.

import type { VozDeExemplo } from '@voz/vozes-de-exemplo.ts'

export const AMOSTRAS_GERADAS = true

export const VOZES_DE_EXEMPLO: readonly VozDeExemplo[] = ${JSON.stringify(escolhidas, null, 2)}
`
  await writeFile(ARQUIVO_DA_LISTA, conteudo)
  console.log(`Lista gravada em ${ARQUIVO_DA_LISTA}. Commite a lista e a pasta app/public/vozes/.`)
}

await principal()
