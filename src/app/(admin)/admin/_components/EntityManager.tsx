"use client";

import { useState, useTransition } from "react";
import type { ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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

export interface ColumnDef<Row> {
  key: string;
  header: string;
  render?: (row: Row) => ReactNode;
}

export type ActionResult = { error?: string } | void;

export interface EntityManagerProps<Row extends { id: string }> {
  title: string;
  subtitle?: string;
  columns: ColumnDef<Row>[];
  rows: Row[];
  fields: FieldDef[];
  emptyLabel: string;
  createAction: (formData: FormData) => Promise<ActionResult>;
  updateAction: (id: string, formData: FormData) => Promise<ActionResult>;
  deleteAction: (id: string) => Promise<ActionResult>;
  /** Populate the edit modal's default values from a row. */
  toFormValues: (row: Row) => Record<string, string | boolean>;
  extraRowActions?: (row: Row) => ReactNode;
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
        <option value="" disabled>
          Select…
        </option>
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

export function EntityManager<Row extends { id: string }>({
  title,
  subtitle,
  columns,
  rows,
  fields,
  emptyLabel,
  createAction,
  updateAction,
  deleteAction,
  toFormValues,
  extraRowActions,
}: EntityManagerProps<Row>) {
  const [modalRow, setModalRow] = useState<Row | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const editing = modalRow !== null && modalRow !== "new" ? modalRow : null;
  const defaults = editing ? toFormValues(editing) : {};

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
                    <TD key={col.key}>
                      {col.render ? col.render(row) : String((row as never)[col.key] ?? "")}
                    </TD>
                  ))}
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {extraRowActions?.(row)}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Edit ${title.slice(0, -1)}`}
                        onClick={() => setModalRow(row)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${title.slice(0, -1)}`}
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
        title={editing ? `Edit ${title.slice(0, -1)}` : `New ${title.slice(0, -1)}`}
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
