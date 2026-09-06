import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { getPortalInvoice } from "@/application/portalService";
import { PortalInvoice } from "./PortalInvoice";

export const metadata = { title: "Invoice" };
export const dynamic = "force-dynamic";

export default async function PortalInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage("/portal");
  const { id } = await params;

  const invoice = await getPortalInvoice(user, id);
  if (!invoice) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 transition hover:text-neutral-900 print:hidden dark:hover:text-neutral-100"
      >
        <ArrowLeft className="size-4" />
        All quotations
      </Link>
      <PortalInvoice invoice={invoice} />
    </div>
  );
}
