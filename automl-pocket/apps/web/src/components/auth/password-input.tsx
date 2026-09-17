"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

// Campo de senha compartilhado (cadastro, login e redefinição) com botão de
// mostrar/ocultar. O botão fica fora da ordem de tabulação para não atrasar
// o fluxo teclado → submit; continua acessível por clique e leitores de tela.
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        className={cn("pr-9", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        onClick={() => setVisible((value) => !value)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
