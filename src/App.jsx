import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby.jsx';
import Table from './components/Table.jsx';
import RoundEndModal from './components/RoundEndModal.jsx';
import Chat from './components/Chat.jsx';
import RulesModal from './components/RulesModal.jsx';
import { isSoundMuted, toggleMute } from './utils/sound.js';
import { Play, LogIn, PlusCircle, HelpCircle, AlertCircle, RefreshCw } from 'lucide-react';

const getInitialServerUrl = () => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('zoliky_custom_server_url') ||
    window.__ZOLIKY_SERVER_URL__ ||
    import.meta.env.VITE_SERVER_URL ||
    '';
};

const SERVER_URL = getInitialServerUrl();

const socket = io(SERVER_URL || '/', {
  autoConnect: true,
  transports: ['websocket', 'polling']
});

export default function App() {
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('zoliky_name') || '');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [currentUserId, setCurrentUserId] = useState(() => sessionStorage.getItem('zoliky_playerId') || null);
  const [room, setRoom] = useState(null);
  const [serverInfo, setServerInfo] = useState(null);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(isSoundMuted());
  const [errorMsg, setErrorMsg] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [connectError, setConnectError] = useState(null);
  const [showServerModal, setShowServerModal] = useState(false);
  const [customServerInput, setCustomServerInput] = useState(SERVER_URL);

  // Check URL query params for ?room=ABCD
  const [hasInviteFromUrl, setHasInviteFromUrl] = useState(false);

  useEffect(() => {
    const onConnect = () => {
      setIsConnected(true);
      setConnectError(null);
    };
    const onDisconnect = () => {
      setIsConnected(false);
    };
    const onConnectError = (err) => {
      setIsConnected(false);
      setConnectError(err?.message || 'Chyba připojení');
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('room');
    if (codeParam) {
      setRoomCodeInput(codeParam.toUpperCase().trim());
      setHasInviteFromUrl(true);
    }

    // Fetch server LAN info
    fetch(`${SERVER_URL}/api/info`)
      .then(res => res.json())
      .then(data => setServerInfo(data))
      .catch(() => {});
  }, []);

  // Socket event listeners
  useEffect(() => {
    socket.on('room:updated', (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on('player:kicked', ({ reason, message }) => {
      setRoom(null);
      setErrorMsg(message || (reason === 'pesek' ? '🪵 Dostal(a) jste Peška a byl(a) jste vyřazen(a) ze hry.' : 'Byl(a) jste odebrán(a) hostitelem z místnosti.'));
      window.history.pushState({}, '', '/');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    return () => {
      socket.off('room:updated');
      socket.off('player:kicked');
      socket.off('disconnect');
    };
  }, []);

  // Save name
  const handleNameChange = (val) => {
    setPlayerName(val);
    localStorage.setItem('zoliky_name', val);
  };

  const handleToggleMute = () => {
    const next = toggleMute();
    setIsMuted(next);
  };

  // Create room
  const handleCreateRoom = (e) => {
    e?.preventDefault();
    if (!playerName.trim()) {
      setErrorMsg('Zadejte prosím své jméno.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);

    let finished = false;
    const timeoutTimer = setTimeout(() => {
      if (!finished) {
        setIsLoading(false);
        setErrorMsg(`Herní server (${SERVER_URL || window.location.origin}) neodpovídá. Zkontrolujte, zda na Renderu svítí zeleně "Live" a zda je zadaná správná URL adresa serveru.`);
      }
    }, 6000);

    socket.emit('room:create', { playerName: playerName.trim() }, (res) => {
      finished = true;
      clearTimeout(timeoutTimer);
      setIsLoading(false);
      if (res?.success) {
        setCurrentUserId(res.playerId);
        sessionStorage.setItem('zoliky_playerId', res.playerId);
        setRoom(res.room);
        // Update URL query without full reload
        window.history.pushState({}, '', `/?room=${res.room.code}`);
      } else {
        setErrorMsg(res?.error || 'Nepodařilo se vytvořit místnost.');
      }
    });
  };

  // Join room
  const handleJoinRoom = (e) => {
    e?.preventDefault();
    if (!playerName.trim()) {
      setErrorMsg('Zadejte prosím své jméno.');
      return;
    }
    if (!roomCodeInput.trim()) {
      setErrorMsg('Zadejte prosím kód místnosti.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    let finished = false;
    const timeoutTimer = setTimeout(() => {
      if (!finished) {
        setIsLoading(false);
        setErrorMsg(`Herní server (${SERVER_URL || window.location.origin}) neodpovídá. Zkontrolujte, zda na Renderu svítí zeleně "Live" a zda je zadaná správná URL adresa serveru.`);
      }
    }, 6000);

    socket.emit('room:join', {
      roomCode: roomCodeInput.toUpperCase().trim(),
      playerName: playerName.trim(),
      playerId: currentUserId
    }, (res) => {
      finished = true;
      clearTimeout(timeoutTimer);
      setIsLoading(false);
      if (res?.success) {
        setCurrentUserId(res.playerId);
        sessionStorage.setItem('zoliky_playerId', res.playerId);
        setRoom(res.room);
        window.history.pushState({}, '', `/?room=${res.room.code}`);
      } else {
        setErrorMsg(res?.error || 'Nepodařilo se připojit k místnosti.');
      }
    });
  };

  // Lobby actions
  const handleAddBot = () => {
    socket.emit('room:addBot', {}, (res) => {
      if (!res?.success) setErrorMsg(res?.error);
    });
  };

  const handleUpdateSettings = (settings) => {
    socket.emit('room:settings', { settings }, (res) => {
      if (!res?.success) setErrorMsg(res?.error);
    });
  };

  const handleStartGame = () => {
    socket.emit('room:start', {}, (res) => {
      if (!res?.success) setErrorMsg(res?.error);
    });
  };

  // Game actions
  const handleDraw = (source, cb) => {
    socket.emit('game:draw', { source }, cb);
  };

  const handleMeld = (melds, cb) => {
    socket.emit('game:meld', { melds }, cb);
  };

  const handleLayOff = (tableMeldId, cards, cb) => {
    socket.emit('game:layOff', { tableMeldId, cards }, cb);
  };

  const handleSwapJoker = (tableMeldId, jokerId, handCardId, cb) => {
    socket.emit('game:swapJoker', { tableMeldId, jokerId, handCardId }, cb);
  };

  const handleDiscard = (cardId, cb) => {
    socket.emit('game:discard', { cardId }, cb);
  };

  const handleReturnDiscard = (cb) => {
    socket.emit('game:returnDiscard', {}, cb);
  };

  const handleNextRound = () => {
    socket.emit('game:nextRound', {}, (res) => {
      if (!res?.success) setErrorMsg(res?.error);
    });
  };

  const handleKickPlayer = (targetPlayerId) => {
    socket.emit('room:kickPlayer', { targetPlayerId }, (res) => {
      if (!res?.success) setErrorMsg(res?.error);
    });
  };

  const handleGivePesek = (targetPlayerId) => {
    socket.emit('room:givePesek', { targetPlayerId }, (res) => {
      if (!res?.success) setErrorMsg(res?.error);
    });
  };

  const handleLeaveGame = () => {
    socket.emit('room:leaveGame', {}, () => {
      setRoom(null);
      window.history.pushState({}, '', '/');
    });
  };

  const handleNewRoomAfterGame = () => {
    setRoom(null);
    window.history.pushState({}, '', '/');
    socket.emit('room:create', { playerName: playerName.trim() || 'Hráč' }, (res) => {
      if (res?.success) {
        setCurrentUserId(res.playerId);
        sessionStorage.setItem('zoliky_playerId', res.playerId);
        setRoom(res.room);
        window.history.pushState({}, '', `/?room=${res.room.code}`);
      }
    });
  };

  const handleSendMessage = (text) => {
    socket.emit('chat:send', { text });
  };

  // Landing / Welcome View
  if (!room) {
    return (
      <div className="min-h-screen felt-table flex flex-col items-center justify-center p-4">
        {/* Error notification */}
        {errorMsg && (
          <div className="mb-6 px-4 py-3 bg-red-950/90 border border-red-500 text-red-200 text-sm font-semibold rounded-2xl shadow-xl flex items-center gap-2 max-w-md w-full">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="w-full max-w-md bg-stone-900/90 border border-stone-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md text-stone-100 flex flex-col items-center text-center">
          {/* Logo / Badge */}
          <div className="w-20 h-20 bg-amber-500/20 border-2 border-amber-400/80 rounded-3xl flex items-center justify-center text-4xl mb-4 shadow-xl shadow-amber-500/10">
            🃏
          </div>

          <h1 className="text-3xl font-black tracking-tight text-amber-400 mb-1">
            České Žolíky
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 mb-6">
            Klasická společenská karetní hra pro mobil, iPad i počítač. Hrajte s přáteli přes kód nebo odkaz!
          </p>

          {/* Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (hasInviteFromUrl && roomCodeInput.trim()) {
                handleJoinRoom(e);
              } else if (roomCodeInput.trim()) {
                handleJoinRoom(e);
              } else {
                handleCreateRoom(e);
              }
            }}
            className="w-full space-y-4 text-left"
          >
            <div>
              <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1.5">
                Tvoje přezdívka
              </label>
              <input
                type="text"
                placeholder="Např. Martin, Eliška, Babička..."
                value={playerName}
                onChange={(e) => handleNameChange(e.target.value)}
                maxLength={20}
                autoFocus
                className="w-full px-4 py-3 bg-stone-950 border border-stone-700 rounded-2xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-400 font-semibold text-sm transition"
              />
            </div>

            {hasInviteFromUrl && roomCodeInput.trim() ? (
              <div className="space-y-3 pt-2">
                <div className="p-3 bg-amber-950/40 border border-amber-500/50 rounded-2xl text-center">
                  <div className="text-xs text-stone-300 font-semibold">Pozvánka do herní místnosti:</div>
                  <div className="font-mono text-3xl font-black text-amber-400 tracking-widest my-1">{roomCodeInput}</div>
                  <div className="text-[11px] text-stone-400">Hostitel na vás čeká u stolu!</div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !playerName.trim()}
                  className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 active:scale-98 font-black text-white rounded-2xl shadow-xl shadow-emerald-900/40 flex items-center justify-center gap-2 text-base transition cursor-pointer"
                >
                  <LogIn className="w-5 h-5" />
                  <span>VSTOUPIT DO HRY {roomCodeInput}</span>
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setRoomCodeInput('');
                      setHasInviteFromUrl(false);
                      window.history.pushState({}, '', '/');
                    }}
                    className="text-xs text-stone-400 hover:text-stone-200 underline"
                  >
                    Nebo vytvořit vlastní novou hru
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Create Room Button */}
                <button
                  type="button"
                  onClick={handleCreateRoom}
                  disabled={isLoading || !playerName.trim()}
                  className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 active:scale-98 font-bold text-white rounded-2xl shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <PlusCircle className="w-5 h-5" />
                  <span>Vytvořit novou hru</span>
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-stone-800" />
                  <span className="flex-shrink mx-3 text-stone-500 text-xs font-semibold">NEBO</span>
                  <div className="flex-grow border-t border-stone-800" />
                </div>

                {/* Join Room */}
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider">
                    Kód místnosti
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="KÓD (např. ABCD)"
                      value={roomCodeInput}
                      onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase().trim())}
                      maxLength={6}
                      className="flex-1 px-4 py-3 bg-stone-950 border border-stone-700 rounded-2xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-400 font-mono font-bold tracking-widest text-center text-sm transition uppercase"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !playerName.trim() || !roomCodeInput.trim()}
                      className="px-5 py-3 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 active:scale-95 font-bold text-white rounded-2xl shadow transition flex items-center gap-1.5 text-sm cursor-pointer"
                    >
                      <LogIn className="w-4 h-4" />
                      <span>Připojit</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </form>

          {/* Quick Rules Link */}
          <button
            onClick={() => setIsRulesOpen(true)}
            className="mt-6 text-xs text-amber-400/90 hover:text-amber-300 flex items-center gap-1.5 transition font-semibold"
          >
            <HelpCircle className="w-4 h-4" />
            <span>Jak se hrají Žolíky? Zobrazit pravidla</span>
          </button>

          {/* Server status & quick config */}
          <div className="mt-4 pt-3 border-t border-stone-800/60 w-full flex items-center justify-center gap-2 text-[11px] text-stone-400">
            <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400' : 'bg-red-500 animate-ping'}`} />
            <span className="truncate">
              {isConnected ? 'Server připojen' : (connectError ? 'Nelze se spojit se serverem' : 'Připojování k serveru...')}
            </span>
            <button
              type="button"
              onClick={() => setShowServerModal(true)}
              className="text-amber-400 hover:text-amber-200 underline cursor-pointer shrink-0 ml-1 font-semibold"
            >
              (Nastavit server)
            </button>
          </div>
        </div>

        {/* Server Config Modal */}
        {showServerModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-stone-900 border border-stone-700 rounded-3xl p-6 max-w-md w-full shadow-2xl text-left">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-800">
                <h3 className="font-bold text-base text-amber-400">Nastavení herního serveru (Backend)</h3>
                <button onClick={() => setShowServerModal(false)} className="text-stone-400 hover:text-white">✕</button>
              </div>

              <p className="text-xs text-stone-300 mb-4">
                Pokud máte web nahraný na svém FTP hostingu, zadejte sem veřejnou URL adresu herního serveru z vašeho Render dashboardu (např. <code className="text-amber-300">https://ceske-zoliky.onrender.com</code>).
              </p>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-stone-400 uppercase tracking-wider mb-1">
                    URL adresa herního serveru
                  </label>
                  <input
                    type="url"
                    placeholder="https://vase-jmeno.onrender.com"
                    value={customServerInput}
                    onChange={(e) => setCustomServerInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-stone-950 border border-stone-700 rounded-xl text-stone-100 placeholder-stone-600 focus:outline-none focus:border-amber-400 font-mono text-xs"
                  />
                  <div className="text-[10px] text-stone-500 mt-1">
                    Aktuální spojení: {SERVER_URL || 'výchozí stejná doména ( / )'}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      let url = customServerInput.trim();
                      if (url.endsWith('/')) url = url.slice(0, -1);
                      localStorage.setItem('zoliky_custom_server_url', url);
                      window.location.reload();
                    }}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 font-bold text-white text-xs rounded-xl transition cursor-pointer"
                  >
                    Uložit a připojit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      localStorage.removeItem('zoliky_custom_server_url');
                      window.location.reload();
                    }}
                    className="px-3 py-2.5 bg-stone-800 hover:bg-stone-700 font-medium text-stone-400 hover:text-stone-200 text-xs rounded-xl transition cursor-pointer"
                  >
                    Obnovit výchozí
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
      </div>
    );
  }

  // Active Game or Lobby View
  return (
    <div className="min-h-screen bg-stone-950 text-stone-100">
      {room.status === 'lobby' ? (
        <Lobby
          room={room}
          currentUserId={currentUserId}
          serverInfo={serverInfo}
          onStartGame={handleStartGame}
          onAddBot={handleAddBot}
          onKickPlayer={handleKickPlayer}
          onGivePesek={handleGivePesek}
          onLeaveGame={handleLeaveGame}
          onUpdateSettings={handleUpdateSettings}
          onOpenRules={() => setIsRulesOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      ) : (
        <Table
          room={room}
          currentUserId={currentUserId}
          onDraw={handleDraw}
          onMeld={handleMeld}
          onLayOff={handleLayOff}
          onSwapJoker={handleSwapJoker}
          onDiscard={handleDiscard}
          onReturnDiscard={handleReturnDiscard}
          onKickPlayer={handleKickPlayer}
          onGivePesek={handleGivePesek}
          onLeaveGame={handleLeaveGame}
          onOpenRules={() => setIsRulesOpen(true)}
          isMuted={isMuted}
          onToggleMute={handleToggleMute}
        />
      )}

      {/* Round End Victory Modal */}
      <RoundEndModal
        room={room}
        currentUserId={currentUserId}
        onNextRound={handleNextRound}
        onNewRoom={handleNewRoomAfterGame}
        onLeaveGame={handleLeaveGame}
      />

      {/* Chat & Emoji drawer */}
      <Chat
        messages={room?.chatMessages || []}
        onSendMessage={handleSendMessage}
        isOpen={isChatOpen}
        onToggle={() => setIsChatOpen(!isChatOpen)}
      />

      {/* Rules Modal */}
      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
    </div>
  );
}

