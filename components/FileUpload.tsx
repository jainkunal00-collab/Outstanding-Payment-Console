import React, { useRef, useState } from 'react';
import { Upload, FileText, AlertCircle, FileSpreadsheet } from 'lucide-react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
      // Clear the input value so the same file can be selected again after a "Clear Data" action
      e.target.value = '';
    }
  };

  const handleFile = (file: File) => {
    const validTypes = [
      'text/csv', 
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel' // .xls
    ];
    const validExtensions = ['.csv', '.xlsx', '.xls'];
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();

    if (validTypes.includes(file.type) || validExtensions.includes(fileExt)) {
      if (file.size > 25 * 1024 * 1024) { // 25MB Limit
        alert("File size exceeds 25MB limit.");
        return;
      }
      setFileName(file.name);
      onFileSelect(file);
    } else {
      alert("Please upload a valid CSV or Excel file.");
    }
  };

  const onButtonClick = () => {
    inputRef.current?.click();
  };

  return (
    <div className="w-full max-w-2xl mx-auto mb-8">
      <div 
        className={`relative flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed transition-all duration-300 ease-in-out
          ${dragActive ? 'border-indigo-500 bg-indigo-50 scale-[1.01]' : 'border-slate-300 bg-white hover:bg-slate-50'}
        `}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input 
          ref={inputRef}
          type="file" 
          className="hidden" 
          accept=".csv, .xlsx, .xls"
          onChange={handleChange}
        />
        
        <div className="flex flex-col items-center pointer-events-none">
          {fileName ? (
            <>
              <div className="p-3 bg-indigo-100 rounded-full text-indigo-600 mb-3">
                 {fileName.endsWith('.csv') ? <FileText size={32} /> : <FileSpreadsheet size={32} />}
              </div>
              <p className="text-sm font-medium text-slate-700">{fileName}</p>
              <p className="text-xs text-slate-500 mt-1">File loaded successfully</p>
            </>
          ) : (
            <>
              <div className="p-3 bg-slate-100 rounded-full text-slate-400 mb-3 group-hover:text-indigo-500 transition-colors">
                <Upload size={32} />
              </div>
              <p className="text-sm font-medium text-slate-700">
                <button onClick={onButtonClick} className="text-indigo-600 hover:underline mr-1 cursor-pointer pointer-events-auto">Click to upload</button>
                or drag and drop
              </p>
              <p className="text-xs text-slate-500 mt-1">Excel or CSV files (Max 25MB)</p>
            </>
          )}
        </div>
      </div>
      
      {!fileName && (
         <div className="mt-4 flex items-start gap-2 text-xs text-slate-500 bg-blue-50 p-3 rounded-lg border border-blue-100">
            <AlertCircle size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p>Ensure your file follows the hierarchical party format: Party header row followed by transaction details.</p>
         </div>
      )}
    </div>
  );
};

export default FileUpload;