type EstadoOrbe = "parado" | "conectando" | "ouvindo" | "pensando" | "falando";

/** Indicador visual do estado da conversa; o controle do microfone fica no botão abaixo. */
export function OrbeVoz({ estado, encerrando }: { estado: EstadoOrbe; encerrando: boolean }) {
  return (
    <div className="orbe-palco" data-estado={encerrando ? "pensando" : estado} aria-hidden="true">
      <div className="orbe-halo" />
      <div className="orbe-anel" />
      <div className="orbe-esfera">
        <div className="orbe-fluxo" />
        <div className="orbe-luz" />
      </div>
    </div>
  );
}
