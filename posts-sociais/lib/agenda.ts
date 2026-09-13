// Gera um convite .ics a partir do "melhor horário" sugerido para um post (texto livre em português).
const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  "terça": 2,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  "sábado": 6,
  sabado: 6,
};

/** Lê o primeiro dia da semana e a primeira hora mencionados no texto; sem nenhum, sugere amanhã às 9h. */
export function proximaDataSugerida(melhorHorario: string, agora = new Date()): Date {
  const texto = String(melhorHorario || "").toLowerCase();
  let diaSemana: number | null = null;
  for (const [nome, indice] of Object.entries(DIAS_SEMANA)) {
    if (texto.includes(nome)) {
      diaSemana = indice;
      break;
    }
  }
  const horaEncontrada = texto.match(/(\d{1,2})\s*h/);
  const hora = horaEncontrada ? Math.min(23, parseInt(horaEncontrada[1], 10)) : 9;

  const alvo = new Date(agora);
  alvo.setSeconds(0, 0);
  if (diaSemana === null) {
    alvo.setDate(alvo.getDate() + 1);
  } else {
    let diff = (diaSemana - agora.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    alvo.setDate(alvo.getDate() + diff);
  }
  alvo.setHours(hora, 0, 0, 0);
  return alvo;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatarDataLocal(d: Date) {
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
}

function formatarDataUtc(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escaparIcs(s: string) {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export function gerarIcsPost({ titulo, descricao, melhorHorario }: { titulo: string; descricao: string; melhorHorario: string }): string {
  const inicio = proximaDataSugerida(melhorHorario);
  const fim = new Date(inicio.getTime() + 30 * 60 * 1000);
  const uid = `post-${Date.now()}-${Math.random().toString(36).slice(2)}@posts-em-minutos`;
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//IA para Executivos//Posts em Minutos//PT",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatarDataUtc(new Date())}`,
    `DTSTART:${formatarDataLocal(inicio)}`,
    `DTEND:${formatarDataLocal(fim)}`,
    `SUMMARY:${escaparIcs(titulo)}`,
    `DESCRIPTION:${escaparIcs(descricao)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return linhas.join("\r\n");
}

export function baixarArquivo(nomeArquivo: string, conteudo: string, tipo: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
