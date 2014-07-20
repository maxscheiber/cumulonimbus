chrome.extension.sendMessage({accountId: ''}, function(response) {
	var readyStateCheckInterval = setInterval(function() {
	if (document.readyState === "complete") {
		clearInterval(readyStateCheckInterval);
		console.log("Hello. This message was sent from scripts/inject.js");

    var helpPath = '/help';
    var loginPath = '/login';
    var registerPath = '/m/register';
    var browsePath = '/m/browse';
    var accountId = '';
    var proceed = false;

    if (window.location.pathname === helpPath) {
      accountId = window.location.search.slice(3);
    }

    if (window.location.pathname.slice(0, 9) === '/1/oauth2') {
      accountId = 'waiting';
      proceed = true;
    }

    chrome.runtime.sendMessage({accountId: accountId}, function(response) {
      accountId = response.accountId;

      if (!accountId || (accountId === 'waiting' && !proceed)) {
        return;
      } else if (window.location.pathname === helpPath) {
        var link = document.querySelector('a#home-icon');
        link.href = '/logout';
        link.click();
      } else if (window.location.pathname === loginPath) {
        var link = document.querySelector('a#home-icon');
        link.href = registerPath;
        link.click();
      } else if (window.location.pathname === registerPath) {
        var password = accountId.slice(0, 12);
        var email = accountId.slice(12);
        document.getElementById('register_fname').value = 'Jimmy';
        document.getElementById('register_lname').value = 'Dean';
        document.getElementById('register_email').value = email + '@mailinator.com';
        document.getElementById('register_password').value = password;
        document.getElementById('tos_checkbox').checked = true;
        document.getElementById('register_submit').click();
      } else if (window.location.pathname === browsePath) {
        var link = document.getElementById('desktop_version');
        link.href = response.oauthUrl;
        link.click();
      } else if (window.location.pathname.slice(0, 9) === '/1/oauth2') {
        document.querySelector('button[name=allow_access]').click();
      }
    });
	}
	}, 10);
});
