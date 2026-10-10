import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "outline" | "ghost" | "emerald" | "teal" | "indigo" | "blue" | "purple" | "amber" | "rose" | "sky";
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
    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed select-none min-h-[40px]";

  const variantStyles = {
    primary:
      "bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:scale-[0.99] focus:ring-blue-600",
    blue:
      "bg-blue-600 hover:bg-blue-700 text-white shadow-sm active:scale-[0.99] focus:ring-blue-600",
    indigo:
      "bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm active:scale-[0.99] focus:ring-indigo-600",
    purple:
      "bg-purple-600 hover:bg-purple-700 text-white shadow-sm active:scale-[0.99] focus:ring-purple-600",
    teal:
      "bg-teal-700 hover:bg-teal-800 text-white shadow-sm active:scale-[0.99] focus:ring-teal-700",
    emerald:
      "bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm active:scale-[0.99] focus:ring-emerald-600",
    amber:
      "bg-amber-600 hover:bg-amber-700 text-white shadow-sm active:scale-[0.99] focus:ring-amber-600",
    rose:
      "bg-rose-600 hover:bg-rose-700 text-white shadow-sm active:scale-[0.99] focus:ring-rose-600",
    sky:
      "bg-sky-600 hover:bg-sky-700 text-white shadow-sm active:scale-[0.99] focus:ring-sky-600",
    secondary:
      "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm active:scale-[0.99] focus:ring-blue-600",
    danger:
      "bg-rose-600 hover:bg-rose-700 text-white shadow-sm active:scale-[0.99] focus:ring-rose-500",
    outline:
      "bg-transparent hover:bg-slate-50 text-slate-700 border border-slate-300 active:scale-[0.99] focus:ring-blue-600",
    ghost:
      "bg-transparent hover:bg-slate-100 text-slate-700 hover:text-slate-900 active:scale-[0.99] focus:ring-slate-300",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs min-h-[34px]",
    md: "px-4 py-2 text-xs sm:text-sm min-h-[40px]",
    lg: "px-5 py-2.5 text-sm sm:text-base min-h-[44px]",
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
