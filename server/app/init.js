var express = require('express'),
    cookieParser = require('cookie-parser'),
    bodyParser = require('body-parser'),
    session = require('express-session'),
    flash = require('connect-flash'),
    mongoose = require('mongoose'),
    passport = require('passport'),
    config = require('../config/config');

var User = mongoose.model('User');

module.exports = function(app) {
  app.set('port', process.env.PORT || 8080);

  app.engine('html', require('hogan-express'));
  app.set('views', config.appRoot + '/views');
  app.set('view engine', 'html');
  app.set('layout', 'layouts/guest');

  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({extended: false}));

  app.use(cookieParser(config.cookieSecret));
  app.use(session({
    secret: config.cookieSecret,
    cookie: {maxAge: 1000 * 60 * 60},
    saveUninitialized: true,
    resave: true
  }));
  app.use(flash());
  app.use(passport.initialize());
  app.use(passport.session());

  app.set('partials', {
    // add partials here
  });

  app.locals.site = config.site;

  app.use(function(req, res, next) {
    res.locals.successFlashes = req.flash('success');
    res.locals.errorFlashes = req.flash('error');

    if (req.user) {
      res.locals.layout = 'layouts/user';
      res.locals.authUser = req.user;
    }

    next();
  });

  passport.use(User.createStrategy());
  passport.serializeUser(User.serializeUser());
  passport.deserializeUser(User.deserializeUser());

  require('./routes')(app);

  app.use('/static', express.static(config.root + '/public'));

  app.use(function(req, res) {
    res.status(404).render('404');
  });

  app.use(function(err, req, res, next) {
    console.error(err);
    res.status(500).render('500', {message: err.message});
  });

};
