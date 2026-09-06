"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Boxes, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { PageHeader } from "@/components/layout/PageHeader";
import { Select } from "@/components/ui/Select";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";

export type FieldDef =
  | { name: string; label: string; type: "text"; required?: boolean; placeholder?: string }
  | {
      name: string;
      label: string;
      type: "number";
      step?: string;
      required?: boolean;
      hint?: string;
    }
  | {
      name: string;
      label: string;
      type: "select";
      options: { value: string; label: string }[];
      required?: boolean;
    }
  | { name: string; label: string; type: "checkbox" }
  | { name: string; label: string; type: "textarea" };

// Columns are pure data, never callbacks — the whole point is that this config is built
// inside a Server Component page and handed to this Client Component as a prop. React
// Server Components can only serialise plain data across that boundary, so a `render`
// function here would crash the build the moment a page tried to pass one (it did once —
// see git history). "kind" lets pages get badges/percent suffixes without a closure.
export type ColumnDef =
  | { key: string; header: string; kind?: "text" }
  | { key: string; header: string; kind: "percent" }
  | { key: string; header: string; kind: "badge"; toneMap: Record<string, BadgeTone>; labelMap?: Record<string, string> };

export type ActionResult = { error?: string } | void;

export interface DetailLink {
  hrefBase: string;
  label: string;
}

export interface EntityManagerProps<Row extends Record<string, unknown> & { id: string }> {
  title: string;
  /** Singular form of `title`, for modal headings and action labels ("Edit Category").
      Only needed when dropping the trailing "s" doesn't produce it, e.g. a title
      ending in "-ies" ("Categories" -> "Categorie" is wrong; pass "Category"). */
  entityName?: string;
  subtitle?: string;
  columns: ColumnDef[];
  rows: Row[];
  fields: FieldDef[];
  emptyLabel: string;
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (id: string, formData: FormData) => Promise<ActionResult>;
  deleteAction: (id: string) => Promise<ActionResult>;
  /** When set, an extra row action links to a nested detail screen (e.g. stock levels). */
  detailLink?: DetailLink;
}

function renderCell(row: Record<string, unknown>, col: ColumnDef) {
  const value = row[col.key];
  if (col.kind === "percent") return `${String(value ?? "")}%`;
  if (col.kind === "badge") {
    const key = String(value);
    const tone = col.toneMap[key] ?? "neutral";
    const label = col.labelMap?.[key] ?? key;
    return <Badge tone={tone}>{label}</Badge>;
  }
  return String(value ?? "");
}

function FieldInput({
  field,
  defaultValue,
}: {
  field: FieldDef;
  defaultValue?: string | boolean;
}) {
  if (field.type === "select") {
    return (
      <Select
        name={field.name}
        label={field.label}
        required={field.required}
        defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
      >
        {field.required && (
          <option value="" disabled>
            Select…
          </option>
        )}
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    );
  }
  if (field.type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        <input
          type="checkbox"
          name={field.name}
          defaultChecked={defaultValue === true}
          className="size-4 rounded border-neutral-300 text-indigo-600 focus:ring-indigo-600 dark:border-neutral-700"
        />
        {field.label}
      </label>
    );
  }
  if (field.type === "textarea") {
    return (
      <Textarea
        name={field.name}
        label={field.label}
        defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
      />
    );
  }
  return (
    <Input
      name={field.name}
      label={field.label}
      type={field.type === "number" ? "number" : "text"}
      step={field.type === "number" ? field.step ?? "any" : undefined}
      hint={field.type === "number" ? field.hint : undefined}
      required={field.required}
      placeholder={field.type === "text" ? field.placeholder : undefined}
      defaultValue={typeof defaultValue === "string" ? defaultValue : ""}
    />
  );
}

export function EntityManager<Row extends Record<string, unknown> & { id: string }>({
  title,
  entityName,
  subtitle,
  columns,
  rows,
  fields,
  emptyLabel,
  createAction,
  updateAction,
  deleteAction,
  detailLink,
}: EntityManagerProps<Row>) {
  const [modalRow, setModalRow] = useState<Row | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const singular = entityName ?? title.slice(0, -1);
  const editing = modalRow !== null && modalRow !== "new" ? modalRow : null;
  // Defaults are read straight off the row by field name — rows are shaped by the page to
  // match field names 1:1, so no per-entity mapping function is needed (see ColumnDef note).
  const defaults: Record<string, string | boolean> = {};
  if (editing) {
    for (const field of fields) {
      const value = editing[field.name];
      defaults[field.name] = field.type === "checkbox" ? Boolean(value) : String(value ?? "");
    }
  }

  function closeModal() {
    setModalRow(null);
    setError(null);
  }

  async function handleSubmit(formData: FormData) {
    const result = editing
      ? await updateAction(editing.id, formData)
      : await createAction(formData);
    if (result && "error" in result && result.error) {
      setError(result.error);
      return;
    }
    closeModal();
  }

  function handleDelete(row: Row) {
    if (!confirm("Delete this record? This cannot be undone.")) return;
    startTransition(async () => {
      const result = await deleteAction(row.id);
      if (result && "error" in result && result.error) {
        alert(result.error);
      }
    });
  }

  return (
    <div>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <Button leftIcon={<Plus className="size-4" />} onClick={() => setModalRow("new")}>
            New
          </Button>
        }
      />

      <Card>
        {rows.length === 0 ? (
          <EmptyState title={emptyLabel} />
        ) : (
          <Table>
            <THead>
              <TR>
                {columns.map((col) => (
                  <TH key={col.key}>{col.header}</TH>
                ))}
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((row) => (
                <TR key={row.id}>
                  {columns.map((col) => (
                    <TD key={col.key}>{renderCell(row, col)}</TD>
                  ))}
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {detailLink && (
                        <Link href={`${detailLink.hrefBase}/${row.id}`}>
                          <Button variant="ghost" size="sm" aria-label={detailLink.label}>
                            <Boxes className="size-4" />
                          </Button>
                        </Link>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${singular}`}
                        onClick={() => setModalRow(row)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${singular}`}
                        disabled={pending}
                        onClick={() => handleDelete(row)}
                      >
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Modal
        open={modalRow !== null}
        onClose={closeModal}
        title={editing ? `Edit ${singular}` : `New ${singular}`}
      >
        <form action={handleSubmit} className="flex flex-col gap-4">
          {fields.map((field) => (
            <FieldInput key={field.name} field={field} defaultValue={defaults[field.name]} />
          ))}
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button type="submit">{editing ? "Save changes" : "Create"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
