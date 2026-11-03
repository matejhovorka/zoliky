import React from 'react';

const SUIT_DATA = {
  H: { symbol: '♥', color: 'text-red-600', name: 'Srdce' },
  D: { symbol: '♦', color: 'text-red-600', name: 'Káry' },
  C: { symbol: '♣', color: 'text-stone-900', name: 'Kříže' },
  S: { symbol: '♠', color: 'text-stone-900', name: 'Piky' }
};

export default function Card({
  card,
  isSelected = false,
  onClick = null,
  size = 'md', // 'sm', 'md', 'lg'
  isBack = false,
  disabled = false,
  customBadge = null,
  showRepresented = true
}) {
  // Size classes
  const sizeClasses = {
    sm: 'w-10 h-14 rounded-md',
    md: 'w-14 h-20 sm:w-16 sm:h-24 rounded-lg',
    lg: 'w-16 h-24 sm:w-20 sm:h-28 rounded-xl'
  }[size] || 'w-14 h-20 rounded-lg';

  // Card Back
  if (isBack) {
    return (
      <div
        className={`${sizeClasses} relative border-2 border-white/60 bg-gradient-to-br from-blue-700 via-indigo-900 to-blue-950 flex items-center justify-center card-shadow transition-transform overflow-hidden`}
      >
        <div className="w-[85%] h-[85%] border border-blue-400/40 rounded flex items-center justify-center bg-blue-800/50">
          <span className="text-white/40 text-xs sm:text-sm font-bold tracking-widest">🃏</span>
        </div>
      </div>
    );
  }

  if (!card) return null;

  const { rank, suit, isJoker, representedRank, representedSuit } = card;
  const suitInfo = suit ? SUIT_DATA[suit] : null;

  // Selected animation & border
  const selectedStyle = isSelected
    ? '-translate-y-3 sm:-translate-y-4 ring-3 ring-amber-400 shadow-xl shadow-amber-400/30'
    : 'hover:-translate-y-1';

  const cursorStyle = disabled
    ? 'cursor-not-allowed opacity-75'
    : onClick
    ? 'cursor-pointer active:scale-95'
    : 'cursor-default';

  const isSm = size === 'sm';
  const isLg = size === 'lg';

  // Render Joker Card
  if (isJoker) {
    return (
      <div
        onClick={disabled ? undefined : onClick}
        className={`${sizeClasses} ${selectedStyle} ${cursorStyle} relative bg-gradient-to-b from-amber-50 via-amber-100 to-amber-200 border-2 border-amber-500 text-amber-900 select-none transition-all duration-150 card-shadow overflow-hidden`}
      >
        {/* Top left corner */}
        <div className={`absolute ${isSm ? 'top-0.5 left-1' : 'top-1 left-1.5'} flex items-center space-x-0.5 leading-none font-black text-amber-700 pointer-events-none`}>
          <span className={isSm ? 'text-[9px]' : 'text-[11px] sm:text-xs'}>Ž</span>
          <span className={isSm ? 'text-[8px]' : 'text-[10px]'}>★</span>
        </div>

        {/* Center illustration */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-1 pointer-events-none">
          <div className={`${isSm ? 'text-base' : 'text-xl sm:text-2xl'} leading-none filter drop-shadow`}>🃏</div>
          <div className={`${isSm ? 'text-[7px]' : 'text-[8px] sm:text-[10px]'} font-black uppercase tracking-tighter text-amber-800 leading-tight mt-0.5`}>
            Žolík
          </div>
          {/* If represents a card in table meld */}
          {showRepresented && representedRank && representedSuit && (
            <div className="mt-0.5 px-1 py-0.2 bg-amber-900/90 text-amber-100 text-[7px] sm:text-[8px] rounded font-bold whitespace-nowrap leading-none">
              {representedRank}{SUIT_DATA[representedSuit]?.symbol}
            </div>
          )}
        </div>

        {/* Bottom right corner */}
        <div className={`absolute ${isSm ? 'bottom-0.5 right-1' : 'bottom-1 right-1.5'} flex items-center space-x-0.5 leading-none font-black text-amber-700 rotate-180 pointer-events-none`}>
          <span className={isSm ? 'text-[9px]' : 'text-[11px] sm:text-xs'}>Ž</span>
          <span className={isSm ? 'text-[8px]' : 'text-[10px]'}>★</span>
        </div>

        {customBadge && (
          <div className="absolute top-0 right-0 bg-emerald-600 text-white rounded-bl-md text-[8px] px-1 font-bold shadow z-10">
            {customBadge}
          </div>
        )}
      </div>
    );
  }

  // Render Standard Card
  const textColor = suitInfo?.color || 'text-stone-900';

  // Corner positioning and sizing based on card size
  const cornerPosTop = isSm ? 'top-0.5 left-1' : isLg ? 'top-1.5 left-2' : 'top-1 left-1.5 sm:top-1.5 sm:left-2';
  const cornerPosBottom = isSm ? 'bottom-0.5 right-1' : isLg ? 'bottom-1.5 right-2' : 'bottom-1 right-1.5 sm:bottom-1.5 sm:right-2';
  const rankClass = isSm
    ? (rank === '10' ? 'text-[9px] font-black tracking-tighter' : 'text-[10px] font-black tracking-tight')
    : isLg
    ? 'text-sm sm:text-base font-black tracking-tight'
    : (rank === '10' ? 'text-xs sm:text-sm font-black tracking-tighter' : 'text-xs sm:text-sm font-black tracking-tight');
  const suitSymbolClass = isSm
    ? 'text-[9px] leading-none -mt-0.5'
    : isLg
    ? 'text-xs sm:text-sm leading-none -mt-0.5'
    : 'text-[11px] sm:text-xs leading-none -mt-0.5';

  return (
    <div
      onClick={disabled ? undefined : onClick}
      className={`${sizeClasses} ${selectedStyle} ${cursorStyle} relative bg-white border border-stone-300 ${textColor} select-none transition-all duration-150 card-shadow overflow-hidden`}
    >
      {/* Top Left Corner */}
      <div className={`absolute ${cornerPosTop} flex flex-col items-center leading-none pointer-events-none`}>
        <span className={rankClass}>{rank}</span>
        <span className={suitSymbolClass}>{suitInfo?.symbol}</span>
      </div>

      {/* Center Symbol / Court Indicator */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-center">
        {['J', 'Q', 'K'].includes(rank) ? (
          <div className="flex flex-col items-center justify-center leading-none">
            <span className={isSm ? 'text-xs font-black' : isLg ? 'text-xl sm:text-2xl font-black' : 'text-sm sm:text-lg font-black'}>
              {rank}
            </span>
            <span className={isSm ? 'text-[9px] -mt-0.5 opacity-90' : 'text-xs sm:text-sm -mt-0.5 opacity-90'}>
              {suitInfo?.symbol}
            </span>
          </div>
        ) : rank === 'A' ? (
          <div className="flex flex-col items-center justify-center leading-none">
            <span className={isSm ? 'text-sm font-black' : isLg ? 'text-2xl sm:text-3xl font-black' : 'text-lg sm:text-2xl font-black'}>
              {suitInfo?.symbol}
            </span>
          </div>
        ) : (
          <span className={isSm ? 'text-xs' : isLg ? 'text-xl sm:text-2xl' : 'text-base sm:text-xl'}>
            {suitInfo?.symbol}
          </span>
        )}
      </div>

      {/* Bottom Right Corner (Rotated 180) */}
      <div className={`absolute ${cornerPosBottom} flex flex-col items-center leading-none rotate-180 pointer-events-none`}>
        <span className={rankClass}>{rank}</span>
        <span className={suitSymbolClass}>{suitInfo?.symbol}</span>
      </div>

      {customBadge && (
        <div className="absolute top-0 right-0 bg-emerald-600 text-white rounded-bl-md text-[8px] px-1 font-bold shadow z-10">
          {customBadge}
        </div>
      )}
    </div>
  );
}

