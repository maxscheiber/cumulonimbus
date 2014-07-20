
exports.index = function(req, res) {
  if (req.user) {
    return res.render('dashboard', {
      user: req.user
    });
  } else {
    return res.render('landing');
  }
};

// TODO; update file manager from all of user's accounts
exports.filemanager = function(req, res) {
  if (req.user) {
    return res.render('filemanager', {
      user: req.user
    });
  } else {
    return res.render('landing');
  }
}

exports.about = function(req, res) {
  return res.render('about');
};

exports.login = function(req, res) {
  if (req.user) {
    return res.redirect('/');
  } else {
    return res.render('login');
  }
};

exports.logout = function(req, res) {
  req.logout();
  req.flash('success', 'Logged out successfully!');
  return res.redirect('/');
};
