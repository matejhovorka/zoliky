import React, { useState, useMemo } from 'react';
import Card from './Card.jsx';
import {
  validateSingleMeld,
  validateOpeningMelds,
  canLayOff,
  canSwapJoker,
  partitionIntoValidMelds
} from '../../server/gameLogic.js';
import {
  Layers,
  ArrowDownCircle,
  Sparkles,
  HelpCircle,
  Volume2,
  VolumeX,
  History,
  Info,
  CheckCircle,
  XCircle,
  RotateCw
} from 'lucide-react';
import {
  playDrawSound,
  playDiscardSound,
  playMeldSound,
  playJokerSound,
  playErrorSound
} from '../utils/sound.js';

export default function Table({
  room,
  currentUserId,
  onDraw,
  onMeld,
  onLayOff,
  onSwapJoker,
  onDiscard,
  onReturnDiscard,
  onKickPlayer,
  onGivePesek,
  onLeaveGame,
  onOpenRules,
  isMuted,
  onToggleMute
}) {
  const [selectedCardIds, setSelectedCardIds] = useState(new Set());
  const [sortMode, setSortMode] = useState('suit'); // 'suit' or 'rank'
  const [showLog, setShowLog] = useState(false);
  const [showPesekModal, setShowPesekModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [actionError, setActionError] = useState(null);

  const gameState = room?.gameState;
  const players = room?.players || [];
  const settings = room?.settings || {};
  const isHost = room?.hostId === currentUserId;

  const currentPlayer = players[gameState?.currentTurnPlayerIndex];
  const isMyTurn = currentPlayer?.id === currentUserId;
  const turnPhase = gameState?.turnPhase; // 'draw' or 'play_or_discard'

  const myPlayer = players.find(p => p.id === currentUserId);
  const opponents = players.filter(p => p.id !== currentUserId);

  const drawnFromDiscard = gameState?.drawnFromDiscardCard;
  const hasDrawnDiscardInHand = Boolean(
    drawnFromDiscard && myPlayer?.hand?.some(c => c.id === drawnFromDiscard.id)
  );

  // Clear selection error after 3 seconds
  const showError = (msg) => {
    setActionError(msg);
    playErrorSound();
    setTimeout(() => setActionError(null), 3500);
  };

  // Sorted hand cards
  const sortedHand = useMemo(() => {
    if (!myPlayer?.hand) return [];
    const hand = [...myPlayer.hand];

    if (sortMode === 'suit') {
      const suitOrder = { H: 1, D: 2, C: 3, S: 4 };
      const rankOrder = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
        'J': 11, 'Q': 12, 'K': 13, 'A': 14
      };
      return hand.sort((a, b) => {
        if (a.isJoker) return 1;
        if (b.isJoker) return -1;
        if (a.suit !== b.suit) return suitOrder[a.suit] - suitOrder[b.suit];
        return rankOrder[a.rank] - rankOrder[b.rank];
      });
    } else {
      const rankOrder = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
        'J': 11, 'Q': 12, 'K': 13, 'A': 14
      };
      return hand.sort((a, b) => {
        if (a.isJoker) return 1;
        if (b.isJoker) return -1;
        if (a.rank !== b.rank) return rankOrder[a.rank] - rankOrder[b.rank];
        return (a.suit || '').localeCompare(b.suit || '');
      });
    }
  }, [myPlayer?.hand, sortMode]);

  // Selected cards array
  const selectedCards = useMemo(() => {
    if (!myPlayer?.hand) return [];
    return myPlayer.hand.filter(c => selectedCardIds.has(c.id));
  }, [myPlayer?.hand, selectedCardIds]);

  // Live evaluation of selected cards
  const selectionAnalysis = useMemo(() => {
    if (selectedCards.length < 3) {
      return {
        canMeld: false,
        text: selectedCards.length === 1 ? 'Vybrána 1 karta' : `Vybrány ${selectedCards.length} karty`,
        points: 0,
        melds: []
      };
    }

    // Crucial rule: player MUST retain at least 1 card in hand to discard to finish turn / close!
    const cardsRemainingAfterMeld = (myPlayer?.hand?.length || 0) - selectedCards.length;
    if (cardsRemainingAfterMeld < 1) {
      return {
        canMeld: false,
        text: 'Nelze vyložit: musí vám zbýt alespoň 1 karta na odhození!',
        error: 'Nelze vyložit všechny karty z ruky! V ruce vám musí zůstat alespoň 1 karta na závěrečné odhození pro ukončení tahu / zavření.',
        points: 0,
        melds: []
      };
    }

    // Try full partition algorithm (handles 1, 2, or 3 melds in any order!)
    const partitions = partitionIntoValidMelds(selectedCards);

    if (partitions && partitions.length > 0) {
      if (!myPlayer?.hasOpened) {
        const minTurns = settings.minTurnsToMeld ?? 4;
        const turnsPlayed = myPlayer?.turnsCount || 0;
        const requiredTurns = minTurns === 4 ? 3 : (minTurns === 3 ? 2 : 0);
        const canMeldRounds = turnsPlayed >= requiredTurns;

        if (!canMeldRounds) {
          return {
            canMeld: false,
            text: `Vykládat lze až po 3. kole (odehráno: ${turnsPlayed}/${requiredTurns} kol)`,
            error: `Vykládat karty lze až po 3. kole! (Váš odehraný počet kol: ${turnsPlayed} z ${requiredTurns}).`,
            melds: partitions
          };
        }

        // Must validate opening rules (e.g. 42 points + pure sequence)
        const openCheck = validateOpeningMelds(partitions, settings);
        if (openCheck.valid) {
          const meldNames = openCheck.validatedMelds.map(m =>
            `${m.type === 'sequence' ? 'Postupka' : 'Skupina'} (${m.points} b)`
          ).join(' + ');
          return {
            canMeld: true,
            text: `${meldNames} = ${openCheck.totalPoints} b ✓`,
            points: openCheck.totalPoints,
            melds: partitions
          };
        } else {
          return {
            canMeld: false,
            text: openCheck.error,
            error: openCheck.error,
            melds: partitions
          };
        }
      } else {
        // Player has already opened: any valid partition of 1, 2, or 3 melds is allowed!
        let totalPts = 0;
        const meldNames = partitions.map(m => {
          const val = validateSingleMeld(m);
          totalPts += val.points || 0;
          return `${val.type === 'sequence' ? 'Postupka' : 'Skupina'} (${val.points} b)`;
        }).join(' + ');

        return {
          canMeld: true,
          text: `${meldNames} = ${totalPts} b ✓`,
          points: totalPts,
          melds: partitions
        };
      }
    }

    const single = validateSingleMeld(selectedCards);
    return {
      canMeld: false,
      text: single.error || 'Neplatná kombinace',
      error: single.error || 'Neplatná kombinace karet.',
      melds: []
    };
  }, [selectedCards, myPlayer?.hasOpened, settings]);

  // Toggle card selection
  const handleToggleCard = (card) => {
    const newSet = new Set(selectedCardIds);
    if (newSet.has(card.id)) {
      newSet.delete(card.id);
    } else {
      newSet.add(card.id);
    }
    setSelectedCardIds(newSet);
  };

  // Check if player can win while keeping Joker(s) for next round
  const canWinWithKeptJoker = useMemo(() => {
    if (!myPlayer?.hasOpened || !myPlayer?.hand || myPlayer.hand.length < 2) return false;
    if (settings.keepJokerOnWin === false) return false;
    const selectedOne = selectedCards.length === 1;
    if (!selectedOne || selectedCards[0].isJoker) return false;
    const remainingCards = myPlayer.hand.filter(c => c.id !== selectedCards[0].id);
    return remainingCards.length > 0 && remainingCards.every(c => c.isJoker);
  }, [myPlayer?.hasOpened, myPlayer?.hand, settings.keepJokerOnWin, selectedCards]);

  const keptJokersCountToKeep = useMemo(() => {
    if (!canWinWithKeptJoker || selectedCards.length !== 1) return 0;
    return (myPlayer?.hand || []).filter(c => c.id !== selectedCards[0].id && c.isJoker).length;
  }, [canWinWithKeptJoker, myPlayer?.hand, selectedCards]);

  const hasOnlyJokersAndOneNonJoker = useMemo(() => {
    if (!myPlayer?.hasOpened || !myPlayer?.hand || myPlayer.hand.length < 2) return false;
    if (settings.keepJokerOnWin === false) return false;
    const jokers = myPlayer.hand.filter(c => c.isJoker);
    const nonJokers = myPlayer.hand.filter(c => !c.isJoker);
    return jokers.length > 0 && nonJokers.length === 1;
  }, [myPlayer?.hasOpened, myPlayer?.hand, settings.keepJokerOnWin]);

  // Actions
  const handleDraw = (source) => {
    if (!isMyTurn) return showError('Nejste na tahu.');
    if (turnPhase !== 'draw') return showError('Kartu jste si již dobrali.');

    if (source === 'discard') {
      const turnsPlayed = myPlayer?.turnsCount || 0;
      if (turnsPlayed < 3) {
        return showError(`Kartu odhozenou soupeřem lze brát až po 3. kole! (Váš odehraný počet kol: ${turnsPlayed} z 3).`);
      }
    }

    onDraw(source, (res) => {
      if (!res.success) {
        showError(res.error);
      } else {
        playDrawSound();
      }
    });
  };

  const handleMeld = () => {
    if (!isMyTurn) return showError('Nejste na tahu.');
    if (turnPhase !== 'play_or_discard') return showError('Nejprve si musíte dobrat kartu.');

    const minTurns = settings.minTurnsToMeld ?? 4;
    const turnsPlayed = myPlayer?.turnsCount || 0;
    const requiredTurns = minTurns === 4 ? 3 : (minTurns === 3 ? 2 : 0);
    const canMeldRounds = turnsPlayed >= requiredTurns;
    if (!myPlayer?.hasOpened && !canMeldRounds) {
      return showError(`Vykládat karty lze až po 3. kole! (Váš odehraný počet kol: ${turnsPlayed} z ${requiredTurns}).`);
    }

    if (!selectionAnalysis.canMeld) {
      return showError(selectionAnalysis.error || 'Vybrané karty netvoří platné vyložení.');
    }

    const meldsToSubmit = (selectionAnalysis.melds && selectionAnalysis.melds.length > 0)
      ? selectionAnalysis.melds
      : [selectedCards];

    onMeld(meldsToSubmit, (res) => {
      if (!res.success) {
        showError(res.error);
      } else {
        playMeldSound();
        setSelectedCardIds(new Set());
      }
    });
  };

  const handleLayOff = (tableMeld) => {
    if (!isMyTurn) return showError('Nejste na tahu.');
    if (turnPhase !== 'play_or_discard') return showError('Nejprve si musíte dobrat kartu.');
    if (!myPlayer?.hasOpened) return showError('Přikládat můžete až po svém prvním vyložení.');
    if (selectedCards.length === 0) return showError('Vyberte nejprve kartu/karty ze své ruky k přiložení.');

    // If player selected 1 card that can swap a joker in this meld, automatically perform swap!
    if (selectedCards.length === 1) {
      const swappableJoker = tableMeld.cards.find(c => c.isJoker && canSwapJoker(tableMeld, selectedCards[0], c.id).valid);
      if (swappableJoker) {
        return handleSwapJoker(tableMeld, swappableJoker);
      }
    }

    if ((myPlayer?.hand?.length || 0) - selectedCards.length < 1) {
      return showError('Nelze přiložit všechny zbývající karty! V ruce vám musí zůstat alespoň 1 karta na závěrečné odhození pro ukončení tahu / zavření.');
    }

    const check = canLayOff(tableMeld, selectedCards);
    if (!check.valid) {
      return showError(check.error || 'Tuto kartu nelze k vybrané kombinaci přiložit.');
    }

    onLayOff(tableMeld.id, selectedCards, (res) => {
      if (!res.success) {
        showError(res.error);
      } else {
        playMeldSound();
        setSelectedCardIds(new Set());
      }
    });
  };

  const handleSwapJoker = (tableMeld, jokerCard) => {
    if (!isMyTurn) return showError('Nejste na tahu.');
    if (!myPlayer?.hasOpened) return showError('Vyměňovat žolíka můžete až po svém prvním vyložení.');
    if (selectedCards.length !== 1) {
      return showError('Vyberte ze své ruky právě 1 kartu, kterou chcete vyměnit za žolíka.');
    }

    const handCard = selectedCards[0];
    const check = canSwapJoker(tableMeld, handCard, jokerCard.id);
    if (!check.valid) {
      return showError(check.error || 'Tuto kartu nelze vyměnit za tohoto žolíka.');
    }

    onSwapJoker(tableMeld.id, jokerCard.id, handCard.id, (res) => {
      if (!res.success) {
        showError(res.error);
      } else {
        playJokerSound();
        setSelectedCardIds(new Set());
      }
    });
  };

  const handleReturnDiscard = () => {
    if (!isMyTurn) return showError('Nejste na tahu.');
    if (!hasDrawnDiscardInHand) return showError('Nemáte v ruce kartu z odhozu k vrácení.');

    onReturnDiscard((res) => {
      if (!res.success) {
        showError(res.error);
      } else {
        playDrawSound();
        setSelectedCardIds(new Set());
      }
    });
  };

  const handleDiscard = () => {
    if (!isMyTurn) return showError('Nejste na tahu.');
    if (turnPhase !== 'play_or_discard') return showError('Nejprve si musíte dobrat kartu.');

    // If card was taken from discard, it MUST be used in meld or lay-off, cannot discard while still holding it
    if (hasDrawnDiscardInHand) {
      return showError('Kartu z odhozu musíte v tomto tahu ihned použít k vyložení nebo přiložení! Pokud ji použít nemůžete, klikněte na "Vrátit do odhozu a líznout z talónu".');
    }

    if (selectedCards.length !== 1) return showError('Pro ukončení tahu musíte vybrat přesně 1 kartu k odhození.');

    const cardToDiscard = selectedCards[0];
    onDiscard(cardToDiscard.id, (res) => {
      if (!res.success) {
        showError(res.error);
      } else {
        playDiscardSound();
        setSelectedCardIds(new Set());
      }
    });
  };

  return (
    <div className="relative w-full h-screen h-[100dvh] max-h-screen overflow-hidden flex flex-col justify-between felt-table select-none">
      {/* Top Bar: Room Code, Turn Info, Sound & Rules */}
      <div className="shrink-0 w-full px-3 py-1.5 bg-stone-950/70 border-b border-stone-800/80 flex items-center justify-between text-xs sm:text-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <span className="font-mono font-black text-amber-400 bg-stone-900 px-2 py-0.5 rounded-lg border border-stone-700">
            {room?.code}
          </span>
          <span className="text-stone-300 font-semibold hidden sm:inline">
            {gameState?.roundNumber}. kolo
          </span>
        </div>

        {/* Turn indicator banner */}
        <div className="flex items-center gap-2 px-3 py-1 rounded-full font-bold text-xs bg-stone-900 border border-stone-700 shadow">
          {isMyTurn ? (
            <span className="text-emerald-400 flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              JSTE NA TAHU
              {turnPhase === 'draw' ? ' (Doberte si)' : ' (Hrajte / Odhoďte)'}
            </span>
          ) : (
            <span className="text-stone-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              Na tahu: <strong className="text-amber-300">{currentPlayer?.name || '...'}</strong>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          {isHost && (
            <button
              onClick={() => setShowPesekModal(true)}
              className="px-2.5 py-1.5 rounded-xl bg-amber-950/80 hover:bg-amber-800 text-amber-300 border border-amber-600/60 font-bold text-xs flex items-center gap-1 transition shadow cursor-pointer active:scale-95"
              title="Dát někomu Peška (odebrat ze hry)"
            >
              <span>🪵</span>
              <span className="hidden sm:inline">Pešek</span>
            </button>
          )}

          <button
            onClick={() => setShowLeaveConfirm(true)}
            className="px-2.5 py-1.5 rounded-xl bg-stone-800 hover:bg-red-950 hover:text-red-300 text-stone-300 border border-stone-700/80 font-bold text-xs flex items-center gap-1 transition cursor-pointer active:scale-95"
            title="Odejít ze hry"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">Odejít</span>
          </button>

          <button
            onClick={() => setShowLog(!showLog)}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition"
            title="Historie tahu"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={onToggleMute}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-300 transition"
            title={isMuted ? 'Zapnout zvuk' : 'Vypnout zvuk'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
          <button
            onClick={onOpenRules}
            className="p-1.5 rounded-lg bg-stone-800 hover:bg-stone-700 text-amber-300 transition"
            title="Pravidla Žolíků"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Floating Action Error Notification */}
      {actionError && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-red-950/95 border-2 border-red-500 text-red-200 text-xs sm:text-sm font-bold rounded-2xl shadow-2xl flex items-center gap-2 animate-bounce">
          <XCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Collapsible Game Event Log Drawer */}
      {showLog && (
        <div className="absolute top-12 right-2 z-40 w-72 max-h-64 overflow-y-auto bg-stone-900/95 border border-stone-700 rounded-2xl p-3 shadow-2xl text-xs space-y-1.5">
          <div className="font-bold text-amber-400 mb-2 flex items-center justify-between">
            <span>Záznam hry</span>
            <button onClick={() => setShowLog(false)} className="text-stone-400 hover:text-white">✕</button>
          </div>
          {gameState?.log?.length === 0 ? (
            <div className="text-stone-500 text-center py-2">Zatím žádné tahy.</div>
          ) : (
            gameState?.log?.map(entry => (
              <div key={entry.id} className="text-stone-300 py-0.5 border-b border-stone-800/50">
                <span className="text-stone-500 text-[10px] mr-1">{entry.time}</span>
                <span>{entry.text}</span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Opponents Area (Top of Table) */}
      <div className="shrink-0 w-full px-2 py-1 flex items-center justify-around gap-2 sm:gap-3 overflow-x-auto no-scrollbar">
        {opponents.map((opp) => {
          const isOppTurn = opp.id === currentPlayer?.id;
          return (
            <div
              key={opp.id}
              className={`flex items-center gap-1.5 sm:gap-2 px-2.5 py-1 sm:py-1.5 rounded-2xl border transition-all ${
                isOppTurn
                  ? 'bg-amber-950/60 border-amber-400 ring-2 ring-amber-400/50 shadow-lg'
                  : 'bg-stone-950/40 border-stone-800/80'
              }`}
            >
              <div className="relative">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-stone-800 border border-stone-700 flex items-center justify-center text-sm sm:text-base">
                  {opp.isBot ? '🤖' : '👤'}
                </div>
                {isOppTurn && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-stone-900 animate-ping" />
                )}
              </div>

              <div className="text-left">
                <div className="text-xs sm:text-sm font-bold text-stone-200 flex items-center gap-1">
                  <span className="truncate max-w-[70px] sm:max-w-[100px]">{opp.name}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] sm:text-xs">
                  <span className="text-stone-400">🃏 {opp.cardCount} karet</span>
                  {opp.leftGame ? (
                    <span className="px-1.5 py-0.2 rounded font-bold text-[10px] bg-stone-800 text-amber-300 border border-amber-600/50">
                      {opp.hasPesek ? '🪵 Pešek (Bot)' : '🚪 Odešel (Bot)'}
                    </span>
                  ) : (
                    <span
                      className={`px-1.5 py-0.2 rounded font-semibold ${
                        opp.hasOpened ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'text-stone-500'
                      }`}
                    >
                      {opp.hasOpened ? 'Vyloženo' : 'Čeká'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Center Table: Talon (Draw pile), Discard pile, & Table Melds */}
      <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto px-2 sm:px-3 py-1 flex flex-col justify-between gap-1 sm:gap-2 overflow-hidden">
        {/* Draw & Discard Piles Center Bar */}
        <div className="shrink-0 flex items-center justify-center gap-6 sm:gap-10 my-1">
          {/* Talon (Draw Pile) */}
          <div className="flex flex-col items-center">
            <div
              onClick={() => handleDraw('talon')}
              className={`relative cursor-pointer transition-transform duration-150 ${
                isMyTurn && turnPhase === 'draw'
                  ? 'hover:scale-105 active:scale-95 ring-4 ring-emerald-400 rounded-xl shadow-xl shadow-emerald-500/30'
                  : ''
              }`}
              title="Dobrát kartu z talónu"
            >
              <Card isBack={true} size="md" />
              <div className="absolute -bottom-2 inset-x-0 mx-auto w-max px-2 py-0.5 bg-stone-900/90 text-stone-200 text-[10px] sm:text-xs rounded-full font-bold border border-stone-700 shadow">
                {gameState?.talonCount || 0} karet
              </div>
            </div>
            <span className="mt-3 text-[11px] font-bold text-stone-300 tracking-wide uppercase">
              Talón (Dobrat)
            </span>
          </div>

          {/* Discard Pile */}
          <div className="flex flex-col items-center">
            <div
              onClick={() => {
                if (isMyTurn && turnPhase === 'draw') {
                  handleDraw('discard');
                } else if (isMyTurn && turnPhase === 'play_or_discard' && selectedCards.length === 1) {
                  handleDiscard();
                }
              }}
              className={`relative cursor-pointer transition-transform duration-150 ${
                isMyTurn && turnPhase === 'draw' && (myPlayer?.turnsCount || 0) >= 3
                  ? 'hover:scale-105 active:scale-95 ring-4 ring-amber-400 rounded-xl shadow-xl shadow-amber-500/30'
                  : isMyTurn && turnPhase === 'play_or_discard' && selectedCards.length === 1
                  ? 'hover:scale-105 active:scale-95 ring-4 ring-red-500 rounded-xl shadow-xl shadow-red-500/30'
                  : ''
              }`}
              title={
                turnPhase === 'draw'
                  ? ((myPlayer?.turnsCount || 0) >= 3 ? 'Vzít vrchní kartu z odhozu' : 'Kartu z odhozu lze brát až po 3. kole')
                  : 'Klikněte pro odhození vybrané karty'
              }
            >
              {gameState?.discardTop ? (
                <Card card={gameState.discardTop} size="md" />
              ) : (
                <div className="w-13 h-18 sm:w-14 sm:h-20 border-2 border-dashed border-stone-600/70 rounded-xl flex items-center justify-center text-stone-500 text-xs">
                  Prázdno
                </div>
              )}
              <div className="absolute -bottom-2 inset-x-0 mx-auto w-max px-2 py-0.5 bg-stone-900/90 text-stone-200 text-[10px] sm:text-xs rounded-full font-bold border border-stone-700 shadow">
                {gameState?.discardCount || 0} karet
              </div>
            </div>
            <div className="mt-3 flex flex-col items-center leading-tight">
              <span className="text-[11px] font-bold text-stone-300 tracking-wide uppercase">
                {isMyTurn && turnPhase === 'play_or_discard' && selectedCards.length === 1 ? (
                  <span className="text-red-400 animate-pulse font-extrabold">Zahodit sem!</span>
                ) : (
                  'Odhoz'
                )}
              </span>
              {(myPlayer?.turnsCount || 0) < 3 && (
                <span className="text-[9px] text-amber-400/80 font-medium tracking-normal lowercase">
                  (brát až po 3. kole)
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Warning & Return Button if player took card from discard */}
        {isMyTurn && turnPhase === 'play_or_discard' && hasDrawnDiscardInHand && (
          <div className="shrink-0 w-full max-w-xl mx-auto px-3 py-1.5 bg-amber-950/90 border-2 border-amber-500 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-2 shadow-2xl animate-fade-in text-center sm:text-left">
            <div className="text-xs text-amber-200 font-semibold flex items-center gap-1.5">
              <span className="text-base">⚠️</span>
              <span>
                Vzali jste si kartu z odhozu: musíte ji v tomto tahu <strong>ihned vyložit nebo přiložit</strong>!
              </span>
            </div>
            <button
              onClick={handleReturnDiscard}
              className="px-2.5 py-1 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-500 hover:to-amber-600 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span>↩</span>
              <span>Vrátit a líznout z talónu</span>
            </button>
          </div>
        )}

        {/* Table Melds (Vyložené kombinace na stole) */}
        <div className="flex-1 min-h-0 w-full bg-black/25 border border-white/10 rounded-2xl p-2 sm:p-2.5 overflow-y-auto">
          <div className="flex items-center justify-between mb-1.5 px-1 shrink-0">
            <div className="text-xs font-bold text-amber-300/80 flex items-center gap-1.5 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Kombinace na stole ({gameState?.tableMelds?.length || 0})</span>
            </div>
            {myPlayer?.hasOpened && selectedCards.length > 0 && (
              <span className="text-[11px] text-emerald-300 font-semibold animate-pulse">
                💡 Klikněte na &quot;Přiložit&quot; u libovolné kombinace
              </span>
            )}
          </div>

          {gameState?.tableMelds?.length === 0 ? (
            <div className="h-16 flex items-center justify-center text-xs text-stone-400/60 font-medium">
              Zatím žádný hráč nevyložil karty na stůl.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-2.5">
              {gameState?.tableMelds?.map((meld) => (
                <div
                  key={meld.id}
                  className="bg-stone-950/70 border border-stone-800 rounded-xl p-2 flex flex-col justify-between shadow-md"
                >
                  <div className="flex items-center justify-between text-[11px] text-stone-400 mb-1">
                    <span className="font-bold text-stone-200">
                      {meld.type === 'sequence' ? 'Postupka' : 'Skupina'} ({meld.ownerName})
                    </span>

                    {/* Lay-off button if player has opened and selected cards */}
                    {isMyTurn && myPlayer?.hasOpened && selectedCards.length > 0 && (
                      <button
                        onClick={() => handleLayOff(meld)}
                        className="px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white font-bold text-[10px] rounded-lg shadow transition"
                      >
                        + Přiložit
                      </button>
                    )}
                  </div>

                  {/* Cards in this table meld */}
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                    {meld.cards.map((c) => {
                      const isJoker = c.isJoker;
                      const canSwapThisJoker = isJoker && isMyTurn && myPlayer?.hasOpened && selectedCards.length === 1 && canSwapJoker(meld, selectedCards[0], c.id).valid;
                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            if (canSwapThisJoker) {
                              handleSwapJoker(meld, c);
                            }
                          }}
                          className={`relative group ${canSwapThisJoker ? 'cursor-pointer ring-2 ring-amber-400 rounded-lg animate-pulse' : ''}`}
                        >
                          <Card card={c} size="sm" />
                          {/* Swap Joker button if applicable */}
                          {isJoker && isMyTurn && myPlayer?.hasOpened && selectedCards.length === 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSwapJoker(meld, c);
                              }}
                              className={`absolute -top-2 -right-2 px-1.5 py-0.5 rounded-md font-black text-[9px] shadow-xl z-20 transition ${
                                canSwapThisJoker
                                  ? 'bg-amber-400 hover:bg-amber-300 text-stone-950 animate-bounce ring-2 ring-white cursor-pointer'
                                  : 'bg-stone-800 text-stone-400 opacity-60 cursor-not-allowed'
                              }`}
                              title="Vyměnit žolíka za vybranou kartu z ruky"
                            >
                              Vyměnit! 🃏
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Area: Player's Hand, Action Buttons & Sorting */}
      <div className="shrink-0 w-full bg-stone-950/95 border-t border-stone-800/80 px-2 sm:px-4 pt-1.5 pb-2 sm:pb-3 shadow-2xl flex flex-col items-center">
        {/* Helper Banner / Turn action prompt */}
        <div className="w-full max-w-4xl flex items-center justify-between mb-1 text-xs">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="font-bold text-amber-400">Tvoje ruka</span>
            <span className="text-stone-400 text-[11px] sm:text-xs">({myPlayer?.hand?.length || 0} karet)</span>
            {myPlayer?.hasOpened ? (
              <span className="text-[10px] px-2 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-full font-bold">
                ✓ Vyloženo
              </span>
            ) : (
              <div className="flex items-center gap-1">
                {(myPlayer?.turnsCount || 0) < 3 ? (
                  <span className="text-[10px] px-2 py-0.2 bg-red-950/80 text-red-300 border border-red-700/60 rounded-full font-bold flex items-center gap-1">
                    🔒 Vykládání až po 3. kole ({myPlayer?.turnsCount || 0}/3 kol)
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.2 bg-stone-800 text-amber-300 rounded-full font-semibold">
                    Podmínka: min. {settings.minPoints || 42} b
                    {settings.requirePureSequence ? ' + čistá postupka' : ''}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Sort Hand Buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setSortMode('suit')}
              className={`px-2 py-0.5 rounded-lg text-[10px] sm:text-[11px] font-semibold transition ${
                sortMode === 'suit'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-stone-800 text-stone-400 hover:text-stone-200'
              }`}
            >
              Podle barev
            </button>
            <button
              onClick={() => setSortMode('rank')}
              className={`px-2 py-0.5 rounded-lg text-[10px] sm:text-[11px] font-semibold transition ${
                sortMode === 'rank'
                  ? 'bg-amber-600 text-white shadow'
                  : 'bg-stone-800 text-stone-400 hover:text-stone-200'
              }`}
            >
              Podle hodnot
            </button>
          </div>
        </div>

        {/* Hand Cards Container */}
        <div className="w-full max-w-5xl overflow-x-auto py-1 px-1 sm:px-2 no-scrollbar flex items-center justify-start sm:justify-center gap-1 sm:gap-1.5">
          {sortedHand.map((card) => {
            const isSelected = selectedCardIds.has(card.id);
            const isLastDrawn = card.id === myPlayer?.lastDrawnCardId;
            return (
              <div key={card.id} className="shrink-0 transition-all relative">
                {isLastDrawn && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-cyan-400 text-stone-950 font-black text-[9px] px-1.5 py-0.2 rounded-full shadow-lg uppercase tracking-wider flex items-center gap-0.5 z-30 animate-pulse whitespace-nowrap pointer-events-none">
                    ✨ Líznuto
                  </div>
                )}
                <div className={isLastDrawn ? 'ring-4 ring-cyan-400 ring-offset-2 ring-offset-stone-900 rounded-xl shadow-xl shadow-cyan-400/50 -translate-y-2' : ''}>
                  <Card
                    card={card}
                    isSelected={isSelected}
                    onClick={() => handleToggleCard(card)}
                    size="md"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions Bar & Selection Status */}
        <div className="w-full max-w-4xl mt-1 flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-800/60">
          {/* Selected cards info */}
          <div className="text-xs text-stone-300 flex items-center gap-2">
            <span className="font-semibold">{selectionAnalysis.text}</span>
            {canWinWithKeptJoker && (
              <span className="text-amber-300 font-extrabold animate-pulse">
                ★ Zavření se {keptJokersCountToKeep > 1 ? `${keptJokersCountToKeep} žolíky` : 'žolíkem'} do dalšího kola!
              </span>
            )}
            {!canWinWithKeptJoker && hasOnlyJokersAndOneNonJoker && isMyTurn && turnPhase === 'play_or_discard' && (
              <span className="text-amber-300/90 text-[11px] hidden sm:inline">
                (Označte běžnou kartu pro zavření a ponechání {(myPlayer?.hand || []).filter(c => c.isJoker).length > 1 ? `${(myPlayer?.hand || []).filter(c => c.isJoker).length} žolíků` : 'žolíka'})
              </span>
            )}
            {selectedCards.length > 0 && (
              <button
                onClick={() => setSelectedCardIds(new Set())}
                className="text-stone-500 hover:text-stone-300 underline text-[11px]"
              >
                Zrušit výběr
              </button>
            )}
          </div>

          {/* Main Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Meld Button */}
            <button
              onClick={handleMeld}
              disabled={!isMyTurn || turnPhase !== 'play_or_discard' || !selectionAnalysis.canMeld}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition ${
                isMyTurn && turnPhase === 'play_or_discard' && selectionAnalysis.canMeld
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-95 text-white shadow-lg shadow-emerald-900/40 cursor-pointer'
                  : 'bg-stone-800/80 text-stone-500 cursor-not-allowed'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>Vyložit vybrané</span>
            </button>

            {/* Discard / Win Button */}
            <button
              onClick={handleDiscard}
              disabled={!isMyTurn || turnPhase !== 'play_or_discard' || selectedCards.length !== 1}
              className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-1.5 transition ${
                canWinWithKeptJoker
                  ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 hover:from-amber-400 hover:to-yellow-300 text-stone-950 font-black shadow-xl shadow-amber-500/50 active:scale-95 animate-pulse cursor-pointer border-2 border-white/60'
                  : isMyTurn && turnPhase === 'play_or_discard' && selectedCards.length === 1
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-white shadow-lg shadow-red-900/40 cursor-pointer'
                  : 'bg-stone-800/80 text-stone-500 cursor-not-allowed'
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" />
              <span>
                {canWinWithKeptJoker
                  ? `Zavřít a nechat si ${keptJokersCountToKeep > 1 ? `${keptJokersCountToKeep} žolíky` : 'žolíka'}! 🃏`
                  : 'Zahodit kartu'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Pesek Modal */}
      {showPesekModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-stone-900 border-2 border-amber-500/60 rounded-3xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-stone-800">
              <div className="flex items-center gap-2">
                <span className="text-3xl">🪵</span>
                <div>
                  <h3 className="font-black text-lg text-amber-400">Dát někomu Peška</h3>
                  <p className="text-[11px] text-stone-400">Vybraný hráč bude odebrán ze hry a karty převezme Bot</p>
                </div>
              </div>
              <button
                onClick={() => setShowPesekModal(false)}
                className="text-stone-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
              {opponents.filter(o => !o.leftGame).length === 0 ? (
                <div className="text-center py-4 text-xs text-stone-400">Žádní další živí hráči u stolu.</div>
              ) : (
                opponents.filter(o => !o.leftGame).map(opp => (
                  <div key={opp.id} className="flex items-center justify-between p-3 bg-stone-950/60 border border-stone-800 rounded-2xl">
                    <div className="flex items-center gap-2.5">
                      <span className="text-xl">{opp.isBot ? '🤖' : '👤'}</span>
                      <div>
                        <div className="font-bold text-sm text-stone-200">{opp.name}</div>
                        <div className="text-[10px] text-stone-400">🃏 {opp.cardCount} karet</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        onGivePesek(opp.id);
                        setShowPesekModal(false);
                      }}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 active:scale-95 text-stone-950 font-black text-xs rounded-xl shadow-lg flex items-center gap-1 cursor-pointer transition"
                    >
                      <span>🪵 Dát Peška</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowPesekModal(false)}
              className="w-full py-2.5 bg-stone-800 hover:bg-stone-700 font-semibold text-stone-300 rounded-xl text-xs transition cursor-pointer"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}

      {/* Leave Game Confirm Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-stone-900 border border-stone-700 rounded-3xl p-6 max-w-sm w-full shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-500/50 flex items-center justify-center text-2xl mx-auto mb-3">
              🚪
            </div>
            <h3 className="font-black text-lg text-stone-100 mb-1">Opravdu chcete odejít?</h3>
            <p className="text-xs text-stone-400 mb-6">
              Vaši ruku a další tahy automaticky převezme počítač (bot), takže hra pro ostatní hráče plynule pokračuje.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 py-2.5 bg-stone-800 hover:bg-stone-700 font-bold text-stone-300 text-xs rounded-xl transition cursor-pointer"
              >
                Zůstat ve hře
              </button>
              <button
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onLeaveGame();
                }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 active:scale-95 font-black text-white text-xs rounded-xl transition shadow-lg shadow-red-950/50 cursor-pointer"
              >
                Odejít
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

