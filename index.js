const { defaultMaxListeners } = require("stream");

let express = require("express");
let path = require("path");
let app = require("express")();
let http = require("http").createServer(app);
let io = require("socket.io")(http);

// https://stackoverflow.com/a/36041093
// Express Middleware for serving static files
app.use(express.static(path.join(__dirname, 'public')));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// To change number to words for scoring
let numberToWords = require("number-to-words");

let connectedUsers = 0;

let game = null;
let turnScore = 0;

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
    game = createNewGame();
    io.emit("status", "Second player found. New game!");
    io.emit("newDice", game.dice);
    console.log("Game created.");
  }

  socket.on("diceChoices", (sentDice) => {
    socket.broadcast.emit("diceChoices", sentDice);
  });

  socket.on("rollDice", (selectedDice) => {
    io.emit("status", "Rolling dice.");

    let unscoredDice = [];

    for (let i = 0; i < 6; i++) {
      if (game.dice[i].available && selectedDice[i]) {
        game.dice[i].available = false;
        unscoredDice.push(game.dice[i].value);
      }
    }

    game.dice = rollDice(game.dice);

    io.emit("newDice", game.dice);
  });

  // const getScoringOptions = (availableDice) => {
  socket.on("getScoringOptions", (chosenDice) => {
    const availableDice = checkDice(chosenDice);
    var scoringOptions = [];
    // Special rolls
    if (availableDice.length == 6) {
      // One to six (req 6 dice)
      for (i = 0; i < 6; i++) {
        // Breaks out of statement if number of dice for any value isn't 1
        if (availableDice[i] != 1) {
          break;
        }
        if (i == 5 && availableDice[i] == 1) {
          scoringOptions.push({ roll: "One to six*", score: 1500 });
        }
      }
      // Any three pairs (req 6 dice)
      var pairCount = 0;
      for (i = 0; i < 6; i++) {
        // Checks for pairs and increments the counter
        if (availableDice[i] == 2) {
          pairCount++;
        }
      }
      if (pairCount == 3) {
        scoringOptions.push({ roll: "Any three pairs*", score: 1500 });
      }
    }
    // Three of a kind or more
    for (i = 1; i < 6; i++) {
      // Starts at 2
      let h = availableDice[i];
      if (h >= 3) {
        if (i != 5 || i != 4) {
          scoringOptions.push({
            roll: `${h} ${numberToWords.toWords(i + 1)}s`,
            score: i * 100 * (h - 2),
          });
        } else if (i != 4) {
          // Sixes
          scoringOptions.push({
            roll: `${h} ${numberToWords.toWords(i + 1)}es`,
            score: i * 100 * (h - 2),
          });
        }
      }
    }
    // Ones and Fives
    switch ((i = availableDice[0])) {
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

    switch ((i = availableDice[4])) {
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
    // Checks for empty array
    if (scoringOptions.length == 0) {
      let chosenDiceLength = 0;
      let unavailableDice = 0;
      for (let i = 0; i < 6; i++) {
        chosenDiceLength += availableDice[i];
        if (!game.dice[i].available) {
          unavailableDice++;
        }
      }
      if (chosenDiceLength == 6) {
        scoringOptions.push({ roll: "No scoring dice", score: 500 }); // Combo if all dice don't give a combo
      } else if (chosenDiceLength + unavailableDice == 6) {
        // after three consecutive zilch counts, lose 500 points ***
        scoringOptions.push("Zilch!"); // Otherwise, zilch out
      } else {
        scoringOptions.push("Choose some dice to see your options");
      }
    }

    let potentialRollScore = 0;
    for (let i = 0; i < scoringOptions.length; i++) {
      potentialRollScore += scoringOptions[i].score;
    }
    enableCashIn(turnScore, potentialRollScore);

    // Changes status to list of possible options
    io.emit("scoringOptions", JSON.stringify(scoringOptions));
  });
});

const enableCashIn = (turnScore, potentialRollScore) => {
  let totalPotentialScore = turnScore + potentialRollScore;
  if (totalPotentialScore >= 300) {
    io.emit("enableCashIn");
  }
};

http.listen(3000, () => {
  console.log("Listening on port 3000");
});

const createNewGame = (initialPlayer, scoreLimit = 10000) => {
  const currentPlayer = initialPlayer
    ? initialPlayer
    : Math.floor(Math.random() + 1);

  return {
    accumulatedPoints: 0, // The points accumulated, but not cashed in, on a specific turn.
    currentPlayer,
    dice: rollDice(),
    history: [], // The history of moves played so far in the game
    score: [0, 0], // Current (banked) score of both players
    consecutiveZilchCounter: [0, 0], // Current number of consecutive zilches for both players
    scoreLimit, // The score limit for this game.
  };
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
          value: Math.floor(Math.random() * 6) + 1,
          available: true,
        };
      }
      return die; // Otherwise, return the used die without changing its value.
    });
  }

  // If no previous dice are supplied, return a fresh roll of 6 dice.
  const dice = [];
  for (let i = 0; i < 6; i++) {
    dice.push({ value: Math.floor(Math.random() * 6) + 1, available: true });
  }
  return dice;
};

const checkDice = (dice) => {
  var availableDice = [0, 0, 0, 0, 0, 0];

  for (i = 0; i < dice.length; i++) {
    // if (dice[i].available != true) {
    availableDice[dice[i].value - 1]++;
    // }
  }
  return availableDice;
};

/*
values = [0,0,0,0,0,0];
values[0]++ // Found a 1
values[1]++ // Found a 2
...
values[5]++ // Found a 6

if there are any ones or fives this counts as a scoring "combo" ("single one, 2 ones, 2 fives, single five")
if any of the values are >=3 that is a scoring combo ("3 ones, 4 twos, 5 threes, etc")
if there are 6 dice:
  if there are 3 values that are equal to 2 => three pairs
  if all values are equal to 1 => 1-2-3-4-5-6
else if nothing scored:
  give the "nothing" combo
*/
