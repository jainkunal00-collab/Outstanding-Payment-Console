import React, { useState, useMemo, useRef, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import DashboardStats from './components/DashboardStats';
import PartyDetailView from './components/PartyDetailView';
import AIChatSupport from './components/AIChatSupport';
import { parseFile, downloadExcel, downloadExcelCombined, downloadExcelCompanyWide, downloadPrefixMap, getUniqueCompanies, getCompanyNameFromBillNo, UNMAPPED_KEY, finalizeParty, parseDate } from './services/csvProcessor';
import { generatePaymentReminder } from './services/geminiService';
import { ProcessedParty, BillDetail } from './types';
import { Download, MessageSquare, Save, Search, X, Building2, Check, Trash2, ArrowLeft, ChevronDown, CalendarClock, Filter, Send, Share2, Loader2, Copy, Calendar } from 'lucide-react';

const STORAGE_KEY = 'yash_marketing_outstanding_data';
const UPLOAD_TIME_KEY = 'yash_marketing_upload_time';

function App() {
  const [data, setData] = useState<ProcessedParty[]>([]);
  const [lastUploadTime, setLastUploadTime] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompanies, setFilterCompanies] = useState<string[]>([]);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [filterMinDays, setFilterMinDays] = useState<number | ''>('');
  const [dateRange, setDateRange] = useState<{from: string, to: string}>({ from: '', to: '' });
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [uploadKey, setUploadKey] = useState(0);
  
  // Selection State
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkMessages, setBulkMessages] = useState<Record<string, { status: 'loading' | 'ready' | 'error', text?: string }>>({});

  // Clear confirmation state
  const [confirmClear, setConfirmClear] = useState(false);

  // Scroll Position Management
  const scrollPositionRef = useRef(0);

  const filterRef = useRef<HTMLDivElement>(null);
  const dateFilterRef = useRef<HTMLDivElement>(null);

  // Persistence: Load from LocalStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const savedTime = localStorage.getItem(UPLOAD_TIME_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
            setData(parsed);
            if (savedTime) setLastUploadTime(savedTime);
        }
      } catch (e) {
        console.error("Failed to load saved data", e);
      }
    }
  }, []);

  // Persistence: Save to LocalStorage
  useEffect(() => {
    if (data.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      if (lastUploadTime) localStorage.setItem(UPLOAD_TIME_KEY, lastUploadTime);
    } else {
      // Ensure storage is cleared when data is empty
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(UPLOAD_TIME_KEY);
    }
  }, [data, lastUploadTime]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterDropdownOpen(false);
      }
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target as Node)) {
        setIsDateDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);
  const [activeReminder, setActiveReminder] = useState<{party: ProcessedParty, message: string} | null>(null);
  const [generatingReminder, setGeneratingReminder] = useState(false);

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [selectedCompaniesForModal, setSelectedCompaniesForModal] = useState<string[]>([]);
  const companiesList = getUniqueCompanies();

  // Navigation Handlers with Scroll Preservation
  const handleOpenPartyDetail = (id: string) => {
    scrollPositionRef.current = window.scrollY;
    setSelectedPartyId(id);
    window.scrollTo(0, 0);
  };

  const handleBackToDashboard = () => {
    setSelectedPartyId(null);
    setTimeout(() => {
      window.scrollTo(0, scrollPositionRef.current);
    }, 0);
  };

  // Helper to convert input YYYY-MM-DD to timestamp compatible with parseDate
  const getFilterTimestamp = (dateStr: string) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m-1, d).getTime();
  };

  const getFilteredBillsForParty = (party: ProcessedParty) => {
    return party.bills.filter(b => {
      if (b.billAmt <= 0) return false;
      
      // Filter by Company
      if (filterCompanies.length > 0) {
        const bCompany = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
        if (!filterCompanies.includes(bCompany)) return false;
      }
      
      // Filter by Min Days
      if (filterMinDays !== '' && b.days < filterMinDays) return false;

      // Filter by Date Range
      if (dateRange.from || dateRange.to) {
         const bDate = parseDate(b.billDate);
         if (bDate === 0) return false; // Filter out bills with no valid date

         if (dateRange.from) {
             const fromTs = getFilterTimestamp(dateRange.from);
             if (fromTs && bDate < fromTs) return false;
         }
         if (dateRange.to) {
             const toTs = getFilterTimestamp(dateRange.to);
             if (toTs && bDate > toTs) return false;
         }
      }

      return true;
    });
  };

  const filteredData = useMemo(() => {
    return data.filter(p => {
      if (searchTerm && !p.partyName.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      const relevantBills = getFilteredBillsForParty(p);
      if ((filterCompanies.length > 0 || filterMinDays !== '' || dateRange.from || dateRange.to) && relevantBills.length === 0) return false;
      return true;
    });
  }, [data, searchTerm, filterCompanies, filterMinDays, dateRange]);

  const handleFileSelect = async (file: File) => {
    setLoading(true);
    try {
      const processed = await parseFile(file);
      setData(processed);
      
      const now = new Date();
      const formattedDate = now.toLocaleString('en-IN', { 
        day: '2-digit', month: 'short', year: '2-digit', 
        hour: '2-digit', minute: '2-digit', hour12: true 
      });
      setLastUploadTime(formattedDate);
    } catch (error) {
      console.error(error);
      alert("Error parsing file. Please check format.");
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    if (!confirmClear) {
        setConfirmClear(true);
        // Reset confirmation after 3 seconds if not confirmed
        setTimeout(() => setConfirmClear(false), 3000);
        return;
    }

    // Perform clear
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(UPLOAD_TIME_KEY);
    
    setSearchTerm('');
    setFilterCompanies([]);
    setFilterMinDays('');
    setDateRange({ from: '', to: '' });
    setSelectedCompaniesForModal([]);
    setSelectedPartyIds(new Set());
    setLoading(false);
    setIsCompanyModalOpen(false);
    setActiveReminder(null);
    setSelectedPartyId(null);
    setUploadKey(prev => prev + 1);
    setData([]);
    setLastUploadTime(null);
    setConfirmClear(false);
  };

  const handlePhoneNumberChange = (id: string, value: string) => {
    setData(prev => prev.map(p => p.id === id ? { ...p, phoneNumber: value } : p));
  };

  const handleBillStatusChange = (partyId: string, billNo: string, newStatus: BillDetail['status']) => {
    setData(prev => {
      return prev.map(p => {
        if (p.id !== partyId) return p;
        const updatedBills = p.bills.map(b => 
          b.billNo === billNo ? { ...b, status: newStatus } : b
        );
        const partyCopy = { ...p, bills: updatedBills };
        // We do not re-run finalizeParty here to prevent re-shuffling logic, just update status
        return partyCopy;
      });
    });
  };

  // Selection Logic
  const toggleSelectAll = () => {
    if (selectedPartyIds.size === filteredData.length) {
      setSelectedPartyIds(new Set());
    } else {
      setSelectedPartyIds(new Set(filteredData.map(p => p.id)));
    }
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedPartyIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPartyIds(newSet);
  };

  const openWhatsApp = (phone: string, message: string) => {
    const cleanPhone = phone?.replace(/[^0-9]/g, '');
    if (!cleanPhone) {
      alert("Please enter a valid phone number for this party.");
      return;
    }
    const url = `https://wa.me/${cleanPhone.length === 10 ? '91'+cleanPhone : cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  const handleGenerateReminder = async (party: ProcessedParty, directSend: boolean = false) => {
      setGeneratingReminder(true);
      try {
        const msg = await generatePaymentReminder(party);
        if (directSend) {
          openWhatsApp(party.phoneNumber, msg);
        } else {
          setActiveReminder({ party, message: msg });
        }
      } catch (err) {
        alert("Failed to generate reminder.");
      } finally {
        setGeneratingReminder(false);
      }
  };

  // Bulk WhatsApp Logic
  const handleBulkWhatsAppClick = () => {
    setIsBulkModalOpen(true);
    // Initialize status for all selected
    const initialStatus: Record<string, { status: 'loading' | 'ready' | 'error', text?: string }> = {};
    selectedPartyIds.forEach(id => {
        initialStatus[id] = { status: 'loading' };
    });
    setBulkMessages(initialStatus);

    // Process concurrently but independently
    Array.from(selectedPartyIds).forEach(async (item) => {
        const id = String(item);
        const party = data.find(p => p.id === id);
        if (party) {
            try {
                const msg = await generatePaymentReminder(party);
                setBulkMessages(prev => ({...prev, [id]: { status: 'ready', text: msg }}));
            } catch (e) {
                setBulkMessages(prev => ({...prev, [id]: { status: 'error' }}));
            }
        }
    });
  };

  // Passed filteredData and filter params to ensure Excel matches the view
  const handleDownload = () => filteredData.length > 0 && downloadExcel(filteredData, filterCompanies, filterMinDays, dateRange);
  const handleDownloadCombined = () => filteredData.length > 0 && downloadExcelCombined(filteredData, filterCompanies, filterMinDays, dateRange);

  const handleToggleCompanyFilter = (company: string) => {
    setFilterCompanies(prev => 
      prev.includes(company) ? prev.filter(c => c !== company) : [...prev, company]
    );
  };

  const handleSelectAllCompanies = () => {
    if (filterCompanies.length === companiesList.length) {
      setFilterCompanies([]);
    } else {
      setFilterCompanies([...companiesList]);
    }
  };

  const handleToggleCompanyModal = (company: string) => {
    setSelectedCompaniesForModal(prev => 
      prev.includes(company) ? prev.filter(c => c !== company) : [...prev, company]
    );
  };

  const handleDownloadSelectedCompanies = (format: 'standard' | 'combined') => {
    if (selectedCompaniesForModal.length === 0) return;
    downloadExcelCompanyWide(data, selectedCompaniesForModal, format, filterMinDays, dateRange);
    setIsCompanyModalOpen(false);
  };

  const selectedParty = data.find(p => p.id === selectedPartyId);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-sm">
                <Download size={20} />
            </div>
            <div className="flex flex-col">
                <h1 className="text-lg font-bold text-slate-800 leading-tight">Yash Marketing</h1>
                {lastUploadTime && (
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        Updated: {lastUploadTime}
                    </span>
                )}
            </div>
          </div>
          <div className="flex items-center gap-2">
             {selectedPartyId ? (
                <button onClick={handleBackToDashboard} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200">
                  <ArrowLeft size={16} /> Back
                </button>
             ) : (
                <>
                   <button onClick={() => downloadPrefixMap()} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200">
                      <Download size={16} /> Prefix Guide
                   </button>
                   {data.length > 0 && (
                       <>
                          <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg shadow-sm transition-colors"><Save size={16} /> Excel 1</button>
                          <button onClick={handleDownloadCombined} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-sm transition-colors border border-indigo-900"><Save size={16} /> Excel 2</button>
                          <button onClick={() => setIsCompanyModalOpen(true)} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors border border-emerald-800"><Building2 size={16} /> Export Company Wide</button>
                          <button 
                            onClick={handleClear} 
                            className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors border ml-2 cursor-pointer ${confirmClear ? 'bg-red-600 text-white border-red-700 hover:bg-red-700 shadow-md' : 'text-red-600 bg-red-50 hover:bg-red-100 border-red-100'}`}
                          >
                             <Trash2 size={16} /> {confirmClear ? 'Confirm Clear?' : 'Clear'}
                          </button>
                       </>
                   )}
                </>
             )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {data.length === 0 ? (
           <div className="flex flex-col items-center justify-center min-h-[60vh]">
              <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold text-slate-900 mb-2">Outstanding Payment Console</h2>
                  <p className="text-slate-500 max-w-md mx-auto">Upload Excel/CSV or wait for saved data to load.</p>
              </div>
              <FileUpload key={uploadKey} onFileSelect={handleFileSelect} />
              {loading && <p className="mt-4 text-indigo-600 animate-pulse font-medium text-sm">Processing File...</p>}
           </div>
        ) : selectedPartyId && selectedParty ? (
            <PartyDetailView 
              party={selectedParty} 
              onBack={handleBackToDashboard} 
              filterCompanies={filterCompanies}
              filterMinDays={filterMinDays}
              dateRange={dateRange}
              onSendWhatsApp={(msg) => openWhatsApp(selectedParty.phoneNumber, msg)}
              onStatusChange={handleBillStatusChange}
              onGenerateReminder={() => handleGenerateReminder(selectedParty, false)}
            />
        ) : (
            <div className="animate-fade-in relative">
                <DashboardStats data={data} />
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-20">
                    <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white sticky left-0">
                        <h3 className="text-lg font-bold text-slate-800">Payment Management</h3>
                        <div className="flex flex-wrap items-center gap-2">
                            <button onClick={handleDownload} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg shadow-sm transition-colors">
                                <Save size={16} /> Excel 1
                            </button>
                            <button onClick={handleDownloadCombined} className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-indigo-700 hover:bg-indigo-800 rounded-lg shadow-sm transition-colors border border-indigo-900">
                                <Save size={16} /> Excel 2
                            </button>
                            
                            {/* Filter: Companies */}
                            <div className="relative" ref={filterRef}>
                                <button onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)} className={`flex items-center gap-2 px-3 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-800 transition-colors font-medium border-none outline-none ${filterCompanies.length > 0 ? 'ring-2 ring-indigo-500' : ''}`}>
                                    <Filter size={16} />
                                    <span>{filterCompanies.length === 0 ? 'All Companies' : `${filterCompanies.length} Selected`}</span>
                                    <ChevronDown size={14} className={`transition-transform ${isFilterDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isFilterDropdownOpen && (
                                    <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                                        <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filters</span>
                                            <button onClick={() => setFilterCompanies([])} className="text-[10px] text-indigo-600 font-black uppercase hover:underline">Reset</button>
                                        </div>
                                        <div className="max-h-72 overflow-y-auto py-1">
                                            {/* Select All Option */}
                                            <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors group border-b border-slate-100 sticky top-0 bg-white z-10 shadow-sm">
                                                <input 
                                                    type="checkbox" 
                                                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                    checked={companiesList.length > 0 && filterCompanies.length === companiesList.length}
                                                    onChange={handleSelectAllCompanies}
                                                />
                                                <span className="text-sm font-bold text-slate-900">Select All</span>
                                            </label>

                                            {companiesList.map(c => (
                                                <label key={c} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors group">
                                                    <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600" checked={filterCompanies.includes(c)} onChange={() => handleToggleCompanyFilter(c)} />
                                                    <span className={`text-sm ${filterCompanies.includes(c) ? 'font-bold text-indigo-700' : 'text-slate-600'}`}>{c}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Filter: Date Range */}
                            <div className="relative" ref={dateFilterRef}>
                                <button 
                                    onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)} 
                                    className={`flex items-center gap-2 px-3 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-800 transition-colors font-medium border-none outline-none ${dateRange.from || dateRange.to ? 'ring-2 ring-indigo-500' : ''}`}
                                >
                                    <Calendar size={16} />
                                    <span>{(dateRange.from || dateRange.to) ? 'Date Filter' : 'Date Range'}</span>
                                    <ChevronDown size={14} className={`transition-transform ${isDateDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>
                                {isDateDropdownOpen && (
                                    <div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                                        <div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Date Range</span>
                                            <button onClick={() => { setDateRange({from: '', to: ''}); setIsDateDropdownOpen(false); }} className="text-[10px] text-indigo-600 font-black uppercase hover:underline">Clear</button>
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">From Date</label>
                                                <input 
                                                    type="date" 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={dateRange.from}
                                                    onChange={(e) => setDateRange(prev => ({...prev, from: e.target.value}))}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">To Date (Till)</label>
                                                <input 
                                                    type="date" 
                                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none"
                                                    value={dateRange.to}
                                                    onChange={(e) => setDateRange(prev => ({...prev, to: e.target.value}))}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Filter: Min Days */}
                            <div className="relative w-full sm:w-36">
                                <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                <input type="number" placeholder="Min Days" className="pl-9 pr-3 py-2 bg-slate-700 text-white placeholder:text-slate-400 rounded-lg text-sm border-none focus:ring-2 focus:ring-indigo-500 outline-none w-full" value={filterMinDays} onChange={(e) => setFilterMinDays(e.target.value === '' ? '' : parseInt(e.target.value))} />
                            </div>
                            
                            {/* Search */}
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input type="text" placeholder="Search party..." className="pl-10 pr-4 py-2 bg-slate-700 text-white rounded-lg text-sm border-none focus:ring-2 focus:ring-indigo-500 outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-6 py-3 w-10">
                                      <input 
                                        type="checkbox" 
                                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                        checked={filteredData.length > 0 && selectedPartyIds.size === filteredData.length}
                                        onChange={toggleSelectAll}
                                      />
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Party Name</th>
                                    <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Debit/Credit</th>
                                    <th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Contact Info</th>
                                    <th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {filteredData.map((party) => {
                                    const filteredBills = getFilteredBillsForParty(party);
                                    // Exclude 'paid' status from dashboard totals to reflect "Active" debt
                                    const activeBills = filteredBills.filter(b => b.status !== 'paid');
                                    const visibleDebit = activeBills.reduce((sum, b) => sum + b.billAmt, 0);
                                    
                                    return (
                                        <tr key={party.id} className={`hover:bg-slate-50 transition-colors ${selectedPartyIds.has(party.id) ? 'bg-indigo-50/50' : ''}`}>
                                            <td className="px-6 py-4 w-10">
                                              <input 
                                                type="checkbox" 
                                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                                checked={selectedPartyIds.has(party.id)}
                                                onChange={() => toggleSelectOne(party.id)}
                                              />
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <button onClick={() => handleOpenPartyDetail(party.id)} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 uppercase block tracking-tight text-left">{party.partyName}</button>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase mt-1">{activeBills.length} Active Bills</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right">
                                                <div className="flex flex-col items-end gap-1">
                                                    {visibleDebit > 0 && (
                                                        <span className="text-sm font-bold text-red-600 font-mono block">
                                                            ₹{visibleDebit.toLocaleString()} <span className="text-[9px] opacity-70">DR</span>
                                                        </span>
                                                    )}
                                                    {party.balanceCredit > 0 && (
                                                        <span className="text-sm font-bold text-emerald-600 font-mono block">
                                                            ₹{party.balanceCredit.toLocaleString()} <span className="text-[9px] opacity-70">CR</span>
                                                        </span>
                                                    )}
                                                    {visibleDebit === 0 && party.balanceCredit === 0 && (
                                                        <span className="text-slate-400 font-mono">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2">
                                                  <input type="text" placeholder="10 Digit No" className="bg-slate-100 text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-md px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-32" value={party.phoneNumber} onChange={(e) => handlePhoneNumberChange(party.id, e.target.value)} />
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                  <button onClick={() => handleGenerateReminder(party)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Preview Message">
                                                      <MessageSquare size={18} />
                                                  </button>
                                                  <button onClick={() => handleGenerateReminder(party, true)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Send Direct WhatsApp">
                                                      <Send size={18} />
                                                  </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {selectedPartyIds.size > 0 && (
                   <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 z-40 animate-slide-up">
                       <span className="text-sm font-bold">{selectedPartyIds.size} Parties Selected</span>
                       <div className="h-4 w-px bg-slate-700"></div>
                       <button onClick={handleBulkWhatsAppClick} className="flex items-center gap-2 text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors">
                           <Share2 size={18} /> Send WhatsApp Bulk
                       </button>
                       <button onClick={() => setSelectedPartyIds(new Set())} className="ml-2 p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white">
                           <X size={16} />
                       </button>
                   </div>
                )}
            </div>
        )}
        
        {/* AI Chat Support Component */}
        <AIChatSupport data={data} />
      </main>

      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Company Wide Export</h3>
                    <button onClick={() => setIsCompanyModalOpen(false)} className="text-slate-500"><X size={20} /></button>
                </div>
                <div className="p-4 overflow-y-auto">
                    <div className="grid grid-cols-1 gap-1">
                        {companiesList.map(c => (
                            <button key={c} onClick={() => handleToggleCompanyModal(c)} className={`flex items-center justify-between p-3 rounded-lg border text-sm font-medium ${selectedCompaniesForModal.includes(c) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700'}`}>
                                {c} {selectedCompaniesForModal.includes(c) && <Check size={16} />}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-4 bg-slate-50 flex flex-col gap-2">
                    <button onClick={() => handleDownloadSelectedCompanies('standard')} disabled={selectedCompaniesForModal.length === 0} className="w-full py-2 bg-emerald-600 text-white rounded-lg font-bold disabled:bg-slate-400">Excel 1 (Standard)</button>
                    <button onClick={() => handleDownloadSelectedCompanies('combined')} disabled={selectedCompaniesForModal.length === 0} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold disabled:bg-slate-400">Excel 2 (Combined)</button>
                </div>
            </div>
        </div>
      )}

      {activeReminder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
             <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up">
                 <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                     <h3 className="font-black text-slate-900 uppercase tracking-tight">AI Draft Message</h3>
                     <button onClick={() => setActiveReminder(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                 </div>
                 <div className="p-6">
                     <textarea className="w-full h-56 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm font-medium text-slate-700 leading-relaxed shadow-inner" value={activeReminder.message} readOnly />
                     <div className="mt-6 flex flex-col sm:flex-row gap-3">
                        <button onClick={() => { navigator.clipboard.writeText(activeReminder.message); alert("Copied!"); }} className="flex-1 px-4 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                           <Copy size={18} /> Copy Text
                        </button>
                        <button onClick={() => openWhatsApp(activeReminder.party.phoneNumber, activeReminder.message)} className="flex-1 px-4 py-3 bg-[#25D366] text-white rounded-xl font-bold text-sm hover:bg-[#128C7E] shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2">
                           <Share2 size={18} /> Send via WhatsApp
                        </button>
                     </div>
                 </div>
             </div>
          </div>
      )}

      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-up">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                    <h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                        <Share2 size={20} className="text-emerald-600" />
                        Bulk WhatsApp Sender
                    </h3>
                    <button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                <div className="p-4 bg-blue-50 border-b border-blue-100 flex gap-3 text-xs text-blue-700">
                    <div className="mt-0.5"><Loader2 size={16} className="animate-spin" /></div>
                    <p>AI messages are generating automatically. Click "Send" next to each party to open WhatsApp Web in a new tab.</p>
                </div>
                <div className="overflow-y-auto flex-1 p-2">
                    {Array.from(selectedPartyIds).map(id => {
                        const party = data.find(p => p.id === id);
                        const status = bulkMessages[id] || { status: 'loading' };
                        if (!party) return null;

                        return (
                            <div key={id} className="flex items-center justify-between p-4 mb-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-200 transition-colors">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm">{party.partyName}</h4>
                                    <p className="text-xs text-slate-500 font-mono mt-1">{party.phoneNumber || 'No Phone'}</p>
                                </div>
                                <div>
                                    {status.status === 'loading' && (
                                        <span className="flex items-center gap-2 text-xs font-bold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-lg">
                                            <Loader2 size={14} className="animate-spin" /> Generating...
                                        </span>
                                    )}
                                    {status.status === 'error' && (
                                        <span className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">Failed</span>
                                    )}
                                    {status.status === 'ready' && (
                                        <button 
                                            onClick={() => openWhatsApp(party.phoneNumber, status.text || '')}
                                            className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white text-xs font-bold rounded-lg hover:bg-[#128C7E] shadow-md shadow-emerald-100 transition-all"
                                        >
                                            <Share2 size={14} /> Send WhatsApp
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
      )}

      {generatingReminder && !isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[2px]">
             <div className="bg-white p-6 rounded-2xl shadow-2xl border border-slate-100 flex items-center gap-4 animate-scale-up">
                 <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                 <span className="text-sm font-black text-indigo-600 uppercase tracking-widest">Generating AI Intelligence...</span>
             </div>
        </div>
      )}
    </div>
  );
}

export default App;