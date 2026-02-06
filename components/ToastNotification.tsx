
import React, { useEffect } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

interface ToastNotificationProps {
  toasts: Toast[];
  removeToast: (id: string) => void;
}

const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, removeToast }) => {
  return (
    <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-3 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
      ))}
    </div>
  );
};

const ToastItem: React.FC<{ toast: Toast; removeToast: (id: string) => void }> = ({ toast, removeToast }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 4000);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success': return <CheckCircle size={20} className="text-emerald-500" />;
      case 'error': return <AlertCircle size={20} className="text-red-500" />;
      default: return <Info size={20} className="text-indigo-500" />;
    }
  };

  const getStyles = () => {
    switch (toast.type) {
      case 'success': return 'bg-white border-emerald-100 shadow-emerald-100/50';
      case 'error': return 'bg-white border-red-100 shadow-red-100/50';
      default: return 'bg-white border-indigo-100 shadow-indigo-100/50';
    }
  };

  return (
    <div className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg max-w-sm w-80 animate-slide-up ${getStyles()}`}>
      <div className="mt-0.5">{getIcon()}</div>
      <div className="flex-1">
        <p className="text-sm font-bold text-slate-800">{toast.type === 'error' ? 'Error' : toast.type === 'success' ? 'Success' : 'Info'}</p>
        <p className="text-xs text-slate-500 mt-1 leading-snug">{toast.message}</p>
      </div>
      <button onClick={() => removeToast(toast.id)} className="text-slate-400 hover:text-slate-600 transition-colors">
        <X size={16} />
      </button>
    </div>
  );
};

export default ToastNotification;
