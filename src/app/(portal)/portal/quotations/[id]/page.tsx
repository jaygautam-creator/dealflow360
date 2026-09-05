import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUserPage } from "@/infrastructure/auth/guards";
import { getPortalQuotation } from "@/application/portalService";
import { PortalQuotation } from "./PortalQuotation";

export const dynamic = "force-dynamic";

export default async function PortalQuotationPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUserPage("/portal");
  const { id } = await params;

  // Scoped to the session's customer inside the service. An id belonging to another
  // customer is not found — the same answer as an id that does not exist, so the portal
  // cannot be used to probe for which quotations are real.
  const quotation = await getPortalQuotation(user, id);
  if (!quotation) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/portal"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 transition hover:text-neutral-900 dark:hover:text-neutral-100"
      >
        <ArrowLeft className="size-4" />
        All quotations
      </Link>
      <PortalQuotation quotation={quotation} />
    </div>
  );
}
