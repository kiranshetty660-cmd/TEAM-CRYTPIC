import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  hoverEffect?: boolean;
}

export function Card({ children, className = "", hoverEffect = false, ...props }: CardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-xl p-5 shadow-sm transition-all duration-150 ${
        hoverEffect ? "hover:border-slate-300 hover:shadow-md" : ""
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex items-center justify-between pb-3.5 border-b border-slate-100 mb-3.5 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <h3 className={`text-base font-semibold text-slate-900 tracking-tight ${className}`}>{children}</h3>;
}
