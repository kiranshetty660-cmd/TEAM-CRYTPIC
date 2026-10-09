import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "danger" | "warning" | "success" | "info" | "neutral" | "purple";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Badge({ children, variant = "neutral", size = "md", className = "" }: BadgeProps) {
  const variantStyles = {
    danger: "bg-red-50 text-red-700 border border-red-200 font-semibold",
    warning: "bg-amber-50 text-amber-800 border border-amber-200 font-semibold",
    success: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold",
    info: "bg-blue-50 text-blue-700 border border-blue-200 font-semibold",
    purple: "bg-purple-50 text-purple-700 border border-purple-200 font-semibold",
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
