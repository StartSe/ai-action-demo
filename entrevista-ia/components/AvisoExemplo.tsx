"use client";
// O aviso que toda lista com dado de exemplo mostra (US-004).
//
// Uma frase, sempre no mesmo lugar (acima do conteúdo) e sempre com a mesma saída: conectar a IA. Sem
// ele, quem abre o app cheio não tem como saber que aquela vaga e aqueles candidatos não são dele — e
// uma lista de pessoas inventadas sem etiqueta é pior que uma tela vazia.
//
// É um componente, e não uma cópia por tela, porque são várias listas: a frase muda (o que é de
// exemplo em cada uma), o convite e o endereço não. O endereço das Configurações fica **aqui dentro**,
// num `href` — scripts/verificar-jargao.mjs limpa atributos técnicos antes de varrer, então este é o
// único jeito de um componente compartilhado carregar o link sem exceção no verificador.
import type { ReactNode } from "react";
import { Aviso } from "@/components/ui";

export function AvisoExemplo({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5">
      <Aviso tom="warn">
        {children}
        <div className="mt-2.5">
          <a className="btn-link text-[13px]" href="/setup#openrouter">Conectar a IA</a>
        </div>
      </Aviso>
    </div>
  );
}
