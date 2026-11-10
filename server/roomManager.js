// Room and Game State Manager for Czech Žolíky
import { createDeck, shuffle } from './cards.js';
import {
  validateOpeningMelds,
  validateSingleMeld,
  canLayOff,
  canSwapJoker,
  calculateHandPenalty
} from './gameLogic.js';
import { decideBotTurn, decideBotPlayAndDiscard } from './botAI.js';

export class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map(); // roomCode -> room object
    this.botTimeouts = new Map(); // roomCode -> timeout
  }

  clearBotTimeout(code) {
    if (this.botTimeouts.has(code)) {
      clearTimeout(this.botTimeouts.get(code));
      this.botTimeouts.delete(code);
    }
  }

  setBotTimeout(code, fn, delay) {
    this.clearBotTimeout(code);
    const t = setTimeout(fn, delay);
    this.botTimeouts.set(code, t);
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    try {
      code = '';
      for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
    } catch (e) {
      code = 'ZOLIK';
    }
    return code;
  }

  createRoom(hostPlayerName, customCode = null) {
    let code = customCode ? customCode.toUpperCase().trim() : this.generateRoomCode();
    while (this.rooms.has(code)) {
      code = this.generateRoomCode();
    }

    const hostId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const room = {
      code,
      hostId,
      status: 'lobby', // 'lobby' | 'playing' | 'round_ended'
      settings: {
        minPoints: 42,
        requirePureSequence: true,
        cardsPerPlayer: 12,
        keepJokerOnWin: true,
        minTurnsToMeld: 4 // default: až po 3. kole (od 4. kola hry)
      },
      players: [
        {
          id: hostId,
          name: hostPlayerName || 'Hráč 1',
          isBot: false,
          isHost: true,
          connected: true,
          hand: [],
          hasOpened: false,
          openedThisTurn: false,
          turnsCount: 0,
          lastDrawnCardId: null,
          leftGame: false,
          hasPesek: false,
          totalScore: 0,
          roundScore: 0
        }
      ],
      gameState: null,
      chatMessages: []
    };

    this.rooms.set(code, room);
    return { room, player: room.players[0] };
  }

  getRoom(code) {
    return this.rooms.get(code?.toUpperCase()?.trim());
  }

  joinRoom(code, playerName, persistentPlayerId = null) {
    const room = this.getRoom(code);
    if (!room) {
      return { success: false, error: 'Místnost nebyla nalezena.' };
    }

    // Check reconnection
    if (persistentPlayerId) {
      const existing = room.players.find(p => p.id === persistentPlayerId);
      if (existing) {
        existing.connected = true;
        if (playerName) existing.name = playerName;
        return { success: true, room, player: existing, reconnected: true };
      }
    }

    if (room.status !== 'lobby') {
      return { success: false, error: 'Hra v této místnosti již probíhá.' };
    }

    if (room.players.length >= 20) {
      return { success: false, error: 'Místnost dosáhla maximální kapacity 20 hráčů.' };
    }

    const playerId = `p_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const newPlayer = {
      id: playerId,
      name: playerName || `Hráč ${room.players.length + 1}`,
      isBot: false,
      isHost: false,
      connected: true,
      hand: [],
      hasOpened: false,
      openedThisTurn: false,
      turnsCount: 0,
      lastDrawnCardId: null,
      leftGame: false,
      hasPesek: false,
      totalScore: 0,
      roundScore: 0
    };

    room.players.push(newPlayer);
    this.addLog(room, `${newPlayer.name} se připojil(a) do místnosti.`);
    return { success: true, room, player: newPlayer };
  }

  addBot(code) {
    const room = this.getRoom(code);
    if (!room || room.status !== 'lobby') return { success: false, error: 'Nelze přidat bota.' };
    if (room.players.length >= 20) return { success: false, error: 'Místnost dosáhla limitu.' };

    const botNames = [
      'Karel (Bot)', 'Božena (Bot)', 'Jarda (Bot)', 'Alena (Bot)',
      'František (Bot)', 'Vlasta (Bot)', 'Zdeněk (Bot)', 'Eva (Bot)',
      'Miloš (Bot)', 'Ludmila (Bot)', 'Pavel (Bot)', 'Hana (Bot)'
    ];
    const usedNames = new Set(room.players.map(p => p.name));
    const availableName = botNames.find(n => !usedNames.has(n)) || `Bot ${room.players.length + 1}`;

    const botPlayer = {
      id: `bot_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      name: availableName,
      isBot: true,
      isHost: false,
      connected: true,
      hand: [],
      hasOpened: false,
      openedThisTurn: false,
      turnsCount: 0,
      lastDrawnCardId: null,
      leftGame: false,
      hasPesek: false,
      totalScore: 0,
      roundScore: 0
    };

    room.players.push(botPlayer);
    this.addLog(room, `${botPlayer.name} byl přidán do hry.`);
    return { success: true, room, botPlayer };
  }

  removePlayer(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false };

    const idx = room.players.findIndex(p => p.id === playerId);
    if (idx === -1) return { success: false };

    const removed = room.players[idx];
    room.players.splice(idx, 1);
    this.addLog(room, `${removed.name} opustil(a) místnost.`);

    if (room.players.length === 0) {
      this.clearBotTimeout(code);
      this.rooms.delete(code);
      return { success: true, roomDeleted: true };
    }

    // Pass host if needed
    if (removed.isHost && room.players.length > 0) {
      const nextHuman = room.players.find(p => !p.isBot) || room.players[0];
      nextHuman.isHost = true;
      room.hostId = nextHuman.id;
    }

    // If game in progress and removed player was on turn
    if (room.status === 'playing' && room.gameState) {
      if (room.gameState.currentTurnPlayerIndex >= room.players.length) {
        room.gameState.currentTurnPlayerIndex = 0;
      }
      this.checkAndTriggerBot(room);
    }

    return { success: true, room };
  }

  kickPlayer(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může vyhazovat hráče.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.isHost) return { success: false, error: 'Hostitele nelze vyhodit.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `${host.name} odebral(a) hráče ${target.name} z místnosti.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // In active game: convert to bot so game doesn't break
    target.isBot = true;
    target.leftGame = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (Bot)`;
    target.connected = false;
    this.addLog(room, `❌ ${host.name} vyřadil(a) hráče ${target.originalName}. Karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }
    return { success: true, room, target, action: 'botified' };
  }

  givePesek(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může dát Peška.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.id === hostId) return { success: false, error: 'Nemůžete dát Peška sami sobě.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.name}! Hráč byl odebrán.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // Active game: mark with Pešek and turn into Bot
    target.isBot = true;
    target.leftGame = true;
    target.hasPesek = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (🪵 Pešek)`;
    target.connected = false;

    this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.originalName}! Hráč byl vyřazen ze hry, karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room, target, action: 'pesek' };
  }

  leaveGame(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const player = room.players[playerIdx];

    if (room.status === 'lobby') {
      return this.removePlayer(code, playerId);
    }

    // Active game: convert player into Bot
    player.isBot = true;
    player.leftGame = true;
    player.originalName = player.originalName || player.name;
    player.name = `${player.originalName} (Bot)`;
    player.connected = false;

    this.addLog(room, `🚪 ${player.originalName} opustil(a) hru. Karty a tahy za něj převzal Bot.`);

    // If host left, transfer host role
    if (player.isHost) {
      player.isHost = false;
      const nextHost = room.players.find(p => !p.leftGame && !p.isBot) || room.players.find(p => !p.leftGame);
      if (nextHost) {
        nextHost.isHost = true;
        room.hostId = nextHost.id;
        this.addLog(room, `Novým hostitelem stolu se stává ${nextHost.name}.`);
      }
    }

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === playerIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room };
  }

  updateSettings(code, hostId, newSettings) {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId || room.status !== 'lobby') {
      return { success: false, error: 'Pouze hostitel může upravovat pravidla v lobby.' };
    }

    room.settings = {
      ...room.settings,
      ...newSettings
    };
    return { success: true, room };
  }



  kickPlayer(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může vyhazovat hráče.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.isHost) return { success: false, error: 'Hostitele nelze vyhodit.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `${host.name} odebral(a) hráče ${target.name} z místnosti.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // In active game: convert to bot so game doesn't break
    target.isBot = true;
    target.leftGame = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (Bot)`;
    target.connected = false;
    this.addLog(room, `❌ ${host.name} vyřadil(a) hráče ${target.originalName}. Karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }
    return { success: true, room, target, action: 'botified' };
  }

  givePesek(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může dát Peška.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.id === hostId) return { success: false, error: 'Nemůžete dát Peška sami sobě.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.name}! Hráč byl odebrán.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // Active game: mark with Pešek and turn into Bot
    target.isBot = true;
    target.leftGame = true;
    target.hasPesek = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (🪵 Pešek)`;
    target.connected = false;

    this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.originalName}! Hráč byl vyřazen ze hry, karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room, target, action: 'pesek' };
  }

  leaveGame(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const player = room.players[playerIdx];

    if (room.status === 'lobby') {
      return this.removePlayer(code, playerId);
    }

    // Active game: convert player into Bot
    player.isBot = true;
    player.leftGame = true;
    player.originalName = player.originalName || player.name;
    player.name = `${player.originalName} (Bot)`;
    player.connected = false;

    this.addLog(room, `🚪 ${player.originalName} opustil(a) hru. Karty a tahy za něj převzal Bot.`);

    // If host left, transfer host role
    if (player.isHost) {
      player.isHost = false;
      const nextHost = room.players.find(p => !p.leftGame && !p.isBot) || room.players.find(p => !p.leftGame);
      if (nextHost) {
        nextHost.isHost = true;
        room.hostId = nextHost.id;
        this.addLog(room, `Novým hostitelem stolu se stává ${nextHost.name}.`);
      }
    }

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === playerIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room };
  }

  startGame(code, hostId) {
    const room = this.getRoom(code);
    if (!room || room.hostId !== hostId) {
      return { success: false, error: 'Pouze hostitel může spustit hru.' };
    }
    if (room.players.length < 2) {
      return { success: false, error: 'Ke hře jsou potřeba alespoň 2 hráči. Můžete přidat bota!' };
    }

    // Start new round
    return this.startNewRound(room);
  }

  startNewRound(roomOrCode) {
    const room = typeof roomOrCode === 'string' ? this.getRoom(roomOrCode) : roomOrCode;
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    this.clearBotTimeout(room.code);

    let totalKeptJokers = 0;
    room.players.forEach(p => {
      const pKept = p.keptJokers || (p.keptJoker ? [p.keptJoker] : []);
      totalKeptJokers += pKept.length;
    });

    // In Czech Žolíky, strictly 2 decks (108 cards: 2x 52 cards + 4 Jokers) for up to 8 players!
    const deckPairs = room.players.length > 8 ? Math.max(1, Math.ceil(room.players.length / 6)) : 1;
    const defaultJokers = deckPairs * 4;
    const jokersToSpawn = Math.max(0, defaultJokers - totalKeptJokers);
    const deck = shuffle(createDeck({ playerCount: room.players.length, jokerCount: jokersToSpawn }));
    const cardsPerPlayer = room.settings.cardsPerPlayer || 12;

    // Reset player states for new round, carrying over any kept jokers
    room.players.forEach(p => {
      const pKept = p.keptJokers || (p.keptJoker ? [p.keptJoker] : []);
      if (pKept.length > 0) {
        p.hand = pKept.map((j, idx) => ({
          id: j.id || `kept_joker_${p.id}_${idx}_${Date.now()}`,
          deckNum: j.deckNum || 1,
          suit: null,
          rank: 'JOKER',
          isJoker: true,
          representedSuit: null,
          representedRank: null
        }));
        p.keptJoker = null;
        p.keptJokers = null;
      } else {
        p.hand = [];
        p.keptJoker = null;
        p.keptJokers = null;
      }
      p.hasOpened = false;
      p.openedThisTurn = false;
      p.roundScore = 0;
      p.turnsCount = 0;
      p.lastDrawnCardId = null;
      p.hasPesek = false;
    });

    // Deal cards until each player has cardsPerPlayer
    for (let c = 0; c < cardsPerPlayer; c++) {
      for (const p of room.players) {
        if (p.hand.length < cardsPerPlayer) {
          p.hand.push(deck.pop());
        }
      }
    }

    // First card on discard pile
    const discardPile = [deck.pop()];
    const talon = deck;

    room.status = 'playing';
    room.gameState = {
      roundNumber: (room.gameState?.roundNumber || 0) + 1,
      talon,
      discardPile,
      tableMelds: [],
      currentTurnPlayerIndex: 0,
      turnPhase: 'draw', // 'draw' | 'play_or_discard'
      drawnFromDiscardCard: null,
      roundWinner: null,
      isHandRummy: false,
      turnStartTime: Date.now()
    };

    const firstPlayer = room.players[0];
    this.addLog(room, `Začalo ${room.gameState.roundNumber}. kolo! Na tahu je ${firstPlayer.name}.`);

    this.checkAndTriggerBot(room);
    return { success: true, room };
  }



  kickPlayer(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může vyhazovat hráče.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.isHost) return { success: false, error: 'Hostitele nelze vyhodit.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `${host.name} odebral(a) hráče ${target.name} z místnosti.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // In active game: convert to bot so game doesn't break
    target.isBot = true;
    target.leftGame = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (Bot)`;
    target.connected = false;
    this.addLog(room, `❌ ${host.name} vyřadil(a) hráče ${target.originalName}. Karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }
    return { success: true, room, target, action: 'botified' };
  }

  givePesek(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může dát Peška.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.id === hostId) return { success: false, error: 'Nemůžete dát Peška sami sobě.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.name}! Hráč byl odebrán.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // Active game: mark with Pešek and turn into Bot
    target.isBot = true;
    target.leftGame = true;
    target.hasPesek = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (🪵 Pešek)`;
    target.connected = false;

    this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.originalName}! Hráč byl vyřazen ze hry, karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room, target, action: 'pesek' };
  }

  leaveGame(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const player = room.players[playerIdx];

    if (room.status === 'lobby') {
      return this.removePlayer(code, playerId);
    }

    // Active game: convert player into Bot
    player.isBot = true;
    player.leftGame = true;
    player.originalName = player.originalName || player.name;
    player.name = `${player.originalName} (Bot)`;
    player.connected = false;

    this.addLog(room, `🚪 ${player.originalName} opustil(a) hru. Karty a tahy za něj převzal Bot.`);

    // If host left, transfer host role
    if (player.isHost) {
      player.isHost = false;
      const nextHost = room.players.find(p => !p.leftGame && !p.isBot) || room.players.find(p => !p.leftGame);
      if (nextHost) {
        nextHost.isHost = true;
        room.hostId = nextHost.id;
        this.addLog(room, `Novým hostitelem stolu se stává ${nextHost.name}.`);
      }
    }

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === playerIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room };
  }

  drawCard(code, playerId, source) {
    const room = this.getRoom(code);
    if (!room || room.status !== 'playing') return { success: false, error: 'Hra neprobíhá.' };

    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (currentPlayer.id !== playerId) return { success: false, error: 'Nejste na tahu.' };

    if (room.gameState.turnPhase !== 'draw') {
      return { success: false, error: 'V tomto tahu jste si již kartu dobrali.' };
    }

    let drawnCard = null;

    if (source === 'talon') {
      if (room.gameState.talon.length === 0) {
        // Reshuffle discard pile (except top card)
        if (room.gameState.discardPile.length <= 1) {
          return { success: false, error: 'V balíčku již nejsou žádné karty.' };
        }
        const topCard = room.gameState.discardPile.pop();
        room.gameState.talon = shuffle(room.gameState.discardPile);
        room.gameState.discardPile = [topCard];
        this.addLog(room, 'Dobírací balíček byl znovu zamíchán z odhozených karet.');
      }
      drawnCard = room.gameState.talon.pop();
      room.gameState.drawnFromDiscardCard = null;
      this.addLog(room, `${currentPlayer.name} si dobral(a) kartu z talónu.`);
    } else if (source === 'discard') {
      const turnsPlayed = currentPlayer.turnsCount || 0;
      if (turnsPlayed < 3) {
        return {
          success: false,
          error: `Kartu odhozenou soupeřem lze brát až po 3. kole! (Váš odehraný počet kol: ${turnsPlayed} z 3).`
        };
      }
      if (room.gameState.discardPile.length === 0) {
        return { success: false, error: 'Odhazovací balíček je prázdný.' };
      }
      drawnCard = room.gameState.discardPile.pop();
      room.gameState.drawnFromDiscardCard = drawnCard;
      this.addLog(room, `${currentPlayer.name} si vzal(a) kartu z odhazovacího balíčku.`);
    } else {
      return { success: false, error: 'Neplatný zdroj pro dobrání karty.' };
    }

    currentPlayer.hand.push(drawnCard);
    currentPlayer.lastDrawnCardId = drawnCard.id;
    room.gameState.turnPhase = 'play_or_discard';

    return { success: true, room, drawnCard };
  }

  returnDiscardCard(code, playerId) {
    const room = this.getRoom(code);
    if (!room || room.status !== 'playing') return { success: false, error: 'Hra neprobíhá.' };

    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (currentPlayer.id !== playerId) return { success: false, error: 'Nejste na tahu.' };

    if (room.gameState.turnPhase !== 'play_or_discard') {
      return { success: false, error: 'Nejste ve fázi po dobrání karty.' };
    }

    const drawnCard = room.gameState.drawnFromDiscardCard;
    if (!drawnCard) {
      return { success: false, error: 'V tomto tahu jste si kartu z odhozu nevzali.' };
    }

    const cardIndex = currentPlayer.hand.findIndex(c => c.id === drawnCard.id);
    if (cardIndex === -1) {
      return { success: false, error: 'Kartu z odhozu jste již použili, nelze ji vrátit.' };
    }

    // Return discard card to top of discard pile
    currentPlayer.hand.splice(cardIndex, 1);
    room.gameState.discardPile.push(drawnCard);

    // Draw card from talon instead
    if (room.gameState.talon.length === 0) {
      if (room.gameState.discardPile.length <= 1) {
        return { success: false, error: 'V balíčku již nejsou žádné další karty.' };
      }
      const topDiscard = room.gameState.discardPile.pop();
      room.gameState.talon = shuffle(room.gameState.discardPile);
      room.gameState.discardPile = [topDiscard];
      this.addLog(room, 'Dobírací balíček byl znovu zamíchán z odhozených karet.');
    }

    const newCard = room.gameState.talon.pop();
    currentPlayer.hand.push(newCard);
    currentPlayer.lastDrawnCardId = newCard.id;
    room.gameState.drawnFromDiscardCard = null;

    this.addLog(room, `${currentPlayer.name} vrátil(a) kartu do odhozu a vzal(a) si kartu z talónu.`);
    return { success: true, room, newCard };
  }

  meldCards(code, playerId, meldsCards) {
    const room = this.getRoom(code);
    if (!room || room.status !== 'playing') return { success: false, error: 'Hra neprobíhá.' };

    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (currentPlayer.id !== playerId) return { success: false, error: 'Nejste na tahu.' };

    if (room.gameState.turnPhase !== 'play_or_discard') {
      return { success: false, error: 'Nejprve si musíte dobrat kartu.' };
    }

    if (!meldsCards || meldsCards.length === 0) {
      return { success: false, error: 'Nevybrali jste žádnou kombinaci karet.' };
    }

    // Verify each card is used at most once across all submitted melds
    const allMeldCardIds = meldsCards.flatMap(m => m.map(c => c.id));
    if (new Set(allMeldCardIds).size !== allMeldCardIds.length) {
      return { success: false, error: 'Karta nemůže být použita ve více kombinacích současně.' };
    }

    // Verify all cards exist in player's hand
    const playerHandMap = new Map(currentPlayer.hand.map(c => [c.id, c]));
    for (const meld of meldsCards) {
      for (const card of meld) {
        if (!playerHandMap.has(card.id)) {
          return { success: false, error: 'Nemáte vybrané karty ve své ruce.' };
        }
      }
    }

    // Must keep at least 1 card in hand to discard to close/end turn!
    const totalCardsToMeld = meldsCards.reduce((acc, m) => acc + m.length, 0);
    if (currentPlayer.hand.length - totalCardsToMeld < 1) {
      return {
        success: false,
        error: 'Nelze vyložit všechny karty z ruky! V ruce vám musí zůstat alespoň 1 karta na závěrečné odhození pro ukončení tahu / zavření.'
      };
    }

    // If player hasn't opened yet: check turn restrictions and opening requirements
    if (!currentPlayer.hasOpened) {
      const minTurns = room.settings.minTurnsToMeld ?? 3;
      const turnsPlayed = currentPlayer.turnsCount || 0;
      const requiredTurns = minTurns === 4 ? 3 : (minTurns === 3 ? 2 : 0);
      if (turnsPlayed < requiredTurns) {
        return {
          success: false,
          error: `Vykládat karty je povoleno až po 3. kole! (Váš odehraný počet kol: ${turnsPlayed} z ${requiredTurns}).`
        };
      }

      const openVal = validateOpeningMelds(meldsCards, room.settings);
      if (!openVal.valid) {
        return { success: false, error: openVal.error };
      }

      // Check rule: if drawn from discard without having opened, discard card MUST be used in opening
      if (room.gameState.drawnFromDiscardCard) {
        const discardId = room.gameState.drawnFromDiscardCard.id;
        const usedDiscard = meldsCards.some(m => m.some(c => c.id === discardId));
        if (!usedDiscard) {
          return {
            success: false,
            error: 'Když si vezmete kartu z odhozu před prvním vyložením, musíte ji v tomto tahu použít k vyložení!'
          };
        }
      }

      // Execute opening
      for (const validatedMeld of openVal.validatedMelds) {
        const meldId = `meld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        room.gameState.tableMelds.push({
          id: meldId,
          type: validatedMeld.type,
          cards: validatedMeld.cards,
          rank: validatedMeld.rank || null,
          suit: validatedMeld.suit || null,
          ownerId: currentPlayer.id,
          ownerName: currentPlayer.name
        });
      }

      // Remove cards from player hand
      const usedCardIds = new Set(meldsCards.flatMap(m => m.map(c => c.id)));
      currentPlayer.hand = currentPlayer.hand.filter(c => !usedCardIds.has(c.id));
      currentPlayer.hasOpened = true;
      currentPlayer.openedThisTurn = true;

      this.addLog(room, `${currentPlayer.name} se poprvé vyložil(a) se ${openVal.totalPoints} body! 🎉`);
      return { success: true, room };
    }

    // If already opened: validate each meld independently
    const validatedNewMelds = [];
    for (let i = 0; i < meldsCards.length; i++) {
      const val = validateSingleMeld(meldsCards[i]);
      if (!val.valid) {
        return { success: false, error: `Kombinace #${i + 1} není platná: ${val.error}` };
      }
      validatedNewMelds.push(val);
    }

    for (const vm of validatedNewMelds) {
      const meldId = `meld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      room.gameState.tableMelds.push({
        id: meldId,
        type: vm.type,
        cards: vm.cards,
        rank: vm.rank || null,
        suit: vm.suit || null,
        ownerId: currentPlayer.id,
        ownerName: currentPlayer.name
      });
    }

    const usedCardIds = new Set(meldsCards.flatMap(m => m.map(c => c.id)));
    currentPlayer.hand = currentPlayer.hand.filter(c => !usedCardIds.has(c.id));

    this.addLog(room, `${currentPlayer.name} vyložil(a) novou kombinaci.`);
    return { success: true, room };
  }



  kickPlayer(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může vyhazovat hráče.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.isHost) return { success: false, error: 'Hostitele nelze vyhodit.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `${host.name} odebral(a) hráče ${target.name} z místnosti.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // In active game: convert to bot so game doesn't break
    target.isBot = true;
    target.leftGame = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (Bot)`;
    target.connected = false;
    this.addLog(room, `❌ ${host.name} vyřadil(a) hráče ${target.originalName}. Karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }
    return { success: true, room, target, action: 'botified' };
  }

  givePesek(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může dát Peška.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.id === hostId) return { success: false, error: 'Nemůžete dát Peška sami sobě.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.name}! Hráč byl odebrán.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // Active game: mark with Pešek and turn into Bot
    target.isBot = true;
    target.leftGame = true;
    target.hasPesek = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (🪵 Pešek)`;
    target.connected = false;

    this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.originalName}! Hráč byl vyřazen ze hry, karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room, target, action: 'pesek' };
  }

  leaveGame(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const player = room.players[playerIdx];

    if (room.status === 'lobby') {
      return this.removePlayer(code, playerId);
    }

    // Active game: convert player into Bot
    player.isBot = true;
    player.leftGame = true;
    player.originalName = player.originalName || player.name;
    player.name = `${player.originalName} (Bot)`;
    player.connected = false;

    this.addLog(room, `🚪 ${player.originalName} opustil(a) hru. Karty a tahy za něj převzal Bot.`);

    // If host left, transfer host role
    if (player.isHost) {
      player.isHost = false;
      const nextHost = room.players.find(p => !p.leftGame && !p.isBot) || room.players.find(p => !p.leftGame);
      if (nextHost) {
        nextHost.isHost = true;
        room.hostId = nextHost.id;
        this.addLog(room, `Novým hostitelem stolu se stává ${nextHost.name}.`);
      }
    }

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === playerIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room };
  }

  layOff(code, playerId, tableMeldId, cards) {
    const room = this.getRoom(code);
    if (!room || room.status !== 'playing') return { success: false, error: 'Hra neprobíhá.' };

    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (currentPlayer.id !== playerId) return { success: false, error: 'Nejste na tahu.' };

    if (!currentPlayer.hasOpened) {
      return { success: false, error: 'Přikládat ke kombinacím můžete až po svém prvním vyložení.' };
    }

    if (room.gameState.turnPhase !== 'play_or_discard') {
      return { success: false, error: 'Nejprve si musíte dobrat kartu.' };
    }

    const targetMeld = room.gameState.tableMelds.find(m => m.id === tableMeldId);
    if (!targetMeld) {
      return { success: false, error: 'Vybraná kombinace na stole nebyla nalezena.' };
    }

    // Check hand contains cards
    const handIds = new Set(currentPlayer.hand.map(c => c.id));
    for (const c of cards) {
      if (!handIds.has(c.id)) {
        return { success: false, error: 'Nemáte tuto kartu ve své ruce.' };
      }
    }

    // Must keep at least 1 card in hand to discard to close/end turn!
    if (currentPlayer.hand.length - cards.length < 1) {
      return {
        success: false,
        error: 'Nelze přiložit všechny zbývající karty! V ruce vám musí zůstat alespoň 1 karta na závěrečné odhození pro ukončení tahu / zavření.'
      };
    }

    // If player is attempting to lay off 1 card that can swap a Joker in this meld,
    // automatically execute swapJoker so the player gets the Joker in hand!
    if (cards.length === 1) {
      const swappableJoker = targetMeld.cards.find(c => c.isJoker && canSwapJoker(targetMeld, cards[0], c.id).valid);
      if (swappableJoker) {
        return this.swapJoker(code, playerId, targetMeld.id, swappableJoker.id, cards[0].id);
      }
    }

    const check = canLayOff(targetMeld, cards);
    if (!check.valid) {
      return { success: false, error: check.error || 'Tuto kartu nelze k vybrané kombinaci přiložit.' };
    }

    // Update table meld
    targetMeld.cards = check.cards;
    if (check.suit) targetMeld.suit = check.suit;
    if (check.rank) targetMeld.rank = check.rank;

    // Remove from player hand
    const laidIds = new Set(cards.map(c => c.id));
    currentPlayer.hand = currentPlayer.hand.filter(c => !laidIds.has(c.id));

    this.addLog(room, `${currentPlayer.name} přiložil(a) ${cards.length} kartu/karet ke kombinaci.`);
    return { success: true, room };
  }



  kickPlayer(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může vyhazovat hráče.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.isHost) return { success: false, error: 'Hostitele nelze vyhodit.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `${host.name} odebral(a) hráče ${target.name} z místnosti.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // In active game: convert to bot so game doesn't break
    target.isBot = true;
    target.leftGame = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (Bot)`;
    target.connected = false;
    this.addLog(room, `❌ ${host.name} vyřadil(a) hráče ${target.originalName}. Karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }
    return { success: true, room, target, action: 'botified' };
  }

  givePesek(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může dát Peška.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.id === hostId) return { success: false, error: 'Nemůžete dát Peška sami sobě.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.name}! Hráč byl odebrán.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // Active game: mark with Pešek and turn into Bot
    target.isBot = true;
    target.leftGame = true;
    target.hasPesek = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (🪵 Pešek)`;
    target.connected = false;

    this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.originalName}! Hráč byl vyřazen ze hry, karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room, target, action: 'pesek' };
  }

  leaveGame(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const player = room.players[playerIdx];

    if (room.status === 'lobby') {
      return this.removePlayer(code, playerId);
    }

    // Active game: convert player into Bot
    player.isBot = true;
    player.leftGame = true;
    player.originalName = player.originalName || player.name;
    player.name = `${player.originalName} (Bot)`;
    player.connected = false;

    this.addLog(room, `🚪 ${player.originalName} opustil(a) hru. Karty a tahy za něj převzal Bot.`);

    // If host left, transfer host role
    if (player.isHost) {
      player.isHost = false;
      const nextHost = room.players.find(p => !p.leftGame && !p.isBot) || room.players.find(p => !p.leftGame);
      if (nextHost) {
        nextHost.isHost = true;
        room.hostId = nextHost.id;
        this.addLog(room, `Novým hostitelem stolu se stává ${nextHost.name}.`);
      }
    }

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === playerIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room };
  }

  swapJoker(code, playerId, tableMeldId, jokerId, handCardId) {
    const room = this.getRoom(code);
    if (!room || room.status !== 'playing') return { success: false, error: 'Hra neprobíhá.' };

    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (currentPlayer.id !== playerId) return { success: false, error: 'Nejste na tahu.' };

    if (!currentPlayer.hasOpened) {
      return { success: false, error: 'Vyměňovat žolíky můžete až po svém prvním vyložení.' };
    }

    const targetMeld = room.gameState.tableMelds.find(m => m.id === tableMeldId);
    if (!targetMeld) return { success: false, error: 'Kombinace nebyla nalezena.' };

    const handCard = currentPlayer.hand.find(c => c.id === handCardId);
    if (!handCard) return { success: false, error: 'Nemáte tuto kartu v ruce.' };

    const check = canSwapJoker(targetMeld, handCard, jokerId);
    if (!check.valid) {
      return { success: false, error: check.error };
    }

    // Perform swap: handCard replaces joker in meld, joker enters player's hand
    const jokerIndex = targetMeld.cards.findIndex(c => c.id === jokerId);
    const targetJoker = targetMeld.cards[jokerIndex];

    targetMeld.cards[jokerIndex] = {
      ...handCard,
      orderVal: targetJoker.orderVal || undefined
    };

    // Remove natural card from hand, add cleaned Joker to hand
    currentPlayer.hand = currentPlayer.hand.filter(c => c.id !== handCardId);
    currentPlayer.hand.push({
      id: targetJoker.id,
      deckNum: targetJoker.deckNum,
      suit: null,
      rank: 'JOKER',
      isJoker: true,
      representedSuit: null,
      representedRank: null
    });

    this.addLog(room, `${currentPlayer.name} vyměnil(a) kartu za žolíka ze stolu! 🃏`);
    return { success: true, room };
  }



  kickPlayer(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může vyhazovat hráče.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.isHost) return { success: false, error: 'Hostitele nelze vyhodit.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `${host.name} odebral(a) hráče ${target.name} z místnosti.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // In active game: convert to bot so game doesn't break
    target.isBot = true;
    target.leftGame = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (Bot)`;
    target.connected = false;
    this.addLog(room, `❌ ${host.name} vyřadil(a) hráče ${target.originalName}. Karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }
    return { success: true, room, target, action: 'botified' };
  }

  givePesek(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může dát Peška.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.id === hostId) return { success: false, error: 'Nemůžete dát Peška sami sobě.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.name}! Hráč byl odebrán.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // Active game: mark with Pešek and turn into Bot
    target.isBot = true;
    target.leftGame = true;
    target.hasPesek = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (🪵 Pešek)`;
    target.connected = false;

    this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.originalName}! Hráč byl vyřazen ze hry, karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room, target, action: 'pesek' };
  }

  leaveGame(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const player = room.players[playerIdx];

    if (room.status === 'lobby') {
      return this.removePlayer(code, playerId);
    }

    // Active game: convert player into Bot
    player.isBot = true;
    player.leftGame = true;
    player.originalName = player.originalName || player.name;
    player.name = `${player.originalName} (Bot)`;
    player.connected = false;

    this.addLog(room, `🚪 ${player.originalName} opustil(a) hru. Karty a tahy za něj převzal Bot.`);

    // If host left, transfer host role
    if (player.isHost) {
      player.isHost = false;
      const nextHost = room.players.find(p => !p.leftGame && !p.isBot) || room.players.find(p => !p.leftGame);
      if (nextHost) {
        nextHost.isHost = true;
        room.hostId = nextHost.id;
        this.addLog(room, `Novým hostitelem stolu se stává ${nextHost.name}.`);
      }
    }

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === playerIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room };
  }

  discardCard(code, playerId, cardId) {
    const room = this.getRoom(code);
    if (!room || room.status !== 'playing') return { success: false, error: 'Hra neprobíhá.' };

    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (currentPlayer.id !== playerId) return { success: false, error: 'Nejste na tahu.' };

    if (room.gameState.turnPhase !== 'play_or_discard') {
      return { success: false, error: 'Nejprve si musíte dobrat kartu z balíčku.' };
    }

    // Rule: If card was drawn from discard, it MUST be used in this turn (cannot remain in hand)!
    if (room.gameState.drawnFromDiscardCard) {
      const discardId = room.gameState.drawnFromDiscardCard.id;
      const isStillInHand = currentPlayer.hand.some(c => c.id === discardId);
      if (isStillInHand) {
        return {
          success: false,
          error: 'Kartu z odhozu musíte v tomto tahu ihned použít k vyložení nebo přiložení! Pokud ji použít nemůžete, klikněte na "Vrátit kartu do odhozu a dobrat z talónu".'
        };
      }
    }

    const cardIndex = currentPlayer.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) {
      return { success: false, error: 'Nemáte tuto kartu v ruce.' };
    }

    const discardedCard = currentPlayer.hand[cardIndex];

    // Check Win Condition with Kept Jokers:
    // If player has opened (or opened this turn), and ALL remaining cards in hand after discard are Jokers (1, 2, 3, etc.):
    // And rule keepJokerOnWin is enabled (default true)
    const allowKeepJoker = room.settings.keepJokerOnWin !== false;
    const remainingCards = currentPlayer.hand.filter((_, idx) => idx !== cardIndex);
    const hasOnlyJokersLeft = remainingCards.length > 0 && remainingCards.every(c => c.isJoker);
    const isWinWithKeptJokers = allowKeepJoker && currentPlayer.hasOpened && hasOnlyJokersLeft;

    currentPlayer.hand.splice(cardIndex, 1);
    room.gameState.discardPile.push(discardedCard);
    currentPlayer.turnsCount = (currentPlayer.turnsCount || 0) + 1;
    currentPlayer.lastDrawnCardId = null;

    this.addLog(room, `${currentPlayer.name} odhodil(a) kartu a ukončil(a) tah.`);

    // Check Win Condition 1: player's hand is empty (0 cards)!
    if (currentPlayer.hand.length === 0) {
      return this.handlePlayerWin(room, currentPlayer, []);
    }

    // Check Win Condition 2: all remaining cards in hand are Jokers!
    if (isWinWithKeptJokers && currentPlayer.hand.length > 0 && currentPlayer.hand.every(c => c.isJoker)) {
      const keptJokers = [...currentPlayer.hand];
      currentPlayer.keptJokers = keptJokers;
      currentPlayer.keptJoker = keptJokers[0]; // backward compatibility
      return this.handlePlayerWin(room, currentPlayer, keptJokers);
    }

    // Move to next player
    this.advanceToNextTurn(room);
    return { success: true, room };
  }



  kickPlayer(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může vyhazovat hráče.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.isHost) return { success: false, error: 'Hostitele nelze vyhodit.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `${host.name} odebral(a) hráče ${target.name} z místnosti.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // In active game: convert to bot so game doesn't break
    target.isBot = true;
    target.leftGame = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (Bot)`;
    target.connected = false;
    this.addLog(room, `❌ ${host.name} vyřadil(a) hráče ${target.originalName}. Karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }
    return { success: true, room, target, action: 'botified' };
  }

  givePesek(code, hostId, targetPlayerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const host = room.players.find(p => p.id === hostId);
    if (!host || !host.isHost) {
      return { success: false, error: 'Pouze hostitel může dát Peška.' };
    }

    const targetIdx = room.players.findIndex(p => p.id === targetPlayerId);
    if (targetIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const target = room.players[targetIdx];
    if (target.id === hostId) return { success: false, error: 'Nemůžete dát Peška sami sobě.' };

    if (room.status === 'lobby') {
      room.players.splice(targetIdx, 1);
      this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.name}! Hráč byl odebrán.`);
      return { success: true, room, target, action: 'kicked' };
    }

    // Active game: mark with Pešek and turn into Bot
    target.isBot = true;
    target.leftGame = true;
    target.hasPesek = true;
    target.originalName = target.originalName || target.name;
    target.name = `${target.originalName} (🪵 Pešek)`;
    target.connected = false;

    this.addLog(room, `🪵 ${host.name} dal Peška hráči ${target.originalName}! Hráč byl vyřazen ze hry, karty převzal Bot.`);

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === targetIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room, target, action: 'pesek' };
  }

  leaveGame(code, playerId) {
    const room = this.getRoom(code);
    if (!room) return { success: false, error: 'Místnost neexistuje.' };

    const playerIdx = room.players.findIndex(p => p.id === playerId);
    if (playerIdx === -1) return { success: false, error: 'Hráč nebyl nalezen.' };

    const player = room.players[playerIdx];

    if (room.status === 'lobby') {
      return this.removePlayer(code, playerId);
    }

    // Active game: convert player into Bot
    player.isBot = true;
    player.leftGame = true;
    player.originalName = player.originalName || player.name;
    player.name = `${player.originalName} (Bot)`;
    player.connected = false;

    this.addLog(room, `🚪 ${player.originalName} opustil(a) hru. Karty a tahy za něj převzal Bot.`);

    // If host left, transfer host role
    if (player.isHost) {
      player.isHost = false;
      const nextHost = room.players.find(p => !p.leftGame && !p.isBot) || room.players.find(p => !p.leftGame);
      if (nextHost) {
        nextHost.isHost = true;
        room.hostId = nextHost.id;
        this.addLog(room, `Novým hostitelem stolu se stává ${nextHost.name}.`);
      }
    }

    if (room.status === 'playing' && room.gameState?.currentTurnPlayerIndex === playerIdx) {
      this.checkAndTriggerBot(room);
    }

    return { success: true, room };
  }

  handlePlayerWin(room, winner, keptJokers = []) {
    const isHandRummy = winner.openedThisTurn && room.gameState.tableMelds.length > 0;
    room.status = 'round_ended';
    room.gameState.roundWinner = winner;
    room.gameState.isHandRummy = isHandRummy;

    const keptCount = Array.isArray(keptJokers) ? keptJokers.length : (keptJokers ? 1 : 0);
    room.gameState.hasKeptJoker = keptCount > 0;
    room.gameState.keptJokersCount = keptCount;

    const penaltyMultiplier = isHandRummy ? 2 : 1;

    // Calculate penalty points
    room.players.forEach(p => {
      if (p.id === winner.id) {
        p.roundScore = 0;
      } else {
        const rawPenalty = calculateHandPenalty(p.hand);
        p.roundScore = rawPenalty * penaltyMultiplier;
        p.totalScore += p.roundScore;
      }
    });

    if (keptCount > 0) {
      const jokerText = keptCount === 1 ? 'ŽOLÍKA' : (keptCount < 5 ? `${keptCount} ŽOLÍKY` : `${keptCount} ŽOLÍKŮ`);
      this.addLog(room, `🏆 ${winner.name} ZAVŘEL(A) KOLO a nechává si ${jokerText} do dalšího kola! 🃏✨`);
    } else if (isHandRummy) {
      this.addLog(room, `🏆 ${winner.name} ZAVŘEL(A) Z RUKY! Dvojité trestné body pro ostatní! 🌟`);
    } else {
      this.addLog(room, `🎉 ${winner.name} vyhrál(a) toto kolo!`);
    }

    return { success: true, room, roundEnded: true };
  }

  advanceToNextTurn(room) {
    let nextIndex = (room.gameState.currentTurnPlayerIndex + 1) % room.players.length;
    room.gameState.currentTurnPlayerIndex = nextIndex;
    room.gameState.turnPhase = 'draw';
    room.gameState.drawnFromDiscardCard = null;
    room.gameState.turnStartTime = Date.now();

    const nextPlayer = room.players[nextIndex];
    nextPlayer.openedThisTurn = false;
    this.addLog(room, `Na tahu je ${nextPlayer.name}.`);

    this.checkAndTriggerBot(room);
  }

  checkAndTriggerBot(room) {
    if (room.status !== 'playing' || !room.gameState) return;

    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (!currentPlayer || !currentPlayer.isBot) return;

    // Realistic bot delay: 1.2s before drawing, then 1.4s before playing/discarding
    this.setBotTimeout(room.code, () => {
      this.executeBotTurn(room, currentPlayer);
    }, 1200);
  }

  executeBotTurn(room, botPlayer) {
    if (room.status !== 'playing' || !room.gameState) return;
    const currentPlayer = room.players[room.gameState.currentTurnPlayerIndex];
    if (!currentPlayer || currentPlayer.id !== botPlayer.id) return;

    // Step 1: Decide and execute draw
    const { drawChoice } = decideBotTurn(botPlayer, room.gameState, room.settings);
    this.drawCard(room.code, botPlayer.id, drawChoice);
    this.broadcastRoom(room);

    // Step 2: Melds, lay-offs, joker swaps, and discard after brief pause
    this.setBotTimeout(room.code, () => {
      if (room.status !== 'playing' || !room.gameState) return;

      const { meldsToPlay, layOffsToPlay, jokerSwapsToPlay, discardCard } =
        decideBotPlayAndDiscard(botPlayer, room.gameState, room.settings);

      // Play Joker swaps first
      for (const js of jokerSwapsToPlay) {
        this.swapJoker(room.code, botPlayer.id, js.tableMeldId, js.jokerId, js.handCardId);
      }

      // Play Melds
      if (meldsToPlay.length > 0) {
        this.meldCards(room.code, botPlayer.id, meldsToPlay);
      }

      // Play Lay-offs
      for (const lo of layOffsToPlay) {
        this.layOff(room.code, botPlayer.id, lo.tableMeldId, lo.cards);
      }

      this.broadcastRoom(room);

      // Step 3: Discard
      this.setBotTimeout(room.code, () => {
        if (room.status !== 'playing' || !room.gameState) return;

        let cardToDiscard = discardCard;
        if (!cardToDiscard && botPlayer.hand.length > 0) {
          cardToDiscard = botPlayer.hand[0];
        }

        if (cardToDiscard) {
          this.discardCard(room.code, botPlayer.id, cardToDiscard.id);
        }
        this.broadcastRoom(room);
      }, 1000);
    }, 1200);
  }

  addLog(room, message) {
    if (!room.gameState) return;
    const entry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      text: message
    };
    if (!room.gameState.log) room.gameState.log = [];
    room.gameState.log.unshift(entry);
    if (room.gameState.log.length > 40) {
      room.gameState.log.pop();
    }
  }

  addChatMessage(code, playerId, text) {
    const room = this.getRoom(code);
    if (!room) return;

    const player = room.players.find(p => p.id === playerId);
    if (!player) return;

    const msg = {
      id: `msg_${Date.now()}`,
      senderName: player.name,
      senderId: player.id,
      text: text.trim().substring(0, 200),
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    room.chatMessages.push(msg);
    if (room.chatMessages.length > 50) {
      room.chatMessages.shift();
    }
    return msg;
  }

  /**
   * Returns a sanitized room state for a specific client:
   * other players' hands are hidden (only card count is sent)
   */
  getSanitizedState(room, playerId) {
    if (!room) return null;

    const sanitizedPlayers = room.players.map(p => {
      const isSelf = p.id === playerId;
      return {
        id: p.id,
        name: p.name,
        originalName: p.originalName || null,
        isBot: p.isBot,
        isHost: p.isHost,
        connected: p.connected,
        leftGame: !!p.leftGame,
        hasPesek: !!p.hasPesek,
        turnsCount: p.turnsCount || 0,
        lastDrawnCardId: isSelf ? (p.lastDrawnCardId || null) : null,
        cardCount: p.hand.length,
        hasOpened: p.hasOpened,
        totalScore: p.totalScore,
        roundScore: p.roundScore,
        hasKeptJoker: !!p.keptJoker || (p.keptJokers && p.keptJokers.length > 0),
        keptJokersCount: (p.keptJokers ? p.keptJokers.length : (p.keptJoker ? 1 : 0)),
        // Only disclose hand if it's the player themselves or round has ended
        hand: (isSelf || room.status === 'round_ended') ? p.hand : []
      };
    });

    return {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      settings: room.settings,
      players: sanitizedPlayers,
      gameState: room.gameState ? {
        roundNumber: room.gameState.roundNumber,
        talonCount: room.gameState.talon.length,
        discardTop: room.gameState.discardPile[room.gameState.discardPile.length - 1] || null,
        discardCount: room.gameState.discardPile.length,
        tableMelds: room.gameState.tableMelds,
        currentTurnPlayerIndex: room.gameState.currentTurnPlayerIndex,
        turnPhase: room.gameState.turnPhase,
        roundWinner: room.gameState.roundWinner ? {
          id: room.gameState.roundWinner.id,
          name: room.gameState.roundWinner.name
        } : null,
        isHandRummy: room.gameState.isHandRummy,
        hasKeptJoker: room.gameState.hasKeptJoker || false,
        keptJokersCount: room.gameState.keptJokersCount || 0,
        drawnFromDiscardCard: (room.players[room.gameState.currentTurnPlayerIndex]?.id === playerId)
          ? room.gameState.drawnFromDiscardCard
          : null,
        log: room.gameState.log || []
      } : null,
      chatMessages: room.chatMessages
    };
  }

  broadcastRoom(room) {
    if (!room || !this.io) return;
    // Broadcast tailored state to each socket connected to the room
    const socketsInRoom = this.io.sockets.adapter.rooms.get(room.code);
    if (!socketsInRoom) return;

    for (const socketId of socketsInRoom) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket && socket.data.playerId) {
        const sanitized = this.getSanitizedState(room, socket.data.playerId);
        socket.emit('room:updated', sanitized);
      }
    }
  }
}
