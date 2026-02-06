
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { RawCsvRow, ProcessedParty, BillDetail } from '../types';

export const UNMAPPED_KEY = "D.N/TCS";

// Initial/Fallback Mapping
const DEFAULT_PREFIX_MAP: Record<string, string> = {
  "Al/25-26/": "GSK",
  "*HAL/25/": "GSK",
  "BSO25": "Johnson",
  "JJGS25": "Johnson",
  "C25Y": "Cadbury",
  "D/25-26/": "Figaro",
  "E/25-26/": "Hershey",
  "FR2526027": "Ferrero",
  "H/25-26/": "Haldram",
  "I/25-26/": "Ziggy",
  "K/25-26/": "Kellogs",
  "LIN10025": "Loreal",
  "LCBL04725": "Loreal",
  "M/25-26/": "Malas",
  "N/25-26/": "3M",
  "O/25-26/": "Lotte",
  "Q/25-26/": "Jimmy",
  "*Q/24-25/": "Jimmy",
  "R/25-26/": "Havells",
  "*R/24-25/": "Havells",
  "S2526411": "Catch",
  "*S2425411": "Catch",
  "T/25-26/": "Tops",
  "U/25-26/": "Budweiser",
  "V/25-26/": "Vebba",
  "W/25-26/": "Wabh Bakri",
  "Z/25-26/": "Delmonte"
};

// Mutable Map for Dynamic Cloud Updates
let CURRENT_PREFIX_MAP = { ...DEFAULT_PREFIX_MAP };

export const updateGlobalPrefixMap = (newMap: Record<string, string>) => {
    CURRENT_PREFIX_MAP = { ...DEFAULT_PREFIX_MAP, ...newMap };
};

export const getUniqueCompanies = () => {
  const mapped = Array.from(new Set(Object.values(CURRENT_PREFIX_MAP))).sort();
  // Place D.N/TCS (Unmapped) at the 1st position
  return [UNMAPPED_KEY, ...mapped];
};

/**
 * Returns a list of party names who have at least one bill with an undefined prefix.
 */
export const getUnmappedParties = (data: ProcessedParty[]): string[] => {
  const unmapped = new Set<string>();
  data.forEach(p => {
    const hasUnmappedBill = p.bills.some(b => b.billNo && !getCompanyNameFromBillNo(b.billNo));
    if (hasUnmappedBill) {
      unmapped.add(p.partyName);
    }
  });
  return Array.from(unmapped).sort();
};

export const getCompanyNameFromBillNo = (billNo: string): string | null => {
  if (!billNo) return null;
  
  // Normalize bill number
  const upperBill = billNo.toUpperCase().trim();
  
  // 1. Try exact or near-exact matches first
  const strippedBill = upperBill.startsWith('*') ? upperBill.substring(1) : upperBill;

  for (const rawPrefix in CURRENT_PREFIX_MAP) {
    const upperPrefix = rawPrefix.toUpperCase().trim();
    const strippedPrefix = upperPrefix.startsWith('*') ? upperPrefix.substring(1) : upperPrefix;

    if (upperBill.startsWith(upperPrefix)) return CURRENT_PREFIX_MAP[rawPrefix];
    if (upperBill.startsWith(strippedPrefix)) return CURRENT_PREFIX_MAP[rawPrefix];
    if (strippedBill.startsWith(strippedPrefix)) return CURRENT_PREFIX_MAP[rawPrefix];
  }

  // 2. Fallback to "clean" match (alphanumeric only) to handle variations in slashes/dashes
  const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const billClean = clean(billNo);
  
  if (billClean) {
    for (const rawPrefix in CURRENT_PREFIX_MAP) {
      const prefixClean = clean(rawPrefix);
      if (prefixClean && billClean.startsWith(prefixClean)) {
        return CURRENT_PREFIX_MAP[rawPrefix];
      }
    }
  }

  return null;
};

// Helper to re-scan processed data after a Prefix Update
export const reapplyPrefixes = (parties: ProcessedParty[]): ProcessedParty[] => {
    // Since getCompanyNameFromBillNo is called dynamically in UI components,
    // we strictly don't *need* to change the party object structure unless
    // we were caching company names on the bill object. 
    // Currently, company name is derived on render.
    // We just return a shallow copy to trigger React re-render.
    return parties.map(p => ({ ...p }));
};

export const parsePrefixFile = (file: File): Promise<Record<string, string>> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        const map: Record<string, string> = {};
        // Expecting Row 1 to be headers, data starts from Row 2
        // Column 0 = Prefix, Column 1 = Company Name
        jsonData.slice(1).forEach(row => {
            if (row[0] && row[1]) {
                const prefix = String(row[0]).trim();
                const company = String(row[1]).trim();
                if (prefix && company) {
                    map[prefix] = company;
                }
            }
        });
        resolve(map);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsArrayBuffer(file);
  });
};

export const parseFile = (file: File): Promise<ProcessedParty[]> => {
  return new Promise((resolve, reject) => {
    const fileExt = file.name.split('.').pop()?.toLowerCase();

    if (fileExt === 'csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          try {
            const rawData = results.data as RawCsvRow[];
            const processed = processRawData(rawData);
            resolve(processed);
          } catch (err) {
            reject(err);
          }
        },
        error: (err) => {
          reject(err);
        }
      });
    } else if (['xlsx', 'xls'].includes(fileExt || '')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { raw: false }) as RawCsvRow[];
          const processed = processRawData(jsonData);
          resolve(processed);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    } else {
      reject(new Error("Unsupported file type"));
    }
  });
};

const round = (num: number) => Math.round((num + Number.EPSILON) * 100) / 100;

const cleanCurrency = (val: any): number => {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const str = String(val).trim();
    if (!str) return 0;
    let cleanStr = str.replace(/[^0-9.\-()]/g, '');
    let isParens = false;
    if (cleanStr.startsWith('(') && cleanStr.endsWith(')')) {
        isParens = true;
        cleanStr = cleanStr.replace(/[()]/g, '');
    }
    const num = parseFloat(cleanStr);
    if (isNaN(num)) return 0;
    let finalNum = Math.abs(num);
    const hasCr = /cr/i.test(str);
    const hasDr = /dr/i.test(str);
    if (hasCr) return -finalNum;
    if (hasDr) return finalNum;
    if (isParens) return -finalNum;
    if (str.includes('-')) return -finalNum; 
    if (parseFloat(cleanStr) < 0) return -finalNum;
    return finalNum;
};

export const parseDate = (dateStr: string): number => {
    if (!dateStr) return 0;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return d.getTime();
    const parts = dateStr.split(/[-\/\s]/);
    if (parts.length >= 3) {
        const day = parseInt(parts[0], 10);
        const monthStr = (parts[1] || '').toLowerCase();
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        const months: Record<string, number> = {
            jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
            jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
        };
        const month = months[monthStr.substring(0, 3)];
        if (month !== undefined && !isNaN(day) && !isNaN(year)) {
            return new Date(year, month, day).getTime();
        }
    }
    return 0;
};

export const finalizeParty = (party: ProcessedParty) => {
    const positiveBillsWithIdx = party.bills
        .map((b, idx) => ({ ...b, _originalIdx: idx }))
        .filter(b => b.billAmt > 0);
    const negativeBills = party.bills.filter(b => b.billAmt < 0);
    
    positiveBillsWithIdx.sort((a, b) => {
        const dateA = parseDate(a.billDate);
        const dateB = parseDate(b.billDate);
        if (dateA !== dateB) return dateA - dateB;
        return a._originalIdx - b._originalIdx;
    });

    let availableCredit = negativeBills.reduce((sum, b) => sum + Math.abs(b.billAmt), 0);
    availableCredit = round(availableCredit);
    
    const adjustedBills: BillDetail[] = [];
    for (const billWrapper of positiveBillsWithIdx) {
        const { _originalIdx, ...bill } = billWrapper;
        if (availableCredit > 0) {
            if (availableCredit >= bill.billAmt) {
                availableCredit = round(availableCredit - bill.billAmt);
            } else {
                const remainingBillAmt = round(bill.billAmt - availableCredit);
                adjustedBills.push({ ...bill, billAmt: remainingBillAmt });
                availableCredit = 0;
            }
        } else {
            adjustedBills.push(bill);
        }
    }
    
    party.bills = adjustedBills;
    party.balanceDebit = round(adjustedBills.reduce((sum, b) => sum + b.billAmt, 0));
    party.balanceCredit = availableCredit;
    party.rawBalance = round(party.balanceDebit - party.balanceCredit);
};

const processRawData = (rows: RawCsvRow[]): ProcessedParty[] => {
  const parties: ProcessedParty[] = [];
  let currentParty: ProcessedParty | null = null;
  rows.forEach((row, index) => {
    const partyName = String(row["Party Name"] || "").trim();
    const billNo = String(row["Bill No."] || "").trim();
    if (partyName) {
      if (currentParty) {
        finalizeParty(currentParty);
        parties.push(currentParty);
      }
      const balance = cleanCurrency(row["Balance"] || "0");
      currentParty = {
        id: `party-${index}-${Date.now()}`,
        partyName: partyName,
        rawBalance: balance,
        balanceDebit: 0,
        balanceCredit: 0,
        phoneNumber: '',
        bills: []
      };
    } else if (currentParty) {
        const rawBillAmt = cleanCurrency(row["Bill Amt."]);
        let billAmt = rawBillAmt;
        const receivedAmt = cleanCurrency(row["Received"]);
        if (Math.abs(receivedAmt) > 0) billAmt = round(billAmt - receivedAmt);
        
        const billDate = String(row["Bill Date"] || "").trim();
        if (Math.abs(billAmt) !== 0 || !!(billNo || billDate)) {
            currentParty.bills.push({
              billNo: billNo || "",
              billDate: billDate,
              billAmt: billAmt,
              originalBillAmt: rawBillAmt,
              dueDate: String(row["Due Date"] || ""),
              days: parseInt(String(row["Days"] || "0").replace(/,/g, '')) || 0
            });
        }
    }
  });
  if (currentParty) {
    finalizeParty(currentParty);
    parties.push(currentParty);
  }
  return parties;
};

// HELPER: Convert input YYYY-MM-DD to comparable timestamp
const getFilterTimestamp = (dateStr: string) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m-1, d).getTime();
};

const checkBillMatch = (b: BillDetail, filterCompanies: string[], filterMinDays: number | '', dateRange?: {from: string, to: string}) => {
    // Basic Active Filter
    if (b.status === 'paid' || b.status === 'dispute') return false;
    
    // Filter by Company
    if (filterCompanies.length > 0) {
        const company = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
        if (!filterCompanies.includes(company)) return false;
    }
    
    // Filter by Days
    if (filterMinDays !== '' && b.days < filterMinDays) return false;

    // Filter by Date Range
    if (dateRange && (dateRange.from || dateRange.to)) {
        const bDate = parseDate(b.billDate);
        if (bDate === 0) return false;

        const fromTs = getFilterTimestamp(dateRange.from);
        const toTs = getFilterTimestamp(dateRange.to);

        // Special Rule: If only one date is selected (from), treat it as "Up To" date (show older bills)
        if (dateRange.from && !dateRange.to) {
             // Only From selected -> Show Bills <= From (Up To logic)
             if (fromTs && bDate > fromTs) return false;
        } else {
             // Standard Range: From <= Bill <= To
             if (fromTs && bDate < fromTs) return false;
             if (toTs && bDate > toTs) return false;
        }
    }

    return true;
};

export const downloadExcel = (parties: ProcessedParty[], filterCompanies: string[] = [], filterMinDays: number | '' = '', dateRange?: {from: string, to: string}) => {
  const BILLS_PER_ROW = 4;
  const header = [
    "S No.", "Party Name", "Balance Debit", "Balance Credit", "Phone Number",
    ...Array.from({ length: BILLS_PER_ROW }).flatMap((_, i) => [
        `Bill Date ${i+1}`, `Bill No ${i+1}`, `Bill Amt ${i+1}`
    ])
  ];

  const rowsToHighlight: number[] = [];
  const finalDataRows: any[][] = [];
  let partyCounter = 1;
  let grandTotalDebit = 0;
  let grandTotalCredit = 0;

  parties.forEach((p) => {
    // Filter out bills marked as paid or dispute in session
    // AND apply company/day filters if they exist
    const partyBills = p.bills.filter(b => checkBillMatch(b, filterCompanies, filterMinDays, dateRange));
    
    // Recalculate debit based on active filtered bills
    const activeDebit = round(partyBills.reduce((sum, b) => sum + b.billAmt, 0));
    
    // Accumulate Totals
    grandTotalDebit += activeDebit;
    grandTotalCredit += p.balanceCredit;

    let isFirstRowForParty = true;

    if (partyBills.length === 0) {
      const baseData = [
        partyCounter++,
        p.partyName,
        activeDebit > 0 ? activeDebit : "",
        p.balanceCredit > 0 ? -p.balanceCredit : "",
        p.phoneNumber
      ];
      const emptyBills = Array(BILLS_PER_ROW * 3).fill("");
      finalDataRows.push([...baseData, ...emptyBills]);
    } else {
      for (let i = 0; i < partyBills.length; i += BILLS_PER_ROW) {
        const billChunk = partyBills.slice(i, i + BILLS_PER_ROW);
        let rowHasUnknownPrefix = false;

        const baseData = isFirstRowForParty ? [
          partyCounter++,
          p.partyName,
          activeDebit > 0 ? activeDebit : "",
          p.balanceCredit > 0 ? -p.balanceCredit : "",
          p.phoneNumber
        ] : ["", "", "", "", ""];

        const billData = billChunk.flatMap(b => {
          const companyName = getCompanyNameFromBillNo(b.billNo);
          if (!companyName && b.billNo) {
            rowHasUnknownPrefix = true;
          }
          const isAdjusted = b.billAmt < b.originalBillAmt;
          const displayAmt = isAdjusted ? `${b.billAmt} (B)` : String(b.billAmt);
          return [b.billDate, companyName || b.billNo, displayAmt];
        });

        while (billData.length < BILLS_PER_ROW * 3) {
          billData.push("");
        }
        finalDataRows.push([...baseData, ...billData]);
        if (rowHasUnknownPrefix) rowsToHighlight.push(finalDataRows.length);
        isFirstRowForParty = false;
      }
    }
  });

  // Append Grand Total Row
  finalDataRows.push([
    "", 
    "GRAND TOTAL", 
    grandTotalDebit > 0 ? round(grandTotalDebit) : "", 
    grandTotalCredit > 0 ? -round(grandTotalCredit) : "", 
    "", 
    ...Array(BILLS_PER_ROW * 3).fill("")
  ]);

  const wsData = [header, ...finalDataRows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
  for (let R = 1; R <= range.e.r; ++R) {
    const isHighlightedRow = rowsToHighlight.includes(R);
    const isTotalRow = finalDataRows[R-1] && finalDataRows[R-1][1] === "GRAND TOTAL";
    
    for (let C = 0; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({c: C, r: R});
        const cell = ws[cellRef];
        if (!cell) continue;
        if (!cell.s) cell.s = {};
        
        if (isHighlightedRow) {
            cell.s.fill = { fgColor: { rgb: "FFFF00" }, patternType: "solid" };
        }
        
        if (isTotalRow) {
            if (!cell.s.font) cell.s.font = {};
            cell.s.font.bold = true;
            cell.s.fill = { fgColor: { rgb: "EFEFEF" }, patternType: "solid" };
        }
        
        if (typeof cell.v === 'string' && cell.v.includes("(B)")) {
            if (!cell.s.font) cell.s.font = {};
            cell.s.font.bold = true;
        }
    }
  }

  const wscols = [{ wch: 8 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  for (let i = 0; i < BILLS_PER_ROW * 3; i++) {
     wscols.push({ wch: (i + 1) % 3 === 0 ? 15 : 12 });
  }
  ws['!cols'] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, "Processed Data");
  XLSX.writeFile(wb, "processed_outstanding_payment.xlsx");
};

export const downloadExcelCombined = (parties: ProcessedParty[], filterCompanies: string[] = [], filterMinDays: number | '' = '', dateRange?: {from: string, to: string}) => {
  const BILLS_PER_ROW = 4;
  const header = [
    "S No.", "Party Name", "Balance Debit", "Balance Credit", "Phone Number",
    ...Array.from({ length: BILLS_PER_ROW }).flatMap((_, i) => [
        `Bill Date ${i+1}`, `Bill No & Amt ${i+1}`
    ])
  ];

  const rowsToHighlight: number[] = [];
  const finalDataRows: any[][] = [];
  let partyCounter = 1;
  let grandTotalDebit = 0;
  let grandTotalCredit = 0;

  parties.forEach((p) => {
    const partyBills = p.bills.filter(b => checkBillMatch(b, filterCompanies, filterMinDays, dateRange));

    // Recalculate debit based on active bills
    const activeDebit = round(partyBills.reduce((sum, b) => sum + b.billAmt, 0));
    
    // Accumulate Totals
    grandTotalDebit += activeDebit;
    grandTotalCredit += p.balanceCredit;

    let isFirstRowForParty = true;

    if (partyBills.length === 0) {
      const baseData = [
        partyCounter++,
        p.partyName,
        activeDebit > 0 ? activeDebit : "",
        p.balanceCredit > 0 ? -p.balanceCredit : "",
        p.phoneNumber
      ];
      const emptyBills = Array(BILLS_PER_ROW * 2).fill("");
      finalDataRows.push([...baseData, ...emptyBills]);
    } else {
      for (let i = 0; i < partyBills.length; i += BILLS_PER_ROW) {
        const billChunk = partyBills.slice(i, i + BILLS_PER_ROW);
        let rowHasUnknownPrefix = false;

        const baseData = isFirstRowForParty ? [
          partyCounter++,
          p.partyName,
          activeDebit > 0 ? activeDebit : "",
          p.balanceCredit > 0 ? -p.balanceCredit : "",
          p.phoneNumber
        ] : ["", "", "", "", ""];

        const billData = billChunk.flatMap(b => {
          const companyName = getCompanyNameFromBillNo(b.billNo);
          if (!companyName && b.billNo) {
            rowHasUnknownPrefix = true;
          }
          const isAdjusted = b.billAmt < b.originalBillAmt;
          const displayAmt = isAdjusted ? `${b.billAmt} (B)` : String(b.billAmt);
          
          // Separate Bill Date, combine No and Amt with 3 spaces as requested.
          return [b.billDate, `${companyName || b.billNo}   ${displayAmt}`];
        });

        while (billData.length < BILLS_PER_ROW * 2) {
          billData.push("");
        }

        finalDataRows.push([...baseData, ...billData]);
        if (rowHasUnknownPrefix) rowsToHighlight.push(finalDataRows.length);
        isFirstRowForParty = false;
      }
    }
  });

  // Append Grand Total Row
  finalDataRows.push([
    "", 
    "GRAND TOTAL", 
    grandTotalDebit > 0 ? round(grandTotalDebit) : "", 
    grandTotalCredit > 0 ? -round(grandTotalCredit) : "", 
    "", 
    ...Array(BILLS_PER_ROW * 2).fill("")
  ]);

  const wsData = [header, ...finalDataRows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
  for (let R = 1; R <= range.e.r; ++R) {
    const isHighlightedRow = rowsToHighlight.includes(R);
    const isTotalRow = finalDataRows[R-1] && finalDataRows[R-1][1] === "GRAND TOTAL";

    for (let C = 0; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({c: C, r: R});
        const cell = ws[cellRef];
        if (!cell) continue;
        if (!cell.s) cell.s = {};
        
        if (isHighlightedRow) {
            cell.s.fill = { fgColor: { rgb: "FFFF00" }, patternType: "solid" };
        }

        if (isTotalRow) {
            if (!cell.s.font) cell.s.font = {};
            cell.s.font.bold = true;
            cell.s.fill = { fgColor: { rgb: "EFEFEF" }, patternType: "solid" };
        }

        if (typeof cell.v === 'string' && cell.v.includes("(B)")) {
            if (!cell.s.font) cell.s.font = {};
            cell.s.font.bold = true;
        }
    }
  }

  const wscols = [{ wch: 8 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  for (let i = 0; i < BILLS_PER_ROW; i++) {
    wscols.push({ wch: 12 }); // Date column
    wscols.push({ wch: 35 }); // Combined No & Amt column
  }
  ws['!cols'] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, "Combined Data");
  XLSX.writeFile(wb, "combined_bill_outstanding_report.xlsx");
};

export const downloadExcelCompanyWide = (parties: ProcessedParty[], companyNames: string[], format: 'standard' | 'combined' = 'standard', minDays: number | '' = '', dateRange?: {from: string, to: string}) => {
  const BILLS_PER_ROW = 4;
  const isCombined = format === 'combined';
  
  const header = [
    "S No.", "Party Name", "Total Debit (Selected Filter)", "Balance Credit", "Phone Number",
    ...Array.from({ length: BILLS_PER_ROW }).flatMap((_, i) => 
        isCombined 
            ? [`Bill Date ${i+1}`, `Company & Amt ${i+1}`]
            : [`Bill Date ${i+1}`, `Company ${i+1}`, `Bill Amt ${i+1}`]
    )
  ];

  const finalDataRows: any[][] = [];
  let partyCounter = 1;
  let grandTotalDebit = 0;
  let grandTotalCredit = 0;

  parties.forEach((p) => {
    const filteredBills = p.bills.filter(b => {
        if (b.billAmt <= 0) return false;
        
        if (b.status === 'paid' || b.status === 'dispute') return false;

        // Min Days filter
        if (minDays !== '' && b.days < minDays) return false;

        // Company Filter
        const detectedCompany = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
        if (companyNames.length > 0 && !companyNames.includes(detectedCompany)) {
            return false;
        }
        
        // Date Range Logic
        if (dateRange && (dateRange.from || dateRange.to)) {
             const bDate = parseDate(b.billDate);
             if (bDate === 0) return false;

             const fromTs = getFilterTimestamp(dateRange.from);
             const toTs = getFilterTimestamp(dateRange.to);

             if (dateRange.from && !dateRange.to) {
                 // Single date: Up To logic
                 if (fromTs && bDate > fromTs) return false;
             } else {
                 if (fromTs && bDate < fromTs) return false;
                 if (toTs && bDate > toTs) return false;
             }
        }

        return true;
    });
    
    if (filteredBills.length === 0) return; 

    const companyDebitTotal = round(filteredBills.reduce((sum, b) => sum + b.billAmt, 0));
    
    // Accumulate Totals
    grandTotalDebit += companyDebitTotal;
    grandTotalCredit += p.balanceCredit;

    let isFirstRowForParty = true;

    for (let i = 0; i < filteredBills.length; i += BILLS_PER_ROW) {
      const billChunk = filteredBills.slice(i, i + BILLS_PER_ROW);

      const baseData = isFirstRowForParty ? [
        partyCounter++,
        p.partyName,
        companyDebitTotal,
        p.balanceCredit > 0 ? -p.balanceCredit : "",
        p.phoneNumber
      ] : ["", "", "", "", ""];

      const billData = billChunk.flatMap(b => {
        const detectedCompany = getCompanyNameFromBillNo(b.billNo);
        // If unmapped, show original Bill Number, otherwise show Company Name
        const companyField = detectedCompany || b.billNo || UNMAPPED_KEY;
        
        const isAdjusted = b.billAmt < b.originalBillAmt;
        const displayAmt = isAdjusted ? `${b.billAmt} (B)` : String(b.billAmt);
        
        if (isCombined) {
            // Bill Date in separate column, No column shows Company/Bill combined with Amt
            return [b.billDate, `${companyField}   ${displayAmt}`];
        } else {
            // Bill Date in separate column, Bill No column shows Company/Bill
            return [b.billDate, companyField, displayAmt];
        }
      });

      const chunkDataSize = isCombined ? BILLS_PER_ROW * 2 : BILLS_PER_ROW * 3;
      while (billData.length < chunkDataSize) {
        billData.push("");
      }

      finalDataRows.push([...baseData, ...billData]);
      isFirstRowForParty = false;
    }
  });

  if (finalDataRows.length === 0) {
    alert(`No outstanding found matching the selected filter.`);
    return;
  }

  // Append Grand Total Row
  finalDataRows.push([
    "", 
    "GRAND TOTAL", 
    grandTotalDebit > 0 ? round(grandTotalDebit) : "", 
    grandTotalCredit > 0 ? -round(grandTotalCredit) : "", 
    "", 
    ...Array(isCombined ? BILLS_PER_ROW * 2 : BILLS_PER_ROW * 3).fill("")
  ]);

  const wsData = [header, ...finalDataRows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  const range = XLSX.utils.decode_range(ws['!ref'] || "A1");
  for (let R = 1; R <= range.e.r; ++R) {
    const isTotalRow = finalDataRows[R-1] && finalDataRows[R-1][1] === "GRAND TOTAL";

    for (let C = 0; C <= range.e.c; ++C) {
        const cellRef = XLSX.utils.encode_cell({c: C, r: R});
        const cell = ws[cellRef];
        if (!cell) continue;
        if (!cell.s) cell.s = {};
        
        if (isTotalRow) {
            if (!cell.s.font) cell.s.font = {};
            cell.s.font.bold = true;
            cell.s.fill = { fgColor: { rgb: "EFEFEF" }, patternType: "solid" };
        }
    }
  }

  const wscols = [{ wch: 8 }, { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 15 }];
  for (let i = 0; i < BILLS_PER_ROW; i++) {
     if (isCombined) {
         wscols.push({ wch: 12 }); // Date
         wscols.push({ wch: 35 }); // Company Name & Amt
     } else {
         wscols.push({ wch: 12 }); // Date
         wscols.push({ wch: 25 }); // Company Name
         wscols.push({ wch: 15 }); // Amt
     }
  }
  ws['!cols'] = wscols;

  const fileName = `filtered_outstanding_${format}_${new Date().toISOString().split('T')[0]}.xlsx`;
  XLSX.utils.book_append_sheet(wb, ws, "Outstanding");
  XLSX.writeFile(wb, fileName);
};

export const downloadPaidDisputeReport = (parties: ProcessedParty[], filterCompanies: string[] = [], dateRange?: {from: string, to: string}) => {
  const header = ["S No.", "Company", "Party Name", "Bill No", "Bill Date", "Bill Amt", "Status"];
  const rows: any[][] = [];
  let counter = 1;
  const allBills: any[] = [];

  parties.forEach(p => {
      p.bills.forEach(b => {
          if (b.status === 'paid' || b.status === 'dispute') {
               const company = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
               
               // Apply Company Filter
               if (filterCompanies.length > 0 && !filterCompanies.includes(company)) return;

               // Apply Date Range Filter if set
               if (dateRange && (dateRange.from || dateRange.to)) {
                   const bDate = parseDate(b.billDate);
                   if (bDate === 0) return;
                   const fromTs = getFilterTimestamp(dateRange.from);
                   const toTs = getFilterTimestamp(dateRange.to);
                   
                   if (dateRange.from && !dateRange.to) {
                        if (fromTs && bDate > fromTs) return;
                   } else {
                        if (fromTs && bDate < fromTs) return;
                        if (toTs && bDate > toTs) return;
                   }
               }

               allBills.push({
                   company,
                   partyName: p.partyName,
                   billNo: b.billNo,
                   billDate: b.billDate,
                   billAmt: b.billAmt,
                   status: b.status
               });
          }
      });
  });

  if (allBills.length === 0) {
      alert("No Paid or Disputed bills found matching the current filters.");
      return;
  }

  // Sort: Company -> Status -> Party
  allBills.sort((a, b) => {
      if (a.company !== b.company) return a.company.localeCompare(b.company);
      if (a.status !== b.status) return a.status.localeCompare(b.status);
      return a.partyName.localeCompare(b.partyName);
  });

  allBills.forEach(item => {
      rows.push([
          counter++,
          item.company,
          item.partyName,
          item.billNo,
          item.billDate,
          item.billAmt,
          item.status.toUpperCase()
      ]);
  });

  const wsData = [header, ...rows];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wscols = [{ wch: 8 }, { wch: 20 }, { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
  ws['!cols'] = wscols;

  XLSX.utils.book_append_sheet(wb, ws, "Paid_Dispute_Report");
  XLSX.writeFile(wb, `paid_dispute_report_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const downloadPrefixMap = () => {
  const header = ["Bill Number Prefix", "Company Name"];
  const data = Object.entries(CURRENT_PREFIX_MAP).map(([prefix, company]) => [prefix, company]);
  const wsData = [header, ...data];
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  const wscols = [{ wch: 25 }, { wch: 25 }];
  ws['!cols'] = wscols;
  XLSX.utils.book_append_sheet(wb, ws, "Prefix Guide");
  XLSX.writeFile(wb, "bill_number_prefix_guide.xlsx");
};
