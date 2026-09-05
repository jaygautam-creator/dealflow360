import { NextRequest, NextResponse } from "next/server";
import { requirePermissionApi } from "@/infrastructure/auth/guards";
import { PERMISSIONS as P } from "@/infrastructure/auth/rbac";
import { apiError } from "@/app/api/_lib/respond";
import { approvalStatusLabel, parseReportFilters, runReport } from "@/application/reportsQuery";

/**
 * Streams the same rows the Reports page shows, as a file download.
 *
 * We deliberately do not pull in a spreadsheet library for the "XLS" export: Excel opens
 * tab-separated text natively as long as the content type says so, so `format=xls` is the
 * exact same rows rendered TSV instead of CSV. That is honest about what it produces — no
 * fake `.xlsx` binary — and needs zero new dependencies.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requirePermissionApi(P.DASHBOARD_VIEW);
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const filters = parseReportFilters(params);
    const format = params.format === "xls" ? "xls" : "csv";

    const { rows } = await runReport(user, filters);

    const delimiter = format === "xls" ? "\t" : ",";
    const header = ["Number", "Customer", "Owner", "Stage", "Approval", "Risk score", "Discount %", "Total (INR)"];
    const lines = [header.join(delimiter)];

    for (const row of rows) {
      lines.push(
        [
          escapeField(row.number, delimiter),
          escapeField(row.customerName, delimiter),
          escapeField(row.ownerName, delimiter),
          row.status,
          approvalStatusLabel(row.status),
          row.riskScore.toFixed(1),
          row.discountPct.toFixed(1),
          (row.totalPaise / 100).toFixed(2),
        ].join(delimiter),
      );
    }

    // Excel guesses the encoding of a plain text file and guesses wrong; a UTF-8 BOM
    // makes it read the file correctly instead of mangling non-ASCII customer names.
    const body = `\uFEFF${lines.join("\r\n")}`;
    const contentType = format === "xls" ? "application/vnd.ms-excel" : "text/csv";
    const filename = `reports-${new Date().toISOString().slice(0, 10)}.${format === "xls" ? "xls" : "csv"}`;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": `${contentType}; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

/**
 * Neutralises spreadsheet formula injection (CWE-1236).
 *
 * A cell whose first character is `=`, `+`, `-`, `@`, tab or carriage return is executed
 * as a formula when the file is opened in Excel, LibreOffice or Sheets — so a customer
 * named `=cmd|'/c calc'!A1` becomes code the moment a finance user opens the export.
 * Customer and user names are attacker-controlled data as far as this file is concerned,
 * and RFC 4180 quoting does not help: the quotes are stripped before the formula parser
 * ever sees the value. Prefixing with an apostrophe forces the cell to text.
 *
 * Applied only to the free-text columns. Numeric columns are formatted by us and a
 * legitimately negative total must keep its leading minus sign to stay a number.
 */
function safeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function escapeField(value: string, delimiter: string): string {
  const safe = safeCell(value);
  if (safe.includes(delimiter) || safe.includes('"') || safe.includes("\n") || safe.includes("\r")) {
    return `"${safe.replaceAll('"', '""')}"`;
  }
  return safe;
}
