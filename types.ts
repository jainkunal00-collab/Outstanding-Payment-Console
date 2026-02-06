
export interface RawCsvRow {
  "Party Name": string;
  "Bill No.": string;
  "Bill Date": string;
  "Bill Amt.": string;
  "Received": string;
  "Balance": string;
  "Cumulative Total": string;
  "Due Date": string;
  "Days": string;
  "P.D.C.": string;
  "Remark": string;
}

export interface BillDetail {
  billNo: string;
  billDate: string;
  billAmt: number;
  originalBillAmt: number; // The amount before FIFO adjustment
  dueDate: string;
  days: number;
  status?: 'paid' | 'dispute' | 'unpaid'; // Session-based status
  manualAdjustment?: number; // Tracks partial payments made in the console
}

export interface ProcessedParty {
  id: string;
  partyName: string;
  balanceDebit: number; // Positive outstanding
  balanceCredit: number; // Negative outstanding (advance)
  phoneNumber: string;
  rawBalance: number;
  bills: BillDetail[];
}

export interface ChartData {
  name: string;
  value: number;
}
