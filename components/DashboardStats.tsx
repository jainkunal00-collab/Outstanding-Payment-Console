import React, { useMemo } from 'react';
import { ProcessedParty } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Users, Building2, AlertCircle, Clock } from 'lucide-react';
import { getCompanyNameFromBillNo, UNMAPPED_KEY, getUnmappedParties } from '../services/csvProcessor';

interface DashboardStatsProps {
  data: ProcessedParty[];
}

const COMPANY_COLORS = [
  '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#ec4899', '#06b6d4', '#f97316', '#3b82f6', '#14b8a6'
];

const AGING_COLORS = ['#10b981', '#f59e0b', '#f97316', '#ef4444'];

/**
 * Formats numbers into Indian style with space: ₹ 10,00,00,000
 */
const formatINR = (amount: number) => {
  const formatter = new Intl.NumberFormat('en-IN', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `₹ ${formatter.format(amount)}`;
};

const DashboardStats: React.FC<DashboardStatsProps> = ({ data }) => {
  
  const stats = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    let debitCount = 0;
    let creditCount = 0;

    data.forEach(p => {
      totalDebit += p.balanceDebit;
      totalCredit += p.balanceCredit;
      if (p.balanceDebit > 0) debitCount++;
      if (p.balanceCredit > 0) creditCount++;
    });

    return { totalDebit, totalCredit, debitCount, creditCount };
  }, [data]);

  const agingAnalysis = useMemo(() => {
    const buckets = [
      { name: '0-30 Days', amount: 0 },
      { name: '31-60 Days', amount: 0 },
      { name: '61-90 Days', amount: 0 },
      { name: '90+ Days', amount: 0 },
    ];
    data.forEach(p => {
      p.bills.forEach(b => {
        if (b.billAmt > 0) {
          if (b.days <= 30) buckets[0].amount += b.billAmt;
          else if (b.days <= 60) buckets[1].amount += b.billAmt;
          else if (b.days <= 90) buckets[2].amount += b.billAmt;
          else buckets[3].amount += b.billAmt;
        }
      });
    });
    return buckets;
  }, [data]);

  const companyWiseTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    
    data.forEach(p => {
        p.bills.forEach(b => {
            if (b.billAmt > 0) {
                const company = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
                totals[company] = (totals[company] || 0) + b.billAmt;
            }
        });
    });

    return Object.entries(totals)
        .map(([name, value]) => ({ 
            name, 
            amount: Math.round(value) 
        }))
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);
  }, [data]);

  const unmappedCompaniesList = useMemo(() => getUnmappedParties(data), [data]);

  const topDebtors = [...data]
    .sort((a, b) => b.balanceDebit - a.balanceDebit)
    .slice(0, 5)
    .map(p => ({
        name: p.partyName.length > 20 ? p.partyName.substring(0, 20) + '...' : p.partyName,
        amount: p.balanceDebit
    }));

  return (
    <div className="space-y-6 mb-8">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-red-100 text-red-600 rounded-lg">
              <TrendingUp size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Receivable</p>
              <h3 className="text-2xl font-bold text-slate-800">
                {formatINR(stats.totalDebit)}
              </h3>
              <p className="text-xs text-red-500 font-medium mt-1">{stats.debitCount} Parties Owe</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-green-100 text-green-600 rounded-lg">
              <TrendingDown size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Advance/Credit</p>
              <h3 className="text-2xl font-bold text-slate-800">
                {formatINR(stats.totalCredit)}
              </h3>
              <p className="text-xs text-green-500 font-medium mt-1">{stats.creditCount} Parties Advanced</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg">
              <Users size={24} />
            </div>
            <div>
              <p className="text-sm text-slate-500 font-medium">Total Parties</p>
              <h3 className="text-2xl font-bold text-slate-800">
                {data.length}
              </h3>
              <p className="text-xs text-indigo-500 font-medium mt-1">Active Accounts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Debt Aging Analysis Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <div className="flex items-center justify-between mb-6">
          <h4 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Clock size={20} className="text-indigo-600" /> Debt Aging Analysis
          </h4>
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Priority View</span>
        </div>
        <div className="flex flex-col lg:flex-row gap-8">
          <div className="h-[250px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agingAnalysis} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={80} tick={{fontSize: 10, fill: '#64748b', fontWeight: 700}} />
                <Tooltip formatter={(value: number) => [formatINR(value), 'Total']} contentStyle={{ borderRadius: '8px', border: 'none' }} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} barSize={24}>
                  {agingAnalysis.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={AGING_COLORS[index % AGING_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:flex lg:flex-col gap-3 lg:w-48">
             {agingAnalysis.map((bucket, idx) => (
               <div key={bucket.name} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                 <p className="text-[10px] text-slate-400 font-bold uppercase mb-1">{bucket.name}</p>
                 <p className="text-sm font-black font-mono" style={{ color: AGING_COLORS[idx] }}>{formatINR(bucket.amount)}</p>
               </div>
             ))}
          </div>
        </div>
      </div>

      {/* Main Breakdown Section */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 w-full">
        <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
          <h4 className="text-xl font-bold text-slate-800">Company Wise Outstanding</h4>
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <Building2 size={18} />
            <span className="font-semibold">{companyWiseTotals.length} Companies Identified</span>
          </div>
        </div>

        <div className="flex flex-col gap-8">
            {/* Chart Column */}
            <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={companyWiseTotals} margin={{ top: 10, right: 10, left: 20, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="name" 
                            tick={{fontSize: 10, fill: '#64748b'}} 
                            interval={0}
                            angle={-45}
                            textAnchor="end"
                            height={60}
                        />
                        <YAxis 
                            tick={{fontSize: 10, fill: '#64748b'}} 
                            tickFormatter={(value) => `₹${(value/100000).toFixed(0)}L`}
                            width={50}
                        />
                        <Tooltip 
                            formatter={(value: number) => [formatINR(value), 'Outstanding']}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        />
                        <Bar dataKey="amount" radius={[4, 4, 0, 0]} barSize={30}>
                            {companyWiseTotals.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={COMPANY_COLORS[index % COMPANY_COLORS.length]} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            {/* List of Companies - Card Style Horizontal Wrapping */}
            <div className="flex flex-wrap gap-4 items-center justify-start">
                {companyWiseTotals.map((item, idx) => (
                    <div 
                        key={item.name} 
                        className="flex items-center gap-4 px-4 py-2 bg-slate-50 border border-slate-100 rounded-lg hover:border-indigo-200 transition-colors group"
                    >
                        <div className="flex items-center gap-2">
                            <div 
                                className="w-2 h-2 rounded-full" 
                                style={{ backgroundColor: COMPANY_COLORS[idx % COMPANY_COLORS.length] }}
                            ></div>
                            <span className="text-xs font-black text-slate-700 uppercase tracking-tighter">
                                {item.name}
                            </span>
                        </div>
                        <span className="text-xs font-bold text-indigo-700 font-mono">
                            {formatINR(item.amount)}
                        </span>
                    </div>
                ))}
            </div>

            {/* Unmapped Companies Detailed List */}
            {unmappedCompaniesList.length > 0 && (
                <div className="p-3 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="flex items-center gap-2 mb-2 text-amber-800">
                        <AlertCircle size={14} />
                        <span className="text-[10px] font-bold uppercase tracking-tight">Debit Note/TCS Receivables (No Prefix Defined):</span>
                    </div>
                    <div className="max-h-24 overflow-y-auto pr-2 scrollbar-thin">
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-x-4 gap-y-1">
                            {unmappedCompaniesList.map(name => (
                                <div key={name} className="text-[9px] text-slate-600 font-medium truncate py-0.5 border-b border-amber-100/50">
                                    • {name}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
            <div className="text-right">
                <p className="text-xs text-slate-500 font-medium">Total Net Receivable</p>
                <p className="text-lg font-black text-slate-900">{formatINR(stats.totalDebit)}</p>
            </div>
        </div>
      </div>

      {/* Top 5 Debtors Chart - Secondary Detail */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h4 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
            <div className="w-1 h-6 bg-red-500 rounded-full"></div>
            Top 5 Debtors (Individual Parties)
          </h4>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topDebtors} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={160} tick={{fontSize: 11, fill: '#64748b', fontWeight: 600}} />
                <Tooltip 
                    formatter={(value: number) => [formatINR(value), 'Outstanding']}
                    cursor={{fill: 'rgba(241, 245, 249, 0.5)'}}
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="amount" fill="#ef4444" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
      </div>
    </div>
  );
};

export default DashboardStats;