var user = require('./controllers/user'),
    account = require('./controllers/account'),
    page = require('./controllers/pages'),
    auth = require('./middlewares/auth.js');

module.exports = function(app) {
  app.get('/', page.index);
  app.get('/about', page.about);
  app.get('/login', page.login);
  app.get('/logout', page.logout);


  app.get('/account/new', account.create);
  app.post('/account/new', account.create);
  app.get('/account/:account', account.show);
  app.get('/user/:username/accounts', user.accounts);
  app.get('/user/:username', user.show);
  app.post('/login', user.processLogin);
  app.post('/register', user.register);
};
