var mongoose = require('mongoose'),
    passport = require('passport');

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
        message: 'Logged in successfully',
        username: user.username
      });
    });
  })(req, res, next);
};

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
