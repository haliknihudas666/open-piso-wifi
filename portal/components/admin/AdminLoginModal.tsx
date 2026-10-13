'use client';

import React, { useState } from 'react';
import { Lock, ArrowRight, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

interface AdminLoginModalProps {
  onSuccess: (pin: string) => void;
}

export function AdminLoginModal({ onSuccess }: AdminLoginModalProps) {
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setErrorMsg('Please enter the Admin PIN');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid Admin PIN');
      }

      // Store in sessionStorage
      sessionStorage.setItem('hudas_admin_pin', pin);
      onSuccess(pin);
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <Card className="w-full max-w-sm border-2 border-black shadow-neo-xl relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <div className="text-center mb-6 pt-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm flex items-center justify-center mb-3">
            <Lock className="w-6 h-6 stroke-[2.5]" />
          </div>
          <h2 className="text-xl font-extrabold font-display text-black dark:text-white">Admin Authentication</h2>
          <p className="text-xs font-semibold text-neutral-600 dark:text-[#b7c6c2] mt-1">
            Enter machine PIN to access control dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            type="password"
            placeholder="PIN"
            value={pin}
            onChange={(e) => {
              setPin(e.target.value);
              setErrorMsg(null);
            }}
            autoFocus
            className="text-center font-mono text-xl tracking-widest font-extrabold"
          />

          {errorMsg && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[#ff5f57] text-black border-2 border-black shadow-neo-sm text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-black" />
              <span>{errorMsg}</span>
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full gap-2" isLoading={isLoading}>
            <span>Unlock Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}
