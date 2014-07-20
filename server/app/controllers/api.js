var mongoose = require('mongoose'),
    passport = require('passport'),
    _ = require('underscore');

var User = mongoose.model('User');
var Account = mongoose.model('Account');
var File = mongoose.model('File');

exports.login = function(req, res, next) {
  passport.authenticate('local', function(err, user, info) {
    if (err) {
      return res.json(401, {message: 'Error logging in'});
    }
    if (!user) {
      return res.json(401, {message: 'Bad login credentials'});
    }
    req.logIn(user, function(err) {
      if (err) {
        return next(err);
      }

      return res.json({
        status: 'success',
        message: 'Logged in successfully',
        username: user.username
      });
    });
  })(req, res, next);
};

exports.pathListing = function(req, res) {
  return res.json({message: 'not completed yet'})
}

function reduceAccount(account) {
  return {
    id: account._id,
    name: account.name,
    provider: account.provider,
    token: account.oauthToken
  };
}

exports.accounts = function(req, res) {
  User.load(req.user.username, function(err, user) {
    if (err) {
      return res.json(404, {message: 'User not found'});
    }

    accounts = _.map(user.accounts, reduceAccount);

    return res.json({
      status: 'success',
      accounts: accounts
    });
  });
}

exports.instructionsNew = function(req, res) {
  var size = req.body.size;

  Account.getMostFree(req.user._id, function(err, account) {
    if (account.free < body.size) {
      return res.json(403, {error: 'Not enough room'});
    }

    return res.json({
      status: 'success',
      account: reduceAccount(account)
    });
  });
}

exports.instructionsMove = function(req, res) {
  return res.json({message: 'not done yet'});
}

exports.instructionsModify = function(req, res) {
  return res.json({message: 'not done yet'});
}

exports.instructionsDelete = function(req, res) {
  return res.json({message: 'not done yet'});
}

exports.updateNew = function(req, res) {
  var post = req.body;

  var filename = post.filename;
  var path = post.path;
  var provider = post.provider;
  var cloudId = post.cloudId;
  var size = post.size;
  var accountId = post.accountId;
  var now = Date.now();

  if (!(filename && path && provider && cloudId && size && accountId)) {
    return res.json('403', {
      status: 'error',
      message: 'Include all fields: filename path provider cloudId size accountId'
    })
  }

  var file = new File({
    name: filename,
    path: path,
    provider: provider,
    cloudId: cloudId,
    size: size,
    user: req.user._id,
    account: accountId,
    createDate: now,
    changeDate: now
  });

  file.save(function(err) {
    if (err) {
      return res.json(500, {
        status: 'error',
        message: 'Failed to add file'
      });
    }

    return res.json({
      status: 'success',
      message: 'File added successfully'
    });
  })
}

exports.updateMove = function(req, res) {
  return res.json({message: 'not done yet'});
}

exports.updateModify = function(req, res) {
  return res.json({message: 'not done yet'});
}

exports.updateDelete = function(req, res) {
  return res.json({message: 'not done yet'});
}
