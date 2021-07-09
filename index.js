const express = require("express");
const path = require("path");
const app = express();
const setUpSocketEvents = require("./socket").setUp;

// console.log(setUpSocketEvents);

// https://stackoverflow.com/a/36041093
// Express Middleware for serving static files
app.use(express.static(path.join(__dirname, "public")));

app.get("", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

// Set up socket.io and register events
const http = require("http").createServer(app);
const io = require("socket.io")(http);
setUpSocketEvents(io);

// Global state - should eventually be moved into "rooms"
let gameState = null;
let connectedUsers = 0;

http.listen(3000, () => {
  console.log("Listening on port 3000");
});
