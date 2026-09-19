// Tipos da escuta do navegador (Web Speech API), usados por components/SalaVoz.tsx.
//
// `speechSynthesis` (a fala) já vem do DOM do TypeScript e não precisa de nada aqui; `SpeechRecognition`
// (a escuta) ainda não está em `lib.dom.d.ts` na versão 5.9, então as partes que a sala de treino usa
// são declaradas aqui — mesmo molde de lib/elevenlabs-convai.d.ts, que faz isto para o elemento do
// widget de voz. Arquivo sem `import`/`export` de propósito: é assim que ele se junta ao escopo global.
//
// Só o Chrome (e os navegadores baseados nele) implementam isso hoje, e só com o prefixo `webkit`. Por
// isso as duas entradas de `Window` são opcionais: a sala tem de funcionar sem nenhuma delas.

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(indice: number): SpeechRecognitionAlternative;
  readonly [indice: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(indice: number): SpeechRecognitionResult;
  readonly [indice: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

/** `error` vale "not-allowed" (microfone negado), "no-speech", "aborted", "network", entre outros. */
interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((evento: SpeechRecognitionEvent) => void) | null;
  onerror: ((evento: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

interface SpeechRecognitionConstrutor {
  new (): SpeechRecognition;
}

interface Window {
  SpeechRecognition?: SpeechRecognitionConstrutor;
  webkitSpeechRecognition?: SpeechRecognitionConstrutor;
}
