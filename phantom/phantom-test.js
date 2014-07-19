var page = require('webpage').create();

page.open('http://lewisjellis.com', function() {
  console.log(page.evaluate(function() { return document.title;}))
  page.render('example.png');
  console.log('saved screenie')
  phantom.exit();
});
