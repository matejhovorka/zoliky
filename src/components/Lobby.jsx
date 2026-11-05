import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Copy,
  Check,
  QrCode as QrIcon,
  Users,
  Bot,
  Play,
  Settings,
  HelpCircle,
  Volume2,
  VolumeX,
  Share2
} from 'lucide-react';

export default function Lobby({
  room,
  currentUserId,
  serverInfo,
  onStartGame,
  onAddBot,
  onKickPlayer,
  onGivePesek,
  onLeaveGame,
  onUpdateSettings,
  onOpenRules,
  isMuted,
  onToggleMute
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrCanvasRef = useRef(null);

  const isHost = room?.hostId === currentUserId;
  const roomCode = room?.code || '';

  // Determine shareable link:
  // If serverInfo.publicUrl exists and user is on localhost, use publicUrl so mobile/iPad can connect over Eduroam!
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const effectiveBaseUrl = (serverInfo?.publicUrl && isLocalhost) ? serverInfo.publicUrl : window.location.origin;
  const shareLink = `${effectiveBaseUrl}/?room=${roomCode}`;

  useEffect(() => {
    if (showQr && qrCanvasRef.current && shareLink) {
      QRCode.toCanvas(qrCanvasRef.current, shareLink, {
        width: 220,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      }, (err) => {
        if (err) console.error('QR code error', err);
      });
    }
  }, [showQr, shareLink]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareLink).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const handleSettingChange = (field, value) => {
    if (!isHost) return;
    onUpdateSettings({
      ...room.settings,
      [field]: value
    });
  };

  const playerCount = room?.players?.length || 0;
  const canStart = playerCount >= 2 && isHost;

  return (
    <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 flex flex-col items-center">
      {/* Top Bar with rules & sound */}
      <div className="w-full flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🃏</span>
          <h1 className="text-xl sm:text-2xl font-black tracking-tight text-amber-400">
            České Žolíky
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onLeaveGame}
            className="flex items-center gap-1 px-3 py-2 bg-stone-800 hover:bg-stone-700 active:scale-95 text-stone-400 hover:text-stone-200 text-xs sm:text-sm font-semibold rounded-xl transition"
            title="Odejít z místnosti"
          >
            <span>🚪 Odejít</span>
          </button>
          <button
            onClick={onToggleMute}
            className="p-2 bg-stone-800 hover:bg-stone-700 active:scale-95 text-stone-300 rounded-xl transition"
            title={isMuted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
          >
            {isMuted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 text-emerald-400" />}
          </button>
          <button
            onClick={onOpenRules}
            className="flex items-center gap-1.5 px-3 py-2 bg-stone-800 hover:bg-stone-700 active:scale-95 text-amber-300 text-xs sm:text-sm font-semibold rounded-xl transition"
          >
            <HelpCircle className="w-4 h-4" />
            <span className="hidden sm:inline">Pravidla</span>
          </button>
        </div>
      </div>

      {/* Main Room Card */}
      <div className="w-full bg-stone-900/90 border border-stone-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md">
        {/* Room Code & Quick Join Link */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-6 border-b border-stone-800">
          <div>
            <div className="text-xs uppercase tracking-widest font-bold text-stone-400 mb-1">
              Kód herní místnosti
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-4xl sm:text-5xl font-black text-amber-400 tracking-wider">
                {roomCode}
              </span>
              <button
                onClick={() => setShowQr(!showQr)}
                className="p-2.5 bg-stone-800 hover:bg-stone-700 active:scale-95 text-amber-300 rounded-xl transition flex items-center gap-1 text-xs font-semibold"
                title="Zobrazit QR kód pro mobil"
              >
                <QrIcon className="w-5 h-5" />
                <span className="hidden sm:inline">QR kód</span>
              </button>
            </div>
            <p className="text-xs text-stone-400 mt-1">
              Řekněte kód kamarádům nebo jim pošlete odkaz:
            </p>
            <div className="mt-2 text-[11px] text-amber-300/90 font-mono bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800 break-all select-all flex items-center justify-between gap-2">
              <span className="truncate">{shareLink}</span>
              {effectiveBaseUrl.includes('trycloudflare.com') && (
                <span className="shrink-0 px-1.5 py-0.5 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded text-[9px] font-bold">
                  Eduroam OK
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full md:w-auto">
            {isHost && (
              <button
                onClick={onStartGame}
                disabled={!canStart}
                className={`w-full sm:w-auto px-6 py-3 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition shadow-lg ${
                  canStart
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white shadow-emerald-900/40 cursor-pointer animate-pulse'
                    : 'bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700/50'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>SPUSTIT HRU</span>
              </button>
            )}
            <button
              onClick={handleCopyLink}
              className="w-full sm:w-auto px-5 py-3 bg-amber-600 hover:bg-amber-500 active:scale-95 text-white font-bold text-sm rounded-2xl flex items-center justify-center gap-2 transition shadow-lg shadow-amber-900/30"
            >
              {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Odkaz zkopírován!' : 'Kopírovat odkaz'}
            </button>
          </div>
        </div>

        {/* QR Code Modal / Popup */}
        {showQr && (
          <div className="my-6 p-6 bg-stone-950/80 rounded-2xl border border-stone-800 flex flex-col items-center animate-fade-in text-center">
            <h3 className="font-bold text-base text-amber-300 mb-1">
              📱 Naskenujte foťákem mobilu nebo iPadu
            </h3>
            <p className="text-xs text-stone-400 mb-4">
              Otevřete fotoaparát na telefonu nebo tabletu a klikněte na odkaz pro okamžité připojení do hry!
            </p>
            <div className="p-3 bg-white rounded-2xl shadow-xl">
              <canvas ref={qrCanvasRef} />
            </div>
            <div className="mt-3 font-mono text-[11px] text-stone-400 truncate max-w-sm">
              {shareLink}
            </div>
          </div>
        )}

        {/* Players in Lobby */}
        <div className="py-6 border-b border-stone-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              <h2 className="font-bold text-lg text-stone-100 flex items-center gap-2">
                <span>Hráči v místnosti ({playerCount})</span>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full">
                  🃏 {Math.max(1, Math.ceil(playerCount / 4)) * 108} karet
                </span>
              </h2>
            </div>

            {isHost && (
              <button
                onClick={onAddBot}
                className="px-3 py-1.5 bg-stone-800 hover:bg-stone-700 active:scale-95 text-xs font-semibold text-stone-200 rounded-xl flex items-center gap-1.5 transition cursor-pointer"
              >
                <Bot className="w-4 h-4 text-emerald-400" />
                <span>+ Přidat bota (AI)</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {room?.players?.map((player) => {
              const isCurrent = player.id === currentUserId;
              return (
                <div
                  key={player.id}
                  className={`p-4 rounded-2xl border flex items-center justify-between ${
                    isCurrent
                      ? 'bg-amber-950/20 border-amber-500/40 text-amber-200'
                      : 'bg-stone-950/40 border-stone-800 text-stone-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-lg font-bold">
                      {player.isBot ? '🤖' : '👤'}
                    </div>
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <span>{player.name}</span>
                        {isCurrent && (
                          <span className="text-[10px] bg-amber-500 text-stone-950 px-1.5 py-0.2 rounded-full font-black">
                            TY
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-stone-400">
                        {player.isHost ? 'Hostitel místnosti' : player.isBot ? 'Počítač (AI)' : 'Hráč'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {isHost && !isCurrent && (
                      <>
                        <button
                          onClick={() => onGivePesek?.(player.id)}
                          title="Dát Peška"
                          className="px-2 py-1 bg-amber-950/80 hover:bg-amber-800 active:scale-95 text-[11px] font-bold text-amber-300 border border-amber-600/60 rounded-lg flex items-center gap-1 transition cursor-pointer"
                        >
                          <span>🪵</span>
                          <span className="hidden sm:inline">Pešek</span>
                        </button>
                        <button
                          onClick={() => onKickPlayer?.(player.id)}
                          title="Odebrat hráče z místnosti"
                          className="px-2 py-1 bg-red-950/80 hover:bg-red-800 active:scale-95 text-[11px] font-bold text-red-300 border border-red-700/60 rounded-lg flex items-center gap-1 transition cursor-pointer"
                        >
                          <span>✕</span>
                          <span className="hidden sm:inline">Odebrat</span>
                        </button>
                      </>
                    )}
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500" />
                  </div>
                </div>
              );
            })}
          </div>

          {playerCount < 2 && (
            <p className="text-xs text-amber-400/90 mt-3 text-center">
              ⚠️ Pro zahájení hry jsou potřeba alespoň 2 hráči. Připojte další zařízení nebo klikněte na <strong>&quot;Přidat bota&quot;</strong>!
            </p>
          )}
        </div>

        {/* Room Rules & Options */}
        <div className="py-6 border-b border-stone-800">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base text-stone-100">Nastavení pravidel</h3>
            {!isHost && (
              <span className="text-xs text-stone-400 ml-auto">(Nastavuje hostitel)</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Min Points for Opening */}
            <div className="p-3 bg-stone-950/40 rounded-2xl border border-stone-800/80">
              <label className="block text-xs font-semibold text-stone-300 mb-2">
                Minimální body pro první vyložení
              </label>
              <div className="flex gap-2">
                {[
                  { label: '42 bodů (Standard)', val: 42 },
                  { label: '30 bodů (Rychlejší)', val: 30 },
                  { label: 'Bez minima', val: 0 }
                ].map(opt => (
                  <button
                    key={opt.val}
                    disabled={!isHost}
                    onClick={() => handleSettingChange('minPoints', opt.val)}
                    className={`flex-1 py-1.5 px-2 text-xs rounded-xl font-medium transition ${
                      room?.settings?.minPoints === opt.val
                        ? 'bg-amber-600 text-white font-bold shadow'
                        : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pure Sequence Required */}
            <div className="p-3 bg-stone-950/40 rounded-2xl border border-stone-800/80">
              <label className="block text-xs font-semibold text-stone-300 mb-2">
                Čistá postupka při prvním vyložení
              </label>
              <div className="flex gap-2">
                {[
                  { label: 'Vyžadována (Standard)', val: true },
                  { label: 'Nepovinná', val: false }
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    disabled={!isHost}
                    onClick={() => handleSettingChange('requirePureSequence', opt.val)}
                    className={`flex-1 py-1.5 px-2 text-xs rounded-xl font-medium transition ${
                      room?.settings?.requirePureSequence === opt.val
                        ? 'bg-amber-600 text-white font-bold shadow'
                        : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Keep Joker On Win Rule */}
            <div className="p-3 bg-stone-950/40 rounded-2xl border border-stone-800/80 sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-300 mb-2 flex items-center justify-between">
                <span>Ponechání žolíka do dalšího kola při zavření (2 karty v ruce)</span>
                <span className="text-amber-400 font-bold">🃏 Speciální pravidlo</span>
              </label>
              <div className="flex gap-2">
                {[
                  { label: 'Povoleno (Standard)', val: true },
                  { label: 'Vypnuto (pouze zavření na 0 karet)', val: false }
                ].map(opt => (
                  <button
                    key={String(opt.val)}
                    disabled={!isHost}
                    onClick={() => handleSettingChange('keepJokerOnWin', opt.val)}
                    className={`flex-1 py-1.5 px-2 text-xs rounded-xl font-medium transition ${
                      room?.settings?.keepJokerOnWin !== false === opt.val
                        ? 'bg-amber-600 text-white font-bold shadow'
                        : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Meld start turn requirement (Až po 3. kole) */}
            <div className="p-3 bg-stone-950/40 rounded-2xl border border-stone-800/80 sm:col-span-2">
              <label className="block text-xs font-semibold text-stone-300 mb-2 flex items-center justify-between">
                <span>Kdy je povoleno poprvé vykládat karty</span>
                <span className="text-amber-400 font-bold">⏱️ Pravidlo úvodních kol</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                {[
                  { label: 'Až po 3. kole (od 4. kola hry) [Doporučeno]', val: 4 },
                  { label: 'Od 3. kola (po 2 úvodních kolech)', val: 3 },
                  { label: 'Hned od 1. kola (bez omezení)', val: 1 }
                ].map(opt => (
                  <button
                    key={opt.val}
                    disabled={!isHost}
                    onClick={() => handleSettingChange('minTurnsToMeld', opt.val)}
                    className={`flex-1 py-1.5 px-3 text-xs rounded-xl font-medium transition ${
                      (room?.settings?.minTurnsToMeld ?? 4) === opt.val
                        ? 'bg-amber-600 text-white font-bold shadow'
                        : 'bg-stone-800 text-stone-400 hover:text-stone-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Start Button */}
        <div className="pt-6 flex flex-col items-center">
          {isHost ? (
            <button
              onClick={onStartGame}
              disabled={!canStart}
              className={`w-full max-w-md py-4 px-8 rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition shadow-xl ${
                canStart
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white shadow-emerald-900/40 cursor-pointer'
                  : 'bg-stone-800 text-stone-500 cursor-not-allowed border border-stone-700/50'
              }`}
            >
              <Play className="w-6 h-6 fill-current" />
              <span>SPUSTIT HRU</span>
            </button>
          ) : (
            <div className="text-center p-4 bg-stone-950/50 border border-stone-800 rounded-2xl max-w-md w-full">
              <div className="text-sm font-semibold text-amber-300 animate-pulse">
                ⏳ Čeká se na hostitele, až spustí hru...
              </div>
              <div className="text-xs text-stone-400 mt-1">
                Připravte se na parádní partičku Žolíků!
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

