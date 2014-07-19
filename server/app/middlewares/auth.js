exports.requireLogin = function (req, res, next) {
  if (!req.isAuthenticated()) {
    return res.redirect('/login');
  }
  next();
};

exports.apiLogin = function(req, res, next) {
  if (!req.isAuthenticated()) {
    return res.json(401, {message: 'Not logged in'});
  }
  next();
}
