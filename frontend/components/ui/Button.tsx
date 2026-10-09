import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "emerald";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed select-none min-h-[44px]";

  const variantStyles = {
    primary:
      "bg-slate-900 hover:bg-slate-800 text-white shadow-sm active:scale-[0.99] focus:ring-slate-900",
    emerald:
      "bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm active:scale-[0.99] focus:ring-emerald-600",
    secondary:
      "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm active:scale-[0.99] focus:ring-slate-400",
    danger:
      "bg-red-600 hover:bg-red-700 text-white shadow-sm active:scale-[0.99] focus:ring-red-500",
    outline:
      "bg-transparent hover:bg-slate-100 text-slate-700 border border-slate-300 active:scale-[0.99] focus:ring-slate-400",
    ghost:
      "bg-transparent hover:bg-slate-100 text-slate-600 hover:text-slate-900 active:scale-[0.99] focus:ring-slate-400",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
      ) : leftIcon ? (
        <span className="mr-2 inline-flex items-center">{leftIcon}</span>
      ) : null}
      {children}
      {!isLoading && rightIcon && <span className="ml-2 inline-flex items-center">{rightIcon}</span>}
    </button>
  );
}
