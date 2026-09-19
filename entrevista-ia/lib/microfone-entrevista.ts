/** Separa pausa manual de pausa durante a fala. Serializa chamadas ao SDK para
 * uma permissão lenta não religar o microfone depois de a entrevistadora começar. */
export class MicrofoneEntrevista {
  private falando = false;
  private pausado = false;
  private interrupcao = false;
  private ativo = false;
  private fechado = false;
  private fila: Promise<void> = Promise.resolve();
  private aplicar: (ativo: boolean) => Promise<unknown>;
  private mudou: (estado: { falando: boolean; pausado: boolean; ativo: boolean }) => void;
  constructor(aplicar: (ativo: boolean) => Promise<unknown>, mudou: (estado: { falando: boolean; pausado: boolean; ativo: boolean }) => void) {
    this.aplicar = aplicar; this.mudou = mudou;
  }
  private sincronizar() {
    const executar = async () => {
      while (!this.fechado) {
        const desejado = !this.pausado && (!this.falando || this.interrupcao);
        if (desejado === this.ativo) break;
        await this.aplicar(desejado);
        this.ativo = desejado;
      }
      if (!this.fechado) this.mudou({ falando: this.falando, pausado: this.pausado, ativo: this.ativo });
    };
    this.fila = this.fila.catch(() => {}).then(executar);
    return this.fila;
  }
  aoFalar(falando: boolean) {
    if (falando !== this.falando) this.interrupcao = false;
    this.falando = falando;
    this.mudou({ falando, pausado: this.pausado, ativo: this.ativo });
    return this.sincronizar();
  }
  pausar(pausado: boolean) { this.pausado = pausado; return this.sincronizar(); }
  interromper() { this.pausado = false; this.interrupcao = true; return this.sincronizar(); }
  fechar() { this.fechado = true; }
}
