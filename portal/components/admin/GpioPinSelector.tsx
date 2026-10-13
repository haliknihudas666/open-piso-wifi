'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Cpu,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  X,
  ExternalLink,
  Maximize2,
  Check,
  List,
  MapPin,
  Search,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

// BCM GPIO number → Physical Pin number (Raspberry Pi 40-pin J8 header)
const BCM_TO_PHYSICAL: Record<number, number> = {
  0: 27, 1: 28, 2: 3, 3: 5, 4: 7, 5: 29, 6: 31, 7: 26,
  8: 24, 9: 21, 10: 19, 11: 23, 12: 32, 13: 33, 14: 8, 15: 10,
  16: 36, 17: 11, 18: 12, 19: 35, 20: 38, 21: 40, 22: 15, 23: 16,
  24: 18, 25: 22, 26: 37, 27: 13,
};

export interface PiPin {
  physical: number;
  bcm: number | null;
  wiringPi: number | null;
  name: string;
  type:
    | 'gpio'
    | 'power3v3'
    | 'power5v'
    | 'ground'
    | 'reserved_i2c'
    | 'reserved_spi'
    | 'reserved_uart'
    | 'reserved_eeprom'
    | 'id_sc'
    | 'id_sd';
}

// Full 40-pin Raspberry Pi J8 header definition
export const PI_PINS: PiPin[] = [
  { physical: 1,  bcm: null, wiringPi: null, name: '3.3V Power',         type: 'power3v3' },
  { physical: 2,  bcm: null, wiringPi: null, name: '5V Power',           type: 'power5v' },
  { physical: 3,  bcm: 2,    wiringPi: 8,    name: 'SDA1 (I2C)',         type: 'reserved_i2c' },
  { physical: 4,  bcm: null, wiringPi: null, name: '5V Power',           type: 'power5v' },
  { physical: 5,  bcm: 3,    wiringPi: 9,    name: 'SCL1 (I2C)',         type: 'reserved_i2c' },
  { physical: 6,  bcm: null, wiringPi: null, name: 'Ground',             type: 'ground' },
  { physical: 7,  bcm: 4,    wiringPi: 7,    name: 'GPIO_GCLK',          type: 'gpio' },
  { physical: 8,  bcm: 14,   wiringPi: 15,   name: 'TXD0 (UART)',        type: 'reserved_uart' },
  { physical: 9,  bcm: null, wiringPi: null, name: 'Ground',             type: 'ground' },
  { physical: 10, bcm: 15,   wiringPi: 16,   name: 'RXD0 (UART)',        type: 'reserved_uart' },
  { physical: 11, bcm: 17,   wiringPi: 0,    name: 'GPIO_GEN0',          type: 'gpio' },
  { physical: 12, bcm: 18,   wiringPi: 1,    name: 'GPIO_GEN1',          type: 'gpio' },
  { physical: 13, bcm: 27,   wiringPi: 2,    name: 'GPIO_GEN2',          type: 'gpio' },
  { physical: 14, bcm: null, wiringPi: null, name: 'Ground',             type: 'ground' },
  { physical: 15, bcm: 22,   wiringPi: 3,    name: 'GPIO_GEN3',          type: 'gpio' },
  { physical: 16, bcm: 23,   wiringPi: 4,    name: 'GPIO_GEN4',          type: 'gpio' },
  { physical: 17, bcm: null, wiringPi: null, name: '3.3V Power',         type: 'power3v3' },
  { physical: 18, bcm: 24,   wiringPi: 5,    name: 'GPIO_GEN5',          type: 'gpio' },
  { physical: 19, bcm: 10,   wiringPi: 12,   name: 'MOSI (SPI)',         type: 'reserved_spi' },
  { physical: 20, bcm: null, wiringPi: null, name: 'Ground',             type: 'ground' },
  { physical: 21, bcm: 9,    wiringPi: 13,   name: 'MISO (SPI)',         type: 'reserved_spi' },
  { physical: 22, bcm: 25,   wiringPi: 6,    name: 'GPIO_GEN6',          type: 'gpio' },
  { physical: 23, bcm: 11,   wiringPi: 14,   name: 'SCLK (SPI)',         type: 'reserved_spi' },
  { physical: 24, bcm: 8,    wiringPi: 10,   name: 'CE0 (SPI)',          type: 'reserved_spi' },
  { physical: 25, bcm: null, wiringPi: null, name: 'Ground',             type: 'ground' },
  { physical: 26, bcm: 7,    wiringPi: 11,   name: 'CE1 (SPI)',          type: 'reserved_spi' },
  { physical: 27, bcm: 0,    wiringPi: 30,   name: 'SDA0 (I2C EEPROM)',   type: 'reserved_eeprom' },
  { physical: 28, bcm: 1,    wiringPi: 31,   name: 'SCL0 (I2C EEPROM)',   type: 'reserved_eeprom' },
  { physical: 29, bcm: 5,    wiringPi: 21,   name: 'GPIO_5',             type: 'gpio' },
  { physical: 30, bcm: null, wiringPi: null, name: 'Ground',             type: 'ground' },
  { physical: 31, bcm: 6,    wiringPi: 22,   name: 'GPIO_6',             type: 'gpio' },
  { physical: 32, bcm: 12,   wiringPi: 26,   name: 'GPIO_12 (PWM0)',     type: 'gpio' },
  { physical: 33, bcm: 13,   wiringPi: 23,   name: 'GPIO_13 (PWM1)',     type: 'gpio' },
  { physical: 34, bcm: null, wiringPi: null, name: 'Ground',             type: 'ground' },
  { physical: 35, bcm: 19,   wiringPi: 24,   name: 'GPIO_19 (MISO)',     type: 'gpio' },
  { physical: 36, bcm: 16,   wiringPi: 27,   name: 'GPIO_16',            type: 'gpio' },
  { physical: 37, bcm: 26,   wiringPi: 25,   name: 'GPIO_26',            type: 'gpio' },
  { physical: 38, bcm: 20,   wiringPi: 28,   name: 'GPIO_20',            type: 'gpio' },
  { physical: 39, bcm: null, wiringPi: null, name: 'Ground',             type: 'ground' },
  { physical: 40, bcm: 21,   wiringPi: 29,   name: 'GPIO_21',            type: 'gpio' },
];

const RESERVED_TYPES = new Set(['reserved_i2c', 'reserved_spi', 'reserved_uart', 'reserved_eeprom']);
const RESERVED_LABELS: Record<string, string> = {
  reserved_i2c: 'I2C bus',
  reserved_spi: 'SPI bus',
  reserved_uart: 'UART serial',
  reserved_eeprom: 'I2C ID EEPROM',
};

const SAFE_GPIO_PINS = PI_PINS.filter((p) => p.type === 'gpio');

function getPinColor(
  pin: PiPin,
  coinBcm: number,
  inhibitBcm: number,
  hovered: number | null
): string {
  if (pin.bcm === coinBcm) return '#f59e0b'; // amber / neo-yellow — coin
  if (pin.bcm === inhibitBcm) return '#c084fc'; // purple — inhibit
  if (pin.physical === hovered) return '#38bdf8'; // sky — hover
  switch (pin.type) {
    case 'power3v3': return '#ef4444';
    case 'power5v': return '#f97316';
    case 'ground': return '#475569';
    case 'reserved_i2c':
    case 'reserved_spi':
    case 'reserved_uart':
    case 'reserved_eeprom': return '#78716c';
    default: return '#22c55e';
  }
}

interface GpioPinSelectorProps {
  coinBcm: number;
  inhibitBcm: number;
  onChange: (coinBcm: number, inhibitBcm: number) => void;
}

export function GpioPinSelector({ coinBcm, inhibitBcm, onChange }: GpioPinSelectorProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [assignMode, setAssignMode] = useState<'coin' | 'inhibit'>('coin');
  const [hoveredPhysical, setHoveredPhysical] = useState<number | null>(null);
  const [selectedPhysical, setSelectedPhysical] = useState<number | null>(null);
  const [shakePin, setShakePin] = useState<number | null>(null);
  const [zoom, setZoom] = useState<number>(1.25);
  const [viewTab, setViewTab] = useState<'diagram' | 'list'>('diagram');
  const [searchFilter, setSearchFilter] = useState('');
  const [listCategory, setListCategory] = useState<'all' | 'safe' | 'assigned'>('all');

  const coinPin = PI_PINS.find((p) => p.bcm === coinBcm);
  const inhibitPin = PI_PINS.find((p) => p.bcm === inhibitBcm);

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        setIsModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen]);

  const openModal = (mode: 'coin' | 'inhibit') => {
    setAssignMode(mode);
    setSelectedPhysical(mode === 'coin' ? coinPin?.physical ?? null : inhibitPin?.physical ?? null);
    setIsModalOpen(true);
  };

  const handlePinClick = (pin: PiPin) => {
    if (pin.bcm === null) return; // power/ground — not assignable

    setSelectedPhysical(pin.physical);
    const newBcm = pin.bcm;

    if (assignMode === 'coin') {
      if (newBcm === inhibitBcm) {
        // Conflict — shake animation
        setShakePin(pin.physical);
        setTimeout(() => setShakePin(null), 600);
        return;
      }
      onChange(newBcm, inhibitBcm);
    } else {
      if (newBcm === coinBcm) {
        setShakePin(pin.physical);
        setTimeout(() => setShakePin(null), 600);
        return;
      }
      onChange(coinBcm, newBcm);
    }
  };

  const activeInspectPin =
    PI_PINS.find((p) => p.physical === (hoveredPhysical ?? selectedPhysical)) ??
    (assignMode === 'coin' ? coinPin : inhibitPin) ??
    null;

  // Render pins in pairs (left column = odd physical, right = even)
  const pairs: [PiPin, PiPin][] = [];
  for (let i = 0; i < 40; i += 2) {
    pairs.push([PI_PINS[i], PI_PINS[i + 1]]);
  }

  // Filtered pins for table view
  const filteredPins = PI_PINS.filter((p) => {
    if (listCategory === 'safe' && p.type !== 'gpio') return false;
    if (listCategory === 'assigned' && p.bcm !== coinBcm && p.bcm !== inhibitBcm) return false;
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      p.physical.toString().includes(q) ||
      (p.bcm !== null && p.bcm.toString().includes(q)) ||
      p.name.toLowerCase().includes(q) ||
      (p.wiringPi !== null && p.wiringPi.toString().includes(q))
    );
  });

  return (
    <div className="space-y-3">
      {/* Current assignment summary cards - Clickable to open modal */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Coin Input Card */}
        <button
          type="button"
          onClick={() => openModal('coin')}
          className="flex items-center justify-between p-3.5 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-400 border-2 border-black flex items-center justify-center font-black text-black shrink-0 shadow-neo-sm text-base">
              🪙
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-neutral-800">
                Coin Input Pin
              </div>
              <div className="text-sm font-black font-display text-black truncate">
                BCM {coinBcm}{' '}
                <span className="text-xs font-bold text-neutral-800">
                  (Physical Pin {coinPin?.physical ?? '?'})
                </span>
              </div>
              <div className="text-[11px] font-bold text-neutral-700 truncate">
                {coinPin?.name ?? '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black text-[#ffe17c] text-xs font-black shrink-0 ml-2 group-hover:scale-105 transition-transform">
            <span>Change</span>
            <ExternalLink className="w-3 h-3" />
          </div>
        </button>

        {/* Inhibit Output Card */}
        <button
          type="button"
          onClick={() => openModal('inhibit')}
          className="flex items-center justify-between p-3.5 rounded-xl bg-[#e9d5ff] text-purple-950 border-2 border-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all text-left group cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-400 border-2 border-black flex items-center justify-center font-black text-white shrink-0 shadow-neo-sm text-base">
              🔒
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-black uppercase tracking-wider text-purple-900">
                Inhibit Output Pin
              </div>
              <div className="text-sm font-black font-display text-purple-950 truncate">
                BCM {inhibitBcm}{' '}
                <span className="text-xs font-bold text-purple-900">
                  (Physical Pin {inhibitPin?.physical ?? '?'})
                </span>
              </div>
              <div className="text-[11px] font-bold text-purple-800 truncate">
                {inhibitPin?.name ?? '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-black text-[#e9d5ff] text-xs font-black shrink-0 ml-2 group-hover:scale-105 transition-transform">
            <span>Change</span>
            <ExternalLink className="w-3 h-3" />
          </div>
        </button>
      </div>

      {/* Quick Action Button to open Modal */}
      <button
        type="button"
        onClick={() => openModal('coin')}
        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border-2 border-black bg-white dark:bg-[#1c241f] text-black dark:text-white font-extrabold text-xs shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
      >
        <Cpu className="w-4 h-4 text-amber-500" />
        <span>Open Raspberry Pi 40-Pin GPIO Interactive Map (Zoomable Pinout)</span>
        <Maximize2 className="w-3.5 h-3.5 ml-1 text-neutral-500" />
      </button>

      {/* ======================================================== */}
      {/* FULL INTERACTIVE ZOOMABLE GPIO PINOUT MODAL             */}
      {/* ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-150">
          <div className="w-full max-w-4xl max-h-[94vh] bg-white dark:bg-[#171e19] border-2 border-black dark:border-[#4a6052] rounded-2xl shadow-neo-xl flex flex-col overflow-hidden text-black dark:text-white">
            {/* Modal Header */}
            <div className="p-4 sm:px-6 border-b-2 border-black dark:border-[#4a6052] flex items-center justify-between gap-3 bg-[#f8f6ee] dark:bg-[#111713] shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm shrink-0">
                  <Cpu className="w-5 h-5 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black font-display tracking-tight text-black dark:text-white flex items-center gap-2">
                    <span>Raspberry Pi 40-Pin GPIO Interactive Pinout</span>
                  </h3>
                  <p className="text-xs font-bold text-neutral-600 dark:text-[#b7c6c2]">
                    Select or zoom pins for coin drop pulse detection & electronic inhibit lockout
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl border-2 border-black bg-[#ff5f57] text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer shrink-0"
                title="Close Modal"
              >
                <X className="w-4 h-4 stroke-[3]" />
              </button>
            </div>

            {/* Modal Sub-Header Toolbar (Role switch, View Switcher & Zoom Controls) */}
            <div className="p-3 sm:px-6 bg-white dark:bg-[#171e19] border-b-2 border-black dark:border-[#4a6052] flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Target Assignment Selector */}
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase text-neutral-600 dark:text-[#b7c6c2] tracking-wider shrink-0">
                  Assigning to:
                </span>
                <button
                  type="button"
                  onClick={() => setAssignMode('coin')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    assignMode === 'coin'
                      ? 'bg-[#ffe17c] text-black border-2 border-black shadow-neo-sm'
                      : 'bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] text-neutral-600 dark:text-[#b7c6c2]'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 border border-black" />
                  <span>🪙 Coin Input (BCM {coinBcm})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAssignMode('inhibit')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    assignMode === 'inhibit'
                      ? 'bg-[#e9d5ff] text-purple-950 border-2 border-black shadow-neo-sm'
                      : 'bg-[#f8f6ee] dark:bg-[#111713] border-2 border-black dark:border-[#4a6052] text-neutral-600 dark:text-[#b7c6c2]'
                  }`}
                >
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500 border border-black" />
                  <span>🔒 Inhibit Out (BCM {inhibitBcm})</span>
                </button>
              </div>

              {/* View Mode & Zoom Controls */}
              <div className="flex items-center gap-2">
                {/* View Switcher */}
                <div className="flex items-center p-0.5 rounded-xl border-2 border-black dark:border-[#4a6052] bg-[#f8f6ee] dark:bg-[#111713]">
                  <button
                    type="button"
                    onClick={() => setViewTab('diagram')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      viewTab === 'diagram'
                        ? 'bg-black text-white dark:bg-[#ffe17c] dark:text-black shadow-neo-sm'
                        : 'text-neutral-600 dark:text-[#b7c6c2]'
                    }`}
                  >
                    <MapPin className="w-3 h-3" />
                    <span>Map View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewTab('list')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black transition-all cursor-pointer ${
                      viewTab === 'list'
                        ? 'bg-black text-white dark:bg-[#ffe17c] dark:text-black shadow-neo-sm'
                        : 'text-neutral-600 dark:text-[#b7c6c2]'
                    }`}
                  >
                    <List className="w-3 h-3" />
                    <span>Table List</span>
                  </button>
                </div>

                {/* Zoom Controls (shown only on diagram view) */}
                {viewTab === 'diagram' && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))}
                      disabled={zoom <= 0.75}
                      className="p-1.5 rounded-lg border-2 border-black bg-white dark:bg-[#1c241f] text-black dark:text-white shadow-neo-sm disabled:opacity-40 cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="px-2 py-1 rounded-lg border-2 border-black bg-[#f8f6ee] dark:bg-[#111713] text-[11px] font-mono font-black text-black dark:text-white">
                      {Math.round(zoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.25).toFixed(2)))}
                      disabled={zoom >= 2.5}
                      className="p-1.5 rounded-lg border-2 border-black bg-white dark:bg-[#1c241f] text-black dark:text-white shadow-neo-sm disabled:opacity-40 cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setZoom(1.0)}
                      className="p-1.5 rounded-lg border-2 border-black bg-white dark:bg-[#1c241f] text-black dark:text-white shadow-neo-sm cursor-pointer"
                      title="Reset Zoom to 100%"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto bg-[#f8f6ee] dark:bg-[#111713] p-4 sm:p-6 flex flex-col items-center min-h-[350px]">
              {/* TAB 1: Zoomable Interactive SVG Diagram */}
              {viewTab === 'diagram' && (
                <div className="w-full flex flex-col items-center">
                  <div
                    className="transition-transform duration-150 ease-out origin-top flex justify-center py-2"
                    style={{ transform: `scale(${zoom})` }}
                  >
                    <svg
                      viewBox="0 0 520 720"
                      width={520}
                      height={720}
                      className="select-none drop-shadow-md"
                      style={{ fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}
                    >
                      {/* Raspberry Pi Header Board */}
                      <rect
                        x="160"
                        y="12"
                        width="88"
                        height="696"
                        rx="12"
                        fill="#1c241f"
                        stroke="#000000"
                        strokeWidth="3"
                      />

                      {/* Header Mounting Indication */}
                      <text x="204" y="28" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">
                        ▲ PIN 1 & 2
                      </text>
                      <text x="204" y="700" textAnchor="middle" fill="#64748b" fontSize="8" fontWeight="bold">
                        PIN 39 & 40 ▼
                      </text>

                      {pairs.map(([leftPin, rightPin], rowIdx) => {
                        const y = 46 + rowIdx * 32;
                        const leftBcm = leftPin.bcm;
                        const rightBcm = rightPin.bcm;
                        const leftClickable = leftBcm !== null;
                        const rightClickable = rightBcm !== null;
                        const leftColor = getPinColor(leftPin, coinBcm, inhibitBcm, hoveredPhysical);
                        const rightColor = getPinColor(rightPin, coinBcm, inhibitBcm, hoveredPhysical);
                        const leftShake = shakePin === leftPin.physical;
                        const rightShake = shakePin === rightPin.physical;

                        const leftIsCoin = leftBcm === coinBcm;
                        const leftIsInhibit = leftBcm === inhibitBcm;
                        const rightIsCoin = rightBcm === coinBcm;
                        const rightIsInhibit = rightBcm === inhibitBcm;

                        return (
                          <g key={rowIdx}>
                            {/* Left Pin (Odd) */}
                            <g
                              onClick={() => leftClickable && handlePinClick(leftPin)}
                              onMouseEnter={() => setHoveredPhysical(leftPin.physical)}
                              onMouseLeave={() => setHoveredPhysical(null)}
                              style={{ cursor: leftClickable ? 'pointer' : 'not-allowed' }}
                              className={leftShake ? 'animate-bounce' : ''}
                            >
                              {/* Selection Highlight Ring */}
                              {(leftIsCoin || leftIsInhibit) && (
                                <circle
                                  cx="180"
                                  cy={y}
                                  r="16"
                                  fill="none"
                                  stroke={leftIsCoin ? '#ffe17c' : '#c084fc'}
                                  strokeWidth="3"
                                  strokeDasharray={leftIsCoin ? 'none' : '3,2'}
                                />
                              )}
                              {hoveredPhysical === leftPin.physical && (
                                <circle cx="180" cy={y} r="16" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.8" />
                              )}

                              {/* Invisible larger click target */}
                              <circle cx="180" cy={y} r="16" fill="transparent" />

                              {/* Physical Pin Circle */}
                              <circle
                                cx="180"
                                cy={y}
                                r="11"
                                fill={leftColor}
                                stroke="#000000"
                                strokeWidth="2"
                                opacity={leftClickable ? 1 : 0.8}
                              />
                              <text
                                x="180"
                                y={y + 3.5}
                                textAnchor="middle"
                                fill="#000000"
                                fontSize="9"
                                fontWeight="900"
                              >
                                {leftPin.physical}
                              </text>

                              {/* Left Pin Function Label */}
                              <text
                                x="150"
                                y={y + 3.5}
                                textAnchor="end"
                                fill={leftIsCoin ? '#d97706' : leftIsInhibit ? '#9333ea' : '#1e293b'}
                                fontSize="9.5"
                                fontWeight="800"
                                className="dark:fill-slate-300"
                              >
                                {leftBcm !== null ? `BCM ${leftBcm}` : leftPin.name}
                              </text>
                            </g>

                            {/* Right Pin (Even) */}
                            <g
                              onClick={() => rightClickable && handlePinClick(rightPin)}
                              onMouseEnter={() => setHoveredPhysical(rightPin.physical)}
                              onMouseLeave={() => setHoveredPhysical(null)}
                              style={{ cursor: rightClickable ? 'pointer' : 'not-allowed' }}
                              className={rightShake ? 'animate-bounce' : ''}
                            >
                              {/* Selection Highlight Ring */}
                              {(rightIsCoin || rightIsInhibit) && (
                                <circle
                                  cx="228"
                                  cy={y}
                                  r="16"
                                  fill="none"
                                  stroke={rightIsCoin ? '#ffe17c' : '#c084fc'}
                                  strokeWidth="3"
                                  strokeDasharray={rightIsCoin ? 'none' : '3,2'}
                                />
                              )}
                              {hoveredPhysical === rightPin.physical && (
                                <circle cx="228" cy={y} r="16" fill="none" stroke="#38bdf8" strokeWidth="2" opacity="0.8" />
                              )}

                              {/* Invisible larger click target */}
                              <circle cx="228" cy={y} r="16" fill="transparent" />

                              {/* Physical Pin Circle */}
                              <circle
                                cx="228"
                                cy={y}
                                r="11"
                                fill={rightColor}
                                stroke="#000000"
                                strokeWidth="2"
                                opacity={rightClickable ? 1 : 0.8}
                              />
                              <text
                                x="228"
                                y={y + 3.5}
                                textAnchor="middle"
                                fill="#000000"
                                fontSize="9"
                                fontWeight="900"
                              >
                                {rightPin.physical}
                              </text>

                              {/* Right Pin Function Label */}
                              <text
                                x="258"
                                y={y + 3.5}
                                textAnchor="start"
                                fill={rightIsCoin ? '#d97706' : rightIsInhibit ? '#9333ea' : '#1e293b'}
                                fontSize="9.5"
                                fontWeight="800"
                                className="dark:fill-slate-300"
                              >
                                {rightBcm !== null ? `BCM ${rightBcm}` : rightPin.name}
                              </text>
                            </g>
                          </g>
                        );
                      })}
                    </svg>
                  </div>
                </div>
              )}

              {/* TAB 2: Searchable Quick Reference Table */}
              {viewTab === 'list' && (
                <div className="w-full space-y-3">
                  {/* Filter & Search Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                      <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Search by BCM #, physical pin, name (e.g. BCM 4, UART, I2C)..."
                        className="w-full pl-9 pr-3 py-2 text-xs font-bold rounded-xl border-2 border-black bg-white dark:bg-[#1c241f] text-black dark:text-white shadow-neo-sm focus:outline-none focus:ring-2 focus:ring-black"
                      />
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-extrabold">
                      <button
                        type="button"
                        onClick={() => setListCategory('all')}
                        className={`px-3 py-1.5 rounded-lg border-2 border-black transition-all cursor-pointer ${
                          listCategory === 'all'
                            ? 'bg-[#ffe17c] text-black shadow-neo-sm'
                            : 'bg-white dark:bg-[#1c241f] text-neutral-600 dark:text-[#b7c6c2]'
                        }`}
                      >
                        All 40 Pins
                      </button>
                      <button
                        type="button"
                        onClick={() => setListCategory('safe')}
                        className={`px-3 py-1.5 rounded-lg border-2 border-black transition-all cursor-pointer ${
                          listCategory === 'safe'
                            ? 'bg-[#ffe17c] text-black shadow-neo-sm'
                            : 'bg-white dark:bg-[#1c241f] text-neutral-600 dark:text-[#b7c6c2]'
                        }`}
                      >
                        Safe GPIOs Only
                      </button>
                      <button
                        type="button"
                        onClick={() => setListCategory('assigned')}
                        className={`px-3 py-1.5 rounded-lg border-2 border-black transition-all cursor-pointer ${
                          listCategory === 'assigned'
                            ? 'bg-[#ffe17c] text-black shadow-neo-sm'
                            : 'bg-white dark:bg-[#1c241f] text-neutral-600 dark:text-[#b7c6c2]'
                        }`}
                      >
                        Assigned Pins
                      </button>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto rounded-xl border-2 border-black shadow-neo-sm">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#ffe17c] text-black font-black uppercase text-[10px] tracking-wider border-b-2 border-black">
                        <tr>
                          <th className="p-2.5">Physical Pin</th>
                          <th className="p-2.5">BCM GPIO</th>
                          <th className="p-2.5">WiringPi</th>
                          <th className="p-2.5">Name / Purpose</th>
                          <th className="p-2.5">Current Role</th>
                          <th className="p-2.5 text-right">Quick Assign</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-black/10 dark:divide-white/10 bg-white dark:bg-[#171e19]">
                        {filteredPins.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-6 text-center text-neutral-500 font-bold">
                              No GPIO pins match your search filter.
                            </td>
                          </tr>
                        ) : (
                          filteredPins.map((p) => {
                            const isCoin = p.bcm === coinBcm;
                            const isInhibit = p.bcm === inhibitBcm;
                            const isAssignable = p.bcm !== null;

                            return (
                              <tr
                                key={p.physical}
                                className={`hover:bg-black/5 dark:hover:bg-white/5 transition-colors font-medium ${
                                  isCoin ? 'bg-[#ffe17c]/20' : isInhibit ? 'bg-[#e9d5ff]/20' : ''
                                }`}
                              >
                                <td className="p-2.5 font-mono font-bold text-neutral-800 dark:text-neutral-200">
                                  Pin {p.physical}
                                </td>
                                <td className="p-2.5 font-mono font-black">
                                  {p.bcm !== null ? (
                                    <span className={isCoin ? 'text-amber-600 dark:text-[#ffe17c]' : isInhibit ? 'text-purple-600 dark:text-purple-300' : 'text-emerald-600 dark:text-emerald-400'}>
                                      BCM {p.bcm}
                                    </span>
                                  ) : (
                                    <span className="text-neutral-400">—</span>
                                  )}
                                </td>
                                <td className="p-2.5 font-mono text-neutral-500">
                                  {p.wiringPi !== null ? `WP ${p.wiringPi}` : '—'}
                                </td>
                                <td className="p-2.5 font-bold text-black dark:text-white">
                                  {p.name}
                                </td>
                                <td className="p-2.5">
                                  {isCoin && (
                                    <Badge variant="warning" className="text-[10px]">
                                      🪙 Coin Input
                                    </Badge>
                                  )}
                                  {isInhibit && (
                                    <Badge variant="purple" className="text-[10px]">
                                      🔒 Inhibit Out
                                    </Badge>
                                  )}
                                  {!isCoin && !isInhibit && p.type === 'gpio' && (
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                                      Available
                                    </span>
                                  )}
                                  {!isCoin && !isInhibit && p.bcm === null && (
                                    <span className="text-neutral-400 text-[11px]">Power / GND</span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right space-x-1.5">
                                  {isAssignable ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAssignMode('coin');
                                          handlePinClick(p);
                                        }}
                                        disabled={isCoin}
                                        className={`px-2 py-1 rounded-md text-[10px] font-extrabold border-2 border-black transition-all cursor-pointer ${
                                          isCoin
                                            ? 'bg-amber-400 text-black opacity-60 cursor-default'
                                            : 'bg-[#ffe17c] text-black shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px]'
                                        }`}
                                      >
                                        Set Coin
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAssignMode('inhibit');
                                          handlePinClick(p);
                                        }}
                                        disabled={isInhibit}
                                        className={`px-2 py-1 rounded-md text-[10px] font-extrabold border-2 border-black transition-all cursor-pointer ${
                                          isInhibit
                                            ? 'bg-purple-300 text-black opacity-60 cursor-default'
                                            : 'bg-[#e9d5ff] text-purple-950 shadow-neo-sm hover:translate-x-[1px] hover:translate-y-[1px]'
                                        }`}
                                      >
                                        Set Inhibit
                                      </button>
                                    </>
                                  ) : (
                                    <span className="text-[10px] font-bold text-neutral-400 italic">Fixed Pin</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Pin Inspector & Hover Details Bar */}
            <div className="p-3 sm:px-6 bg-white dark:bg-[#1c241f] border-t-2 border-black dark:border-[#4a6052] shrink-0">
              {activeInspectPin ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg border-2 border-black flex items-center justify-center font-mono font-black text-xs text-black shrink-0 shadow-neo-sm"
                      style={{
                        backgroundColor: getPinColor(
                          activeInspectPin,
                          coinBcm,
                          inhibitBcm,
                          hoveredPhysical
                        ),
                      }}
                    >
                      {activeInspectPin.physical}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-black dark:text-white">
                          Physical Pin {activeInspectPin.physical}
                        </span>
                        {activeInspectPin.bcm !== null && (
                          <Badge variant="primary" className="text-[10px]">
                            BCM {activeInspectPin.bcm}
                          </Badge>
                        )}
                        {activeInspectPin.wiringPi !== null && (
                          <span className="text-[11px] font-mono font-bold text-neutral-500">
                            WiringPi {activeInspectPin.wiringPi}
                          </span>
                        )}
                        <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300">
                          {activeInspectPin.name}
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-neutral-500 dark:text-[#b7c6c2] mt-0.5">
                        {activeInspectPin.bcm === coinBcm && (
                          <span className="text-amber-600 dark:text-[#ffe17c]">
                            ● Currently assigned as Coin Input pin
                          </span>
                        )}
                        {activeInspectPin.bcm === inhibitBcm && (
                          <span className="text-purple-600 dark:text-purple-300">
                            ● Currently assigned as Inhibit Output pin
                          </span>
                        )}
                        {activeInspectPin.type === 'gpio' &&
                          activeInspectPin.bcm !== coinBcm &&
                          activeInspectPin.bcm !== inhibitBcm && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              ✓ Safe general-purpose GPIO
                            </span>
                          )}
                        {RESERVED_TYPES.has(activeInspectPin.type) &&
                          activeInspectPin.bcm !== coinBcm &&
                          activeInspectPin.bcm !== inhibitBcm && (
                            <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3 inline" />
                              Hardware bus ({RESERVED_LABELS[activeInspectPin.type]}) — verify no I2C/SPI shield is attached
                            </span>
                          )}
                        {activeInspectPin.bcm === null && (
                          <span className="text-neutral-400">Power / Ground pin — not software controllable</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Direct One-Click Button for this inspected pin */}
                  {activeInspectPin.bcm !== null && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handlePinClick(activeInspectPin)}
                      className="gap-1.5 shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>
                        Assign to {assignMode === 'coin' ? 'Coin Input' : 'Inhibit Output'} (BCM {activeInspectPin.bcm})
                      </span>
                    </Button>
                  )}
                </div>
              ) : (
                <div className="text-xs font-bold text-neutral-500 text-center py-1">
                  Click or hover any pin on the Raspberry Pi board to inspect and assign it.
                </div>
              )}
            </div>

            {/* Modal Footer (Color Legend & Done Button) */}
            <div className="p-3 sm:px-6 bg-[#f8f6ee] dark:bg-[#111713] border-t-2 border-black dark:border-[#4a6052] flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-neutral-700 dark:text-[#b7c6c2]">
                {[
                  { color: '#22c55e', label: 'Safe GPIO' },
                  { color: '#f59e0b', label: '🪙 Coin Input' },
                  { color: '#c084fc', label: '🔒 Inhibit Out' },
                  { color: '#78716c', label: 'Reserved' },
                  { color: '#ef4444', label: '3.3V / 5V' },
                  { color: '#475569', label: 'Ground' },
                ].map(({ color, label }) => (
                  <span key={label} className="flex items-center gap-1">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0 border border-black/30"
                      style={{ backgroundColor: color }}
                    />
                    <span>{label}</span>
                  </span>
                ))}
              </div>

              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="gap-1.5 px-5 font-black"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Done</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
