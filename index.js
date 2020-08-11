let app = require('express')();
let http = require('http').createServer(app);
let io = require('socket.io')(http);

let connectedUsers = 0;

let game = null;

const functionName = parameters => returnValue;

const createNewGame = (initialPlayer, scoreLimit = 10000) => {
  const currentPlayer = initialPlayer ? initialPlayer : Math.floor(Math.random() + 1)
  game = {
    currentPlayer,
    score:  [0, 0],
    scoreLimit,
    history: [],
    dice: rollDice(6),
  }
}

const rollDice = numDice => {
  const dice = [];
  for(let i = 0; i < numDice; i++) {
    dice.push(Math.floor(Math.random() * 6) + 1);
  }
  return dice;
}

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

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  connectedUsers++;
  console.log('User connected at', new Date().toString());
  socket.on('disconnect', () => {
    console.log('User disconnected at', new Date().toString());
  });

  if(connectedUsers === 2) {
    createNewGame();
    console.log('Game created.');
  }
  socket.on('chat message', msg => {
    console.log('Received message:', msg)
    io.emit('chat message', 'test');
  })
});

http.listen(3000, () => {
  console.log('Listening on port 3000');
});