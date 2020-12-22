$(() => {
  let socket = io();
  let playerNumber = null;
  let gameState = null;
  const NUMBER_OF_DICE = 6;

  // Update status
  socket.on("status", (msg) => {
    $("#status").val(msg);
  });

  socket.on("potentialScore", (msg) => {
    $("#potentialScore").text(msg);
  });

  socket.on("scoringOptions", (msg) => {
    $("#scoringOptions").val(msg);
  });

  socket.on("p1Score", (score) => {
    $("#p1Score").val(score);
  });

  socket.on("p2Score", (score) => {
    $("#p2Score").val(score);
  });

  // Listen to player number assignments
  socket.on("assignPlayerNumber", (number) => {
    if (playerNumber === null) {
      playerNumber = number;
      document.getElementById("playerNumber").innerHTML = playerNumber;
    }
  });

  socket.on("gameStateUpdate", (game) => {
    $("#status").val(`${JSON.stringify(game)}`);
    gameState = game;
    $("#currentScore").text(game.accumulatedPoints);

    setDice(gameState.dice);
  });

  socket.on("resetCheckboxes", () => {
    for (let i = 0; i < NUMBER_OF_DICE; i++) {
      document.getElementById(`dice${i}`).checked = false;
    }
    document.getElementById("rollDice").disabled = true;
    document.getElementById("zilch").style.display = "none";
    document.getElementById("freeRoll").style.display = "none";
  });

  socket.on("enableFreeRoll", () => {
    document.getElementById("freeRoll").style.display = "block";
    document.getElementById("freeRoll").disabled =
      playerNumber !== gameState.currentPlayer;
    document.getElementById("rollDice").disabled = true;
    document.getElementById("cashDice").disabled = true;
  });

  const setDice = (dice) => {
    for (let i = 0; i < dice.length; i++) {
      let die = dice[i];
      const checkBox = document.getElementById(`dice${i}`);
      const label = document.getElementById(`label${i}`);
      checkBox.disabled =
        !die.available || playerNumber !== gameState.currentPlayer;
      label.innerHTML = die.value;
    }
    // document.getElementById("rollDice").disabled =
    //   playerNumber !== gameState.currentPlayer;
  };

  socket.on("enableCashIn", () => {
    document.getElementById("cashDice").disabled =
      playerNumber !== gameState.currentPlayer;
  });

  socket.on("enableRollDice", () => {
    document.getElementById("rollDice").disabled =
      playerNumber !== gameState.currentPlayer;
  });

  $("#rollDice").click(() => {
    let dice = [];
    for (let i = 0; i < NUMBER_OF_DICE; i++) {
      const checkBox = document.getElementById(`dice${i}`);
      dice[i] = checkBox.checked;
    }
    console.log(dice);
    socket.emit("rollDice", dice);
    socket.emit("scoreDice", dice);
    socket.emit("status", "Submitted roll");
  });

  $("#cashDice").click(() => {
    // let dice = [];
    // for (let i = 0; i < 6; i++) {
    //   const checkBox = document.getElementById(`dice${i}`);
    //   dice[i] = checkBox.checked;
    // }
    socket.emit("cashDice");
    // socket.emit("cashDice", dice);
    socket.emit("status", "Cashed in");
  });

  $("#zilch").click(() => {
    socket.emit("zilch");
  });

  $("#freeRoll").click(() => {
    socket.emit("freeRoll");
  });

  $("input:checkbox").change(() => {
    document.getElementById("rollDice").disabled = true;
    document.getElementById("cashDice").disabled = true;
    let chosenDice = [];
    let sentDice = [];
    for (let i = 0; i < NUMBER_OF_DICE; i++) {
      const checkBox = document.getElementById(`dice${i}`);
      sentDice.push({ id: `dice${i}`, checked: checkBox.checked });
      chosenDice[i] = checkBox.checked && gameState.dice[i].available;
    }
    // console.log(chosenDice);
    socket.emit("scoreDice", chosenDice);
    socket.emit("diceChoices", sentDice);
  });

  socket.on("diceChoices", (sentDice) => {
    for (let i = 0; i < sentDice.length; i++) {
      const checkBox = document.getElementById(sentDice[i].id);
      checkBox.checked = sentDice[i].checked;
    }
  });

  socket.on("enableZilch", () => {
    document.getElementById("zilch").style.display = "block";
    document.getElementById("zilch").disabled =
      playerNumber !== gameState.currentPlayer;
    document.getElementById("rollDice").disabled = true;
    document.getElementById("cashDice").disabled = true;
  });
});
