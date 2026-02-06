import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface DateRangePickerProps {
    startDate: string;
    endDate: string;
    onChange: (range: { from: string; to: string }) => void;
    onClose: () => void;
}

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const DateRangePicker: React.FC<DateRangePickerProps> = ({ startDate, endDate, onChange, onClose }) => {
    const [viewDate, setViewDate] = useState(startDate ? new Date(startDate) : new Date());
    const [tempRange, setTempRange] = useState({ from: startDate, to: endDate });
    const [hoverDate, setHoverDate] = useState<string | null>(null);

    const getDaysArray = (year: number, month: number) => {
        const firstDay = new Date(year, month, 1).getDay(); // 0 = Sun
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const days = [];
        for (let i = 0; i < firstDay; i++) days.push(null);
        for (let i = 1; i <= daysInMonth; i++) days.push(new Date(year, month, i));
        return days;
    };

    const formatDate = (d: Date) => {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };

    const formatDisplay = (dateStr: string) => {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    };

    const handleDateClick = (date: Date) => {
        const dateStr = formatDate(date);
        
        if (!tempRange.from || (tempRange.from && tempRange.to)) {
            // Start new selection
            setTempRange({ from: dateStr, to: '' });
        } else {
            // Complete selection
            if (new Date(dateStr) < new Date(tempRange.from)) {
                setTempRange({ from: dateStr, to: tempRange.from });
            } else {
                setTempRange({ ...tempRange, to: dateStr });
            }
        }
    };

    const handleApply = () => {
        // Ensure strictly ordered dates
        if (tempRange.from && tempRange.to && new Date(tempRange.from) > new Date(tempRange.to)) {
             onChange({ from: tempRange.to, to: tempRange.from });
        } else {
             onChange(tempRange);
        }
        onClose();
    };

    const handlePreset = (preset: string) => {
        const now = new Date();
        let from = '';
        let to = formatDate(now);
        
        if (preset === 'today') {
            from = to;
        } else if (preset === 'yesterday') {
            const y = new Date(now); y.setDate(y.getDate() - 1);
            from = formatDate(y);
            to = formatDate(y);
        } else if (preset === 'last7') {
            const d = new Date(now); d.setDate(d.getDate() - 6);
            from = formatDate(d);
        } else if (preset === 'last30') {
            const d = new Date(now); d.setDate(d.getDate() - 29);
            from = formatDate(d);
        } else if (preset === 'thisMonth') {
            from = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
        } else if (preset === 'lastMonth') {
            const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const last = new Date(now.getFullYear(), now.getMonth(), 0);
            from = formatDate(first);
            to = formatDate(last);
        }
        
        setTempRange({ from, to });
    };

    const changeMonth = (delta: number) => {
        const newDate = new Date(viewDate);
        newDate.setMonth(newDate.getMonth() + delta);
        setViewDate(newDate);
    };

    const days = getDaysArray(viewDate.getFullYear(), viewDate.getMonth());

    const getDayClass = (date: Date) => {
        const s = formatDate(date);
        const from = tempRange.from;
        let to = tempRange.to;
        
        // If selecting range (to is empty), visualize range to hoverDate
        if (from && !to && hoverDate) {
             const dTime = date.getTime();
             const fTime = new Date(from).getTime();
             const hTime = new Date(hoverDate).getTime();
             if (dTime >= Math.min(fTime, hTime) && dTime <= Math.max(fTime, hTime)) {
                 if (s === from) return 'bg-indigo-600 text-white rounded-l-full font-bold shadow-md relative z-10';
                 if (s === hoverDate) return 'bg-indigo-400 text-white rounded-r-full font-bold relative z-10';
                 return 'bg-indigo-50 text-indigo-700';
             }
        }

        let isSelected = false;
        let isInRange = false;
        let isStart = false;
        let isEnd = false;

        if (from === s) { isSelected = true; isStart = true; }
        if (to === s) { isSelected = true; isEnd = true; }
        
        if (from && to) {
            const dTime = date.getTime();
            const fTime = new Date(from).getTime();
            const tTime = new Date(to).getTime();
            if (dTime > Math.min(fTime, tTime) && dTime < Math.max(fTime, tTime)) {
                isInRange = true;
            }
        }

        if (isStart && isEnd) return 'bg-indigo-600 text-white rounded-full font-bold shadow-md';
        if (isStart) return 'bg-indigo-600 text-white rounded-l-full font-bold shadow-md';
        if (isEnd) return 'bg-indigo-600 text-white rounded-r-full font-bold shadow-md';
        if (isInRange) return 'bg-indigo-50 text-indigo-700';
        return 'hover:bg-slate-100 text-slate-700';
    };

    return (
        <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 flex flex-col md:flex-row overflow-hidden animate-scale-up origin-top-left w-[300px] md:w-[500px]">
            {/* Sidebar Presets */}
            <div className="md:w-36 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-100 p-2 flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 py-2 hidden md:block">Presets</span>
                {[
                    { l: 'Today', v: 'today' },
                    { l: 'Yesterday', v: 'yesterday' },
                    { l: 'Last 7 Days', v: 'last7' },
                    { l: 'Last 30 Days', v: 'last30' },
                    { l: 'This Month', v: 'thisMonth' },
                    { l: 'Last Month', v: 'lastMonth' }
                ].map(p => (
                    <button 
                        key={p.v} 
                        onClick={() => handlePreset(p.v)}
                        className="text-left px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-colors border border-transparent hover:border-slate-200 whitespace-nowrap"
                    >
                        {p.l}
                    </button>
                ))}
            </div>

            {/* Calendar Area */}
            <div className="flex-1 p-4">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500"><ChevronLeft size={20}/></button>
                    <span className="text-sm font-bold text-slate-800">{MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}</span>
                    <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 rounded-full text-slate-500"><ChevronRight size={20}/></button>
                </div>

                <div className="grid grid-cols-7 mb-2">
                    {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                        <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase">{d}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-y-1">
                    {days.map((d, i) => {
                        if (!d) return <div key={i} className="h-8"></div>;
                        return (
                            <button 
                                key={i} 
                                onClick={() => handleDateClick(d)}
                                onMouseEnter={() => setHoverDate(formatDate(d))}
                                onMouseLeave={() => setHoverDate(null)}
                                className={`h-8 w-full flex items-center justify-center text-xs transition-colors ${getDayClass(d)}`}
                            >
                                {d.getDate()}
                            </button>
                        );
                    })}
                </div>

                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-[10px] text-slate-500">
                        {tempRange.from ? (
                            <span className="font-mono font-bold text-indigo-600">
                                {formatDisplay(tempRange.from)} {tempRange.to ? `→ ${formatDisplay(tempRange.to)}` : ''}
                            </span>
                        ) : 'Select range'}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg">Cancel</button>
                        <button onClick={handleApply} className="px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg flex items-center gap-1 shadow-sm">
                            <Check size={14} /> Apply
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};