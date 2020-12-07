const { defaultMaxListeners } = require("stream");

let app = require("express")();
let http = require("http").createServer(app);
let io = require("socket.io")(http);

// To change number to words for scoring
let numberToWords = require("number-to-words");

let connectedUsers = 0;

let game = null;

const createNewGame = (initialPlayer, scoreLimit = 10000) => {
  const currentPlayer = initialPlayer
    ? initialPlayer
    : Math.floor(Math.random() + 1);

  game = {
    accumulatedPoints: 0, // The points accumulated, but not cashed in, on a specific turn.
    currentPlayer,
    dice: rollDice(),
    history: [], // The history of moves played so far in the game
    score: [0, 0], // Current (banked) score of both players
    scoreLimit, // The score limit for this game.
    selectedDice: [], // The indices of currently selected (not cashed) dice.
  };
};

const rollDice = (previousDice) => {
  if (previousDice) {
    // Previous dice are available
    return previousDice.map((die) => {
      if (die.available) {
        // If the die is available to be rolled, reroll its value.
        return {
          available: true,
          value: Math.floor(Math.random() * 6) + 1,
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
  // Debugging
  console.log(dice); // Prints dice values and availabilities

  var availableDice = [0, 0, 0, 0, 0, 0];

  for (i = 0; i < dice.length; i++) {
    if (dice[i].available == true) {
      availableDice[dice[i].value - 1]++;
    }
  }
  return availableDice;
};

const getScoringOptions = (availableDice) => {
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
        scoringOptions.push("One to six*");
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
      scoringOptions.push("Any three pairs*");
    }
  }

  // Three of a kind or more
  for (i = 1; i < 6; i++) {
    // Starts at 2
    if (availableDice[i] >= 3) {
      // While the number of available dice is still above 3, add all valid combinations
      for (h = availableDice[i]; h >= 3; h--) {
        if (i != 5) {
          scoringOptions.push(`${h} ${numberToWords.toWords(i + 1)}s`);
        } else {
          scoringOptions.push(`${h} ${numberToWords.toWords(i + 1)}es`); // Sixes
        }
      }
    }

    // Ones and Fives
    switch (availableDice[0]) {
      default:
        // While the number of available dice is still above 0, add all valid combinations
        for (i = availableDice[0]; i > 0; i--) {
          if (i == 1) {
            scoringOptions.push("Single one");
            continue;
          }
          scoringOptions.push(`${i} ones`);
        }
        break;
    }
    switch (availableDice[4]) {
      default:
        // While the number of available dice is still above 0, add all valid combinations
        for (i = availableDice[4]; i > 0; i--) {
          if (i == 1) {
            scoringOptions.push("Single five");
            continue;
          }
          scoringOptions.push(`${i} fives`);
        }
        break;
    }

    // Checks for empty array
    if (scoringOptions.length == 0) {
      if (availableDice.length == 6) {
        scoringOptions.push("No scoring dice"); // Combo if all dice don't give a combo
      } else {
        scoringOptions.push("Zilch!"); // Otherwise, zilch out
      }
    }

    // debugging
    console.log(scoringOptions);

    // Return list of possible options
    return scoringOptions;
  }
};

// Prints dice values and all possible combinations
getScoringOptions(checkDice(rollDice()));

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

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

io.on("connection", (socket) => {
  connectedUsers++;
  console.log("User connected at", new Date().toString());
  socket.on("disconnect", () => {
    connectedUsers--;
    console.log("User disconnected at", new Date().toString());
  });

  if (connectedUsers === 2) {
    createNewGame();
    io.emit('status', "Second player found.")
    console.log("Game created.");
  }
  socket.on("rollDice", (msg) => {
    console.log("Received message:", msg);
    io.emit('status', "Rolling dice.")
    const dice = rollDice();
    io.emit("newDice", dice);
    io.emit('status', "Rolled dice.")
  });
});

http.listen(3000, () => {
  console.log("Listening on port 3000");
});
