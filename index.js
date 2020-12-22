const { defaultMaxListeners } = require("stream");

let express = require("express");
let path = require("path");
let app = require("express")();
let http = require("http").createServer(app);
let io = require("socket.io")(http);
let numberToWords = require("number-to-words");

// https://stackoverflow.com/a/36041093
// Express Middleware for serving static files
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

let connectedUsers = 0;

let gameState = null;
const NUMBER_OF_DICE = 6;

// Cheat sheet for socket.io event emission:
// https://socket.io/docs/v3/emit-cheatsheet/index.html

io.on("connection", (socket) => {
  connectedUsers++;
  console.log("User connected at", new Date().toString());
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

  socket.on("diceChoices", (sentDice) => {
    socket.broadcast.emit("diceChoices", sentDice);
  });

  socket.on("rollDice", (selectedDice) => {
    io.emit("status", "Rolling dice.");

    let unscoredDice = [];

    for (let i = 0; i < NUMBER_OF_DICE; i++) {
      if (gameState.dice[i].available && selectedDice[i]) {
        gameState.dice[i].available = false;
        unscoredDice.push(gameState.dice[i].value);
      }
    }

    gameState.accumulatedPoints += gameState.potentialRollScore;
    gameState.potentialRollScore = 0;

    gameState.dice = rollDice(gameState.dice);
    io.emit("currentScore", gameState.accumulatedPoints);
    io.emit("gameStateUpdate", gameState);
  });

  socket.on("getScoringOptions", (chosenDice) => {
    const scoringDiceArray = checkDice(chosenDice);
    let scoringOptions = [];

    if (scoringDiceArray.length === NUMBER_OF_DICE) {
      // One to six (req 6 dice)
      for (i = 0; i < NUMBER_OF_DICE; i++) {
        if (scoringDiceArray[i] != 1) {
          break;
        }
        if (i === 5 && scoringDiceArray[i] === 1) {
          scoringOptions.push({ roll: "One to six*", score: 1500 });
        }
      }

      // Any three pairs (req 6 dice)
      let pairCount = 0;
      for (i = 0; i < NUMBER_OF_DICE; i++) {
        if (scoringDiceArray[i] === 2) {
          pairCount++;
        }
      }
      if (pairCount === 3) {
        scoringOptions.push({ roll: "Any three pairs*", score: 1500 });
      }
    }

    // Three of a kind or more
    for (i = 1; i < NUMBER_OF_DICE; i++) {
      const h = scoringDiceArray[i];
      if (h >= 3) {
        if (i < 4) {
          // Twos, threes, fours
          scoringOptions.push({
            roll: `${h} ${numberToWords.toWords(i + 1)}s`,
            score: i * 100 * (h - 2),
          });
        } else if (i === 5) {
          // Sixes
          scoringOptions.push({
            roll: `${h} ${numberToWords.toWords(i + 1)}es`,
            score: i * 100 * (h - 2),
          });
        }
      }
    }

    // Ones and Fives
    switch ((i = scoringDiceArray[0])) {
      case 0:
        break;
      case 1:
        scoringOptions.push({ roll: "Single one", score: 100 });
        break;
      case 2:
        scoringOptions.push({ roll: `${i} ones`, score: 200 });
        break;
      default:
        scoringOptions.push({
          roll: `${i} ones`,
          score: 1000 * (i - 2),
        });
        break;
    }

    switch ((i = scoringDiceArray[4])) {
      case 0:
        break;
      case 1:
        scoringOptions.push({ roll: "Single five", score: 50 });
        break;
      case 2:
        scoringOptions.push({ roll: `${i} fives`, score: 100 });
        break;
      default:
        scoringOptions.push({
          roll: `${i} fives`,
          score: 500 * (i - 2),
        });
        break;
    }

    if (scoringOptions.length === 0) {
      let chosenDiceLength = 0;
      let unavailableDice = 0;
      for (let i = 0; i < NUMBER_OF_DICE; i++) {
        chosenDiceLength += scoringDiceArray[i];
        if (!gameState.dice[i].available) {
          unavailableDice++;
        }
      }
      if (chosenDiceLength === NUMBER_OF_DICE) {
        scoringOptions.push({ roll: "No scoring dice", score: 500 });
      } else if (chosenDiceLength + unavailableDice === 6) {
        // After three consecutive zilch counts, lose 500 points ***
        scoringOptions.push("Zilch!");
        socket.emit("enableZilch");
        socket.broadcast.emit("enableZilch");
        gameState.consecutiveZilchCounter[gameState.currentPlayer - 1]++;
      } else {
        scoringOptions.push("Choose some dice to see your options");
      }
    }

    gameState.potentialRollScore = 0;
    for (let i = 0; i < scoringOptions.length; i++) {
      gameState.potentialRollScore += scoringOptions[i].score;
    }
    enableCashIn();

    io.emit("scoringOptions", JSON.stringify(scoringOptions));
  });
});

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
  };
};

const enableCashIn = () => {
  const totalPotentialScore =
    gameState.accumulatedPoints + gameState.potentialRollScore;
  io.emit("potentialScore", totalPotentialScore);
  if (totalPotentialScore >= 300) {
    io.emit("enableCashIn");
  }
};

const selectDice = (selection, previousDice) => {
  const processedDice = [];

  for (let i = 0; i < previousDice.length; i++) {
    processedDice[i] = previousDice[i];
    if (previousDice[i].available && selection[i]) {
      processedDice[i].available = false;
    }
  }

  return processedDice;
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
    });
  }
  return dice;
};

// Returns an array of ordered dice values for scoring
const checkDice = (dice) => {
  let scoringDiceArray = [0, 0, 0, 0, 0, 0];
  for (i = 0; i < dice.length; i++) {
    scoringDiceArray[dice[i].value - 1]++;
  }
  return scoringDiceArray;
};

http.listen(3000, () => {
  console.log("Listening on port 3000");
});
