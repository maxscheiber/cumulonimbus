var express = require('express');

require('./config/db');

var app = express();
require('./app/init')(app);

app.listen(app.get('port'), function() {
  console.log('Express server listening on port ' + app.get('port'));
});
