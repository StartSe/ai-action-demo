// Tipos de rotina deste app: nenhum. A infraestrutura compartilhada (lib/rotinas.ts, app/api/rotinas)
// continua presente por ser INFRA da suíte, mas este app não declara a capacidade "rotina" em
// catalogo.json — classificar lançamentos é sempre uma ação sob demanda, disparada pela pessoa ao
// subir os dois arquivos, nunca algo que faça sentido rodar sozinho em segundo plano.
import type { TipoRotina } from "./rotinas";

export const TIPOS_ROTINA: TipoRotina[] = [];
