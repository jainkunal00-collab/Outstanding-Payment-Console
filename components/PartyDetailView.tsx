
import React, { useMemo, useState } from 'react';
import { ProcessedParty, BillDetail } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Phone, Calendar, Hash, Building2, TrendingUp, AlertCircle, Check, X, AlertTriangle, RotateCcw, Share2, Calculator, CheckCircle } from 'lucide-react';
import { getCompanyNameFromBillNo, UNMAPPED_KEY, parseDate } from '../services/csvProcessor';

interface PartyDetailViewProps {
  party: ProcessedParty;
  onBack: () => void;
  filterCompanies?: string[];
  filterMinDays?: number | '';
  dateRange?: { from: string; to: string };
  onSendWhatsApp?: (message: string) => void;
  onStatusChange?: (partyId: string, billNo: string, status: BillDetail['status']) => void;
  onPartialPayment?: (partyId: string, billNo: string, amount: number) => void;
  onUndoPartialPayment?: (partyId: string, billNo: string) => void;
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

const getFilterTimestamp = (dateStr: string) => {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m-1, d).getTime();
};

const PartyDetailView: React.FC<PartyDetailViewProps> = ({ party, onBack, filterCompanies = [], filterMinDays = '', dateRange, onSendWhatsApp, onStatusChange, onPartialPayment, onUndoPartialPayment, onGenerateReminder }) => {
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [activePaymentBill, setActivePaymentBill] = useState<BillDetail | null>(null);
  const [paymentAmount, setPaymentAmount] = useState<string>('');
  
  const filteredBills = useMemo(() => {
    return party.bills.filter(b => {
      if (b.billAmt <= 0) return false;
      if (filterCompanies.length > 0) {
        const bCompany = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
        if (!filterCompanies.includes(bCompany)) return false;
      }
      if (filterMinDays !== '' && b.days < filterMinDays) return false;
      if (dateRange && (dateRange.from || dateRange.to)) {
         const bDate = parseDate(b.billDate);
         if (bDate === 0) return false;
         const fromTs = getFilterTimestamp(dateRange.from);
         const toTs = getFilterTimestamp(dateRange.to);

         // Logic: Single-date selection shows bills same as or older than selected date
         if (dateRange.from && !dateRange.to) {
             if (fromTs && bDate > fromTs) return false;
         } else if (!dateRange.from && dateRange.to) {
             if (toTs && bDate > toTs) return false;
         } else {
             if (fromTs && bDate < fromTs) return false;
             if (toTs && bDate > toTs) return false;
         }
      }
      return true;
    });
  }, [party.bills, filterCompanies, filterMinDays, dateRange]);

  const effectiveBills = useMemo(() => {
    return filteredBills.filter(b => b.status !== 'paid' && b.status !== 'dispute');
  }, [filteredBills]);

  const filteredNetDebit = useMemo(() => {
    return effectiveBills.reduce((sum, b) => sum + b.billAmt, 0);
  }, [effectiveBills]);

  // Identify bills that have partial payments made IN CONSOLE
  const partiallyPaidBills = useMemo(() => {
    return filteredBills.filter(b => (b.manualAdjustment || 0) > 0);
  }, [filteredBills]);

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

  const handleOpenPaymentModal = (bill: BillDetail) => {
      setActivePaymentBill(bill);
      setPaymentAmount('');
      setIsPaymentModalOpen(true);
  };

  const submitPayment = () => {
      if (!activePaymentBill || !onPartialPayment) return;
      const amount = parseFloat(paymentAmount);
      if (isNaN(amount) || amount <= 0) {
          alert("Please enter a valid positive amount.");
          return;
      }
      if (amount > activePaymentBill.billAmt) {
          if (!confirm("Amount entered is greater than the outstanding bill amount. This will mark the bill as fully paid. Continue?")) {
              return;
          }
      }
      onPartialPayment(party.id, activePaymentBill.billNo, amount);
      setIsPaymentModalOpen(false);
      setActivePaymentBill(null);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h2 className="text-3xl font-black text-slate-900 uppercase tracking-tight">{party.partyName}</h2>
            <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 font-medium">
              <div className="flex items-center gap-1.5"><Phone size={14} className="text-slate-400" />{party.phoneNumber || 'No phone added'}</div>
              <div className="flex items-center gap-1.5"><Calendar size={14} className="text-slate-400" />{isFiltering ? 'Oldest Matched Bill:' : 'Oldest Bill:'} {maxDaysDue} Days Due</div>
            </div>
            {isFiltering && (<div className="mt-2 text-[10px] font-black uppercase text-indigo-600 tracking-widest bg-indigo-50 px-2 py-0.5 rounded inline-block">Filtered View Active</div>)}
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{isFiltering ? 'Refined Outstanding' : 'Net Outstanding'}</p>
                <p className="text-3xl font-black text-red-600">{formatINR(filteredNetDebit)}</p>
            </div>
            {onGenerateReminder && (<button onClick={onGenerateReminder} className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white text-xs font-bold rounded-lg hover:bg-[#128C7E] shadow-md shadow-emerald-100 transition-all"><Share2 size={14} /> Send WhatsApp Reminder</button>)}
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-6 border-r border-slate-100 min-h-[400px]">
            <h4 className="text-[11px] font-black text-indigo-600 mb-6 uppercase tracking-widest flex items-center gap-2"><TrendingUp size={16} />Company-wise Breakdown</h4>
            {companyBreakdown.length > 0 ? (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={companyBreakdown} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={100} tick={{fontSize: 10, fill: '#64748b', fontWeight: 800}} tickFormatter={(val) => val.length > 15 ? val.substring(0, 12) + '...' : val} />
                    <Tooltip formatter={(value: number) => [formatINR(value), 'Outstanding']} cursor={{fill: 'rgba(241, 245, 249, 0.5)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                    <Bar dataKey="amount" radius={[0, 6, 6, 0]} barSize={32}>{companyBreakdown.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (<div className="h-[300px] flex items-center justify-center text-slate-400 text-sm italic">{effectiveBills.length === 0 && filteredBills.length > 0 ? "All matching bills marked paid/disputed" : "No data for current filters"}</div>)}
          </div>
          <div className="p-6 bg-slate-50/50 flex flex-col justify-between">
            <div className="space-y-4">
              <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2"><Hash size={16} />{isFiltering ? 'Filtered Metrics' : 'Party Summary Metrics'}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Refined Debit</p><p className="text-xl font-black text-red-600">{formatINR(filteredNetDebit)}</p></div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm"><p className="text-[10px] text-slate-400 font-bold uppercase mb-1">Total Advance</p><p className="text-xl font-black text-green-600">{formatINR(party.balanceCredit)}</p></div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm col-span-1 sm:col-span-2">
                  <div className="flex items-center justify-between mb-2"><p className="text-[10px] text-slate-400 font-bold uppercase">Collection Priority</p>{maxDaysDue > 90 ? (<span className="bg-red-100 text-red-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Critical</span>) : maxDaysDue > 30 ? (<span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">High</span>) : (<span className="bg-blue-100 text-blue-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Normal</span>)}</div>
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">This party has <span className="text-slate-900 font-bold">{effectiveBills.length}</span> active pending bills across <span className="text-slate-900 font-bold">{companyBreakdown.length}</span> companies.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Partial Adjustment Summary Section */}
      {partiallyPaidBills.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden animate-fade-in">
          <div className="px-6 py-3 border-b border-emerald-100 bg-emerald-50/50 flex items-center justify-between">
             <div className="flex items-center gap-2">
                <div className="bg-emerald-100 p-1.5 rounded-md text-emerald-700">
                    <CheckCircle size={16} />
                </div>
                <h3 className="font-bold text-emerald-800 uppercase tracking-widest text-xs">Partial Payment Adjustments</h3>
             </div>
             <span className="text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">{partiallyPaidBills.length} Bills Adjusted</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-emerald-50">
              <thead className="bg-white">
                <tr>
                  <th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Bill Details</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Original Amount</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Adjusted (Session)</th>
                  <th className="px-6 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Balance Due</th>
                  <th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-50">
                {partiallyPaidBills.map((bill, idx) => {
                  const company = getCompanyNameFromBillNo(bill.billNo) || UNMAPPED_KEY;
                  // Display manual adjustment explicitly
                  const sessionAdjustment = bill.manualAdjustment || 0;
                  
                  return (
                    <tr key={idx} className="hover:bg-emerald-50/30 transition-colors">
                      <td className="px-6 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                           <span className="text-xs font-bold text-slate-700">{bill.billNo}</span>
                           <span className="text-[10px] text-slate-500 font-medium">{company} • {bill.billDate}</span>
                        </div>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right">
                         <span className="text-xs font-medium text-slate-500">{formatINR(bill.originalBillAmt)}</span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right">
                         <span className="text-xs font-bold text-emerald-600 flex items-center justify-end gap-1">
                            <Check size={12} strokeWidth={3} /> {formatINR(sessionAdjustment)}
                         </span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-right">
                         <span className="text-sm font-black text-slate-800">{formatINR(bill.billAmt)}</span>
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-center">
                          <button onClick={() => onUndoPartialPayment && onUndoPartialPayment(party.id, bill.billNo)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors border border-transparent hover:border-red-100" title="Cancel Payment">
                              <X size={16} />
                          </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between"><h3 className="font-black text-slate-800 uppercase tracking-widest text-[11px]">{isFiltering ? 'Filtered Transaction History' : 'Full Transaction History'}</h3><span className="text-xs font-bold text-slate-400 uppercase">{filteredBills.length} Records Shown</span></div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-white"><tr><th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Bill Number</th><th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Company</th><th className="px-6 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Bill Date</th><th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Days Due</th><th className="px-6 py-3 text-right text-[10px] font-black text-slate-400 uppercase tracking-wider">Outstanding</th><th className="px-6 py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-wider">Bill Actions</th></tr></thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filteredBills.map((bill, idx) => {
                const company = getCompanyNameFromBillNo(bill.billNo) || UNMAPPED_KEY;
                const isPartiallyAdjusted = bill.billAmt < bill.originalBillAmt && bill.billAmt > 0;
                // const adjustedAmount = bill.originalBillAmt - bill.billAmt; // No longer needed for display in history
                const isPaid = bill.status === 'paid'; const isDisputed = bill.status === 'dispute';
                return (<tr key={idx} className={`transition-colors ${isPaid ? 'bg-slate-50/80' : isDisputed ? 'bg-amber-50/50' : 'hover:bg-slate-50/50'}`}><td className={`px-6 py-4 whitespace-nowrap text-sm font-mono font-bold ${isPaid ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{bill.billNo || 'N/A'}</td><td className={`px-6 py-4 whitespace-nowrap ${isPaid ? 'opacity-50' : ''}`}><div className="flex items-center gap-2"><Building2 size={12} className="text-slate-300" /><span className="text-xs font-black text-slate-600 uppercase">{company}</span></div></td><td className={`px-6 py-4 whitespace-nowrap text-xs font-medium ${isPaid ? 'text-slate-300' : 'text-slate-500'}`}>{bill.billDate}</td><td className={`px-6 py-4 whitespace-nowrap text-center ${isPaid ? 'opacity-50' : ''}`}><span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${isPaid ? 'bg-slate-100 text-slate-400 line-through' : bill.days > 60 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>{bill.days} DAYS</span></td>
                    <td className={`px-6 py-4 whitespace-nowrap text-right ${isPaid ? 'opacity-50' : ''}`}>
                         <div className="flex flex-col items-end gap-0.5">
                             <span className={`text-sm font-black ${isPaid ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{formatINR(bill.billAmt)}{isPartiallyAdjusted ? ' (B)' : ''}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                        {onStatusChange && (<div className="flex items-center justify-center gap-2">{isPaid ? (<button onClick={() => onStatusChange(party.id, bill.billNo, 'unpaid')} className="flex items-center gap-1 px-2 py-1 bg-slate-100 text-slate-600 rounded text-[10px] font-bold uppercase hover:bg-slate-200 transition-colors" title="Undo Paid Status"><RotateCcw size={12} /> Undo</button>) : isDisputed ? (<button onClick={() => onStatusChange(party.id, bill.billNo, 'unpaid')} className="flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded text-[10px] font-bold uppercase hover:bg-amber-200 transition-colors" title="Undo Dispute"><RotateCcw size={12} /> Undo</button>) : (<><button onClick={() => handleOpenPaymentModal(bill)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors border border-transparent hover:border-indigo-100" title="Record Partial Payment"><Calculator size={16} /></button><button onClick={() => onStatusChange(party.id, bill.billNo, 'paid')} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors border border-transparent hover:border-emerald-100" title="Mark as Full Paid"><Check size={16} /></button><button onClick={() => onStatusChange(party.id, bill.billNo, 'dispute')} className="p-1.5 text-amber-600 hover:bg-amber-50 rounded-md transition-colors border border-transparent hover:border-amber-100" title="Mark as Dispute"><AlertTriangle size={16} /></button></>)}</div>)}</td></tr>);
              })}
              {filteredBills.length === 0 && (<tr><td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm italic">No bills match the current filters.</td></tr>)}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase justify-center mt-4"><AlertCircle size={12} />Actions (Paid/Dispute) only affect this session view and do not modify the original uploaded file.</div>
      
      {/* Partial Payment Modal */}
      {isPaymentModalOpen && activePaymentBill && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-scale-up">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 text-sm">Record Partial Payment</h3>
                      <button onClick={() => setIsPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                      <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-100 mb-4">
                           <div className="text-xs text-indigo-600 font-bold uppercase mb-1">Bill Details</div>
                           <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-slate-700">{activePaymentBill.billNo}</span>
                                <span className="text-sm font-black text-indigo-700">{formatINR(activePaymentBill.billAmt)}</span>
                           </div>
                      </div>
                      
                      <div className="space-y-1">
                          <label className="text-xs font-bold text-slate-500 uppercase">Amount Received</label>
                          <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-bold">₹</span>
                              <input 
                                  type="number" 
                                  className="w-full pl-8 pr-4 py-2 bg-slate-100 border border-slate-200 rounded-lg font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                                  placeholder="0"
                                  autoFocus
                                  value={paymentAmount}
                                  onChange={(e) => setPaymentAmount(e.target.value)}
                              />
                          </div>
                      </div>
                      
                      <button onClick={submitPayment} className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg shadow-md shadow-indigo-100 transition-colors mt-2">
                          Confirm Payment
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default PartyDetailView;
