import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requirePermissionPage } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { getInvoiceDetail } from "@/application/invoiceService";
import { WorkspaceInvoice } from "./WorkspaceInvoice";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

export default async function WorkspaceInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermissionPage(P.BILLING_MANAGE, "/workspace/orders/invoices");
  const { id } = await params;

  const invoice = await getInvoiceDetail(user, id);
  if (!invoice) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/workspace/orders/invoices"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 transition hover:text-neutral-900 print:hidden dark:hover:text-neutral-100"
      >
        <ArrowLeft className="size-4" />
        All invoices
      </Link>
      <WorkspaceInvoice invoice={invoice} />
    </div>
  );
}
