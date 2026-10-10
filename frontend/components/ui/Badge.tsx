import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "danger" | "warning" | "success" | "info" | "neutral" | "purple" | "teal" | "indigo" | "sky" | "orange" | "rose" | "fuchsia";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Badge({ children, variant = "neutral", size = "md", className = "" }: BadgeProps) {
  const variantStyles = {
    danger: "bg-rose-50 text-rose-700 border border-rose-200 font-semibold",
    rose: "bg-rose-50 text-rose-700 border border-rose-200 font-semibold",
    warning: "bg-amber-50 text-amber-800 border border-amber-200 font-semibold",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold",
    info: "bg-blue-50 text-blue-700 border border-blue-200 font-semibold",
    indigo: "bg-indigo-50 text-indigo-700 border border-indigo-200 font-semibold",
    purple: "bg-purple-50 text-purple-700 border border-purple-200 font-semibold",
    teal: "bg-teal-50 text-teal-800 border border-teal-200 font-semibold",
    sky: "bg-sky-50 text-sky-800 border border-sky-200 font-semibold",
    orange: "bg-orange-50 text-orange-800 border border-orange-200 font-semibold",
    fuchsia: "bg-fuchsia-50 text-fuchsia-800 border border-fuchsia-200 font-semibold",
    neutral: "bg-slate-100 text-slate-700 border border-slate-200 font-medium",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-[11px] rounded",
    md: "px-2.5 py-0.5 text-xs rounded-md",
    lg: "px-3 py-1 text-xs rounded-md",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 tracking-tight ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
