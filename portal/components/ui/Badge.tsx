import React from 'react';
import { cn } from '@/lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'purple' | 'outline' | 'info' | 'cyan' | 'primary';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  const variantStyles = {
    default: 'bg-[#b7c6c2] text-black border-black',
    primary: 'bg-[#ffe17c] text-black border-black',
    info: 'bg-[#7dd3fc] text-black border-black',
    cyan: 'bg-[#67e8f9] text-black border-black',
    success: 'bg-[#4ade80] text-black border-black',
    warning: 'bg-[#ffe17c] text-black border-black',
    danger: 'bg-[#ff5f57] text-black border-black',
    purple: 'bg-[#c084fc] text-black border-black',
    outline: 'bg-white dark:bg-[#1f2822] text-black dark:text-white border-black',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-extrabold border-2 shadow-neo-sm transition-all select-none',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
