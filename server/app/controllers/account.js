var mongoose = require('mongoose'),
    passport = require('passport'),
    dotenv = require('dotenv');

var Account = mongoose.model('Account');
dotenv.load();

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

  if (!(name && provider)) {
    req.flash('error', 'You must provide a name and provider!');
    return res.redirect('/account/new');
  }

  if (provider !== 'dropbox' && provider !== 'box' && provider !== 'gdrive') {
    return res.redirect('/account/new');
  }

  var account = new Account({
    'name': name,
    'user': req.user._id,
    'provider': provider,
    'capacity': 2*1024*1024*1024,
    'free': 2*1024*1024*1024,
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

    // add account to user account list
    req.user.addAccount(account._id);
    // TODO: generic URL, not localhost
    if (provider === 'dropbox') {
      return res.redirect('https://www.dropbox.com/1/oauth2/authorize' +
            '?client_id=' + process.env.DROPBOX_KEY +
            '&response_type=code&redirect_uri=http://localhost:8080/dropbox' +
            '&state=' + account._id);
    } else if (provider === 'box') {
      return res.redirect('https://www.box.com/api/oauth2/authorize' + '?response_type=code' + 
        '&client_id=' + process.env.BOX_ID + '&state=' + account._id);
    } else if (provider === 'gdrive') {
      return res.redirect('https://accounts.google.com/o/oauth2/auth?' + 'response_type=code' +
        '&client_id=' + process.env.GDRIVE_ID + '&redirect_uri=http://localhost:8080/gdrive' +
        '&scope=https://www.googleapis.com/auth/drive&state=' + account._id);
    } else {
      console.log('Invalid provider ' + provider);
    }
  })
};
