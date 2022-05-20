const numberToWords = require("number-to-words");

const NUMBER_OF_DICE = 6;

/*  Game state reference
    accumulatedPoints: 0, // The points accumulated, but not cashed in, on a specific turn. Only updated on banking.
    potentialRollScore: 0,  // accumulatedPoints + anything the user has selected before they bank or roll again.
    currentPlayer,
    dice: [{
      value: int,
      available: bool, // Whether the die is available to be rolled again
      scored: bool, // Whether the die has already been used for scoring
    }],
    history: [], // The history of moves played so far in the game
    score: [0, 0], // Current (banked) score of both players
    consecutiveZilchCounter: [0, 0],
    scoreLimit, // The score limit for this game.
    numberOfPlayers,

    Understand:
    currentPlayer, numberOfPlayers, scoreLimit, score, consecutiveZilchCounter

    Unclear:
    accumulatedPoints, potentialRollScore, dice, history

*/

const createNewGame = (
  initialPlayer,
  scoreLimit = 2500,
  numberOfPlayers = 2
) => {
  const currentPlayer = initialPlayer
    ? initialPlayer
    : Math.floor(Math.random() * numberOfPlayers) + 1;

  return {
    accumulatedPoints: 0, // The points accumulated, but not cashed in, on a specific turn.
    potentialRollScore: 0,
    currentPlayer,
    dice: rollDice(),
    history: [], // The history of moves played so far in the game
    score: [0, 0], // Current (banked) score of both players
    consecutiveZilchCounter: [0, 0],
    scoreLimit, // The score limit for this game.
    numberOfPlayers,
  };
};

const rollDice = (gameState) => {
  if (gameState) {
    const previousDice = gameState.dice;
    // Previous dice are available
    return previousDice.map((die) => {
      if (die.available) {
        // If the die is available to be rolled, reroll its value.
        return {
          value: Math.floor(Math.random() * NUMBER_OF_DICE) + 1,
          available: true,
          scored: false,
        };
      }
      return die; // Otherwise, return the used die without changing its value.
    });
  }

  // If no previous dice are supplied, return a fresh roll of 6 dice.
  const dice = [];
  for (let i = 0; i < NUMBER_OF_DICE; i++) {
    dice.push({
      value: Math.floor(Math.random() * NUMBER_OF_DICE) + 1,
      available: true,
      scored: false,
    });
  }
  return dice;
};

// Enables the Cash In button when at least 300 points have been
// accumulated and at least one valid dice has been chosen this roll
const enableCashIn = (scoringOptions, gameState) => {
  gameState.potentialRollScore = 0;

  if (scoringOptions[0].score !== undefined) {
    for (let i = 0; i < scoringOptions.length; i++) {
      gameState.potentialRollScore += scoringOptions[i].score;
    }
  }
  const totalPotentialScore =
    gameState.accumulatedPoints + gameState.potentialRollScore;

  return (
    totalPotentialScore >= 300 &&
    scoringOptions[0].score !== 0 &&
    validDiceChosen(gameState)
  );
};

// Returns an array of ordered dice values for scoring
const countDice = (chosenDice, gameState) => {
  let scoringDiceArray = [0, 0, 0, 0, 0, 0];
  for (i = 0; i < chosenDice.length; i++) {
    if (chosenDice[i] && gameState.dice[i].available)
      scoringDiceArray[gameState.dice[i].value - 1]++;
  }
  return scoringDiceArray;
};

// Returns a list of all possible scoring options given the chosen dice
const getScoringOptions = (chosenDice, gameState) => {
  let scoringOptions = [];
  let diceStillAvailable = true;
  const diceCounts = countDice(chosenDice, gameState);
  resetScoredDice(gameState);

  // One to six (req 6 dice)
  for (i = 0; i < NUMBER_OF_DICE; i++) {
    if (diceCounts[i] != 1) break;
    if (i === 5 && diceCounts[i] === 1) {
      scoringOptions.push({ roll: "One to Six", score: 1500 });
      removeAllDice(gameState);
      diceStillAvailable = false;
    }
  }

  // Any three pairs (req 6 dice)
  let pairCount = 0;
  for (i = 0; i < NUMBER_OF_DICE; i++) {
    if (diceCounts[i] === 2) pairCount++;
  }
  if (pairCount === 3) {
    scoringOptions.push({ roll: "Three Pairs", score: 1500 });
    removeAllDice(gameState);
    diceStillAvailable = false;
  }

  if (diceStillAvailable) {
    // Three of a kind or more
    for (i = 1; i < NUMBER_OF_DICE; i++) {
      const dieCount = diceCounts[i];
      if (dieCount >= 3) {
        if (i < 4 || i === 5) {
          // Twos, threes, fours
          scoringOptions.push({
            roll: `${dieCount} ${numberToWords.toWords(i + 1)}s`,
            score: (i + 1) * 100 * (dieCount - 2),
          });
          removeScoredDice(gameState, i + 1, dieCount, chosenDice);
        }
      }
    }

    // Ones and Fives
    switch (diceCounts[0]) {
      case 0:
        break;
      case 1:
        scoringOptions.push({ roll: "Single one", score: 100 });
        removeScoredDice(gameState, 1, diceCounts[0], chosenDice);
        break;
      case 2:
        scoringOptions.push({ roll: `${diceCounts[0]} ones`, score: 200 });
        removeScoredDice(gameState, 1, diceCounts[0], chosenDice);
        break;
      default:
        scoringOptions.push({
          roll: `${diceCounts[0]} ones`,
          score: 1000 * (diceCounts[0] - 2),
        });
        removeScoredDice(gameState, 1, diceCounts[0], chosenDice);
        break;
    }

    switch (diceCounts[4]) {
      case 0:
        break;
      case 1:
        scoringOptions.push({ roll: "Single five", score: 50 });
        removeScoredDice(gameState, 5, diceCounts[4], chosenDice);
        break;
      case 2:
        scoringOptions.push({ roll: `${diceCounts[4]} fives`, score: 100 });
        removeScoredDice(gameState, 5, diceCounts[4], chosenDice);
        break;
      default:
        scoringOptions.push({
          roll: `${diceCounts[4]} fives`,
          score: 500 * (diceCounts[4] - 2),
        });
        removeScoredDice(gameState, 5, diceCounts[4], chosenDice);
        break;
    }
  }

  // Dice options that appear when there are no options within the chosen dice
  if (scoringOptions.length === 0) {
    let chosenDiceLength = 0;
    let unavailableDice = 0;
    for (let i = 0; i < NUMBER_OF_DICE; i++) {
      chosenDiceLength += diceCounts[i];
      if (!gameState.dice[i].available) unavailableDice++;
    }
    if (chosenDiceLength === NUMBER_OF_DICE) {
      scoringOptions.push({ roll: "No scoring dice", score: 500 });
      removeAllDice(gameState);
    } else if (chosenDiceLength + unavailableDice === 6) {
      scoringOptions.push({ roll: "Zilch!", score: 0 });
    } else {
      scoringOptions.push("Choose some dice to see your options");
    }
  }

  return scoringOptions;
};

// Changes to the next player's turn
const nextPlayerTurn = (gameState) => {
  // If the score limit has not been reached, it becomes the next player's turn
  gameState.accumulatedPoints = 0;
  gameState.potentialRollScore = 0;
  gameState.currentPlayer =
    gameState.currentPlayer < gameState.numberOfPlayers
      ? gameState.currentPlayer + 1
      : 1;
  gameState.dice = rollDice();
};

/*
while(nextPlayer.score < gameState.scoreLimit) {
  clearTurnState();
  nextPlayerTurn();
}

*/

// Returns whether any of the dice chosen will give points
const validDiceChosen = (gameState) => {
  for (let i = 0; i < NUMBER_OF_DICE; i++) {
    if (gameState.dice[i].scored) {
      return true;
    }
  }
  return false;
};

// Sets the scored value for all dice used in the current combination false so they won't be scored again
const removeScoredDice = (gameState, diceValue, iterations, chosenDice) => {
  let currentIterations = 0;
  for (let i = 0; i < NUMBER_OF_DICE; i++) {
    if (
      gameState.dice[i].value === diceValue &&
      gameState.dice[i].available &&
      chosenDice[i]
    ) {
      gameState.dice[i].scored = true;
      currentIterations++;
    }
    if (currentIterations === iterations) break;
  }
};

// Sets the scored value for all dice false, meaning they've all been scored (for combinations required all 6 dice)
const removeAllDice = (gameState) => {
  for (i = 0; i < NUMBER_OF_DICE; i++) {
    gameState.dice[i].scored = true;
  }
};

// Resets the scored value to false to allow for scoring
// ** I don't understand why the dice scored attribute are being reset to false every time we try to get the scoring options
const resetScoredDice = (gameState) => {
  for (i = 0; i < NUMBER_OF_DICE; i++) {
    gameState.dice[i].scored = false;
  }
};

// Sets dice that have been previously used in a combo in the same turn to be unavailable
const disableUsedDice = (selectedDice, gameState) => {
  for (let i = 0; i < NUMBER_OF_DICE; i++) {
    if (
      gameState.dice[i].available &&
      selectedDice[i] &&
      gameState.dice[i].scored
    )
      gameState.dice[i].available = false;
  }
};

// Enables the Free Roll button when all the game dice are either
// currently used in a valid combination or unavailble
const enableFreeRoll = (gameState) => {
  let scoredDiceCounter = 0;
  for (let i = 0; i < NUMBER_OF_DICE; i++) {
    if (gameState.dice[i].scored || !gameState.dice[i].available) {
      scoredDiceCounter++;
    } else {
      continue;
    }
  }
  return scoredDiceCounter;
};

module.exports = {
  nextPlayerTurn: nextPlayerTurn,
  createNewGame: createNewGame,
  enableFreeRoll: enableFreeRoll,
  enableCashIn: enableCashIn,
  rollDice: rollDice,
  disableUsedDice: disableUsedDice,
  getScoringOptions: getScoringOptions,
  validDiceChosen: validDiceChosen
};
