var mongoose = require('mongoose'),
    passport = require('passport');

var User = mongoose.model('User');

exports.show = function(req, res) {
  User.findByUsername(req.params.username, function(err, user) {
    if (err || !user) {
      return res.render('404', {message: 'User not found'});
    }
    return res.render('user', {
      user: user
    });
  });
};

exports.accounts = function(req, res) {
  User.load(req.params.username, function(err, user) {
    if (err || !user) {
      return res.render('404', {message: 'User not found'});
    }

    return res.render('accounts', {
      user: user,
      accounts: user.accounts,
      partials: {
        account: 'partials/account'
      }
    });
  });
};

exports.processLogin = passport.authenticate('local', {
  successRedirect: '/filemanager',
  failureRedirect: '/login',
  failureFlash: 'Invalid username or password',
  successFlash: 'Logged in successfully!'
});

exports.register = function(req, res) {
  var post = req.body;
  var username = post.username;
  var email = post.email;
  var password = post.password;
  var verifyPassword = post.verifyPassword;

  if (!(username && email)) {
    req.flash('error', 'You must provide a username and email!');
    return res.redirect('/login');
  }

  if (password !== verifyPassword) {
    req.flash('error', 'Your passwords did not match!');
    return res.redirect('/login');
  }

  var user = {
    'email': email,
    'username': username,
    'createDate': Date.now()
  };

  User.register(user, password, function(err, user) {
    if (err) {
      if (err.code === 11000) {
        req.flash('error', 'That email address is already in use!');
      } else {
        req.flash('error', err.message);
      }
      return res.redirect('/login');
    } else {
      req.login(user, function(err) {
        if (err) {
          // this should never happen...classic line right
          console.log('wtf failed to login');
        }
        return res.redirect('/');
      });
    }
  });
};
