-- ==============================================================================
-- ☁️ OpenPisoWiFi - Supabase PostgreSQL Production Schema
-- ==============================================================================
-- Multi-Branch, Fleet Telemetry, Transaction History, and Remote Command Bus
-- With Enterprise-Grade Row Level Security (RLS) & Multi-Tenant Isolation
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- TABLE: piso_machines (Kiosk Fleets & Branches)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.piso_machines (
  machine_id TEXT PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Main Kiosk',
  location TEXT DEFAULT 'Branch 1',
  uptime_seconds BIGINT DEFAULT 0,
  active_slots INT DEFAULT 1,
  is_wan_online BOOLEAN DEFAULT true,
  cash_box_amount NUMERIC(10,2) DEFAULT 0.00,
  today_total NUMERIC(10,2) DEFAULT 0.00,
  last_seen TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- TABLE: piso_transactions (Live Coin Drops & Voucher Claims)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.piso_transactions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES public.piso_machines(machine_id) ON DELETE CASCADE,
  slot_id TEXT DEFAULT 'slot-1',
  slot_name TEXT DEFAULT 'Main Coinslot',
  amount NUMERIC(10,2) NOT NULL,
  duration_minutes INT NOT NULL,
  mac_address TEXT NOT NULL,
  payment_type TEXT DEFAULT 'COIN' CHECK (payment_type IN ('COIN', 'VOUCHER', 'FREE_TRIAL')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- TABLE: piso_collections (Physical Cash Drawer Audits)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.piso_collections (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES public.piso_machines(machine_id) ON DELETE CASCADE,
  amount_collected NUMERIC(10,2) NOT NULL,
  collected_by TEXT DEFAULT 'Admin',
  collected_at TIMESTAMPTZ DEFAULT now()
);

-- ==============================================================================
-- TABLE: piso_commands (Cloud-to-Edge Remote Command Bus)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.piso_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id TEXT NOT NULL REFERENCES public.piso_machines(machine_id) ON DELETE CASCADE,
  command_type TEXT NOT NULL, -- 'kick_session', 'add_time', 'set_setting', 'unlock_slot', 'reboot'
  payload JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'expired')),
  result JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '10 minutes')
);

-- ==============================================================================
-- PERFORMANCE INDEXES
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_machines_owner ON public.piso_machines(owner_id);
CREATE INDEX IF NOT EXISTS idx_transactions_machine_created ON public.piso_transactions(machine_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_created ON public.piso_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_collections_machine_date ON public.piso_collections(machine_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_machine_status ON public.piso_commands(machine_id, status) WHERE status = 'pending';

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.piso_machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piso_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piso_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.piso_commands ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 1. piso_machines Policies
-- ------------------------------------------------------------------------------
-- Authenticated admins can view only their own machines
CREATE POLICY "Admins can view their own machines"
  ON public.piso_machines
  FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

-- Authenticated admins can register or update their machines
CREATE POLICY "Admins can insert their own machines"
  ON public.piso_machines
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Admins can update their own machines"
  ON public.piso_machines
  FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Service role / device sync can insert and update machine telemetry
CREATE POLICY "Service role full access to machines"
  ON public.piso_machines
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 2. piso_transactions Policies
-- ------------------------------------------------------------------------------
-- Authenticated admins can view transactions belonging only to their machines
CREATE POLICY "Admins can view transactions for their machines"
  ON public.piso_transactions
  FOR SELECT
  TO authenticated
  USING (
    machine_id IN (
      SELECT machine_id FROM public.piso_machines WHERE owner_id = auth.uid()
    )
  );

-- Service role / Edge functions can insert transactions from kiosks
CREATE POLICY "Service role full access to transactions"
  ON public.piso_transactions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 3. piso_collections Policies
-- ------------------------------------------------------------------------------
CREATE POLICY "Admins can view collections for their machines"
  ON public.piso_collections
  FOR SELECT
  TO authenticated
  USING (
    machine_id IN (
      SELECT machine_id FROM public.piso_machines WHERE owner_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to collections"
  ON public.piso_collections
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------------------------
-- 4. piso_commands Policies
-- ------------------------------------------------------------------------------
-- Admins can view commands sent to their machines
CREATE POLICY "Admins can view commands for their machines"
  ON public.piso_commands
  FOR SELECT
  TO authenticated
  USING (
    machine_id IN (
      SELECT machine_id FROM public.piso_machines WHERE owner_id = auth.uid()
    )
  );

-- Admins can queue commands for their machines
CREATE POLICY "Admins can insert commands for their machines"
  ON public.piso_commands
  FOR INSERT
  TO authenticated
  WITH CHECK (
    machine_id IN (
      SELECT machine_id FROM public.piso_machines WHERE owner_id = auth.uid()
    )
  );

-- Service role full access to execute and acknowledge commands
CREATE POLICY "Service role full access to commands"
  ON public.piso_commands
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
