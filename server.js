var socketio = require('socket.io');
var http = require('http');
var fs = require('fs');
var p2 = require('p2');

var server = http.createServer(app);
var io = socketio.listen(server, {log: false});

function app (req, res) {
  if (req.url === '/favicon.ico') {
    return res.end();
  }

  if (req.url === '/') {
    var read = fs.createReadStream('index.html');
    return read.pipe(res);
  }

  if (req.url === '/bunny.png' || req.url === '/pixi.js') {
    var read = fs.createReadStream(req.url.substring(1));
    return read.pipe(res);
  }
};

Game = function () {
  this.players = [];
  this.world = new p2.World({gravity: [0, -20]});
}

Game.prototype.init = function () {
  this.world.solver.tolerance = 0.001;

  var groundShape = new p2.Plane();
  var ground = new p2.Body({position:[0,0]});

  ground.addShape(groundShape);
  this.world.addBody(ground);
}

Game.prototype.addPlayer = function (player) {
  this.players.push(player);
  this.world.addBody(player.body);
}

Game.prototype.killPlayer = function (player) {
  this.players.splice(this.players.indexOf(player), 1);
  this.world.removeBody(player.body);
}

Game.prototype.step = function () {
  var self;

  this.world.step(1/20);

  var playerState = this.players.map(function (player) {
    var step = player.step();
    return step;
  });

  return {'timestamp': Date.now(), 'playerState': playerState };
}

Player = function (x, y) {
  // Player connection
  this.index = null;
  this.id = null;

  // Player Controllable Variables
  this.futureMove = '';
  this.futureJump = false;
  this.isJumping = true;

  // Physics Controlled Variables
  this.shape = new p2.Rectangle(26.0, 35.0, 0, 0, 0);
  this.body = new p2.Body({ mass: 100, position:[x, y] });
  this.body.addShape(this.shape);
}

Player.prototype.move = function (direction) {
  this.futureMove = direction;
}

Player.prototype.jump = function () {
  if (!this.isJumping) {
    this.futureJump = true;
    this.isJumping = true;
  }
}

Player.prototype.step = function () {
  var step = {};

  // Jump Updates
  if (this.futureJump) {
    this.futureJump = false;
    this.body.velocity[1] = 75;
  } else {
    if (this.body.position[1] < 18) {
      this.isJumping = false;
    }
  }

  // Move Stuff
  if (this.futureMove === 'LEFT')
    this.body.velocity[0] = -50;
  if (this.futureMove === 'RIGHT')
    this.body.velocity[0] = 50;

  step.id = this.id;
  step.x = this.body.position[0];
  step.y = this.body.position[1];

  return step;
}

var connections = [];
var game = new Game();

game.init();

io.sockets.on('connection', function (socket) {
  socket.broadcast.emit('user:new');

  var player = new Player(100, 100);

  connections.push(socket.id);
  player.id = socket.id;
  game.addPlayer(player);

  socket.on('player:move', player.move.bind(player));
  socket.on('player:jump', player.jump.bind(player));

  socket.on('disconnect', function() {
    connections.splice(connections.indexOf(socket), 1);
    game.killPlayer(player);
  });
});

var tickLengthMs = 1000 / 60;
var previousTick = Date.now()
var actualTicks = 0

function gameLoop () {
  var now = Date.now();
  actualTicks++;

  if (previousTick + tickLengthMs <= now) {
    var delta = (now - previousTick) / 1000;
    previousTick = now;
    actualTicks = 0;

    io.sockets.volatile.emit('game:state', game.step());
  }

  if (Date.now() - previousTick < tickLengthMs - 16)
    setTimeout(gameLoop);
  else setImmediate(gameLoop);
}

gameLoop();
server.listen(5000);
