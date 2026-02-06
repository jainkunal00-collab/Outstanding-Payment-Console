import React, { useMemo } from 'react';
import { ProcessedParty, BillDetail } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Phone, Calendar, Hash, Building2, TrendingUp, AlertCircle, Check, X, AlertTriangle, RotateCcw, Share2 } from 'lucide-react';
import { getCompanyNameFromBillNo, UNMAPPED_KEY, parseDate } from '../services/csvProcessor';

interface PartyDetailViewProps {
  party: ProcessedParty;
  onBack: () => void;
  filterCompanies?: string[];
  filterMinDays?: number | '';
  dateRange?: { from: string; to: string };
  onSendWhatsApp?: (message: string) => void;
  onStatusChange?: (partyId: string, billNo: string, status: BillDetail['status']) => void;
  onGenerateReminder?: () => void;
}

const COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#f97316', '#3b82f6', '#14b8a6'
];

const formatINR = (amount: number) => {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `₹ ${formatter.format(amount)}`;
};

// Helper to convert input YYYY-MM-DD to timestamp
const getFilterTimestamp = (dateStr: string) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d).getTime();
};

const PartyDetailView: React.FC<PartyDetailViewProps> = ({ party, onBack, filterCompanies = [], filterMinDays = '', dateRange, onSendWhatsApp, onStatusChange, onGenerateReminder }) => {
  
  // 1. Get List of Bills Matching Filters (Company / Date / Min Days)
  // We keep 'paid' bills in this list so we can show them in the table (marked as paid),
  // but we will filter them out for calculations.
  const filteredBills = useMemo(() => {
    return party.bills.filter(b => {
      // Must be a positive outstanding bill to show in detailed receivable view
      if (b.billAmt <= 0) return false;

      // Match companies if filter is active
      if (filterCompanies.length > 0) {
        const bCompany = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
        if (!filterCompanies.includes(bCompany)) return false;
      }

      // Match min days if filter is active
      if (filterMinDays !== '' && b.days < filterMinDays) {
        return false;
      }

      // Match Date Range if active
      if (dateRange && (dateRange.from || dateRange.to)) {
         const bDate = parseDate(b.billDate);
         if (bDate === 0) return false; // Filter out bills with no valid date

         const fromTs = getFilterTimestamp(dateRange.from);
         const toTs = getFilterTimestamp(dateRange.to);

         // Special Rule: If only one date is selected (from), treat it as "Up To" date
         if (dateRange.from && !dateRange.to) {
             if (fromTs && bDate > fromTs) return false;
         } else {
             if (fromTs && bDate < fromTs) return false;
             if (toTs && bDate > toTs) return false;
         }
      }

      return true;
    });
  }, [party.bills, filterCompanies, filterMinDays, dateRange]);

  // 2. Derive "Effective" bills for calculations (Excluding Paid and Disputed)
  const effectiveBills = useMemo(() => {
    return filteredBills.filter(b => b.status !== 'paid' && b.status !== 'dispute');
  }, [filteredBills]);

  // 3. Calculate Totals based on Effective Bills
  const filteredNetDebit = useMemo(() => {
    return effectiveBills.reduce((sum, b) => sum + b.billAmt, 0);
  }, [effectiveBills]);

  const companyBreakdown = useMemo(() => {
    const totals: Record<string, number> = {};
    effectiveBills.forEach(b => {
      const co = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
      totals[co] = (totals[co] || 0) + b.billAmt;
    });

    return Object.entries(totals)
      .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
      .filter(i => i.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [effectiveBills]);

  const maxDaysDue = useMemo(() => {
    if (effectiveBills.length === 0) return 0;
    return Math.max(...effectiveBills.map(b => b.days));
  }, [effectiveBills]);

  const isFiltering = filterCompanies.length > 0 || filterMinDays !== '' || (dateRange && (dateRange.from || dateRange.to));

  return (
    <div className="animate-fade-in space-y-6">
      {/* Detail Header / Stats */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">{party.partyName}</h2>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <Phone size={14} className="text-slate-400" />
                {party.phoneNumber || 'No phone added'}
              </div>
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-400" />
                {isFiltering ? 'Oldest Matched Bill:' : 'Oldest Bill:'} {maxDaysDue} Days Due
              </div>
            </div>
            {isFiltering && (
              <div className="mt-2 text-[10px] font-black uppercase text-indigo-600 tracking-widest bg-indigo-50 px-2 py-0.5 rounded inline-block">
                Filtered View Active
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">
                {isFiltering ? 'Refined Outstanding' : 'Net Outstanding'}
                </p>
                <p className="text-3xl font-black text-red-600">
                {formatINR(filteredNetDebit)}
                </p>
            </div>
            {onGenerateReminder && (
                <button 
                  onClick={onGenerateReminder}
                  className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white text-xs font-bold rounded-lg hover:bg-[#128C7E] shadow-md shadow-emerald-100 transition-all"
                >
                   <Share2 size={14} /> Send WhatsApp Reminder
                </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Horizontal Bar Chart Section */}
          <div className="p-6 border-r border-slate-100 min-h-[400px]">
            <h4 className="text-[11px] font-black text-indigo-600 mb-6 uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={16} />
              Company-wise Breakdown
            </h4>
            {companyBreakdown.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={companyBreakdown} 
                    layout="vertical" 
                    margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={100} 
                      tick={{fontSize: 10, fill: '#64748b', fontWeight: 800}} 
                      tickFormatter={(val) => val.length > 15 ? val.substring(0, 12) + '...' : val}
                    />
                    <Tooltip 
                      formatter={(value: number) => [formatINR(value), 'Outstanding']}
                      cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    />
                    <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={32}>
                      {companyBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-400 text-sm italic">
                {effectiveBills.length === 0 && filteredBills.length > 0 ? "All matching bills marked paid/disputed" : "No data for current filters"}
              </div>
            )}
          </div>

          {/* Detailed Bill List Summary */}
          <div className="p-6 bg-slate-50/50 flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Hash size={16} />
                {isFiltering ? 'Filtered Metrics' : 'Party Summary Metrics'}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Refined Debit</p>
                  <p className="text-xl font-black text-red-600">{formatINR(filteredNetDebit)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Total Advance</p>
                  <p className="text-xl font-black text-green-600">{formatINR(party.balanceCredit)}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-1 sm:col-span-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-slate-400 font-bold uppercase">Collection Priority</p>
                    {maxDaysDue > 90 ? (
                      <span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Critical</span>
                    ) : maxDaysDue > 30 ? (
                      <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">High</span>
                    ) : (
                      <span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Normal</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">
                    This party has <span className="text-slate-900 font-bold">{effectiveBills.length}</span> active pending bills across <span className="text-slate-900 font-bold">{companyBreakdown.length}</span> companies.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full Transaction Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="font-black text-slate-800 uppercase tracking-widest text-[11px]">
            {isFiltering ? 'Filtered Transaction History' : 'Full Transaction History'}
          </h3>
          <span className="text-xs font-bold text-slate-400 uppercase">{filteredBills.length} Records Shown</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-white">
              <tr>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Bill Number</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Company</th>
                <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Bill Date</th>
                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Days Due</th>
                <th className="px-6 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Outstanding</th>
                <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Bill Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredBills.map((bill, idx) => {
                const company = getCompanyNameFromBillNo(bill.billNo) || UNMAPPED_KEY;
                const isPartiallyAdjusted = bill.billAmt < bill.originalBillAmt && bill.billAmt > 0;
                const isPaid = bill.status === 'paid';
                const isDisputed = bill.status === 'dispute';
                
                return (
                  <tr key={idx} className={`transition-colors ${isPaid ? 'bg-slate-50/80' : isDisputed ? 'bg-amber-50/50' : 'hover:bg-slate-50/50'}`}>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm font-mono font-bold ${isPaid ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {bill.billNo || 'N/A'}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap ${isPaid ? 'opacity-50' : ''}`}>
                      <div className="flex items-center gap-2">
                        <Building2 size={12} className="text-slate-300" />
                        <span className="text-xs font-black text-slate-600 uppercase">{company}</span>
                      </div>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-xs font-medium ${isPaid ? 'text-slate-300' : 'text-slate-500'}`}>
                        {bill.billDate}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-center ${isPaid ? 'opacity-50' : ''}`}>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                        isPaid ? 'bg-slate-100 text-slate-400 line-through' :
                        bill.days > 60 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {bill.days} DAYS
                      </span>
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right ${isPaid ? 'opacity-50' : ''}`}>
                      <span className={`text-sm font-black ${isPaid ? 'text-slate-400 line-through' : 'text-slate-900'}`}>
                        {formatINR(bill.billAmt)}
                        {isPartiallyAdjusted && (
                          <span className={`text-xs ml-1 font-black ${isPaid ? 'text-slate-400' : 'text-indigo-700'}`}> (B)</span>
                        )}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        {onStatusChange && (
                            <div className="flex items-center justify-center gap-2">
                                {isPaid ? (
                                    <button 
                                        onClick={() => onStatusChange(party.id, bill.billNo, 'unpaid')}
                                        className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase hover:bg-slate-200 transition-colors"
                                        title="Undo Paid Status"
                                    >
                                        <RotateCcw size={12} /> Undo
                                    </button>
                                ) : isDisputed ? (
                                    <button 
                                        onClick={() => onStatusChange(party.id, bill.billNo, 'unpaid')}
                                        className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px] font-bold uppercase hover:bg-amber-200 transition-colors"
                                        title="Undo Dispute"
                                    >
                                        <RotateCcw size={12} /> Undo
                                    </button>
                                ) : (
                                    <>
                                        <button 
                                            onClick={() => onStatusChange(party.id, bill.billNo, 'paid')}
                                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors border border-transparent hover:border-emerald-100"
                                            title="Mark as Paid (Session Only)"
                                        >
                                            <Check size={16} />
                                        </button>
                                        <button 
                                            onClick={() => onStatusChange(party.id, bill.billNo, 'dispute')}
                                            className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md transition-colors border border-transparent hover:border-amber-100"
                                            title="Mark as Dispute (Session Only)"
                                        >
                                            <AlertTriangle size={16} />
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </td>
                  </tr>
                );
              })}
              {filteredBills.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                    No bills match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Footer / Info */}
      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase justify-center mt-4">
        <AlertCircle size={12} />
        Actions (Paid/Dispute) only affect this session view and do not modify the original uploaded file.
      </div>
    </div>
  );
};

export default PartyDetailView;