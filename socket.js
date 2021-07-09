const {
  nextPlayerTurn,
  createNewGame,
  enableRollDice,
  enableFreeRoll,
  rollDice,
  disableUsedDice,
  enableCashIn,
  getScoringOptions,
} = require("./dice");

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

// Cheat sheet for socket.io event emission:
// https://socket.io/docs/v3/emit-cheatsheet/index.html
const setUpSocketEvents = (io) => {
  connectedUsers = 0;
  gameState = {};

  io.on("connection", (socket) => {
    // On connection, increment the count of connected users and set up socket events.
    connectedUsers++;
    console.log("Connection: User connected at", new Date().toString());

    // Send the connecting user a player number
    io.emit("assignPlayerNumber", connectedUsers);

    // Decrement user count when a user disconnects.
    socket.on("disconnect", () => {
      connectedUsers--;
      console.log("Connection: User disconnected at", new Date().toString());
    });

    // TODO: Support arbitrary number of users.
    // For now, when 2 users join the game will automatically start.
    if (connectedUsers === 2) {
      gameState = createNewGame();
      io.emit("gameStateUpdate", gameState);
      console.log("Game state: Game created.");
    }

    // When dice are selected or deselected by a player, re-emit the selections made to other players.
    socket.on("diceChoices", (sentDice) => {
      socket.broadcast.emit("diceChoices", sentDice);
    });

    // Submit some dice for scoring and roll the rest.
    socket.on("submitAndRollDice", (selectedDice) => {
      io.emit("status", "Rolling dice.");

      disableUsedDice(selectedDice, gameState);

      gameState.accumulatedPoints += gameState.potentialRollScore;
      gameState.potentialRollScore = 0;

      gameState.dice = rollDice(gameState);

      io.emit("gameStateUpdate", gameState);
    });

    // Gets potential scores for dice and enables buttons based on points and checkbox requirements
    socket.on("scoreDice", (chosenDice) => {
      let scoringOptions = getScoringOptions(chosenDice, gameState);

      if (enableCashIn(scoringOptions, gameState)) io.emit("enableCashIn");

      io.emit(
        "potentialScore",
        gameState.accumulatedPoints + gameState.potentialRollScore
      );

      // Checks eligibility of button appearances
      if (enableRollDice(gameState)) io.emit("enableRollDice");
      if (enableFreeRoll(gameState) === 6) io.emit("enableFreeRoll");
      if (scoringOptions[0].roll === "Zilch!") io.emit("enableZilch");
      io.emit("scoringOptions", JSON.stringify(scoringOptions));
    });

    // Adds accumulated points to the current player's total and starts the next player's turn
    socket.on("submitAndCashDice", () => {
      gameState.consecutiveZilchCounter[gameState.currentPlayer - 1] = 0;

      // Updates and emits current player's score
      gameState.score[gameState.currentPlayer - 1] +=
        gameState.potentialRollScore + gameState.accumulatedPoints;
      const currentPlayerScore = gameState.score[gameState.currentPlayer - 1];
      gameState.currentPlayer == 1
        ? io.emit("p1Score", currentPlayerScore)
        : io.emit("p2Score", currentPlayerScore);

      // If the current player reached the score limit the game is over
      // If not, it is the next player's turn
      if (currentPlayerScore >= gameState.scoreLimit) {
        io.emit("status", "Player " + gameState.currentPlayer + " wins!");
        // Once the score limit has been reached, the next player(s) get to take one turn to try to beat the leader.
        // clearTurnState(gameState);
        nextPlayerTurn(gameState);
      } else {
        nextPlayerTurn(gameState);
      }
      io.emit("scoringOptions", "");
      io.emit("gameStateUpdate", gameState);
    });

    // Increments zilch counter and starts the next player's turn
    socket.on("zilch", () => {
      gameState.consecutiveZilchCounter[gameState.currentPlayer - 1]++;

      // Deducts points after three consecutive zilches from the current player,
      // resets the zilch counter and emits the player's new score
      if (gameState.consecutiveZilchCounter[gameState.currentPlayer - 1] == 3) {
        gameState.score[gameState.currentPlayer - 1] -= 500;
        const currentPlayerScore = gameState.score[gameState.currentPlayer - 1];
        gameState.consecutiveZilchCounter[gameState.currentPlayer - 1] = 0;
        gameState.currentPlayer == 1
          ? io.emit("p1Score", currentPlayerScore)
          : io.emit("p2Score", currentPlayerScore);
      }
      nextPlayerTurn(gameState);
      io.emit("potentialScore", gameState.potentialRollScore);
      io.emit("scoringOptions", "");
      io.emit("gameStateUpdate", gameState);
    });

    // Adds up accumulated points and rerolls all dice for the current player
    socket.on("freeRoll", () => {
      gameState.accumulatedPoints += gameState.potentialRollScore;
      io.emit("scoringOptions", "");
      gameState.dice = rollDice();
      io.emit("gameStateUpdate", gameState);
    });
  });
};

exports.setUp = setUpSocketEvents;
