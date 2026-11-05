// Core Game Logic & Rules for Czech Žolíky
import { SUITS, RANKS, RANK_ORDER, PENALTY_VALUES } from './cards.js';

/**
 * Checks if an array of cards forms a valid Sequence (Postupka).
 * Requirements:
 * - Minimum 3 cards
 * - All non-jokers must share the exact same suit
 * - Natural cards cannot have duplicate ranks (e.g. two 5s)
 * - Number of jokers must be <= natural cards
 * - Can fit consecutively in rank order (either A-2-3... or ...Q-K-A, no wrap-around like K-A-2)
 *
 * Returns { valid: boolean, type: 'sequence', pure: boolean, points: number, cardsWithRoles: Array, error?: string }
 */
export function validateSequence(cards) {
  if (!cards || cards.length < 3) {
    return { valid: false, error: 'Postupka musí mít minimálně 3 karty.' };
  }

  const jokers = cards.filter(c => c.isJoker);
  const naturals = cards.filter(c => !c.isJoker);

  if (naturals.length === 0) {
    return { valid: false, error: 'Postupka nemůže být složena pouze ze žolíků.' };
  }

  if (jokers.length > naturals.length) {
    return { valid: false, error: 'Žolíků nemůže být v postupce více než běžných karet.' };
  }

  const commonSuit = naturals[0].suit;
  if (!naturals.every(c => c.suit === commonSuit)) {
    return { valid: false, error: 'Všechny karty v postupce musí mít stejnou barvu.' };
  }

  // Check duplicate ranks among naturals
  const rankCounts = {};
  for (const c of naturals) {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
    if (rankCounts[c.rank] > 1) {
      return { valid: false, error: 'Postupka nemůže obsahovat dvě stejné karty stejné hodnoty.' };
    }
  }

  // We test both Low Ace (A = 1) and High Ace (A = 14) options if Ace is present
  const hasAce = naturals.some(c => c.rank === 'A');

  const testLowAce = testSequenceWithAceValue(cards, naturals, jokers, commonSuit, false);
  if (testLowAce.valid) return testLowAce;

  if (hasAce) {
    const testHighAce = testSequenceWithAceValue(cards, naturals, jokers, commonSuit, true);
    if (testHighAce.valid) return testHighAce;
  }

  return { valid: false, error: 'Karty v postupce netvoří nepřerušenou číselnou řadu.' };
}

function testSequenceWithAceValue(allCards, naturals, jokers, suit, aceIsHigh) {
  const getOrderVal = (rank) => {
    if (rank === 'A') return aceIsHigh ? 14 : 1;
    return RANK_ORDER[rank];
  };

  const getRankFromOrderVal = (val) => {
    if (val === 1) return 'A';
    if (val === 14) return 'A';
    for (const [r, v] of Object.entries(RANK_ORDER)) {
      if (v === val && r !== 'A_HIGH') return r;
    }
    return null;
  };

  // Natural cards mapped with numeric value
  const natWithVal = naturals.map(c => ({
    ...c,
    orderVal: getOrderVal(c.rank)
  })).sort((a, b) => a.orderVal - b.orderVal);

  const minNat = natWithVal[0].orderVal;
  const maxNat = natWithVal[natWithVal.length - 1].orderVal;
  const totalLength = allCards.length;

  // The span of a valid sequence must be exactly totalLength:
  // (start to start + totalLength - 1)
  // Possible starting positions:
  // start <= minNat AND start + totalLength - 1 >= maxNat
  // Also: start >= 1 (low ace) and start + totalLength - 1 <= 14 (high ace)
  let bestSolution = null;

  for (let start = Math.max(1, maxNat - totalLength + 1); start <= minNat; start++) {
    const end = start + totalLength - 1;
    if (end > 14) continue; // Out of card range

    // Check if all naturals fit into this consecutive range
    const neededVals = new Set();
    for (let v = start; v <= end; v++) neededVals.add(v);

    let fits = true;
    for (const n of natWithVal) {
      if (!neededVals.has(n.orderVal)) {
        fits = false;
        break;
      }
      neededVals.delete(n.orderVal);
    }

    if (fits && neededVals.size === jokers.length) {
      // Valid arrangement!
      // Assign representations to jokers
      const missingVals = Array.from(neededVals).sort((a, b) => a - b);
      const jokersAssigned = jokers.map((j, idx) => {
        const repVal = missingVals[idx];
        const repRank = getRankFromOrderVal(repVal);
        return {
          ...j,
          orderVal: repVal,
          representedSuit: suit,
          representedRank: repRank
        };
      });

      const fullSequence = [...natWithVal, ...jokersAssigned].sort((a, b) => a.orderVal - b.orderVal);

      // Calculate points
      let points = 0;
      for (const card of fullSequence) {
        const effectiveRank = card.isJoker ? card.representedRank : card.rank;
        const effectiveVal = card.orderVal;
        if (effectiveRank === 'A') {
          points += (effectiveVal === 1) ? 1 : 10;
        } else if (['J', 'Q', 'K', '10'].includes(effectiveRank)) {
          points += 10;
        } else {
          points += parseInt(effectiveRank, 10);
        }
      }

      bestSolution = {
        valid: true,
        type: 'sequence',
        pure: jokers.length === 0,
        suit,
        points,
        cards: fullSequence,
        minVal: start,
        maxVal: end
      };
      break;
    }
  }

  return bestSolution || { valid: false };
}

/**
 * Checks if an array of cards forms a valid Group/Set (Skupina/Trojice/Čtveřice).
 * Requirements:
 * - 3 or 4 cards
 * - All non-jokers have the exact same rank
 * - All non-jokers have DIFFERENT suits
 * - Jokers <= natural cards
 *
 * Returns { valid: boolean, type: 'group', pure: boolean, points: number, cards: Array, error?: string }
 */
export function validateGroup(cards) {
  if (!cards || cards.length < 3 || cards.length > 4) {
    return { valid: false, error: 'Skupina (trojice/čtveřice) musí mít 3 nebo 4 karty.' };
  }

  const jokers = cards.filter(c => c.isJoker);
  const naturals = cards.filter(c => !c.isJoker);

  if (naturals.length === 0) {
    return { valid: false, error: 'Skupina nemůže být složena pouze ze žolíků.' };
  }

  if (jokers.length > naturals.length) {
    return { valid: false, error: 'Žolíků nemůže být ve skupině více než běžných karet.' };
  }

  const commonRank = naturals[0].rank;
  if (!naturals.every(c => c.rank === commonRank)) {
    return { valid: false, error: 'Všechny karty ve skupině musí mít stejnou hodnotu (např. 7-7-7).' };
  }

  // Check unique suits among naturals
  const usedSuits = new Set();
  for (const c of naturals) {
    if (usedSuits.has(c.suit)) {
      return { valid: false, error: 'Ve skupině nesmí být dvě karty se stejnou barvou.' };
    }
    usedSuits.add(c.suit);
  }

  // Determine available missing suits for jokers
  const allSuits = ['H', 'D', 'C', 'S'];
  const missingSuits = allSuits.filter(s => !usedSuits.has(s));

  const jokersAssigned = jokers.map((j, idx) => ({
    ...j,
    representedRank: commonRank,
    representedSuit: missingSuits[idx] || null
  }));

  // Calculate points
  let singleCardPoints = 10;
  if (commonRank === 'A') {
    singleCardPoints = 10;
  } else if (['J', 'Q', 'K', '10'].includes(commonRank)) {
    singleCardPoints = 10;
  } else {
    singleCardPoints = parseInt(commonRank, 10);
  }

  const points = cards.length * singleCardPoints;

  return {
    valid: true,
    type: 'group',
    pure: jokers.length === 0,
    rank: commonRank,
    points,
    cards: [...naturals, ...jokersAssigned]
  };
}

/**
 * Validates a single meld (either sequence or group)
 */
export function validateSingleMeld(cards) {
  const seqRes = validateSequence(cards);
  if (seqRes.valid) return seqRes;

  const grpRes = validateGroup(cards);
  if (grpRes.valid) return grpRes;

  return {
    valid: false,
    error: seqRes.error || grpRes.error || 'Neplatná kombinace karet.'
  };
}

/**
 * Validates opening melds for a player who has not yet opened.
 * Rules:
 * - Must contain one or more valid melds (sequences or groups)
 * - Total points must meet minPoints threshold (default 42)
 * - If requirePureSequence is true, at least one meld must be a pure sequence (no jokers)
 *
 * melds: Array of arrays of cards, e.g. [[card1, card2, card3], [card4, card5, card6]]
 */
export function validateOpeningMelds(melds, options = {}) {
  const minPoints = options.minPoints ?? 42;
  const requirePureSequence = options.requirePureSequence ?? true;

  if (!melds || melds.length === 0) {
    return { valid: false, error: 'Nevybrali jste žádné karty k vyložení.' };
  }

  let totalPoints = 0;
  let hasPureSequence = false;
  const validatedMelds = [];

  for (let i = 0; i < melds.length; i++) {
    const meldCards = melds[i];
    const validation = validateSingleMeld(meldCards);

    if (!validation.valid) {
      return {
        valid: false,
        error: `Kombinace #${i + 1} není platná: ${validation.error}`
      };
    }

    if (validation.type === 'sequence' && validation.pure) {
      hasPureSequence = true;
    }

    totalPoints += validation.points;
    validatedMelds.push(validation);
  }

  if (totalPoints < minPoints) {
    return {
      valid: false,
      error: `Pro první vyložení potřebujete alespoň ${minPoints} bodů. Vaše kombinace mají pouze ${totalPoints} bodů.`
    };
  }

  if (requirePureSequence && !hasPureSequence) {
    return {
      valid: false,
      error: 'Pro první vyložení musíte mít alespoň jednu čistou postupku (bez žolíka).'
    };
  }

  return {
    valid: true,
    totalPoints,
    hasPureSequence,
    validatedMelds
  };
}

/**
 * Check if card(s) can be laid off (přiložit) onto an existing table meld.
 * tableMeld: existing meld object { id, type, cards, ... }
 * newCards: array of cards from player's hand to add
 */
export function canLayOff(tableMeld, newCards) {
  if (tableMeld.type === 'sequence') {
    // If tableMeld has a joker, check if any of newCards matches the joker's represented card
    const jokersInMeld = tableMeld.cards.filter(c => c.isJoker);
    for (const joker of jokersInMeld) {
      if (joker.representedRank && joker.representedSuit) {
        const matchesJoker = newCards.some(
          c => !c.isJoker && c.rank === joker.representedRank && c.suit === joker.representedSuit
        );
        if (matchesJoker) {
          return {
            valid: false,
            error: `Tato karta (${joker.representedRank}) odpovídá žolíkovi v této postupce. Žolíka je potřeba vyměnit!`
          };
        }
      }
    }
    const combinedCards = [...tableMeld.cards, ...newCards];
    return validateSequence(combinedCards);
  } else if (tableMeld.type === 'group') {
    const combinedCards = [...tableMeld.cards, ...newCards];
    return validateGroup(combinedCards);
  }
  return { valid: false, error: 'Neznámý typ kombinace.' };
}

/**
 * Checks if player can swap a natural card for a Joker in an existing table meld.
 * tableMeld: existing meld object
 * naturalCard: card from player's hand
 * jokerId: the id of the joker inside tableMeld to swap
 */
export function canSwapJoker(tableMeld, naturalCard, jokerId) {
  if (naturalCard.isJoker) {
    return { valid: false, error: 'Žolíka nelze vyměnit za jiného žolíka.' };
  }

  const targetJoker = tableMeld.cards.find(c => c.id === jokerId && c.isJoker);
  if (!targetJoker) {
    return { valid: false, error: 'Vybraná karta na stole není žolík.' };
  }

  if (tableMeld.type === 'sequence') {
    // In sequence, joker has exact representedRank and representedSuit
    if (naturalCard.suit === targetJoker.representedSuit && naturalCard.rank === targetJoker.representedRank) {
      return { valid: true, targetJoker };
    }
    return {
      valid: false,
      error: `Tento žolík zastupuje ${targetJoker.representedRank} ${SUITS[targetJoker.representedSuit]?.name || ''}.`
    };
  } else if (tableMeld.type === 'group') {
    // Pravidlo: Žolíka u stejných symbolů si můžeš vzít, až když budeš měnit 4. kartu.
    // Ve skupině 3 karet je barva žolíka nejednoznačná (2 zbývající barvy).
    // Teprve až když má skupina 4 karty (3 přirozené karty + 1 žolík), je barva jednoznačně určena!
    const naturalCards = tableMeld.cards.filter(c => !c.isJoker);
    if (tableMeld.cards.length < 4 || naturalCards.length < 3) {
      return {
        valid: false,
        error: 'Žolíka ze skupiny stejných symbolů lze vzít až při výměně 4. karty (skupina musí obsahovat 4 karty, aby byla barva jednoznačná).'
      };
    }

    // In a group, natural card must match group's rank and have a suit not already naturally present in the group
    if (naturalCard.rank !== tableMeld.rank) {
      return { valid: false, error: `Tento žolík zastupuje kartu s hodnotou ${tableMeld.rank}.` };
    }

    const naturalSuitsInGroup = naturalCards.map(c => c.suit);
    if (naturalSuitsInGroup.includes(naturalCard.suit)) {
      return { valid: false, error: `Tato barva (${SUITS[naturalCard.suit]?.name}) už v této skupině je.` };
    }

    return { valid: true, targetJoker };
  }

  return { valid: false, error: 'Neplatná operace výměny žolíka.' };
}

/**
 * Calculates penalty points for remaining cards in player's hand at round end
 */
export function calculateHandPenalty(cards) {
  let sum = 0;
  for (const c of cards) {
    if (c.isJoker) {
      sum += PENALTY_VALUES['JOKER'];
    } else {
      sum += PENALTY_VALUES[c.rank] || 10;
    }
  }
  return sum;
}

/**
 * Helper to generate all combinations of size k from an array
 */
function getCombinations(arr, k) {
  const result = [];
  function backtrack(start, combo) {
    if (combo.length === k) {
      result.push([...combo]);
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/**
 * Partitions an arbitrary array of cards into 1, 2, or 3 valid melds (sequences or groups).
 * Returns array of meld card arrays, e.g. [[c1, c2, c3], [c4, c5, c6]], or null if not valid.
 */
export function partitionIntoValidMelds(cards) {
  if (!cards || cards.length < 3) return null;

  // 1. Single valid meld
  const single = validateSingleMeld(cards);
  if (single.valid) {
    return [cards];
  }

  const n = cards.length;

  // 2. Partition into 2 valid melds (length >= 6)
  if (n >= 6) {
    for (let k = 3; k <= Math.floor(n / 2); k++) {
      const combos = getCombinations(cards, k);
      for (const m1 of combos) {
        const m1Ids = new Set(m1.map(c => c.id));
        const m2 = cards.filter(c => !m1Ids.has(c.id));

        const val1 = validateSingleMeld(m1);
        if (val1.valid) {
          const val2 = validateSingleMeld(m2);
          if (val2.valid) {
            return [m1, m2];
          }
        }
      }
    }
  }

  // 3. Partition into 3 valid melds (length >= 9)
  if (n >= 9) {
    for (let k1 = 3; k1 <= n - 6; k1++) {
      const combos1 = getCombinations(cards, k1);
      for (const m1 of combos1) {
        const val1 = validateSingleMeld(m1);
        if (!val1.valid) continue;

        const m1Ids = new Set(m1.map(c => c.id));
        const rem = cards.filter(c => !m1Ids.has(c.id));

        for (let k2 = 3; k2 <= Math.floor(rem.length / 2); k2++) {
          const combos2 = getCombinations(rem, k2);
          for (const m2 of combos2) {
            const val2 = validateSingleMeld(m2);
            if (!val2.valid) continue;

            const m2Ids = new Set(m2.map(c => c.id));
            const m3 = rem.filter(c => !m2Ids.has(c.id));
            const val3 = validateSingleMeld(m3);
            if (val3.valid) {
              return [m1, m2, m3];
            }
          }
        }
      }
    }
  }

  return null;
}

