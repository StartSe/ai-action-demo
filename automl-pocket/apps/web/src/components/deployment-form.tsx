"use client";

import { useId, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Feature do modelo exibida como campo do formulário público. */
export type DeploymentFormField = {
  name: string;
  type: "number" | "category" | "text" | "date" | "id";
  /** Categorias conhecidas do perfilamento (só para type "category") */
  categories: string[];
};

/** Valores preenchidos ({coluna: valor cru}); vazio = coluna sem valor. */
export type DeploymentFormValues = Record<string, string>;

const OTHER_OPTION = "__automl_other__";

const selectClassName =
  "h-8 w-full min-w-0 appearance-none rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

/**
 * Formulário de predição do Web App: a MESMA renderização é usada no preview
 * da configuração (US-043) e na página pública /app/[slug] (US-044).
 *
 * Sem onPredict (modo preview) o botão "Prever" fica desabilitado.
 */
export function DeploymentForm({
  title,
  description,
  fields,
  onPredict,
  pending = false,
}: {
  title: string;
  description: string | null;
  fields: DeploymentFormField[];
  onPredict?: (values: DeploymentFormValues) => void;
  pending?: boolean;
}) {
  const [values, setValues] = useState<DeploymentFormValues>({});
  const setValue = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  return (
    <form
      className="flex w-full flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pending) onPredict?.(values);
      }}
    >
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          {title.trim() || "Formulário de predição"}
        </h2>
        {description?.trim() ? (
          <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4">
        {fields.map((field) => (
          <FormField
            key={field.name}
            field={field}
            value={values[field.name] ?? ""}
            onChange={(value) => setValue(field.name, value)}
          />
        ))}
      </div>

      <Button type="submit" className="w-full" disabled={!onPredict || pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {pending ? "Prevendo…" : "Prever"}
      </Button>
    </form>
  );
}

function FormField({
  field,
  value,
  onChange,
}: {
  field: DeploymentFormField;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {field.name}
      </label>
      {field.type === "category" && field.categories.length > 0 ? (
        <CategoryInput id={id} field={field} value={value} onChange={onChange} />
      ) : field.type === "number" ? (
        <Input
          id={id}
          type="number"
          step="any"
          inputMode="decimal"
          placeholder="Digite um número"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : field.type === "date" ? (
        <Input
          id={id}
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type="text"
          placeholder="Digite um valor"
          maxLength={200}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

/**
 * Select com as categorias conhecidas + opção de digitar outro valor
 * (volta ao select pelo botão ao lado do input).
 */
function CategoryInput({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: DeploymentFormField;
  value: string;
  onChange: (value: string) => void;
}) {
  const [custom, setCustom] = useState(false);

  if (custom) {
    return (
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          type="text"
          placeholder="Digite outro valor"
          maxLength={200}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => {
            setCustom(false);
            onChange("");
          }}
        >
          <Undo2 className="size-4" aria-hidden />
          Opções
        </Button>
      </div>
    );
  }

  return (
    <select
      id={id}
      className={selectClassName}
      value={value}
      onChange={(event) => {
        if (event.target.value === OTHER_OPTION) {
          setCustom(true);
          onChange("");
        } else {
          onChange(event.target.value);
        }
      }}
    >
      <option value="">Selecione…</option>
      {field.categories.map((category) => (
        <option key={category} value={category}>
          {category}
        </option>
      ))}
      <option value={OTHER_OPTION}>Digitar outro valor…</option>
    </select>
  );
}
