import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, Flame, Play, RotateCcw } from 'lucide-react';
import Card from './Card.jsx';

export default function RoundEndModal({ room, currentUserId, onNextRound, onNewRoom, onLeaveGame }) {
  const gameState = room?.gameState;
  const isRoundEnded = room?.status === 'round_ended';

  useEffect(() => {
    if (isRoundEnded) {
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch (e) {}
    }
  }, [isRoundEnded]);

  if (!isRoundEnded || !gameState) return null;

  const winner = gameState.roundWinner;
  const isHandRummy = gameState.isHandRummy;
  const isHost = room.hostId === currentUserId;

  // Sort players by total score ascending (lowest score is best in Žolíky)
  const sortedPlayers = [...room.players].sort((a, b) => a.totalScore - b.totalScore);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-stone-900 border-2 border-amber-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl text-stone-100 flex flex-col items-center text-center">
        {/* Trophy icon */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-500/20 border-2 border-amber-400 rounded-full flex items-center justify-center mb-4 text-amber-400 shadow-lg shadow-amber-500/20 animate-bounce">
          <Trophy className="w-10 h-10 sm:w-12 sm:h-12" />
        </div>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-black text-amber-400">
          {winner ? `${winner.name} vyhrál(a)!` : 'Kolo skončilo!'}
        </h2>

        {isHandRummy && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 bg-red-600/30 border border-red-500 text-red-300 rounded-full text-xs sm:text-sm font-bold tracking-wide uppercase">
            <Flame className="w-4 h-4 text-red-400" /> Zavření z ruky (2x body)
          </div>
        )}

        {gameState.hasKeptJoker && (
          <div className="mt-2 inline-flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-amber-500/20 via-yellow-500/30 to-amber-500/20 border-2 border-amber-400 text-amber-200 rounded-full text-xs sm:text-sm font-black tracking-wide shadow-lg shadow-amber-500/20 animate-pulse">
            <span>🃏</span> {gameState.keptJokersCount > 1 ? `${gameState.keptJokersCount} žolíci přeneseni` : 'Žolík přenesen'} do dalšího kola pro {winner?.name}! <span>★</span>
          </div>
        )}

        <p className="mt-2 text-stone-300 text-xs sm:text-sm">
          {gameState.hasKeptJoker
            ? `${winner?.name} zavřel(a) kolo, ponechal(a) si ${gameState.keptJokersCount > 1 ? `${gameState.keptJokersCount} žolíky` : 'žolíka'} a v příštím kole s ${gameState.keptJokersCount > 1 ? 'nimi' : 'ním'} začne!`
            : 'Vítěz odhodil poslední kartu a vyčistil svou ruku. Ostatním hráčům se započítávají body z neodehraných karet.'}
        </p>

        {/* Score Table */}
        <div className="w-full mt-6 bg-stone-950/60 border border-stone-800 rounded-2xl overflow-hidden text-left">
          <div className="grid grid-cols-12 px-4 py-2.5 bg-stone-800/80 text-[11px] sm:text-xs font-bold text-stone-400 uppercase tracking-wider">
            <div className="col-span-6">Hráč</div>
            <div className="col-span-3 text-center">Toto kolo</div>
            <div className="col-span-3 text-right">Celkem</div>
          </div>

          <div className="divide-y divide-stone-800/50">
            {sortedPlayers.map((player, idx) => {
              const isWinner = player.id === winner?.id;
              return (
                <div
                  key={player.id}
                  className={`grid grid-cols-12 px-4 py-3 items-center text-xs sm:text-sm ${
                    isWinner ? 'bg-amber-500/10 font-bold' : ''
                  }`}
                >
                  <div className="col-span-6 flex items-center gap-2 truncate">
                    <span className="w-5 text-stone-500 text-xs font-mono">#{idx + 1}</span>
                    <span className="truncate">{player.name}</span>
                    {isWinner && <span className="text-amber-400">🏆</span>}
                  </div>
                  <div className="col-span-3 text-center font-mono">
                    {isWinner ? (
                      <span className="text-emerald-400 font-bold">0 b</span>
                    ) : (
                      <span className="text-red-400">+{player.roundScore} b</span>
                    )}
                  </div>
                  <div className="col-span-3 text-right font-mono font-bold text-stone-200">
                    {player.totalScore} b
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Remaining cards of losers preview */}
        <div className="w-full mt-4 max-h-36 overflow-y-auto space-y-2 text-left">
          {sortedPlayers
            .filter(p => p.id !== winner?.id && p.hand && p.hand.length > 0)
            .map(p => (
              <div key={`rem_${p.id}`} className="bg-stone-950/40 p-2 rounded-xl border border-stone-800/60">
                <div className="text-[11px] text-stone-400 font-medium mb-1">
                  Karty v ruce ({p.name}):
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.hand.map(c => (
                    <Card key={c.id} card={c} size="sm" />
                  ))}
                </div>
              </div>
            ))}
        </div>

        {/* Action Buttons */}
        <div className="mt-6 w-full flex flex-col gap-2.5">
          {isHost ? (
            <button
              onClick={onNextRound}
              className="w-full py-3 px-6 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 font-bold text-white rounded-xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" /> Zahájit další kolo
            </button>
          ) : (
            <div className="w-full py-2.5 px-4 bg-stone-800 text-stone-400 rounded-xl text-xs sm:text-sm font-medium">
              Čeká se, až hostitel zahájí další kolo...
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onNewRoom}
              className="flex-1 py-2.5 px-3 bg-amber-600/90 hover:bg-amber-500 text-stone-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>✨</span>
              <span>Založit novou místnost</span>
            </button>
            <button
              onClick={onLeaveGame}
              className="flex-1 py-2.5 px-3 bg-stone-800 hover:bg-stone-700 text-stone-300 font-semibold text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <span>🚪</span>
              <span>Odejít do menu</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

