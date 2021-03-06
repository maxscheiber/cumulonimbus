var user = require('./controllers/user'),
    account = require('./controllers/account'),
    page = require('./controllers/pages'),
    api = require('./controllers/api'),
    auth = require('./middlewares/auth.js');

module.exports = function(app) {
  app.get('/', page.index);
  app.get('/about', page.about);
  app.get('/login', page.login);
  app.get('/logout', page.logout);
  app.post('/login', user.processLogin);
  app.post('/register', user.register);

  app.get('/filemanager', page.filemanager);

  // eventually we probably/hopefully wont use either of these
  app.get('/user/:username/accounts', user.accounts);
  app.get('/user/:username', user.show);

  app.get('/accounts', auth.requireLogin, user.accounts);
  app.get('/account/new', auth.requireLogin, account.create);
  app.post('/account/new', account.create);
  app.get('/accounts/:account', account.show);

  app.get('/dropbox', api.dropbox);
  app.get('/box', api.box);
  app.get('/gdrive', api.gdrive);

  app.post('/getmorespace', auth.requireLogin, account.automate);

  app.post('/api/login', api.login)
  app.get(/^\/api\/folder\/(.*)/, auth.apiLogin, api.pathListing);
  app.get(/^\/api\/tree\/(.*)/, auth.apiLogin, api.treeListing);
  app.get('/api/accounts', auth.apiLogin, api.accounts);
  app.post('/api/instructions/new', auth.apiLogin, api.instructionsNew);
  app.post('/api/instructions/move', auth.apiLogin, api.instructionsMove);
  app.post('/api/instructions/modify', auth.apiLogin, api.instructionsModify);
  app.post('/api/instructions/delete', auth.apiLogin, api.instructionsDelete);
  app.post('/api/update/new', auth.apiLogin, api.updateNew);
  app.post('/api/update/move', auth.apiLogin, api.updateMove);
  app.post('/api/update/modify', auth.apiLogin, api.updateModify);
  app.post('/api/update/delete', auth.apiLogin, api.updateDelete);
};
