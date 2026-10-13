import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <div className="w-full">
        <input
          ref={ref}
          className={cn(
            'w-full px-4 py-3 bg-white dark:bg-[#171e19] border-2 border-black rounded-xl text-black dark:text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-[#ffe17c] transition-all font-medium shadow-neo-sm',
            error && 'border-[#ff5f57] focus:ring-[#ff5f57]',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-[#ff5f57] font-bold">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
