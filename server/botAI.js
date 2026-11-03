// Bot AI for Czech Žolíky
import {
  validateSequence,
  validateGroup,
  validateOpeningMelds,
  canLayOff,
  canSwapJoker
} from './gameLogic.js';
import { RANK_ORDER } from './cards.js';

/**
 * Finds all potential 3-card or 4-card sets (skupiny) from a list of cards
 */
export function findPotentialGroups(handCards) {
  const groups = [];
  const naturals = handCards.filter(c => !c.isJoker);
  const jokers = handCards.filter(c => c.isJoker);

  // Group by rank
  const byRank = {};
  for (const c of naturals) {
    if (!byRank[c.rank]) byRank[c.rank] = [];
    byRank[c.rank].push(c);
  }

  for (const [rank, cards] of Object.entries(byRank)) {
    // Unique suits
    const uniqueSuitCards = [];
    const seenSuits = new Set();
    for (const c of cards) {
      if (!seenSuits.has(c.suit)) {
        seenSuits.add(c.suit);
        uniqueSuitCards.push(c);
      }
    }

    // If 3 or 4 unique suits
    if (uniqueSuitCards.length >= 3) {
      const val = validateGroup(uniqueSuitCards.slice(0, 4));
      if (val.valid) groups.push(val.cards);
      if (uniqueSuitCards.length === 4) {
        // also 3-card subgroups
        const val3 = validateGroup(uniqueSuitCards.slice(0, 3));
        if (val3.valid) groups.push(val3.cards);
      }
    } else if (uniqueSuitCards.length === 2 && jokers.length >= 1) {
      const candidate = [...uniqueSuitCards, jokers[0]];
      const val = validateGroup(candidate);
      if (val.valid) groups.push(val.cards);
    }
  }

  return groups;
}

/**
 * Finds all potential sequences from a list of cards
 */
export function findPotentialSequences(handCards) {
  const sequences = [];
  const naturals = handCards.filter(c => !c.isJoker);
  const jokers = handCards.filter(c => c.isJoker);

  // Group by suit
  const bySuit = {};
  for (const c of naturals) {
    if (!bySuit[c.suit]) bySuit[c.suit] = [];
    bySuit[c.suit].push(c);
  }

  for (const [suit, cards] of Object.entries(bySuit)) {
    // Unique ranks sorted by orderVal
    const uniqueCards = [];
    const seenRanks = new Set();
    for (const c of cards) {
      if (!seenRanks.has(c.rank)) {
        seenRanks.add(c.rank);
        uniqueCards.push(c);
      }
    }

    if (uniqueCards.length >= 2 || (uniqueCards.length >= 1 && jokers.length >= 1)) {
      // Generate subsets of size 3, 4, 5
      const generateSubsets = (arr, size) => {
        const result = [];
        const f = (prefix, start) => {
          if (prefix.length === size) {
            result.push(prefix);
            return;
          }
          for (let i = start; i < arr.length; i++) {
            f([...prefix, arr[i]], i + 1);
          }
        };
        f([], 0);
        return result;
      };

      // Pure sequences (size 3, 4, 5)
      for (let s = 3; s <= Math.min(5, uniqueCards.length); s++) {
        const subsets = generateSubsets(uniqueCards, s);
        for (const sub of subsets) {
          const val = validateSequence(sub);
          if (val.valid) {
            sequences.push(val.cards);
          }
        }
      }

      // Sequences with 1 joker
      if (jokers.length >= 1) {
        for (let s = 2; s <= Math.min(4, uniqueCards.length); s++) {
          const subsets = generateSubsets(uniqueCards, s);
          for (const sub of subsets) {
            const candidate = [...sub, jokers[0]];
            const val = validateSequence(candidate);
            if (val.valid) {
              sequences.push(val.cards);
            }
          }
        }
      }
    }
  }

  return sequences;
}

/**
 * Finds disjoint (non-overlapping) combinations of melds
 */
export function findDisjointMelds(allMelds) {
  const result = [];

  const areDisjoint = (m1, m2) => {
    const ids1 = new Set(m1.map(c => c.id));
    for (const c of m2) {
      if (ids1.has(c.id)) return false;
    }
    return true;
  };

  // 1-meld combinations
  for (const m of allMelds) {
    result.push([m]);
  }

  // 2-meld combinations
  for (let i = 0; i < allMelds.length; i++) {
    for (let j = i + 1; j < allMelds.length; j++) {
      if (areDisjoint(allMelds[i], allMelds[j])) {
        result.push([allMelds[i], allMelds[j]]);

        // 3-meld combinations
        for (let k = j + 1; k < allMelds.length; k++) {
          if (areDisjoint(allMelds[i], allMelds[k]) && areDisjoint(allMelds[j], allMelds[k])) {
            result.push([allMelds[i], allMelds[j], allMelds[k]]);
          }
        }
      }
    }
  }

  return result;
}

/**
 * Evaluates bot's next actions on turn
 */
export function decideBotTurn(botPlayer, gameState, roomSettings) {
  const { hand, hasOpened } = botPlayer;
  const { discardPile, tableMelds } = gameState;
  const topDiscard = discardPile[discardPile.length - 1];

  let drawChoice = 'talon'; // 'talon' or 'discard'

  // Step 1: Check whether drawing from discard is beneficial
  if (topDiscard) {
    const testHandWithDiscard = [...hand, topDiscard];
    const potGroups = findPotentialGroups(testHandWithDiscard);
    const potSeqs = findPotentialSequences(testHandWithDiscard);
    const allCombos = findDisjointMelds([...potSeqs, ...potGroups]);

    const minTurns = roomSettings?.minTurnsToMeld ?? 3;
    const turnsPlayed = botPlayer.turnsCount || 0;
    const requiredTurns = minTurns === 4 ? 3 : (minTurns === 3 ? 2 : 0);
    const canOpenThisTurn = turnsPlayed >= requiredTurns;

    if (!hasOpened && canOpenThisTurn) {
      // Must be able to open using topDiscard
      for (const combo of allCombos) {
        const containsDiscard = combo.some(meld => meld.some(c => c.id === topDiscard.id));
        if (containsDiscard) {
          const valOpen = validateOpeningMelds(combo, roomSettings);
          if (valOpen.valid) {
            drawChoice = 'discard';
            break;
          }
        }
      }
    } else if (hasOpened) {
      // If already opened, does discard help form a new meld or lay off?
      const formsNewMeld = allCombos.some(combo =>
        combo.some(meld => meld.some(c => c.id === topDiscard.id))
      );
      const canLayOffOntoTable = tableMelds.some(tm => canLayOff(tm, [topDiscard]).valid);

      if (formsNewMeld || canLayOffOntoTable) {
        drawChoice = 'discard';
      }
    }
  }

  return {
    drawChoice
  };
}

/**
 * Evaluates melds to play, lay-offs, joker swaps, and card to discard
 */
export function decideBotPlayAndDiscard(botPlayer, gameState, roomSettings) {
  let currentHand = [...botPlayer.hand];
  let hasOpened = botPlayer.hasOpened;
  const meldsToPlay = [];
  const layOffsToPlay = [];
  const jokerSwapsToPlay = [];

  // 1. Try to open if not opened yet and required turns have elapsed
  const minTurns = roomSettings?.minTurnsToMeld ?? 3;
  const turnsPlayed = botPlayer.turnsCount || 0;
  const requiredTurns = minTurns === 4 ? 3 : (minTurns === 3 ? 2 : 0);
  const canOpenThisTurn = turnsPlayed >= requiredTurns;

  if (!hasOpened && canOpenThisTurn) {
    const potGroups = findPotentialGroups(currentHand);
    const potSeqs = findPotentialSequences(currentHand);
    const allCombos = findDisjointMelds([...potSeqs, ...potGroups]);

    // Find valid opening combo with highest points
    let bestOpeningCombo = null;
    let highestPts = 0;

    for (const combo of allCombos) {
      const valOpen = validateOpeningMelds(combo, roomSettings);
      if (valOpen.valid && valOpen.totalPoints > highestPts) {
        // Ensure bot keeps at least 1 card in hand to discard (unless winning z ruky)
        const totalCardsUsed = combo.reduce((acc, m) => acc + m.length, 0);
        if (currentHand.length - totalCardsUsed >= 1) {
          bestOpeningCombo = combo;
          highestPts = valOpen.totalPoints;
        }
      }
    }

    if (bestOpeningCombo) {
      meldsToPlay.push(...bestOpeningCombo);
      const usedIds = new Set(bestOpeningCombo.flatMap(m => m.map(c => c.id)));
      currentHand = currentHand.filter(c => !usedIds.has(c.id));
      hasOpened = true;
    }
  }

  // 2. If opened, try to play additional melds, joker swaps, and lay-offs
  if (hasOpened) {
    // Joker swaps
    for (const tm of gameState.tableMelds) {
      for (const card of tm.cards) {
        if (card.isJoker) {
          for (const handCard of currentHand) {
            const swapCheck = canSwapJoker(tm, handCard, card.id);
            if (swapCheck.valid) {
              jokerSwapsToPlay.push({
                tableMeldId: tm.id,
                jokerId: card.id,
                handCardId: handCard.id
              });
              // Update local hand representation
              currentHand = currentHand.filter(c => c.id !== handCard.id);
              currentHand.push({ ...card, isJoker: true });
              break;
            }
          }
        }
      }
    }

    // Additional new melds from hand
    const potGroups = findPotentialGroups(currentHand);
    const potSeqs = findPotentialSequences(currentHand);
    const allCombos = findDisjointMelds([...potSeqs, ...potGroups]);

    if (allCombos.length > 0) {
      // Pick combo that leaves at least 1 card for discard (unless all cards can be laid and last discarded)
      for (const combo of allCombos) {
        const totalCardsUsed = combo.reduce((acc, m) => acc + m.length, 0);
        if (currentHand.length - totalCardsUsed >= 1) {
          meldsToPlay.push(...combo);
          const usedIds = new Set(combo.flatMap(m => m.map(c => c.id)));
          currentHand = currentHand.filter(c => !usedIds.has(c.id));
          break;
        }
      }
    }

    // Lay-offs onto table
    for (const tm of gameState.tableMelds) {
      for (const c of [...currentHand]) {
        if (currentHand.length <= 1) break; // Keep at least 1 card for discard
        const layCheck = canLayOff(tm, [c]);
        if (layCheck.valid) {
          layOffsToPlay.push({
            tableMeldId: tm.id,
            cards: [c]
          });
          currentHand = currentHand.filter(hc => hc.id !== c.id);
        }
      }
    }
  }

  // 3. Choose discard card
  // Sort remaining cards: prefer discarding high penalty cards that don't match any others
  let discardCard = null;
  if (currentHand.length > 0) {
    const cardScores = currentHand.map(c => {
      let score = 0;
      if (c.isJoker) return { card: c, score: -1000 }; // NEVER discard Joker unless absolutely forced

      // Value weight (prefer discarding 10, J, Q, K over 2, 3)
      const penaltyVal = (['10', 'J', 'Q', 'K', 'A'].includes(c.rank)) ? 10 : parseInt(c.rank, 10);
      score += penaltyVal * 2;

      // Check proximity to other hand cards
      const sameRankCount = currentHand.filter(hc => hc.id !== c.id && hc.rank === c.rank).length;
      score -= sameRankCount * 15;

      const sameSuitNeighbors = currentHand.filter(hc => {
        if (hc.id === c.id || hc.suit !== c.suit || hc.isJoker) return false;
        const diff = Math.abs((RANK_ORDER[c.rank] || 0) - (RANK_ORDER[hc.rank] || 0));
        return diff === 1 || diff === 2;
      }).length;
      score -= sameSuitNeighbors * 10;

      return { card: c, score };
    });

    cardScores.sort((a, b) => b.score - a.score);
    discardCard = cardScores[0].card;
  }

  return {
    meldsToPlay,
    layOffsToPlay,
    jokerSwapsToPlay,
    discardCard
  };
}

