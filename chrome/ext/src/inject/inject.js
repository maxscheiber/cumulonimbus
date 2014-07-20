chrome.extension.sendMessage({accountId: ''}, function(response) {
	var readyStateCheckInterval = setInterval(function() {
	if (document.readyState === "complete") {
		clearInterval(readyStateCheckInterval);
		console.log("Hello. This message was sent from scripts/inject.js");

    var landingPath = '/m';
    var registerPath = '/m/register';
    var browsePath = '/m/browse';
    var accountId = '';

    if (window.location.pathname === landingPath) {
      accountId = window.location.search.slice(3);
    }

    chrome.runtime.sendMessage({accountId: accountId}, function(response) {
      accountId = response.accountId;

      if (window.location.pathname === landingPath) {
        document.querySelector('a[href="/m/register"] span').click();
      } else if (window.location.pathname === registerPath) {
        document.getElementById('register_fname').value = 'Jimmy';
        document.getElementById('register_lname').value = 'Dean';
        document.getElementById('register_email').value = 'jimmydeansammiches85@mailinator.com';
        document.getElementById('register_password').value = 'jimmydean';
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
