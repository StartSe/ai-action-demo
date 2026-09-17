import Image from "next/image";

import { cn } from "@/lib/utils";

import icon from "../../../public/automl-icon.png";

// O PNG de origem tem 512 px: sem width/height explícitos o next/image gera
// srcSet a partir dele e o celular baixa a variante de 1080 px para um logo
// de 36 px. Com o tamanho real, as variantes servidas são 48/96 px.
const ICON_SIZE = 36;

// Marca genérica: ícone (public/automl-icon.png) + texto "AutoML". O texto
// herda o padrão tipográfico atual e fica branco na variante dark.
export function Logo({
  className,
  dark = false,
  iconOnly = false,
}: {
  className?: string;
  dark?: boolean;
  iconOnly?: boolean;
}) {
  if (iconOnly) {
    return (
      <Image
        src={icon}
        alt=""
        aria-hidden
        width={ICON_SIZE}
        height={ICON_SIZE}
        className={cn("size-9 rounded-lg object-contain", className)}
        priority
      />
    );
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src={icon}
        alt=""
        aria-hidden
        width={ICON_SIZE}
        height={ICON_SIZE}
        className="size-9 rounded-lg object-contain"
        priority
      />
      <span
        className={cn(
          "text-lg font-semibold tracking-tight",
          dark ? "text-white" : "text-foreground",
        )}
      >
        Auto
        <span className="bg-gradient-to-r from-blue-600 to-cyan-400 bg-clip-text text-transparent">
          ML
        </span>
      </span>
    </div>
  );
}
