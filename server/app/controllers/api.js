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
          console.log('Found file ' + entity.path + ', adding');
          var path = entity.path.split('/');
          var filename = path[path.length - 1];
          path.pop(); // get rid of filename
          var pathName = '/' + path.join('') + (path.join('') ? '/' : '');

          var now = Date.now();
          var size = parseInt(entity.bytes);

          File.makeFile(new File({
            name: filename,
            path: File.normalizePath(pathName.replace('//', '/')),
            provider: 'dropbox',
            cloudId: entity.rev,
            size: size,
            user: account.user,
            account: account._id,
            createDate: now,
            changeDate: now
          }), cb);
        }
      }, function(err) { });
    }
  });
}

var gdriveGet = function(path, account, folderId) {
  var options = {
    url: 'https://www.googleapis.com/drive/v2/files/' + folderId + '/children',
    headers: {
      'Authorization': 'Bearer ' + account.oauthToken
    }
  };
  request(options, function (err, resp, body) {
    if (err) {
      console.log(err);
      return;
    }
    var items = JSON.parse(body).items;
    async.forEach(items, function (entity, cb) {
      var options = {
        url: 'https://www.googleapis.com/drive/v2/files/' + entity.id,
        headers: {
          'Authorization': 'Bearer ' + account.oauthToken
        }
      };
      request(options, function (err, resp, blob) {
        if (err) {
          console.log(err);
          return;
        }
        var driveFile = JSON.parse(blob);
        if (driveFile.mimeType === 'application/vnd.google-apps.folder') {
          //console.log(path + '/' + driveFile.title + ' is a directory, recursing');
          gdriveGet(path + '/' + driveFile.title + '/', account, driveFile.id);
        } else {
          //console.log(path + '/' + driveFile.title + ' is a file');
          path = path === '' ? '/' : path;
          path = path.replace('//', '/'); // ugh not sure why this is needed, but it is
          var now = Date.now();
          var size = parseInt(driveFile.fileSize);
          File.makeFile(new File({
            name: driveFile.title,
            path: File.normalizePath(path.replace('//', '/')),
            provider: 'gdrive',
            cloudId: driveFile.id,
            size: size,
            user: account.user,
            account: account._id,
            createDate: now,
            changeDate: now
          }), cb);
        }
      });
    }, function(err){});
  });
}

var updateFileList = function(account) {
  if (account.provider === 'dropbox') {
    dropboxGet('/', account);
  } else if (account.provider === 'gdrive') {
    gdriveGet('', account, 'root');
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

          var options = {
            url: 'https://api.dropbox.com/1/account/info',
            headers: {
              'Authorization': 'Bearer ' + account.oauthToken
            }
          };

          request(options, function (err, resp, body) {
            if (err) {
              console.log(err);
              return;
            }
            var data = JSON.parse(body);
            account.capacity = data.quota_info.quota;
            account.free = data.quota_info.quota;
            account.used = 0;

            account.save(function(err) {
              if (err) {
                console.log(err);
                return res.render('500');
              }

              updateFileList(account);

              return res.redirect('/filemanager');
            });
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

            return res.render('accounts');
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

          var options = {
            url: 'https://www.googleapis.com/drive/v2/about',
            headers: {
              'Authorization': 'Bearer ' + account.oauthToken
            }
          };

          request(options, function (err, resp, body) {
            if (err) {
              console.log(err);
              return;
            }
            var data = JSON.parse(body);
            account.capacity = data.quotaBytesTotal;
            account.free = data.quotaBytesTotal;
            account.used = 0;

            account.save(function(err) {
              if (err) {
                console.log(err);
                return res.render('500');
              }

              updateFileList(account);
              return res.redirect('/filemanager');
            });
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
  var post = req.body;
  var path = File.normalizePath(post.path);
  var name = post.name;
  var userId = req.user._id;

  File.forUserPathName(path, name, userId, function (err, file) {
    if (err || !file) {
      console.log(err);
      return res.json(500);
    }
    return res.json({
      status: 'success',
      file: File.toSimpleJSON(file)
    });
  });
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
  if (!(filename && path && provider && cloudId && size && accountId) && size !== 0) {
    return res.json('403', {
      status: 'error',
      message: 'Include all fields: filename path provider cloudId size accountId'
    })
  }
  File.makeFile(new File({
    name: filename,
    path: File.normalizePath(path.replace('//', '/')),
    provider: provider,
    cloudId: cloudId,
    size: size,
    user: userId,
    account: accountId,
    createDate: now,
    changeDate: now
  }), returnJSON(res, 'File added successfully', 'Failed to add file'));
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
      path: File.normalizePath(path),
      name: filename
    }, returnJSON(res, 'Removed file', 'Failed to remove file'));
  }
}
