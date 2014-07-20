
var dropboxKey = 'ylx3j4fcszghohr';
var cumulonimbusHost = 'http://localhost:8080';
var accountId = '';

console.log('loaded?');

chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.accountId.length > 5 && request.accountId !== accountId) {
      accountId = request.accountId;
    }

    var oauthUrl = 'https://www.dropbox.com/1/oauth2/authorize' +
      '?client_id=' + dropboxKey + '&response_type=code' +
      '&redirect_uri=' + cumulonimbusHost + '/dropbox&state=' + accountId;

    sendResponse({
      accountId: accountId,
      oauthUrl: oauthUrl
    });
  }
);
