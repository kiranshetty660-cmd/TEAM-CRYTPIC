import React from "react";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "danger" | "warning" | "success" | "info" | "neutral" | "purple";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Badge({ children, variant = "neutral", size = "md", className = "" }: BadgeProps) {
  const variantStyles = {
    danger: "bg-red-500/15 text-red-400 border border-red-500/30",
    warning: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    success: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    info: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    purple: "bg-purple-500/15 text-purple-400 border border-purple-500/30",
    neutral: "bg-slate-800 text-slate-300 border border-slate-700",
  };

  const sizeStyles = {
    sm: "px-2 py-0.5 text-xs font-medium rounded",
    md: "px-2.5 py-1 text-xs font-semibold rounded-md",
    lg: "px-3 py-1.5 text-sm font-semibold rounded-lg",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 tracking-wide ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}>
      {children}
    </span>
  );
}
