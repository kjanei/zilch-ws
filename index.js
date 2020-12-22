const express = require("express");
const path = require("path");
const app = require("express")();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const numberToWords = require("number-to-words");

// https://stackoverflow.com/a/36041093
// Express Middleware for serving static files
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// Constants
const NUMBER_OF_DICE = 6;

// Global state - should eventually be moved into "rooms"
let gameState = null;
let connectedUsers = 0;

// Cheat sheet for socket.io event emission:
// https://socket.io/docs/v3/emit-cheatsheet/index.html
io.on("connection", (socket) => {
  connectedUsers++;
  console.log("User connected at", new Date().toString());

  // Send the connecting user a player number
  io.emit("assignPlayerNumber", connectedUsers);

  socket.on("disconnect", () => {
    connectedUsers--;
    console.log("User disconnected at", new Date().toString());
  });

  if (connectedUsers === 2) {
    gameState = createNewGame();
    io.emit("gameStateUpdate", gameState);
    console.log("Game created.");
  }

  // Re-emit the selections made by the currently active player to other players
  socket.on("diceChoices", (sentDice) => {
    socket.broadcast.emit("diceChoices", sentDice);
  });

  // Submit some dice and roll the rest
  socket.on("rollDice", (selectedDice) => {
    io.emit("status", "Rolling dice.");

    for (let i = 0; i < NUMBER_OF_DICE; i++) {
      if (
        gameState.dice[i].available &&
        selectedDice[i] &&
        gameState.dice[i].scored
      ) {
        gameState.dice[i].available = false;
      }
    }
    io.emit("resetCheckboxes");

    gameState.accumulatedPoints += gameState.potentialRollScore;
    gameState.potentialRollScore = 0;

    gameState.dice = rollDice(gameState.dice);
    io.emit("gameStateUpdate", gameState);
  });

  socket.on("scoreDice", (chosenDice) => {
    const scoringOptions = getScoringOptions(chosenDice);
    enableCashIn(scoringOptions);
    enableRollDice();
    enableFreeRoll(scoringOptions);

    io.emit("scoringOptions", JSON.stringify(scoringOptions));
  });

  socket.on("cashDice", () => {
    gameState.consecutiveZilchCounter[gameState.currentPlayer - 1] = 0;
    gameState.score[gameState.currentPlayer - 1] +=
      gameState.potentialRollScore + gameState.accumulatedPoints;
    gameState.currentPlayer == 1
      ? io.emit("p1Score", gameState.score[gameState.currentPlayer - 1])
      : io.emit("p2Score", gameState.score[gameState.currentPlayer - 1]);

    if (gameState.score[gameState.currentPlayer - 1] >= gameState.scoreLimit) {
      io.emit("status", "Player " + gameState.currentPlayer + " wins!");
      nextPlayerTurn((gameOver = true));
    } else {
      nextPlayerTurn();
    }
  });

  socket.on("zilch", () => {
    gameState.consecutiveZilchCounter[gameState.currentPlayer - 1]++;
    if (gameState.consecutiveZilchCounter[gameState.currentPlayer - 1] == 3) {
      gameState.score[gameState.currentPlayer - 1] -= 500;
      gameState.consecutiveZilchCounter[gameState.currentPlayer - 1] = 0;
      gameState.currentPlayer == 1
        ? io.emit("p1Score", gameState.score[gameState.currentPlayer - 1])
        : io.emit("p2Score", gameState.score[gameState.currentPlayer - 1]);
    }
    nextPlayerTurn();
  });

  socket.on("freeRoll", () => {
    gameState.accumulatedPoints += gameState.potentialRollScore;
    io.emit("resetCheckboxes");
    io.emit("scoringOptions", "");
    gameState.dice = rollDice();
    io.emit("gameStateUpdate", gameState);
  });
});

const nextPlayerTurn = (gameOver = false) => {
  gameState.accumulatedPoints = 0;
  gameState.potentialRollScore = 0;
  io.emit("potentialScore", gameState.potentialRollScore);
  io.emit("resetCheckboxes");
  io.emit("scoringOptions", "");
  if (!gameOver) {
    gameState.currentPlayer =
      gameState.currentPlayer < gameState.numberOfPlayers
        ? gameState.currentPlayer + 1
        : 1;
    gameState.dice = rollDice();
    io.emit("gameStateUpdate", gameState);
  }
};

const createNewGame = (
  initialPlayer,
  scoreLimit = 10000,
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

const enableCashIn = (scoringOptions) => {
  gameState.potentialRollScore = 0;
  if (scoringOptions[0].score !== undefined) {
    for (let i = 0; i < scoringOptions.length; i++) {
      gameState.potentialRollScore += scoringOptions[i].score;
    }
  }

  const totalPotentialScore =
    gameState.accumulatedPoints + gameState.potentialRollScore;
  io.emit("potentialScore", totalPotentialScore);

  if (totalPotentialScore >= 300) {
    io.emit("enableCashIn");
  }
};

const enableRollDice = () => {
  for (let i = 0; i < NUMBER_OF_DICE; i++) {
    if (gameState.dice[i].scored) {
      io.emit("enableRollDice");
      break;
    }
  }
};

const enableFreeRoll = (scoringOptions) => {
  let scoredDiceCounter = 0;
  for (let i = 0; i < NUMBER_OF_DICE; i++) {
    if (gameState.dice[i].scored || !gameState.dice[i].available) {
      scoredDiceCounter++;
    } else {
      continue;
    }
    if (scoredDiceCounter == 6) {
      io.emit("enableFreeRoll");
    }
  }
};

const rollDice = (previousDice) => {
  if (previousDice) {
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

// Returns an array of ordered dice values for scoring
const countDice = (dice) => {
  let scoringDiceArray = [0, 0, 0, 0, 0, 0];
  for (i = 0; i < dice.length; i++) {
    if (dice[i] && gameState.dice[i].available) {
      scoringDiceArray[gameState.dice[i].value - 1]++;
    }
    // scoringDiceArray[dice[i].value - 1]++;
  }
  return scoringDiceArray;
};

const getScoringOptions = (chosenDice) => {
  let scoringOptions = [];
  const diceCounts = countDice(chosenDice);
  addAllDice();

  // One to six (req 6 dice)
  for (i = 0; i < NUMBER_OF_DICE; i++) {
    if (diceCounts[i] != 1) {
      break;
    }
    if (i === 5 && diceCounts[i] === 1) {
      scoringOptions.push({ roll: "One to Six", score: 1500 });
      removeAllDice();
    }
  }

  // Any three pairs (req 6 dice)
  let pairCount = 0;
  for (i = 0; i < NUMBER_OF_DICE; i++) {
    if (diceCounts[i] === 2) {
      pairCount++;
    }
  }
  if (pairCount === 3) {
    scoringOptions.push({ roll: "Three Pairs", score: 1500 });
    removeAllDice();
  }

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
        removeUsedDice(i + 1, dieCount, chosenDice);
      }
    }
  }

  // Ones and Fives
  switch (diceCounts[0]) {
    case 0:
      break;
    case 1:
      scoringOptions.push({ roll: "Single one", score: 100 });
      removeUsedDice(1, diceCounts[0], chosenDice);
      break;
    case 2:
      scoringOptions.push({ roll: `${diceCounts[0]} ones`, score: 200 });
      removeUsedDice(1, diceCounts[0], chosenDice);
      break;
    default:
      scoringOptions.push({
        roll: `${diceCounts[0]} ones`,
        score: 1000 * (diceCounts[0] - 2),
      });
      removeUsedDice(1, diceCounts[0], chosenDice);
      break;
  }

  switch (diceCounts[4]) {
    case 0:
      break;
    case 1:
      scoringOptions.push({ roll: "Single five", score: 50 });
      removeUsedDice(5, diceCounts[4], chosenDice);
      break;
    case 2:
      scoringOptions.push({ roll: `${diceCounts[4]} fives`, score: 100 });
      removeUsedDice(5, diceCounts[4], chosenDice);
      break;
    default:
      scoringOptions.push({
        roll: `${diceCounts[4]} fives`,
        score: 500 * (diceCounts[4] - 2),
      });
      removeUsedDice(5, diceCounts[4], chosenDice);
      break;
  }

  if (scoringOptions.length === 0) {
    let chosenDiceLength = 0;
    let unavailableDice = 0;
    for (let i = 0; i < NUMBER_OF_DICE; i++) {
      chosenDiceLength += diceCounts[i];
      if (!gameState.dice[i].available) {
        unavailableDice++;
      }
    }
    if (chosenDiceLength === NUMBER_OF_DICE) {
      scoringOptions.push({ roll: "No scoring dice", score: 500 });
      removeAllDice();
    } else if (chosenDiceLength + unavailableDice === 6) {
      scoringOptions.push({ roll: "Zilch!", score: 0 });
      io.emit("enableZilch");
      // removeAllDice();
    } else {
      scoringOptions.push("Choose some dice to see your options");
    }
  }

  return scoringOptions;
};

const removeUsedDice = (diceValue, iterations, chosenDice) => {
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
    if (currentIterations === iterations) {
      break;
    }
  }
};

const removeAllDice = () => {
  for (i = 0; i < NUMBER_OF_DICE; i++) {
    gameState.dice[i].scored = true;
  }
};

const addAllDice = () => {
  for (i = 0; i < NUMBER_OF_DICE; i++) {
    gameState.dice[i].scored = false;
  }
};

http.listen(3000, () => {
  console.log("Listening on port 3000");
});
