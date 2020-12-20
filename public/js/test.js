$(() => {
  let socket = io();
  let playerNumber = null;

  // Update status
  socket.on("status", (msg) => {
    $("#status").val(msg);
  });

  socket.on("scoringOptions", (msg) => {
    $("#scoringOptions").val(msg);
  });

  // Listen to player number assignments
  socket.on("assignPlayerNumber", (number) => {
    if (playerNumber === null) {
      playerNumber = number;
      document.getElementById("playerNumber").innerHTML = playerNumber;
    }
  });

  socket.on("newDice", (dice) => {
    $("#status").val(`Status: \n${JSON.stringify(dice)}`);
    for (let i = 0; i < dice.length; i++) {
      let die = dice[i];
      const checkBox = document.getElementById(`dice${i}`);
      const label = document.getElementById(`label${i}`);
      checkBox.disabled = !die.available;
      label.innerHTML = die.value;
    }
  });

  socket.on("enableCashIn", () => {
    document.getElementById("cashDice").disabled = false;
  });

  $("#rollDice").click(() => {
    let dice = [];
    for (let i = 0; i < 6; i++) {
      const checkBox = document.getElementById(`dice${i}`);
      dice[i] = checkBox.checked;
    }
    socket.emit("rollDice", dice);
    socket.emit("scoreDice", dice);
    socket.emit("status", "Submitted roll");
  });

  $("#cashDice").click(() => {
    let dice = [];
    for (let i = 0; i < 6; i++) {
      const checkBox = document.getElementById(`dice${i}`);
      dice[i] = checkBox.checked;
    }
    socket.emit("cashDice", dice);
    socket.emit("status", "Cashed in");
  });

  $("input:checkbox").change(() => {
    let chosenDice = [];
    let sentDice = [];
    for (let i = 0; i < 6; i++) {
      const checkBox = document.getElementById(`dice${i}`);
      sentDice.push({ id: `dice${i}`, checked: checkBox.checked });
      if (checkBox.checked && !checkBox.disabled) {
        chosenDice.push({
          value: document.getElementById(`label${i}`).innerHTML,
        });
      }
    }
    socket.emit("getScoringOptions", chosenDice);
    socket.emit("diceChoices", sentDice);
  });

  socket.on("diceChoices", (sentDice) => {
    for (let i = 0; i < sentDice.length; i++) {
      const checkBox = document.getElementById(sentDice[i].id);
      checkBox.disabled = sentDice[i].checked;
    }
  });
});
