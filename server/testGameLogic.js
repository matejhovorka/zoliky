import {
  validateSequence,
  validateGroup,
  validateSingleMeld,
  validateOpeningMelds,
  canLayOff,
  canSwapJoker
} from './gameLogic.js';

console.log('Testing Czech Žolíky Rules Engine...');

// Test 1: Pure sequence 7-8-9 of Hearts
const pureSeq = [
  { id: '1', suit: 'H', rank: '7', isJoker: false },
  { id: '2', suit: 'H', rank: '8', isJoker: false },
  { id: '3', suit: 'H', rank: '9', isJoker: false }
];
const res1 = validateSequence(pureSeq);
console.assert(res1.valid && res1.pure && res1.points === 24, 'Test 1 Failed', res1);

// Test 2: Sequence with Joker: 5-Joker-7 of Clubs
const jokerSeq = [
  { id: '1', suit: 'C', rank: '5', isJoker: false },
  { id: 'j', suit: null, rank: 'JOKER', isJoker: true },
  { id: '2', suit: 'C', rank: '7', isJoker: false }
];
const res2 = validateSequence(jokerSeq);
console.assert(res2.valid && !res2.pure && res2.points === 18, 'Test 2 Failed', res2);
const representedJoker = res2.cards.find(c => c.isJoker);
console.assert(representedJoker.representedRank === '6' && representedJoker.representedSuit === 'C', 'Test 2 Joker assignment failed', representedJoker);

// Test 3: Low Ace sequence: A-2-3 of Diamonds
const lowAceSeq = [
  { id: '1', suit: 'D', rank: 'A', isJoker: false },
  { id: '2', suit: 'D', rank: '2', isJoker: false },
  { id: '3', suit: 'D', rank: '3', isJoker: false }
];
const res3 = validateSequence(lowAceSeq);
console.assert(res3.valid && res3.points === 6, 'Test 3 Low Ace Failed', res3);

// Test 4: High Ace sequence: Q-K-A of Spades
const highAceSeq = [
  { id: '1', suit: 'S', rank: 'Q', isJoker: false },
  { id: '2', suit: 'S', rank: 'K', isJoker: false },
  { id: '3', suit: 'S', rank: 'A', isJoker: false }
];
const res4 = validateSequence(highAceSeq);
console.assert(res4.valid && res4.points === 30, 'Test 4 High Ace Failed', res4);

// Test 5: Valid Group: 8♥, 8♦, 8♠
const validGroup = [
  { id: '1', suit: 'H', rank: '8', isJoker: false },
  { id: '2', suit: 'D', rank: '8', isJoker: false },
  { id: '3', suit: 'S', rank: '8', isJoker: false }
];
const res5 = validateGroup(validGroup);
console.assert(res5.valid && res5.pure && res5.points === 24, 'Test 5 Group Failed', res5);

// Test 6: Invalid Group with duplicate suits (two 8♥)
const invalidGroup = [
  { id: '1', suit: 'H', rank: '8', isJoker: false },
  { id: '2', suit: 'H', rank: '8', isJoker: false },
  { id: '3', suit: 'S', rank: '8', isJoker: false }
];
const res6 = validateGroup(invalidGroup);
console.assert(!res6.valid, 'Test 6 Duplicate suit in group should fail', res6);

// Test 7: Opening Melds: 7-8-9 of Hearts (24 pts, pure) + Q-K-A of Spades (30 pts, pure) = 54 pts >= 42 pts
const openRes = validateOpeningMelds([pureSeq, highAceSeq], { minPoints: 42, requirePureSequence: true });
console.assert(openRes.valid && openRes.totalPoints === 54, 'Test 7 Opening failed', openRes);

// Test 8: Opening Melds below 42 points: 7-8-9 of Hearts (24 pts) -> fail
const openResLow = validateOpeningMelds([pureSeq], { minPoints: 42, requirePureSequence: true });
console.assert(!openResLow.valid, 'Test 8 Below 42 should fail', openResLow);

// Test 9: Joker Swap in Sequence: Replace Joker (representing 6♣) with 6♣
const tableMeldSeq = {
  id: 'meld_1',
  type: 'sequence',
  cards: res2.cards
};
const card6C = { id: 'card_6_c', suit: 'C', rank: '6', isJoker: false };
const swapRes = canSwapJoker(tableMeldSeq, card6C, 'j');
console.assert(swapRes.valid, 'Test 9 Joker swap should succeed', swapRes);

console.log('All 9 rules engine tests passed successfully!');

