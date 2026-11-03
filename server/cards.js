// Definition of Cards and Decks for Czech Žolíky
// Total 108 cards: 2 decks of 52 cards (2-10, J, Q, K, A in 4 suits) + 4 Jokers

export const SUITS = {
  H: { id: 'H', name: 'Srdce', symbol: '♥', color: 'red' },
  D: { id: 'D', name: 'Káry', symbol: '♦', color: 'red' },
  C: { id: 'C', name: 'Kříže', symbol: '♣', color: 'black' },
  S: { id: 'S', name: 'Piky', symbol: '♠', color: 'black' }
};

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

// Value hierarchy for sequences (Ace can be 1 or 14)
export const RANK_ORDER = {
  'A': 1, // When used as low ace (A-2-3)
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A_HIGH': 14 // When used as high ace (Q-K-A)
};

// Points in hand for final scoring / penalty points
export const PENALTY_VALUES = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 10,
  'Q': 10,
  'K': 10,
  'A': 10,
  'JOKER': 20
};

/**
 * Creates dynamic card deck for Žolíky scaled to player count (unlimited players)
 * 1-4 players: 2 standard 52-card decks + 4 jokers = 108 cards
 * 5-8 players: 4 standard 52-card decks + 8 jokers = 216 cards
 * etc.
 */
export function createDeck(options = 4) {
  let jokerCount = null;
  let playerCount = 4;

  if (typeof options === 'number') {
    jokerCount = options;
  } else if (typeof options === 'object' && options !== null) {
    playerCount = options.playerCount || 4;
    jokerCount = options.jokerCount !== undefined ? options.jokerCount : null;
  }

  const deckPairs = Math.max(1, Math.ceil(playerCount / 4));
  const totalDecks = deckPairs * 2;
  const defaultJokers = deckPairs * 4;
  const finalJokerCount = jokerCount !== null ? Math.max(0, jokerCount) : defaultJokers;

  const cards = [];
  let cardId = 1;

  // Generate full decks
  for (let deckNum = 1; deckNum <= totalDecks; deckNum++) {
    for (const suitKey of Object.keys(SUITS)) {
      for (const rank of RANKS) {
        cards.push({
          id: `c_${deckNum}_${suitKey}_${rank}_${cardId++}`,
          deckNum,
          suit: suitKey,
          rank,
          isJoker: false,
          representedSuit: null,
          representedRank: null
        });
      }
    }
  }

  // Generate jokers
  for (let j = 1; j <= finalJokerCount; j++) {
    cards.push({
      id: `joker_${j}_${cardId++}`,
      deckNum: Math.min(totalDecks, Math.ceil((j / finalJokerCount) * totalDecks)) || 1,
      suit: null,
      rank: 'JOKER',
      isJoker: true,
      representedSuit: null,
      representedRank: null
    });
  }

  return cards;
}

/**
 * Shuffles an array in-place using Fisher-Yates
 */
export function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

