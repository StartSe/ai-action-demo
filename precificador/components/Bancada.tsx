"use client";
// A tela do item. Carrega o estado uma vez e, daí em diante, recalcula tudo no navegador: arrastar
// o marcador não dispara requisição nenhuma (critério de aceite E5 do PRD). O que vai ao servidor é
// só a gravação, com atraso — e num caminho separado do desenho.
//
// Desktop: ficha à esquerda (rola), painel à direita (fica). Celular: ficha em coluna única e o
// resultado colado no rodapé, em três linhas que expandem ao toque.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FichaItem } from "./FichaItem";
import { PainelPreco } from "./PainelPreco";
import { Estampa } from "./campos";
import { Aviso, ErrorBox, Loading, Topbar, lerErro, useConfirmacao, useStatus } from "./ui";
import { moeda, percentual } from "@/lib/formato";
import { NAVEGACAO } from "@/lib/navegacao";
import { precificarAutomatico, type CanalVenda, type Item, type LinhaCustoFixo, type LinhaInsumo, type Negocio } from "@/lib/precificacao";

type Estado = {
  negocio: Negocio;
  custosFixos: LinhaCustoFixo[];
  canais: CanalVenda[];
  item: Item;
  insumos: LinhaInsumo[];
  /** Só os canais em que alguém escolheu um preço; o resto segue a margem-alvo. */
  precosEscolhidos: Record<string, number>;
  canalPadraoId: string | null;
};

const ATRASO_FICHA = 700;
const ATRASO_PRECO = 500;

export function Bancada({ id }: { id: string }) {
  const { status, erro: erroStatus } = useStatus();
  const router = useRouter();
  const { confirmar, Dialogo } = useConfirmacao();

  const [estado, setEstado] = useState<Estado | null>(null);
  const [canalId, setCanalId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gravacao, setGravacao] = useState<"parado" | "salvando" | "salvo">("parado");
  const [expandido, setExpandido] = useState(false);

  const temporizadorFicha = useRef<ReturnType<typeof setTimeout> | null>(null);
  const temporizadorPreco = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch(`/api/itens/${id}`)
      .then(async (r) => {
        if (!r.ok) throw r;
        const dados = (await r.json()) as Estado;
        setEstado(dados);
        setCanalId(dados.canalPadraoId ?? dados.canais[0]?.id ?? null);
      })
      .catch(async (e) => setErro((await lerErro(e)).mensagem));
  }, [id]);

  /**
   * Grava a ficha depois que a pessoa para de mexer. Nunca no caminho do recálculo.
   *
   * A resposta não volta para a tela. Os ids das linhas nascem no cliente (ver `linhaNova` em
   * FichaItem), então não há nada para reconciliar — e devolver a lista do servidor apagaria a
   * linha recém-adicionada que ainda não tem nome, porque linha sem nome não é persistida. Era esse
   * o bug em que a ficha "trocava de aba e voltava" ao adicionar um insumo.
   */
  function agendarFicha(proximo: Estado) {
    if (temporizadorFicha.current) clearTimeout(temporizadorFicha.current);
    temporizadorFicha.current = setTimeout(() => {
      setGravacao("salvando");
      fetch(`/api/itens/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...proximo.item, insumos: proximo.insumos }),
      })
        .then((r) => {
          if (!r.ok) throw r;
          setErro(null);
          setGravacao("salvo");
        })
        .catch(async (e) => {
          setErro((await lerErro(e)).mensagem);
          setGravacao("parado");
        });
    }, ATRASO_FICHA);
  }

  function mudarItem(mudanca: Partial<Item>) {
    setEstado((atual) => {
      if (!atual) return atual;
      const proximo = { ...atual, item: { ...atual.item, ...mudanca } };
      agendarFicha(proximo);
      return proximo;
    });
  }

  function mudarInsumos(insumos: LinhaInsumo[]) {
    setEstado((atual) => {
      if (!atual) return atual;
      const proximo = { ...atual, insumos };
      agendarFicha(proximo);
      return proximo;
    });
  }

  /** Mexer no preço tira o canal do automático: daqui em diante ele é escolha da pessoa. */
  function mudarPreco(canal: string, preco: number) {
    setEstado((atual) => (atual ? { ...atual, precosEscolhidos: { ...atual.precosEscolhidos, [canal]: preco } } : atual));
    if (temporizadorPreco.current) clearTimeout(temporizadorPreco.current);
    temporizadorPreco.current = setTimeout(() => {
      setGravacao("salvando");
      fetch(`/api/itens/${id}/preco`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canalId: canal, preco }) })
        .then(() => setGravacao("salvo"))
        .catch(() => {
          setErro("Não foi possível guardar o preço. Ele continua na tela, mas pode se perder ao recarregar.");
          setGravacao("parado");
        });
    }, ATRASO_PRECO);
  }

  /** Devolve o canal ao preço da margem-alvo, que volta a acompanhar a ficha. */
  function voltarAoAutomatico(canal: string) {
    if (temporizadorPreco.current) clearTimeout(temporizadorPreco.current);
    setEstado((atual) => {
      if (!atual) return atual;
      const precosEscolhidos = { ...atual.precosEscolhidos };
      delete precosEscolhidos[canal];
      return { ...atual, precosEscolhidos };
    });
    fetch(`/api/itens/${id}/preco?canal=${encodeURIComponent(canal)}`, { method: "DELETE" }).catch(() => {
      setErro("Não foi possível voltar ao preço automático. Recarregue a página.");
    });
  }

  async function apagar() {
    if (!(await confirmar(`Apagar "${estado?.item.nome}"? O histórico de preço dele vai junto.`, { confirmarRotulo: "Apagar o item" }))) return;
    await fetch(`/api/itens/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (erro && !estado) {
    return (
      <>
        <Topbar marca="P" nome="Precificador" area="Financeiro" status={status} erro={erroStatus} navegacao={NAVEGACAO} />
        <main className="max-w-[900px] mx-auto px-8 py-10 max-md:px-4">
          <ErrorBox mensagem={erro} />
          <Link className="btn-link mt-4 inline-block" href="/">
            Voltar para os itens
          </Link>
        </main>
      </>
    );
  }

  if (!estado || !canalId) {
    return (
      <>
        <Topbar marca="P" nome="Precificador" area="Financeiro" status={status} erro={erroStatus} navegacao={NAVEGACAO} />
        <main className="max-w-[900px] mx-auto px-8 py-10 max-md:px-4">
          <Loading texto="Abrindo a bancada" />
        </main>
      </>
    );
  }

  const canal = estado.canais.find((c) => c.id === canalId) ?? estado.canais[0];
  const { derivados, automatico } = precificarAutomatico(
    { negocio: estado.negocio, custosFixos: estado.custosFixos, item: estado.item, insumos: estado.insumos, canal },
    estado.precosEscolhidos[canal.id]
  );
  const preco = derivados.preco;

  return (
    <>
      <Topbar marca="P" nome="Precificador" area="Financeiro" status={status} erro={erroStatus} navegacao={NAVEGACAO} usuario={status?.usuario} />
      {Dialogo}

      <main className="max-w-[1240px] mx-auto px-8 pt-6 pb-12 max-md:px-4 max-md:pt-4 com-rodape">
        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <Link className="btn-link text-[13px]" href="/">
              Itens
            </Link>
            <h1 className="titulo-painel !text-[26px] md:!text-[30px] mt-1">{estado.item.nome || "Item sem nome"}</h1>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* Não há botão de salvar: a ficha grava sozinha. Sem dizer isso na tela, a pessoa
                fica procurando o botão — então o estado da gravação é sempre visível. */}
            <span className="apoio" aria-live="polite">
              {gravacao === "salvando" ? "Salvando…" : gravacao === "salvo" ? "Tudo salvo" : "Salva sozinho"}
            </span>
            <button type="button" className="btn-link text-muted hover:text-danger" onClick={apagar}>
              Apagar
            </button>
          </div>
        </div>

        {erro && <Aviso tom="warn">{erro}</Aviso>}

        <div className="grid grid-cols-[minmax(0,1fr)_420px] gap-8 items-start max-lg:grid-cols-1">
          <FichaItem
            negocio={estado.negocio}
            custosFixos={estado.custosFixos}
            item={estado.item}
            insumos={estado.insumos}
            onItem={mudarItem}
            onInsumos={mudarInsumos}
          />

          <div className="card p-5 lg:sticky lg:top-6 max-md:hidden">
            <PainelPreco
              negocio={estado.negocio}
              custosFixos={estado.custosFixos}
              item={estado.item}
              insumos={estado.insumos}
              canais={estado.canais}
              canalAtivo={canal}
              onCanal={setCanalId}
              precosEscolhidos={estado.precosEscolhidos}
              onPreco={mudarPreco}
              onAutomatico={voltarAoAutomatico}
            />
          </div>
        </div>
      </main>

      {/* Celular: três linhas coladas no rodapé, que abrem o painel inteiro ao toque. */}
      <div className="rodape-resultado md:hidden">
        <button type="button" className="w-full text-left px-4 py-3 cursor-pointer" onClick={() => setExpandido(!expandido)} aria-expanded={expandido}>
          <div className="flex items-center justify-between gap-3">
            <span className="cifra-media">{moeda(preco)}</span>
            <Estampa estado={derivados.estado} />
          </div>
          <div className="flex items-center justify-between gap-3 mt-0.5 text-[13px]">
            <span className="text-ink-2">
              {canal.nome} · margem <span className="cifra font-semibold">{percentual(derivados.margemLiquidaPct)}</span>
              {automatico && " · automático"}
            </span>
            <span className="text-muted">{expandido ? "fechar" : "ver detalhes"}</span>
          </div>
          <div className="apoio mt-0.5">Desconto máximo de {percentual(derivados.descontoMaximoPct)}</div>
        </button>

        {expandido && (
          <div className="max-h-[70vh] overflow-y-auto px-4 pb-6 border-t border-line pt-4">
            <PainelPreco
              negocio={estado.negocio}
              custosFixos={estado.custosFixos}
              item={estado.item}
              insumos={estado.insumos}
              canais={estado.canais}
              canalAtivo={canal}
              onCanal={setCanalId}
              precosEscolhidos={estado.precosEscolhidos}
              onPreco={mudarPreco}
              onAutomatico={voltarAoAutomatico}
            />
          </div>
        )}
      </div>
    </>
  );
}
