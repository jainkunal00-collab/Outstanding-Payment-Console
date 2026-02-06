
import React, { useState, useMemo, useRef, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import DashboardStats from './components/DashboardStats';
import PartyDetailView from './components/PartyDetailView';
import ToastNotification, { Toast } from './components/ToastNotification';
import AIChatSupport from './components/AIChatSupport';
import { DateRangePicker } from './components/DateRangePicker';
import { parseFile, downloadExcel, downloadExcelCombined, downloadExcelCompanyWide, downloadPrefixMap, downloadPaidDisputeReport, getUniqueCompanies, getCompanyNameFromBillNo, UNMAPPED_KEY, parseDate, updateGlobalPrefixMap, parsePrefixFile, reapplyPrefixes } from './services/csvProcessor';
import { generatePaymentReminder } from './services/geminiService';
import { syncPartyMobileNumbers, upsertPartyMobile, fetchGlobalData, saveGlobalData, clearGlobalData, fetchBillPrefixes, uploadBillPrefixes } from './services/supabaseService';
import { ProcessedParty, BillDetail } from './types';
import { Download, MessageSquare, Search, X, Building2, Check, CheckCircle, Trash2, ArrowLeft, ChevronDown, CalendarClock, Filter, Send, Share2, Loader2, Copy, Calendar, RefreshCw, AlertCircle, Cloud, CloudOff, Globe, Upload, Puzzle } from 'lucide-react';

export default function App() {
  const [data, setData] = useState<ProcessedParty[]>([]);
  const [lastUploadTime, setLastUploadTime] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompanies, setFilterCompanies] = useState<string[]>([]);
  const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false);
  const [filterMinDays, setFilterMinDays] = useState<number | ''>('');
  const [dateRange, setDateRange] = useState<{from: string, to: string}>({ from: '', to: '' });
  const [isDateDropdownOpen, setIsDateDropdownOpen] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [uploadKey, setUploadKey] = useState(0);
  
  const [selectedPartyIds, setSelectedPartyIds] = useState<Set<string>>(new Set());
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkMessages, setBulkMessages] = useState<Record<string, { status: 'loading' | 'ready' | 'error', text?: string }>>({});

  const [confirmClear, setConfirmClear] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [cloudStatus, setCloudStatus] = useState<'connected' | 'saving' | 'error'>('connected');
  const [toasts, setToasts] = useState<Toast[]>([]);

  const [phoneSaveStatus, setPhoneSaveStatus] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const saveTimeouts = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [isDownloadMenuOpen, setIsDownloadMenuOpen] = useState(false);
  const [isHeaderDownloadMenuOpen, setIsHeaderDownloadMenuOpen] = useState(false);
  const [isPrefixMenuOpen, setIsPrefixMenuOpen] = useState(false);

  // Extension Integration State
  const [isExtensionActive, setIsExtensionActive] = useState(false);

  const scrollPositionRef = useRef(0);
  const filterRef = useRef<HTMLDivElement>(null);
  const dateFilterRef = useRef<HTMLDivElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const headerDownloadMenuRef = useRef<HTMLDivElement>(null);
  const prefixMenuRef = useRef<HTMLDivElement>(null);
  const prefixInputRef = useRef<HTMLInputElement>(null);

  const addToast = (type: Toast['type'], message: string) => {
    const id = Date.now().toString();
    setToasts(prev => [...prev, { id, type, message }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Check for Extension Presence
  useEffect(() => {
    const checkExtension = () => {
        // The content script sets this attribute on the document root
        if (document.documentElement.getAttribute('data-yash-extension-active') === 'true') {
            setIsExtensionActive(true);
        }
    };
    
    // Check immediately
    checkExtension();
    
    // Check periodically
    const interval = setInterval(checkExtension, 1000);
    
    // Listen for custom event dispatch from content script
    const onExtensionReady = () => setIsExtensionActive(true);
    window.addEventListener('YASH_EXTENSION_READY', onExtensionReady);

    return () => {
        clearInterval(interval);
        window.removeEventListener('YASH_EXTENSION_READY', onExtensionReady);
    };
  }, []);

  useEffect(() => {
    const initApp = async () => {
      setInitialLoading(true);
      try {
        const prefixes = await fetchBillPrefixes();
        if (prefixes) updateGlobalPrefixMap(prefixes);
        const cloudResult = await fetchGlobalData();
        if (cloudResult && cloudResult.data && cloudResult.data.length > 0) {
           let loadedData = cloudResult.data;
           setLastUploadTime(cloudResult.lastUpdated);
           setSyncStatus('syncing');
           loadedData = await syncPartyMobileNumbers(loadedData, (status) => setSyncStatus(status));
           setData(loadedData);
           addToast('success', 'Data synced from Cloud');
        }
      } catch (err) {
        addToast('error', 'Failed to fetch cloud data');
        setCloudStatus('error');
      } finally {
        setInitialLoading(false);
      }
    };
    initApp();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) setIsFilterDropdownOpen(false);
      if (dateFilterRef.current && !dateFilterRef.current.contains(event.target as Node)) setIsDateDropdownOpen(false);
      if (downloadMenuRef.current && !downloadMenuRef.current.contains(event.target as Node)) setIsDownloadMenuOpen(false);
      if (headerDownloadMenuRef.current && !headerDownloadMenuRef.current.contains(event.target as Node)) setIsHeaderDownloadMenuOpen(false);
      if (prefixMenuRef.current && !prefixMenuRef.current.contains(event.target as Node)) setIsPrefixMenuOpen(false);
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

  const handleOpenPartyDetail = (id: string) => {
    scrollPositionRef.current = window.scrollY;
    setSelectedPartyId(id);
    window.scrollTo(0, 0);
  };

  const handleBackToDashboard = () => {
    setSelectedPartyId(null);
    setTimeout(() => window.scrollTo(0, scrollPositionRef.current), 0);
  };

  const getFilterTimestamp = (dateStr: string) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m-1, d).getTime();
  };

  const formatDisplayDate = (dateStr: string) => {
      if (!dateStr) return '';
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
  };

  const getFilteredBillsForParty = (party: ProcessedParty) => {
    return party.bills.filter(b => {
      if (b.billAmt <= 0) return false;
      if (filterCompanies.length > 0) {
        const bCompany = getCompanyNameFromBillNo(b.billNo) || UNMAPPED_KEY;
        if (!filterCompanies.includes(bCompany)) return false;
      }
      if (filterMinDays !== '' && b.days < filterMinDays) return false;
      if (dateRange.from || dateRange.to) {
         const bDate = parseDate(b.billDate);
         if (bDate === 0) return false;
         const fromTs = getFilterTimestamp(dateRange.from);
         const toTs = getFilterTimestamp(dateRange.to);

         // Apply "Up To" logic for single-date selection
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
    setLoading(true); setSyncStatus('idle'); setCloudStatus('saving');
    try {
      const processed = await parseFile(file);
      setSyncStatus('syncing');
      const syncedProcessed = await syncPartyMobileNumbers(processed, (status, msg) => {
        setSyncStatus(status);
        if (status === 'error') addToast('error', `Contact Sync failed: ${msg}`);
      });
      const saveResult = await saveGlobalData(syncedProcessed);
      if (saveResult.success) {
          setCloudStatus('connected');
          addToast('success', 'File Uploaded & Saved to Cloud');
      } else {
          setCloudStatus('error');
          addToast('error', 'Failed to save to Cloud');
      }
      setData(syncedProcessed);
      const now = new Date();
      setLastUploadTime(now.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: true }));
    } catch (error) {
      alert("Error parsing file. Please check format."); setCloudStatus('error');
    } finally { setLoading(false); }
  };

  const handlePrefixUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const file = e.target.files[0]; setLoading(true);
          try {
              const newPrefixMap = await parsePrefixFile(file);
              const uploadRes = await uploadBillPrefixes(newPrefixMap);
              if (uploadRes.success) {
                  updateGlobalPrefixMap(newPrefixMap);
                  setData(prevData => reapplyPrefixes(prevData));
                  addToast('success', 'Prefix Guide Updated Successfully');
              } else addToast('error', 'Failed to save Prefixes to Cloud');
          } catch (err) { addToast('error', 'Invalid Prefix File Format');
          } finally { setLoading(false); setIsPrefixMenuOpen(false); e.target.value = ''; }
      }
  };

  const handleClear = async () => {
    if (!confirmClear) { setConfirmClear(true); setTimeout(() => setConfirmClear(false), 3000); return; }
    setLoading(true); await clearGlobalData(); setSearchTerm(''); setFilterCompanies([]); setFilterMinDays(''); setDateRange({ from: '', to: '' });
    setSelectedCompaniesForModal([]); setSelectedPartyIds(new Set()); setIsCompanyModalOpen(false); setActiveReminder(null);
    setSelectedPartyId(null); setUploadKey(prev => prev + 1); setData([]); setLastUploadTime(null); setConfirmClear(false);
    setSyncStatus('idle'); setLoading(false); addToast('info', 'Cloud Data Cleared');
  };

  const handlePhoneNumberChange = (id: string, value: string, partyName: string) => {
    const updatedData = data.map(p => p.id === id ? { ...p, phoneNumber: value } : p);
    setData(updatedData); setPhoneSaveStatus(prev => ({ ...prev, [id]: 'saving' }));
    if (saveTimeouts.current[id]) clearTimeout(saveTimeouts.current[id]);
    saveTimeouts.current[id] = setTimeout(async () => {
        const res = await upsertPartyMobile(partyName, value);
        await saveGlobalData(updatedData);
        if (res.success) {
            setPhoneSaveStatus(prev => ({ ...prev, [id]: 'saved' }));
            setTimeout(() => setPhoneSaveStatus(prev => { const next = { ...prev }; if (next[id] === 'saved') delete next[id]; return next; }), 2000);
        } else { setPhoneSaveStatus(prev => ({ ...prev, [id]: 'error' })); addToast('error', 'Failed to save phone number'); }
    }, 1000);
  };

  const handleBillStatusChange = (partyId: string, billNo: string, newStatus: BillDetail['status']) => {
    const newData = data.map(p => {
        if (p.id !== partyId) return p;
        const updatedBills = p.bills.map(b => b.billNo === billNo ? { ...b, status: newStatus } : b);
        
        // Also recalc debit if unmarking paid/dispute
        const newDebit = updatedBills.reduce((sum, b) => b.status !== 'paid' && b.status !== 'dispute' ? sum + b.billAmt : sum, 0);
        
        return { ...p, bills: updatedBills, balanceDebit: newDebit, rawBalance: newDebit - p.balanceCredit };
    });
    setData(newData);
    saveGlobalData(newData); // Auto-save status changes
  };
  
  const handlePartialPayment = (partyId: string, billNo: string, amountReceived: number) => {
    const newData = data.map(p => {
        if (p.id !== partyId) return p;
        const updatedBills = p.bills.map(b => {
            if (b.billNo !== billNo) return b;
            
            // Logic: Deduct amount. If remaining is <= 0, mark paid.
            const remaining = b.billAmt - amountReceived;
            const currentManual = b.manualAdjustment || 0;
            const newManual = currentManual + amountReceived;

            if (remaining <= 0) {
                // Fully Paid
                return { ...b, billAmt: 0, status: 'paid' as const, manualAdjustment: newManual };
            } else {
                // Partially Paid - update amount, keep status active (undefined or 'unpaid')
                return { ...b, billAmt: remaining, status: 'unpaid' as const, manualAdjustment: newManual };
            }
        });

        // Recalculate Total Debit for the Party
        const newDebit = updatedBills.reduce((sum, b) => b.status !== 'paid' && b.status !== 'dispute' ? sum + b.billAmt : sum, 0);
        
        return { ...p, bills: updatedBills, balanceDebit: newDebit, rawBalance: newDebit - p.balanceCredit };
    });
    
    setData(newData);
    saveGlobalData(newData);
    addToast('success', `Payment of ₹${amountReceived} recorded.`);
  };

  const handleUndoPartialPayment = (partyId: string, billNo: string) => {
    const newData = data.map(p => {
        if (p.id !== partyId) return p;
        const updatedBills = p.bills.map(b => {
            if (b.billNo !== billNo) return b;
            
            const adjustmentToRevert = b.manualAdjustment || 0;
            if (adjustmentToRevert === 0) return b;

            const newBillAmt = b.billAmt + adjustmentToRevert;
            // If reverting makes bill outstanding again, default to unpaid
            const newStatus = newBillAmt > 0 ? 'unpaid' : 'paid';

            return { 
                ...b, 
                billAmt: newBillAmt, 
                status: newStatus as any, 
                manualAdjustment: 0 
            };
        });

        const newDebit = updatedBills.reduce((sum, b) => b.status !== 'paid' && b.status !== 'dispute' ? sum + b.billAmt : sum, 0);
        return { ...p, bills: updatedBills, balanceDebit: newDebit, rawBalance: newDebit - p.balanceCredit };
    });
    
    setData(newData);
    saveGlobalData(newData);
    addToast('info', 'Partial payment reverted.');
  };

  const toggleSelectAll = () => {
    if (selectedPartyIds.size === filteredData.length) setSelectedPartyIds(new Set());
    else setSelectedPartyIds(new Set(filteredData.map(p => p.id)));
  };

  const toggleSelectOne = (id: string) => {
    const newSet = new Set(selectedPartyIds);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelectedPartyIds(newSet);
  };

  const openWhatsApp = (phone: string, message: string) => {
    const cleanPhone = phone?.replace(/[^0-9]/g, '');
    if (!cleanPhone) { addToast('error', "Invalid or missing phone number"); return; }
    
    // INTEGRATION: If extension is active, use it to automate the send process
    if (isExtensionActive) {
        const event = new CustomEvent('YASH_WA_SEND', { 
            detail: { phone: cleanPhone, message: message } 
        });
        window.dispatchEvent(event);
        addToast('success', 'Sending via Extension...');
    } else {
        // Fallback to standard web link - DIRECT WEB ACCESS
        const phoneParam = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
        const url = `https://web.whatsapp.com/send?phone=${phoneParam}&text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    }
  };

  const handleGenerateReminder = async (party: ProcessedParty, directSend: boolean = false) => {
      setGeneratingReminder(true);
      try {
        const msg = await generatePaymentReminder(party);
        if (directSend) openWhatsApp(party.phoneNumber, msg);
        else setActiveReminder({ party, message: msg });
      } catch (err) { addToast('error', "Failed to generate reminder."); } finally { setGeneratingReminder(false); }
  };

  const handleBulkWhatsAppClick = () => {
    setIsBulkModalOpen(true);
    const initialStatus: Record<string, { status: 'loading' | 'ready' | 'error', text?: string }> = {};
    selectedPartyIds.forEach(id => { initialStatus[id] = { status: 'loading' }; });
    setBulkMessages(initialStatus);
    Array.from(selectedPartyIds).forEach(async (partyId) => {
        const id = String(partyId);
        const party = data.find(p => p.id === id);
        if (party) {
            try { const msg = await generatePaymentReminder(party); setBulkMessages(prev => ({...prev, [id]: { status: 'ready', text: msg }}));
            } catch (e) { setBulkMessages(prev => ({...prev, [id]: { status: 'error' }})); }
        }
    });
  };

  const handleDownload = () => filteredData.length > 0 && downloadExcel(filteredData, filterCompanies, filterMinDays, dateRange);
  const handleDownloadCombined = () => filteredData.length > 0 && downloadExcelCombined(filteredData, filterCompanies, filterMinDays, dateRange);
  const handleDownloadPaidDispute = () => filteredData.length > 0 && downloadPaidDisputeReport(filteredData, filterCompanies, dateRange);

  const handleToggleCompanyFilter = (company: string) => {
    setFilterCompanies(prev => prev.includes(company) ? prev.filter(c => c !== company) : [...prev, company]);
  };

  const handleSelectAllCompanies = () => {
    if (filterCompanies.length === companiesList.length) setFilterCompanies([]);
    else setFilterCompanies([...companiesList]);
  };

  const clearAllFilters = () => {
    setFilterCompanies([]);
    setFilterMinDays('');
    setDateRange({ from: '', to: '' });
  };

  const handleToggleCompanyModal = (company: string) => {
    setSelectedCompaniesForModal(prev => prev.includes(company) ? prev.filter(c => c !== company) : [...prev, company]);
  };

  const handleDownloadSelectedCompanies = (format: 'standard' | 'combined') => {
    if (selectedCompaniesForModal.length === 0) return;
    downloadExcelCompanyWide(data, selectedCompaniesForModal, format, filterMinDays, dateRange);
    setIsCompanyModalOpen(false);
  };

  const selectedParty = data.find(p => p.id === selectedPartyId);

  const hasActiveFilters = filterCompanies.length > 0 || filterMinDays !== '' || dateRange.from || dateRange.to;

  const DownloadDropdown = ({ isOpen, setIsOpen, menuRef, buttonClass }: { isOpen: boolean, setIsOpen: (v: boolean) => void, menuRef: any, buttonClass?: string }) => (
      <div className="relative" ref={menuRef}>
          <button onClick={() => setIsOpen(!isOpen)} className={buttonClass || "flex items-center gap-2 px-3 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors"}><Download size={16} /> Download <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
          {isOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                  <button onClick={() => { handleDownload(); setIsOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border-b border-slate-100 transition-colors">Excel 1 (Standard)</button>
                  <button onClick={() => { handleDownloadCombined(); setIsOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border-b border-slate-100 transition-colors">Excel 2 (Combined)</button>
                  <button onClick={() => { handleDownloadPaidDispute(); setIsOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition-colors">Paid/Dispute Report</button>
              </div>
          )}
      </div>
  );

  if (initialLoading) {
      return (
          <div className="min-h-screen bg-slate-50 flex items-center justify-center flex-col gap-4">
              <Loader2 size={40} className="text-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-500 animate-pulse">Connecting to Yash Cloud...</p>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <ToastNotification toasts={toasts} removeToast={removeToast} />
      <AIChatSupport data={data} />
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3"><div className="bg-indigo-600 p-2 rounded-lg text-white shadow-sm"><Globe size={20} /></div>
            <div className="flex flex-col"><h1 className="text-lg font-bold text-slate-800 leading-tight">Yash Marketing</h1>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">{cloudStatus === 'connected' && <Cloud size={10} className="text-emerald-500" />}{cloudStatus === 'saving' && <RefreshCw size={10} className="text-indigo-500 animate-spin" />}{cloudStatus === 'error' && <CloudOff size={10} className="text-red-500" />}
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${cloudStatus === 'connected' ? 'text-emerald-600' : cloudStatus === 'error' ? 'text-red-500' : 'text-indigo-500'}`}>{cloudStatus === 'saving' ? 'Saving...' : cloudStatus === 'error' ? 'Offline' : 'Cloud Active'}</span></div>
                    {isExtensionActive && (<><span className="text-slate-300">|</span><span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide flex items-center gap-1"><Puzzle size={10} /> Ext. Active</span></>)}
                    {lastUploadTime && (<><span className="text-slate-300">|</span><span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Data: {lastUploadTime}</span></>)}</div></div></div>
          <div className="flex items-center gap-2">{selectedPartyId ? (<button onClick={handleBackToDashboard} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"><ArrowLeft size={16} /> Back</button>) : (<>
                   <div className="relative" ref={prefixMenuRef}><button onClick={() => setIsPrefixMenuOpen(!isPrefixMenuOpen)} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"><Download size={16} /> Prefix Guide <ChevronDown size={14} /></button>
                        {isPrefixMenuOpen && (<div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in">
                                <button onClick={() => { downloadPrefixMap(); setIsPrefixMenuOpen(false); }} className="w-full text-left px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 border-b border-slate-100 transition-colors flex items-center gap-2"><Download size={14} /> Download Guide</button>
                                <label className="w-full text-left px-4 py-2.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50 transition-colors flex items-center gap-2 cursor-pointer"><Upload size={14} /> Update Guide<input ref={prefixInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handlePrefixUpload} /></label></div>)}</div>
                   {data.length > 0 && (<><DownloadDropdown isOpen={isHeaderDownloadMenuOpen} setIsOpen={setIsHeaderDownloadMenuOpen} menuRef={headerDownloadMenuRef} buttonClass="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors" /><button onClick={() => setIsCompanyModalOpen(true)} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors border border-emerald-800"><Building2 size={16} /> Export Company Wide</button>
                          <button onClick={handleClear} className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg transition-colors border ml-2 cursor-pointer ${confirmClear ? 'bg-red-600 text-white border-red-700 hover:bg-red-700 shadow-md' : 'text-red-600 bg-red-50 hover:bg-red-100 border-red-100'}`}><Trash2 size={16} /> {confirmClear ? 'Confirm Delete?' : 'Delete'}</button></>)}</>)}</div></div></header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {data.length === 0 ? (<div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in"><div className="text-center mb-8"><h2 className="text-3xl font-bold text-slate-900 mb-2">Cloud Payment Console</h2><p className="text-slate-500 max-w-md mx-auto">Upload your Excel/CSV here. It will be synced to the cloud and accessible from any device.</p></div><FileUpload key={uploadKey} onFileSelect={handleFileSelect} />{loading && <p className="mt-4 text-indigo-600 animate-pulse font-medium text-sm">Processing & Syncing to Cloud...</p>}</div>) : selectedPartyId && selectedParty ? (
            <PartyDetailView 
                party={selectedParty} 
                onBack={handleBackToDashboard} 
                filterCompanies={filterCompanies} 
                filterMinDays={filterMinDays} 
                dateRange={dateRange} 
                onSendWhatsApp={(msg) => openWhatsApp(selectedParty.phoneNumber, msg)} 
                onStatusChange={handleBillStatusChange}
                onPartialPayment={handlePartialPayment}
                onUndoPartialPayment={handleUndoPartialPayment}
                onGenerateReminder={() => handleGenerateReminder(selectedParty, false)} 
            />
        ) : (<div className="animate-fade-in relative"><DashboardStats data={data} /><div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-20">
                    <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row xl:items-center justify-between gap-4 bg-white sticky left-0"><h3 className="text-lg font-bold text-slate-800">Payment Management</h3><div className="flex flex-wrap items-center gap-2"><DownloadDropdown isOpen={isDownloadMenuOpen} setIsOpen={setIsDownloadMenuOpen} menuRef={downloadMenuRef} />
                            <div className="relative" ref={filterRef}><button onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)} className={`flex items-center gap-2 px-3 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-800 transition-colors font-medium border-none outline-none ${filterCompanies.length > 0 ? 'ring-2 ring-indigo-500' : ''}`}><Filter size={16} /><span>{filterCompanies.length === 0 ? 'All Companies' : `${filterCompanies.length} Selected`}</span><ChevronDown size={14} className={`transition-transform ${isFilterDropdownOpen ? 'rotate-180' : ''}`} /></button>
                                {isFilterDropdownOpen && (<div className="absolute left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden animate-fade-in"><div className="p-3 border-b border-slate-100 flex justify-between items-center bg-slate-50"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filters</span><button onClick={() => setFilterCompanies([])} className="text-[10px] text-indigo-600 font-black uppercase hover:underline">Reset</button></div>
                                        <div className="max-h-72 overflow-y-auto py-1"><label className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors group border-b border-slate-100 sticky top-0 bg-white z-10 shadow-sm"><input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={companiesList.length > 0 && filterCompanies.length === companiesList.length} onChange={handleSelectAllCompanies} /><span className="text-sm font-bold text-slate-900">Select All</span></label>
                                            {companiesList.map(c => (<label key={c} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors group"><input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600" checked={filterCompanies.includes(c)} onChange={() => handleToggleCompanyFilter(c)} /><span className={`text-sm ${filterCompanies.includes(c) ? 'font-bold text-indigo-700' : 'text-slate-600'}`}>{c}</span></label>))}</div></div>)}</div>
                            <div className="relative" ref={dateFilterRef}><button onClick={() => setIsDateDropdownOpen(!isDateDropdownOpen)} className={`flex items-center gap-2 px-3 py-2 bg-slate-700 text-white text-sm rounded-lg hover:bg-slate-800 transition-colors font-medium border-none outline-none ${(dateRange.from || dateRange.to) ? 'ring-2 ring-indigo-500' : ''}`}><Calendar size={16} /><span>{(dateRange.from && !dateRange.to) ? `Up to ${formatDisplayDate(dateRange.from)}` : (!dateRange.from && dateRange.to) ? `Up to ${formatDisplayDate(dateRange.to)}` : (dateRange.from || dateRange.to) ? `${formatDisplayDate(dateRange.from) || '..'} - ${formatDisplayDate(dateRange.to) || '..'}` : 'Date Range'}</span><ChevronDown size={14} className={`transition-transform ${isDateDropdownOpen ? 'rotate-180' : ''}`} /></button>
                                {isDateDropdownOpen && <DateRangePicker startDate={dateRange.from} endDate={dateRange.to} onChange={(range) => setDateRange(range)} onClose={() => setIsDateDropdownOpen(false)} />}</div>
                            <div className="relative w-full sm:w-36"><CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} /><input type="number" placeholder="Min Days" className="pl-9 pr-3 py-2 bg-slate-700 text-white placeholder:text-slate-400 rounded-lg text-sm border-none focus:ring-2 focus:ring-indigo-500 outline-none w-full" value={filterMinDays} onChange={(e) => setFilterMinDays(e.target.value === '' ? '' : parseInt(e.target.value))} /></div>
                            <div className="relative w-full sm:w-64"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input type="text" placeholder="Search party..." className="pl-10 pr-4 py-2 bg-slate-700 text-white rounded-lg text-sm border-none focus:ring-2 focus:ring-indigo-500 outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div></div></div>

                    {/* Active Filters Display */}
                    {hasActiveFilters && (
                      <div className="bg-slate-50/80 px-4 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-2 flex items-center gap-1.5"><Filter size={10} /> Active Filters:</span>
                        {filterCompanies.map(c => (
                          <div key={c} className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 shadow-sm">
                            {c}
                            <button onClick={() => handleToggleCompanyFilter(c)} className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500 transition-colors"><X size={12} /></button>
                          </div>
                        ))}
                        {filterMinDays !== '' && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-white border border-slate-200 rounded-md text-[11px] font-bold text-slate-700 shadow-sm">
                            Min Days: {filterMinDays}
                            <button onClick={() => setFilterMinDays('')} className="p-0.5 hover:bg-slate-100 rounded text-slate-400 hover:text-red-500 transition-colors"><X size={12} /></button>
                          </div>
                        )}
                        {(dateRange.from || dateRange.to) && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-white border border-indigo-200 rounded-md text-[11px] font-bold text-indigo-700 shadow-sm ring-1 ring-indigo-50">
                            {(dateRange.from && !dateRange.to) ? `Up to ${formatDisplayDate(dateRange.from)}` : (!dateRange.from && dateRange.to) ? `Up to ${formatDisplayDate(dateRange.to)}` : `${formatDisplayDate(dateRange.from)} - ${formatDisplayDate(dateRange.to)}`}
                            <button onClick={() => setDateRange({ from: '', to: '' })} className="p-0.5 hover:bg-indigo-50 rounded text-indigo-400 hover:text-red-500 transition-colors"><X size={12} /></button>
                          </div>
                        )}
                        <button onClick={clearAllFilters} className="ml-auto text-[10px] font-black text-red-600 uppercase hover:underline">Clear All</button>
                      </div>
                    )}

                    <div className="overflow-x-auto"><table className="min-w-full divide-y divide-slate-200"><thead className="bg-slate-50"><tr><th className="px-6 py-3 w-10"><input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={filteredData.length > 0 && selectedPartyIds.size === filteredData.length} onChange={toggleSelectAll} /></th><th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Party Name</th><th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase">Debit/Credit</th><th className="px-6 py-3 text-left text-xs font-semibold text-slate-500 uppercase">Contact Info</th><th className="px-6 py-3 text-center text-xs font-semibold text-slate-500 uppercase">Actions</th></tr></thead>
                            <tbody className="bg-white divide-y divide-slate-200">{filteredData.map((party) => { const filteredBills = getFilteredBillsForParty(party); const activeBills = filteredBills.filter(b => b.status !== 'paid'); const visibleDebit = activeBills.reduce((sum, b) => sum + b.billAmt, 0); return (<tr key={party.id} className={`hover:bg-slate-50 transition-colors ${selectedPartyIds.has(party.id) ? 'bg-indigo-50/50' : ''}`}><td className="px-6 py-4 w-10"><input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" checked={selectedPartyIds.has(party.id)} onChange={() => toggleSelectOne(party.id)} /></td><td className="px-6 py-4 whitespace-nowrap"><button onClick={() => handleOpenPartyDetail(party.id)} className="text-sm font-bold text-indigo-600 hover:text-indigo-800 uppercase block tracking-tight text-left">{party.partyName}</button><div className="text-[10px] text-slate-400 font-bold uppercase mt-1">{activeBills.length} Active Bills</div></td><td className="px-6 py-4 whitespace-nowrap text-right"><div className="flex flex-col items-end gap-1">{visibleDebit > 0 && <span className="text-sm font-bold text-red-600 font-mono block">₹{visibleDebit.toLocaleString()} <span className="text-[9px] opacity-70">DR</span></span>}{party.balanceCredit > 0 && <span className="text-sm font-bold text-emerald-600 font-mono block">₹{party.balanceCredit.toLocaleString()} <span className="text-[9px] opacity-70">CR</span></span>}{visibleDebit === 0 && party.balanceCredit === 0 && <span className="text-slate-400 font-mono">-</span>}</div></td><td className="px-6 py-4 whitespace-nowrap"><div className="flex items-center gap-2"><input type="text" placeholder="10 Digit No" className="bg-slate-100 text-slate-700 placeholder:text-slate-400 border border-slate-200 rounded-md px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none w-32 transition-all" value={party.phoneNumber} onChange={(e) => handlePhoneNumberChange(party.id, e.target.value, party.partyName)} /><div className="w-5 h-5 flex items-center justify-center">{phoneSaveStatus[party.id] === 'saving' && <Loader2 size={16} className="animate-spin text-indigo-500" />}{phoneSaveStatus[party.id] === 'saved' && <CheckCircle size={16} className="text-emerald-500 animate-scale-up" />}{phoneSaveStatus[party.id] === 'error' && <span title="Save Failed"><AlertCircle size={16} className="text-red-500" /></span>}</div></div></td><td className="px-6 py-4 whitespace-nowrap text-center"><div className="flex items-center justify-center gap-2"><button onClick={() => handleGenerateReminder(party)} className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Preview Message"><MessageSquare size={18} /></button><button onClick={() => handleGenerateReminder(party, true)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors" title="Send Direct WhatsApp"><Send size={18} /></button></div></td></tr>); })}</tbody></table></div></div></div>)}</main>
      {isCompanyModalOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"><div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]"><div className="p-4 border-b border-slate-200 flex justify-between items-center"><h3 className="font-bold text-slate-800">Company Wide Export</h3><button onClick={() => setIsCompanyModalOpen(false)} className="text-slate-500"><X size={20} /></button></div><div className="p-4 overflow-y-auto"><div className="grid grid-cols-1 gap-1">{companiesList.map(c => (<button key={c} onClick={() => handleToggleCompanyModal(c)} className={`flex items-center justify-between p-3 rounded-lg border text-sm font-medium ${selectedCompaniesForModal.includes(c) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-700'}`}>{c} {selectedCompaniesForModal.includes(c) && <Check size={16} />}</button>))}</div></div><div className="p-4 bg-slate-50 flex flex-col gap-2"><button onClick={() => handleDownloadSelectedCompanies('standard')} disabled={selectedCompaniesForModal.length === 0} className="w-full py-2 bg-emerald-600 text-white rounded-lg font-bold disabled:bg-slate-400">Excel 1 (Standard)</button><button onClick={() => handleDownloadSelectedCompanies('combined')} disabled={selectedCompaniesForModal.length === 0} className="w-full py-2 bg-indigo-600 text-white rounded-lg font-bold disabled:bg-slate-400">Excel 2 (Combined)</button></div></div></div>)}
      {activeReminder && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-scale-up"><div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50"><h3 className="font-black text-slate-900 uppercase tracking-tight">AI Draft Message</h3><button onClick={() => setActiveReminder(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div><div className="p-6"><textarea className="w-full h-56 p-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none resize-none text-sm font-medium text-slate-700 leading-relaxed shadow-inner" value={activeReminder.message} readOnly /><div className="mt-6 flex flex-col sm:flex-row gap-3"><button onClick={() => { navigator.clipboard.writeText(activeReminder.message); addToast('info', 'Copied to Clipboard'); }} className="flex-1 px-4 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"><Copy size={18} /> Copy Text</button><button onClick={() => openWhatsApp(activeReminder.party.phoneNumber, activeReminder.message)} className="flex-1 px-4 py-3 bg-[#25D366] text-white rounded-xl font-bold text-sm hover:bg-[#128C7E] shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-2"><Share2 size={18} /> Send via WhatsApp</button></div></div></div></div>)}
      {isBulkModalOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-up"><div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50"><h3 className="font-black text-slate-900 uppercase tracking-tight flex items-center gap-2"><Share2 size={20} className="text-emerald-600" /> Bulk WhatsApp Sender</h3><button onClick={() => setIsBulkModalOpen(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button></div><div className="p-4 bg-blue-50 border-b border-blue-100 flex gap-3 text-xs text-blue-700"><div className="mt-0.5"><Loader2 size={16} className="animate-spin" /></div><p>AI messages are generating automatically. Click "Send" next to each party to open WhatsApp Web in a new tab.</p></div><div className="overflow-y-auto flex-1 p-2">{Array.from(selectedPartyIds).map(id => { const party = data.find(p => p.id === id); const status = bulkMessages[id] || { status: 'loading' }; if (!party) return null; return (<div key={id} className="flex items-center justify-between p-4 mb-2 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-indigo-200 transition-colors"><div><h4 className="font-bold text-slate-800 text-sm">{party.partyName}</h4><p className="text-xs text-slate-500 font-mono mt-1">{party.phoneNumber || 'No Phone'}</p></div><div>{status.status === 'loading' && <span className="flex items-center gap-2 text-xs font-bold text-indigo-50 text-indigo-500 px-3 py-1.5 rounded-lg"><Loader2 size={14} className="animate-spin" /> Generating...</span>}{status.status === 'error' && <span className="text-xs font-bold text-red-500 bg-red-50 px-3 py-1.5 rounded-lg">Failed</span>}{status.status === 'ready' && <button onClick={() => openWhatsApp(party.phoneNumber, status.text || '')} className="flex items-center gap-2 px-4 py-2 bg-[#25D366] text-white text-xs font-bold rounded-lg hover:bg-[#128C7E] shadow-md shadow-emerald-100 transition-all"><Share2 size={14} /> Send WhatsApp</button>}</div></div>); })}</div></div></div>)}
      {generatingReminder && !isBulkModalOpen && (<div className="fixed inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-[2px]"><div className="bg-white p-6 rounded-2xl shadow-2xl border border-slate-100 flex items-center gap-4 animate-scale-up"><div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div><span className="text-sm font-black text-indigo-600 uppercase tracking-widest">Generating AI Intelligence...</span></div></div>)}
      {selectedPartyIds.size > 0 && (<div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-6 z-40 animate-slide-up"><span className="text-sm font-bold">{selectedPartyIds.size} Parties Selected</span><div className="h-4 w-px bg-slate-700"></div><button onClick={handleBulkWhatsAppClick} className="flex items-center gap-2 text-sm font-bold text-emerald-400 hover:text-emerald-300 transition-colors"><Share2 size={18} /> Send WhatsApp Bulk</button><button onClick={() => setSelectedPartyIds(new Set())} className="ml-2 p-1 hover:bg-slate-800 rounded-full text-slate-400 hover:text-white"><X size={16} /></button></div>)}
    </div>
  );
}
