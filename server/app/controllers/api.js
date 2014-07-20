var mongoose = require('mongoose'),
    passport = require('passport'),
    _ = require('underscore'),
    request = require('request'),
    async = require('async'),
    dotenv = require('dotenv');

dotenv.load();

var User = mongoose.model('User');
var Account = mongoose.model('Account');
var File = mongoose.model('File');

function returnJSON(res, message, failMessage) {
  return function(err) {
    if (err) {
      return res.json(500, {
        status: 'error',
        message: failMessage
      });
    }

    return res.json({
      status: 'success',
      message: message
    });
  }
}

// Asynchronous DFS over Dropbox
var dropboxGet = function(path, account) {
  var options = {
    url: 'https://api.dropbox.com/1/metadata/auto' + path,
    form: {
      'file_limit': 25000,
      'list': 'true'
    },
    headers: {
      'Authorization': 'Bearer ' + account.oauthToken
    }
  };

  request(options, function (err, resp, body) {
    if (!err) {
      var data = JSON.parse(body);
      console.log(body);
      async.forEach(data.contents, function (entity, cb) {
        if (entity.is_dir) {
          console.log(entity.path + ' is a directory, recursing');
          dropboxGet(entity.path, account);
        } else {
          console.log(entity);
          Account.getMostFree(account.user, function(err, freeAccount) {
            if (err || !freeAccount) {
              console.log('Could not add Dropbox file to account');
              console.log(err);
              return;
            } else {
              console.log('Found file ' + entity.path + ', adding');
              var path = entity.path.split('/');
              var filename = path[path.length - 1];
              path.pop(); // get rid of filename
              var pathName = '/' + path.join('') + (path.join('') ? '/' : '');

              var now = Date.now();
              var size = parseInt(entity.bytes);
              var file = new File({
                name: filename,
                path: pathName,
                provider: 'dropbox',
                cloudId: entity.rev,
                size: size,
                user: account.user,
                account: account._id,
                createDate: now,
                changeDate: now
              });

              file.save(function(err) {
                if (err) { console.log(err); return; }
                account.used += size;
                account.free -= size;
                account.save(function (err) {
                  if (err) { console.log('Error updating account'); }
                });
              });
            }
          });
        }
      }, function(err) {

      });
    }
  });
}

var updateFileList = function(account) {
  if (account.provider === 'dropbox') {
    dropboxGet('/', account);
  } else if (account.provider === 'gdrive') {
    // gdriveGet('/', account.oauthToken);
  }
}

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
  File.forUserPath(path, req.user._id, outputFiles(res));
}

exports.treeListing = function(req, res) {
  var path = File.normalizePath(req.params[0]);
  if (path === '/') {
    File.forUser(req.user._id, outputFiles(res));
  } else {
    File.inFolder(path, req.user._id, outputFiles(res));
  }
}

exports.accounts = function(req, res) {
  User.load(req.user.username, function(err, user) {
    if (err) {
      return res.json(404, {
        status: 'error',
        message: 'User not found'
      });
    }

    accounts = _.map(user.accounts, Account.toSimpleJSON);

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

            updateFileList(account);

            return res.redirect('/accounts');
          });
        });
      } else {
        return res.render('404', {message: 'Failed to authenticate'});
      }
    }
  );
}

exports.box = function(req, res, next) {
  var authCode = req.param('code');
  var accountId = req.param('state'); // CSRF

  request.post('https://www.box.com/api/oauth2/token',
    {
      form: {
        code: authCode,
        grant_type: 'authorization_code',
        // TODO: use whichever server we're on
        redirect_uri: 'http://localhost:8080/box',
        client_id: process.env.BOX_ID,
        client_secret: process.env.BOX_SECRET
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

            updateFileList(account);

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
    }
  );
}

exports.gdrive = function(req, res, next) {
  var authCode = req.param('code');
  var accountId = req.param('state'); // CSRF
  request.post('https://accounts.google.com/o/oauth2/token',
    {
      form: {
        code: authCode,
        grant_type: 'authorization_code',
        // TODO: use whichever server we're on
        redirect_uri: 'http://localhost:8080/gdrive',
        client_id: process.env.GDRIVE_ID,
        client_secret: process.env.GDRIVE_SECRET
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

            updateFileList(account);
            return res.render('accounts');
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

  if (!size && size !== 0) {
    return res.json(403, {
      status: 'error',
      message: 'Please provide a size'
    })
  }

  Account.getMostFree(req.user._id, function(err, account) {
    if (err || !account) {
      return res.json(403, {
        status: 'error',
        message: 'No accounts authenticated'
      });
    }

    if (account.free < size) {
      return res.json(403, {
        status: 'error',
        message: 'Not enough room'
      });
    }

    return res.json({
      status: 'success',
      account: Account.toSimpleJSON(account)
    });
  });
}

exports.instructionsMove = function(req, res) {
  // maybe doesnt need instructions?
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

  var userId = req.user._id;

  var filename = post.filename;
  var path = File.normalizePath(post.path);
  var isDir = post.isDir;

  if (isDir) {
    return File.ensureFolder(
      File.normalizePath(path + filename),
      userId,
      returnJSON(res, 'Successfully added folder', 'Failed to add folder')
    );
  }

  var provider = post.provider;
  var cloudId = post.cloudId;
  var size = parseInt(post.size);
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
    user: userId,
    account: accountId,
    createDate: now,
    changeDate: now
  });


  async.series([
    async.apply(File.ensureFolder.bind(File), path, userId),
    file.save.bind(file),
    async.apply(Account.addUsage.bind(Account), accountId, size)
  ], returnJSON(res, 'File added successfully', 'Failed to add file'));
}

exports.updateMove = function(req, res) {
  var post = req.body;

  var filename = post.filename;
  var path = File.normalizePath(post.path);

  var newFilename = post.newFilename;
  var newPath = File.normalizePath(post.newPath);

  var userId = req.user._id;

  //TODO: ensure folder?

  if (filename === '') {
    // this is gonna be a bitch
    //File.moveFolder(path, newPath);
    return res.json(403, {
      status: 'error',
      message: 'cant move folders yet'
    });
  } else {
    File.update({
      user: userId,
      path: path,
      filename: filename
    }, {
      $set: {
        path: newPath,
        filename: newFilename,
        changeDate: Date.now()
      }
    }, returnJSON(res, 'Successfully moved file', 'Failed to move file'));
  }
}

exports.updateModify = function(req, res) {
  var post = req.body;

  var filename = post.filename;
  var path = File.normalizePath(post.path);

  var size = parseInt(post.size);
  var provider = post.provider;
  var cloudId = post.cloudId;
  var accountId = post.accountId;

  var userId = req.user._id;

  File.update({
    user: userId,
    filename: filename,
    path: path
  }, {
    $set: {
      size: size,
      provider: provider,
      cloudId: cloudId,
      accountId: accountId,
      changeDate: Date.now()
    }
  }, returnJSON(res, 'Successfully modified file', 'Failed to modify file'));
}

exports.updateDelete = function(req, res) {
  var post = req.body;

  var filename = post.filename;
  var path = File.normalizePath(post.path);
  var isDir = post.isDir;
  var userId = req.user._id;

  if (isDir) {
    subPath = File.normalizePath(path + filename);
    var pathRegex = new RegExp('^' + subPath.replace(/\//, '\/'));

    File.remove({
      user: userId,
      $or: [
        {
          path: path,
          name: filename
        },
        {path: {$regex: pathRegex}}
      ]
    }, returnJSON(res, 'Removed folder', 'Failed to remove folder'));
  } else {
    File.remove({
      user: userId,
      path: path,
      name: filename
    }, returnJSON(res, 'Removed file', 'Failed to remove file'));
  }
}
