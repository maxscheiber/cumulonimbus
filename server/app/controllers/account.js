var mongoose = require('mongoose'),
    passport = require('passport');

var Account = mongoose.model('Account');

exports.show = function(req, res) {
  Account.load(req.params.account, function(err, account) {
    if (err || !account) {
      return res.render('404', {message: 'Account not found'});
    }
    return res.render('account', {
      account: account
    });
  });
};

exports.create = function(req, res) {
  if (req.method === 'GET') {
    return res.render('account_link');
  }
  var post = req.body;
  var name = post.name;
  var provider = post.provider;
  var token = post.token;

  if (!(name && provider)) {
    req.flash('error', 'You must provide a name and provider!');
    return res.redirect('/account/new');
  }

  var account = new Account({
    'name': name,
    'user': req.user._id,
    'oauthToken': token,
    'provider': provider,
    'capacity': 2*1024*1024*1024,
    'used': 0,
    'priority': 1,
    'createDate': Date.now()
  });

  account.save(function(err) {
    if (err) {
      console.log('account didnt save');
      console.log(err)
      return res.redirect('/account/new');
    }

    req.user.addAccount(account._id);
    // add account to user account list
    return res.redirect('/account/' + account._id);
  })
};
