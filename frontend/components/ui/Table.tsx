import React from "react";

export function Table({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-slate-800">
      <table className={`w-full text-left text-sm text-slate-300 ${className}`}>{children}</table>
    </div>
  );
}

export function TableHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <thead className={`bg-slate-850/80 text-xs uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-800 ${className}`}>{children}</thead>;
}

export function TableBody({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <tbody className={`divide-y divide-slate-800/60 bg-slate-900/50 ${className}`}>{children}</tbody>;
}

export function TableRow({ children, className = "", onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`transition-colors hover:bg-slate-800/40 ${onClick ? "cursor-pointer" : ""} ${className}`}
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
    <th scope="col" colSpan={colSpan} className={`px-4 py-3 font-medium ${className}`} {...props}>
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
    <td colSpan={colSpan} className={`px-4 py-3.5 whitespace-nowrap ${className}`} {...props}>
      {children}
    </td>
  );
}
