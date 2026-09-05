"use client";

import { useState, useTransition } from "react";
import { KeyRound, Plus, UserCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import type { ActionResult } from "../../_components/EntityManager";

interface PortalUser {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  createdAt: string;
}

interface Props {
  customerId: string;
  users: PortalUser[];
  createAction: (customerId: string, formData: FormData) => Promise<ActionResult>;
  resetPasswordAction: (userId: string, formData: FormData) => Promise<ActionResult>;
}

export function PortalUserPanel({ customerId, users, createAction, resetPasswordAction }: Props) {
  const [creating, setCreating] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function closeModals() {
    setCreating(false);
    setResettingId(null);
    setError(null);
  }

  async function handleCreate(formData: FormData) {
    startTransition(async () => {
      const result = await createAction(customerId, formData);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      closeModals();
    });
  }

  async function handleResetPassword(formData: FormData) {
    if (!resettingId) return;
    startTransition(async () => {
      const result = await resetPasswordAction(resettingId, formData);
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      closeModals();
    });
  }

  const resettingUser = resettingId ? users.find((u) => u.id === resettingId) : null;

  return (
    <>
      <Card>
        {/* CardHeader is flex flex-wrap justify-between — title left, button right naturally */}
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="size-4" aria-hidden="true" />
            Portal logins
          </CardTitle>
          <Button
            size="sm"
            leftIcon={<Plus className="size-4" />}
            onClick={() => { setCreating(true); setError(null); }}
          >
            Create portal login
          </Button>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-neutral-500">
            These accounts log in at <code className="text-xs">/portal</code> and can only see
            this customer&apos;s quotations — no internal pricing, risk scores, or other
            customers&apos; data.
          </p>

          {users.length === 0 ? (
            <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-6 text-center text-sm text-neutral-400 dark:border-neutral-700">
              No portal logins yet. Create one so this customer can view and confirm their
              quotations.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Email</TH>
                  <TH>Status</TH>
                  <TH>Created</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {users.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-medium">{u.name}</TD>
                    <TD className="font-mono text-xs">{u.email}</TD>
                    <TD>
                      <Badge tone={u.isActive ? "success" : "neutral"}>
                        {u.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TD>
                    <TD className="text-xs text-neutral-500">
                      {new Date(u.createdAt).toLocaleDateString("en-IN")}
                    </TD>
                    <TD className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Reset password for ${u.name}`}
                        onClick={() => { setResettingId(u.id); setError(null); }}
                      >
                        <KeyRound className="size-4" />
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create portal user modal */}
      <Modal open={creating} onClose={closeModals} title="Create portal login">
        <form action={handleCreate} className="flex flex-col gap-4">
          <p className="text-sm text-neutral-500">
            The role is fixed to <strong>Portal</strong> and cannot be changed. This login will
            only see quotations belonging to this customer.
          </p>
          <Input name="name" label="Name" type="text" required />
          <Input name="email" label="Email address" type="email" required />
          <Input
            name="password"
            label="Password"
            type="password"
            required
            hint="Minimum 8 characters. Share this with the customer securely."
          />
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModals}>
              Cancel
            </Button>
            <Button type="submit">Create login</Button>
          </div>
        </form>
      </Modal>

      {/* Reset password modal */}
      <Modal
        open={resettingId !== null}
        onClose={closeModals}
        title="Reset password"
      >
        <form action={handleResetPassword} className="flex flex-col gap-4">
          <p className="text-sm text-neutral-500">
            Setting a new password for{" "}
            <strong className="font-medium text-neutral-700 dark:text-neutral-300">
              {resettingUser?.email}
            </strong>
            . This action is recorded in the audit log — the password itself is not logged.
          </p>
          <Input
            name="password"
            label="New password"
            type="password"
            required
            hint="Minimum 8 characters."
          />
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={closeModals}>
              Cancel
            </Button>
            <Button type="submit">Set new password</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
