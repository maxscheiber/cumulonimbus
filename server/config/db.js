var mongoose = require('mongoose'),
    config = require('./config'),
    path = require('path'),
    _ = require('underscore');

mongoose.connect(config.dbPath);

mongoose.connection.on('connected', function () {
  console.log('Mongoose connected');
});

mongoose.connection.on('disconnected', function () {
  console.log('Mongoose disconnected');
});

mongoose.connection.on('error', function (err) {
  console.log('Mongoose error: ' + err);
});

var models = [
  'user',
  'account',
  'file',
];

_.each(models, function(model) {
  require(path.join(config.appRoot, 'models', model));
});
