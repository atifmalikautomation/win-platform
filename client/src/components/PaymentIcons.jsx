import React from 'react';

// Official Easypaisa Vector Badge from User Upload
export function EasyPaisaIcon({ className = "w-10 h-10" }) {
  return (
    <div className={`${className} rounded-2xl bg-white p-1 flex items-center justify-center shrink-0 shadow-md shadow-[#00A859]/30 border border-white/20 select-none overflow-hidden`}>
      <img
        src="/easypaisa_badge.png"
        alt="Easypaisa"
        className="w-full h-full object-contain"
        draggable="false"
      />
    </div>
  );
}

// Official JazzCash Vector Badge from User Upload
export function JazzCashIcon({ className = "w-10 h-10" }) {
  return (
    <div className={`${className} rounded-2xl bg-white p-1 flex items-center justify-center shrink-0 shadow-md shadow-[#E30613]/30 border border-white/20 select-none overflow-hidden`}>
      <img
        src="/jazzcash_badge.png"
        alt="JazzCash"
        className="w-full h-full object-contain"
        draggable="false"
      />
    </div>
  );
}

// Official SadaPay Vector Badge (Teal Minimalist Digital Bank)
export function SadaPayIcon({ className = "w-9 h-9" }) {
  return (
    <div className={`${className} rounded-xl shrink-0 flex items-center justify-center shadow-md shadow-[#00D09C]/25 overflow-hidden select-none`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect width="100" height="100" rx="22" fill="#00D09C" />
        <circle cx="36" cy="36" r="9" fill="#FFFFFF" />
        <path d="M36 45 C48 45 64 45 64 36 C64 26 50 26 50 26" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" fill="none" />
        <circle cx="64" cy="64" r="9" fill="#FFFFFF" />
        <path d="M64 55 C52 55 36 55 36 64 C36 74 50 74 50 74" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" fill="none" />
      </svg>
    </div>
  );
}

// Official NayaPay Vector Badge (Coral Orange EMoney Wallet)
export function NayaPayIcon({ className = "w-9 h-9" }) {
  return (
    <div className={`${className} rounded-xl shrink-0 flex items-center justify-center shadow-md shadow-[#FF5722]/25 overflow-hidden select-none`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect width="100" height="100" rx="22" fill="#FF5722" />
        <path d="M28 72 V28 L50 52 V72 L28 48" fill="#FFFFFF" fillOpacity="0.9" />
        <path d="M50 52 L72 28 V72 H60 V44 L50 52" fill="#FFFFFF" />
      </svg>
    </div>
  );
}

// Official Raast & Meezan / 1LINK Bank Transfer Badge
export function MeezanBankIcon({ className = "w-9 h-9" }) {
  return (
    <div className={`${className} rounded-xl shrink-0 flex items-center justify-center shadow-md shadow-[#0B1E38]/40 border border-[#C5A059]/40 overflow-hidden select-none`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect width="100" height="100" rx="22" fill="#0B1E38" />
        <path d="M50 16L84 34V42H16V34L50 16Z" fill="#C5A059" />
        <rect x="22" y="45" width="9" height="32" rx="2" fill="#FFFFFF" />
        <rect x="37" y="45" width="9" height="32" rx="2" fill="#FFFFFF" />
        <rect x="54" y="45" width="9" height="32" rx="2" fill="#FFFFFF" />
        <rect x="69" y="45" width="9" height="32" rx="2" fill="#FFFFFF" />
        <rect x="14" y="80" width="72" height="6" rx="2" fill="#C5A059" />
      </svg>
    </div>
  );
}

// 1LINK / Pakistani Banks Transfer Badge
export function OneLinkBankIcon({ className = "w-9 h-9" }) {
  return (
    <div className={`${className} rounded-xl bg-[#005B94] p-1.5 flex items-center justify-center shrink-0 shadow-sm`}>
      <div className="flex items-center justify-center text-white font-heading font-black text-xs tracking-tighter">
        1LINK
      </div>
    </div>
  );
}

// Official Tether USDT (TRC-20) Vector Badge
export function UsdtIcon({ className = "w-9 h-9" }) {
  return (
    <div className={`${className} rounded-xl shrink-0 flex items-center justify-center shadow-md shadow-[#26A17B]/25 overflow-hidden select-none`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
        <rect width="100" height="100" rx="22" fill="#26A17B" />
        <circle cx="50" cy="50" r="42" stroke="#ffffff" strokeWidth="5" />
        <path d="M30 36H70V44H55V72H45V44H30V36Z" fill="#ffffff" />
        <path d="M50 48C65 48 74 45 74 42C74 39 65 36 50 36C35 36 26 39 26 42C26 45 35 48 50 48Z" stroke="#ffffff" strokeWidth="4" />
      </svg>
    </div>
  );
}
