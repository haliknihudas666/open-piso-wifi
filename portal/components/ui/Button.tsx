import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'accent' | 'danger' | 'ghost' | 'outline' | 'dark';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export function Button({
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const variantStyles = {
    primary:
      'bg-[#ffe17c] text-black border-2 border-black shadow-neo btn-neo font-extrabold',
    secondary:
      'bg-[#b7c6c2] text-black border-2 border-black shadow-neo btn-neo font-bold',
    accent:
      'bg-black text-white dark:bg-[#ffe17c] dark:text-black border-2 border-black shadow-neo btn-neo font-extrabold',
    dark:
      'bg-black text-white border-2 border-black shadow-neo btn-neo font-bold',
    danger:
      'bg-[#ff5f57] text-black border-2 border-black shadow-neo btn-neo font-bold',
    ghost:
      'bg-transparent text-current hover:bg-black/10 dark:hover:bg-white/10 border-2 border-transparent font-semibold',
    outline:
      'bg-white dark:bg-[#1f2822] text-black dark:text-white border-2 border-black shadow-neo btn-neo font-bold',
  };

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
    lg: 'px-6 py-3.5 text-base rounded-xl gap-2.5 font-extrabold',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center cursor-pointer select-none font-sans disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none disabled:shadow-none disabled:transform-none',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
      {children}
    </button>
  );
}
