export type VozDisponivel = {
  voice_id: string;
  name: string;
  labels?: { language?: string; accent?: string };
};

/** Prioriza o idioma informado pelo provedor sem presumir que toda voz fala pt-BR. */
export function opcoesDeVoz(vozes: VozDisponivel[]) {
  const classificadas = vozes.map((voz) => {
    const idioma = (voz.labels?.language ?? "").toLowerCase().replaceAll("_", "-");
    const sotaque = (voz.labels?.accent ?? "").toLowerCase();
    const portugues = /^(pt|pt-br|pt-pt|portuguese|português)$/.test(idioma);
    const brasileira = idioma === "pt-br" || (portugues && /brazil|brasil/.test(sotaque));
    const categoria = brasileira ? 0 : portugues ? 1 : 2;
    const descricao = brasileira ? "Português do Brasil" : portugues ? "Português" : voz.labels?.language;
    return { categoria, valor: voz.voice_id, rotulo: `${voz.name}${descricao ? ` (${descricao})` : ""}` };
  });
  return classificadas.sort((a, b) => a.categoria - b.categoria || a.rotulo.localeCompare(b.rotulo, "pt-BR"))
    .map(({ valor, rotulo }) => ({ valor, rotulo }));
}
