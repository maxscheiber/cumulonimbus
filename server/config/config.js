var path = require('path');

var root = path.join(__dirname, '..');

module.exports = {
  dbPath: process.env.MONGOLAB_URI || 'mongodb://localhost/cumulonimbus',
  root: root,
  appRoot: path.join(root, 'app'),
  site: {
    name: 'Cumulonimbus',
    subtitle: 'Insert Subtitle Here.'
  },
  cookieSecret: 'cumulonimbuscookiesecret'
};
