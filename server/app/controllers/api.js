var mongoose = require('mongoose'),
    passport = require('passport'),
    _ = require('underscore'),
    request = require('request'),
    dotenv = require('dotenv');

dotenv.load();

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

function outputFiles(res) {
  return function(err, files) {
    if (err) {
      return res.json(404, {
        status: 'error',
        message: 'Failed to fetch files'
      })
    }

    return res.json({
      status: 'success',
      files: _.map(files, File.toSimpleJSON)
    });
  }
}

exports.pathListing = function(req, res) {
  var path = File.normalizePath(req.params[0]);

  console.log('getting listing for path ' + path);

  File.forUserPath(path, req.user._id, outputFiles(res));
}

exports.treeListing = function(req, res) {
  File.forUser(req.user._id, outputFiles(res));
}

exports.accounts = function(req, res) {
  User.load(req.user.username, function(err, user) {
    if (err) {
      return res.json(404, {
        status: 'error',
        message: 'User not found'
      });
    }

    accounts = _.map(user.accounts, Account.toSimpleJson);

    return res.json({
      status: 'success',
      accounts: accounts
    });
  });
}

exports.dropbox = function(req, res, next) {
  var authCode = req.param('code');
  var accountId = req.param('state'); // CSRF

  request.post('https://api.dropbox.com/1/oauth2/token',
    {
      auth: {
        'user': process.env.DROPBOX_KEY,
        'pass': process.env.DROPBOX_SECRET,
        'sendImmediately': true
      },
      form: {
        code: authCode,
        grant_type: 'authorization_code',
        // TODO: use whichever server we're on
        redirect_uri: 'http://localhost:8080/dropbox'
      }
    }, function (error, response, body) {
      var accessToken = JSON.parse(body).access_token;
      if (accessToken) {
        Account.load(accountId, function(err, account) {
          if (err || !account) {
            // really shouldn't happen
            return res.render('404', {message: 'Account not found'});
          }

          account.oauthToken = accessToken;
          account.save(function(err) {
            if (err) {
              console.log(err);
              return res.render('500');
            }
            return res.redirect('/accounts');
          });
        });
      } else {
        return res.render('404', {message: 'Failed to authenticate'});
      }
    }
  );
}

exports.instructionsNew = function(req, res) {
  var size = req.body.size;

  if (!size) {
    return res.json(403, {
      status: 'error',
      message: 'Please provide a size'
    })
  }

  Account.getMostFree(req.user._id, function(err, account) {
    if (account.free < size) {
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
  var path = File.normalizePath(post.path);
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

    Account.addUsage(accountId, size, function(err) {
      if (err) {
        console.log(err)
        return res.json(500, {
          status: 'error',
          message: 'Failed to update space usage'
        });
      }

      return res.json({
        status: 'success',
        message: 'File added successfully'
      });
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
