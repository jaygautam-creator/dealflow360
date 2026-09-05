export type BillingInterval = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface RecurringLineInput {
  lineId: string;
  productName: string;
  planId: string;
  planName: string;
  interval: BillingInterval;
  quantity: number;
  /** Net price per unit per period, in paise, after discount. */
  unitAmountPaise: number;
}

export interface OneTimeLineInput {
  lineId: string;
  productName: string;
  quantity: number;
  /** Net line total in paise, after discount, excluding tax. */
  netAmountPaise: number;
  taxPaise: number;
}

export interface ScheduleEntry {
  lineId: string;
  planId: string;
  planName: string;
  productName: string;
  interval: BillingInterval;
  amountPerPeriodPaise: number;
  periodStart: Date;
  periodEnd: Date;
  nextBillingDate: Date;
}

export interface BillingSplit {
  /** A single invoice covering everything billed once, or null if the order is all-subscription. */
  oneTimeInvoicePaise: number | null;
  oneTimeTaxPaise: number;
  /** One forward billing calendar per recurring line. */
  schedules: ScheduleEntry[];
  /** Total the customer commits to per year across all recurring lines. */
  annualRecurringPaise: number;
}

export interface ProrationResult {
  /** Days of the current period that had already elapsed when the change happened. */
  daysUsed: number;
  /** Days remaining in the current period, which is what gets prorated. */
  daysRemaining: number;
  daysInPeriod: number;
  /** Credit for the unused remainder of what the customer already paid for, in paise. */
  creditPaise: number;
  /** Charge for the new arrangement over that same remainder, in paise. */
  chargePaise: number;
  /** Net movement. Positive means the customer owes more; negative means a refund is due. */
  netPaise: number;
  explanation: string;
}
