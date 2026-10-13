import React from 'react';
import { cn } from '@/lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean;
  variant?: 'default' | 'yellow' | 'sage' | 'dark' | 'outline';
}

export function Card({ className, glow = false, variant = 'default', children, ...props }: CardProps) {
  const variantStyles = {
    default:
      'bg-white text-black border-black dark:bg-[#1c241f] dark:text-white dark:border-[#4a6052]',
    yellow:
      'bg-[#ffe17c] text-black border-black dark:bg-[#ffe17c] dark:text-black dark:border-black',
    sage:
      'bg-[#b7c6c2] text-black border-black dark:bg-[#b7c6c2] dark:text-black dark:border-black',
    dark:
      'bg-[#121714] text-white border-black dark:bg-[#121714] dark:text-white dark:border-[#4a6052]',
    outline:
      'bg-transparent text-current border-black dark:border-[#4a6052]',
  };

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 p-5 transition-all duration-150',
        glow ? 'shadow-neo-lg' : 'shadow-neo',
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-lg font-extrabold tracking-tight font-display flex items-center gap-2', className)} {...props}>
      {children}
    </h3>
  );
}
