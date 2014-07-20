var mongoose = require('mongoose'),
    passport = require('passport'),
    request = require('request'),
    dotenv = require('dotenv');

var User = mongoose.model('User');
var Account = mongoose.model('Account');
var File = mongoose.model('File');
dotenv.load();

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
        message: 'Logged in successfully',
        username: user.username
      });
    });
  })(req, res, next);
};

exports.dropbox = function(req, res, next) {
  var authCode = req.param('code');
  var accountId = req.param('state'); // CSRF

  request.post('https://api.dropbox.com/1/oauth2/token',
    {
      auth: {
        // TODO: don't keep this in source code
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
            return res.render('accounts', {
              user: req.user,
              accounts: req.user.accounts,
              partials: {
                account: 'partials/account'
              }
            });
          });
        });
      } else {
        return res.render('404', {message: 'Failed to authenticate'});
      }
    });
}

exports.instructions = function(req, res) {
  var body = req.body;
  var size = body.size;

  Account.getMostFree(req.user._id, function(err, account) {
    if (account.free < body.size) {
      res.json(403, {error: 'Not enough room'});
    }

    // return oauth token, provider, account
    return res.json({
      token: account.oauthToken,
      provider: account.provider,
      account: account.name
    });
  });
}

exports.tokens = function(req, res) {
  return res.json({message: 'not done yet'});
}
