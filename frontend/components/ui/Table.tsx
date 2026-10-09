import React from "react";

export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className={`w-full text-left text-sm text-slate-700 ${className}`}>{children}</table>
    </div>
  );
}

export function TableHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <thead className={`bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500 font-semibold border-b border-slate-200 ${className}`}>{children}</thead>;
}

export function TableBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <tbody className={`divide-y divide-slate-100 bg-white ${className}`}>{children}</tbody>;
}

export function TableRow({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors hover:bg-slate-50/75 ${onClick ? "cursor-pointer" : ""} ${className}`}
    >
      {children}
    </tr>
  );
}

export function TableHead({
  children,
  className = "",
  colSpan,
  ...props
}: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th scope="col" colSpan={colSpan} className={`px-4 py-3 font-semibold text-slate-600 ${className}`} {...props}>
      {children}
    </th>
  );
}

export function TableCell({
  children,
  className = "",
  colSpan,
  ...props
}: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3.5 whitespace-nowrap text-slate-800 ${className}`} {...props}>
      {children}
    </td>
  );
}
