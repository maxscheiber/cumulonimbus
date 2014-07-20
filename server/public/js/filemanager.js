$(function () {
  (function ($) {
    $.fn.tablesorter = function () {
      var $table = this;
      this.find('th').click(function () {
        var idx = $(this).index();
        var direction = $(this).hasClass('sort_asc');
        $table.tablesortby(idx, direction);
      });
      return this;
    };

    $.fn.tablesortby = function (idx, direction) {
      var $rows = this.find('tbody tr');

      function elementToVal(a) {
        var $a_elem = $(a).find('td:nth-child(' + (idx + 1) + ')');
        var a_val = $a_elem.attr('data-sort') || $a_elem.text();
        return (a_val == parseInt(a_val) ? parseInt(a_val) : a_val);
      }
      $rows.sort(function (a, b) {
        var a_val = elementToVal(a),
          b_val = elementToVal(b);
        return (a_val > b_val ? 1 : (a_val == b_val ? 0 : -1)) * (direction ? 1 : -1);
      })
      this.find('th').removeClass('sort_asc sort_desc');
      $(this).find('thead th:nth-child(' + (idx + 1) + ')').addClass(direction ? 'sort_desc' : 'sort_asc');
      for (var i = 0; i < $rows.length; i++)
        this.append($rows[i]);
      this.settablesortmarkers();
      return this;
    };

    $.fn.retablesort = function () {
      var $e = this.find('thead th.sort_asc, thead th.sort_desc');
      if ($e.length)
        this.tablesortby($e.index(), $e.hasClass('sort_desc'));

      return this;
    };

    $.fn.settablesortmarkers = function () {
      this.find('thead th span.indicator').remove();
      this.find('thead th.sort_asc').append('<span class="indicator">&darr;<span>');
      this.find('thead th.sort_desc').append('<span class="indicator">&uarr;<span>');
      return this;
    };
  })(jQuery);

  var XSRF = (document.cookie.match('(^|; )_sfm_xsrf=([^;]*)') || 0)[2];
  var MAX_UPLOAD_SIZE = 10 * 1000 * 1000;
  var $tbody = $('#list');
  $(window).bind('hashchange', list).trigger('hashchange');
  $('#table').tablesorter();

  $('#list').on('click', '.isDir', function(e) {
    e.preventDefault();
    window.location.hash += $(e.target).text() + '/';
    window.location.hash = window.location.hash.replace('//', '/');
    list();
  });

  $('#list').on('click', '.download', function(e) {
    e.preventDefault();
    var path = window.location.hash ? window.location.hash.replace('#', '') : '/';
    var name = $(e.target).parent().parent().find('.first').text();
    // use idempotent delete POST to get provider info. What a hack
    $.post('/api/instructions/delete', {
      path: path,
      name: name
    }, function (data) {
      // TODO: directories
      if (data.status === 'success' && data.file.provider === 'dropbox') {
        $.ajax({
          type: 'GET',
          url: 'https://api-content.dropbox.com/1/files/auto' + data.file.path + data.file.name,
          headers: {'Authorization': 'Bearer ' + data.file.account.oauthToken},
          success: function(file) {
            //saveAs(file, data.file.name);
          }
        });
      } else if (data.status === 'success' && data.file.provider === 'gdrive') {
        console.log('not yet implemented');
      }
    });
  });

  $('#list').on('click', '.delete', function (e) {
    e.preventDefault();
    var path = window.location.hash ? window.location.hash.replace('#', '') : '/';
    var name = $(e.target).parent().parent().find('.first').text();
    $.post('/api/instructions/delete', {
      path: path,
      name: name
    }, function (data) {
      // TODO: directories
      if (data.status === 'success' && data.file.provider === 'dropbox') {
        $.ajax({
          type: 'POST',
          url: 'https://api.dropbox.com/1/fileops/delete',
          headers: {'Authorization': 'Bearer ' + data.file.account.oauthToken},
          data: {
            root: 'auto',
            path: data.file.path + data.file.name
          },
          error: function(a,b,c) {
            console.log(data.file);
            $.ajax({
              type: 'POST',
              url: '/api/update/delete',
              data: {
                path: data.file.path,
                filename: data.file.name
              },
              success: function(data) {
                list();
              }
            });
          },
          success: function (data) {
            $.ajax({
              type: 'POST',
              url: '/api/update/delete',
              data: {
                path: data.file.path,
                filename: data.file.name
              },
              success: function(data) {
                list();
              }
            });
          }
        });
      } else if (data.status === 'success' && data.file.provider === 'gdrive') {
        $.ajax({
          type: 'DELETE',
          url: 'https://www.googleapis.com/drive/v2/files/' + data.file.cloudId,
          headers: {'Authorization': 'Bearer ' + data.file.account.oauthToken},
          success: function(resp) {
            $.ajax({
              type: 'POST',
              url: '/api/update/delete',
              data: {
                path: data.file.path,
                filename: data.file.name
              },
              success: function(data) {
                list();
              }
            });
          }
        });
      }
    });
    return false;
  });

  // TODO: this needs to actually not post to the server and just make a directory
  // locally
  $('#mkdir').submit(function (e) {
    var hashval = window.location.hash.substr(1),
      $dir = $(this).find('[name=name]');
    e.preventDefault();
    var name = $dir.val();
    $dir.val().length && $.post('/api/instructions/new', {
      size: 0,
      isDir: true
    }, function (data) {
      uploadFolder(name);
    }, 'json');
    $dir.val('');
    return false;
  });

  // file upload stuff
  $('#file_drop_target').bind('dragover', function () {
    $(this).addClass('drag_over');
    return false;
  }).bind('dragend', function () {
    $(this).removeClass('drag_over');
    return false;
  }).bind('drop', function (e) {
    e.preventDefault();
    var files = e.originalEvent.dataTransfer.files;
    $.each(files, function (k, file) {
      uploadFile(file);
    });
    $(this).removeClass('drag_over');
  });
  $('input[type=file]').change(function (e) {
    e.preventDefault();
    $.each(this.files, function (k, file) {
      uploadFile(file);
    });
  });

  function driveUpload(file, account, path, parentId) {
    const boundary = '-------314159265358979323846';
    const delimiter = "\r\n--" + boundary + "\r\n";
    const close_delim = "\r\n--" + boundary + "--";

    var reader = new FileReader();
    reader.readAsBinaryString(file);
    reader.onload = function(e) {
      var contentType = file.type || 'application/octet-stream';
      var metadata;
      if (parentId) {
        metadata = {
          'title': file.name,
          'mimeType': contentType,
          'parents': [{'id': parentId}]
        };
      } else {
        metadata = {
          'title': file.name,
          'mimeType': contentType
        };
      }

      var base64Data = btoa(reader.result);
      var multipartRequestBody =
          delimiter +
          'Content-Type: application/json\r\n\r\n' +
          JSON.stringify(metadata) +
          delimiter +
          'Content-Type: ' + contentType + '\r\n' +
          'Content-Transfer-Encoding: base64\r\n' +
          '\r\n' +
          base64Data +
          close_delim;

      $.ajax({
        'url': 'https://www.googleapis.com/upload/drive/v2/files?uploadType=multipart',
        'method': 'POST',
        'headers': {
            'Content-Type': 'multipart/mixed; boundary="' + boundary + '"',
            'Authorization': 'Bearer ' + account.token
          },
        'data': multipartRequestBody,
        'success': function (resp) {
          //var resp = JSON.parse(xhr.responseText);
          $.post('/api/update/new',
            {
              filename: resp.title,
              path: path,
              provider: 'gdrive',
              cloudId: resp.id,
              size: parseInt(resp.fileSize),
              accountId: account.id
            },
            function (data) {
              $row.remove();
              list();
            }
          );
        }
      });
    }
  }

  function getParentId(folders, file, account, path, parentId) {
    var folder = folders[0];
    if (!folder || folder === '/') {
      console.log('attempt to upload file to parenet ' + parentId);
      driveUpload(file, account, path, parentId);
      return;
    }

    $.ajax({
      url: "https://www.googleapis.com/drive/v2/files?maxResults=1&q=title='" + folder + "'",
      async: false,
      headers: {'Authorization': 'Bearer ' + account.token},
      success:
        function (data) {
          console.log (data.items);
          if (data.items.length > 0 && data.items[0].mimeType === 'application/vnd.google-apps.folder' &&
            data.items[0].title === folder) {
            console.log('try next guy!');
            folders.splice(0, 1);
            getParentId(folders, file, account, path, data.items[0].id);
          } else {
            console.log('make new directory and continue');
            console.log('parent is ' + parentId);
            console.log('folder is ' + folder);
            $.ajax({
              url: "https://www.googleapis.com/drive/v2/files/",
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + account.token
              },
              data: JSON.stringify({
                'title': folder,
                'parents': [{'id': parentId ? parentId : 'root'}],
                'mimeType': 'application/vnd.google-apps.folder'
              }),
              success: function (data) {
                // new folder is made, so go to it and continue recursing
                console.log(data);
                folders.splice(0, 1);
                getParentId(folders, file, account, path, data.id);
              }
            });
          }
    }});
  }

  function uploadFile(file) {
    // what even is this
    var folder = window.location.hash.substr(1).replace('//', '/');

    // TODO; add session ID
    $.post('/api/instructions/new', {'size': file.size}, function (data) {
      if (data.error) {
        // not enough space, handle gracefully or something like that
      } else {
        // figure out provider and whatnot
        var account = data.account;
        var provider = account.provider;
        var token = account.token;

        var $row = renderFileUploadRow(file, folder);
        $('#upload_progress').append($row);
        var xhr = new XMLHttpRequest();

        if (provider === 'dropbox') {
          xhr.open('PUT', 'https://api-content.dropbox.com/1/files_put/auto/' +
            (folder + '/' + file.name).replace('//', '/'));
          xhr.setRequestHeader('Authorization', 'Bearer ' + token);
          xhr.onload = function () {
            var resp = JSON.parse(xhr.responseText);
            $.post('/api/update/new',
              {
                filename: file.name,
                path: folder,
                provider: 'dropbox',
                cloudId: resp.rev,
                size: resp.bytes,
                accountId: data.account.id
              },
              function (data) {
                $row.remove();
                list();
              }
            );
          };
          xhr.upload.onprogress = function (e) {
            if (e.lengthComputable) {
              $row.find('.progress').css('width', (e.loaded / e.total * 100 | 0) + '%');
            }
          };
          xhr.send(file);
        }

        else if (provider === 'box') {
          /*var form = new FormData();
          form.append('file', file);
          // TODO: parent_id
          form.append('parent_id', 0);
          var uploadUrl = 'https://upload.box.com/api/2.0/files/content';
          var headers = { Authorization: 'Bearer ' + token };
          $.ajax({
            url: uploadUrl,
            headers: headers,
            type: 'POST',
            processData: false,
            contentType: false,
            data: form
          }, function (data) {
            console.log(data);
          });*/
        }

        else if (provider === 'gdrive') {
          var folders = folder.split('/');
          if (folders[0]) {
            console.log('not in root.');
            getParentId(folders, file, data.account, folder, undefined);
          } else {
            driveUpload(file, data.account, folder, undefined);
          }
        }
      }
    });
  };

  function uploadFolder(name) {
    var folder = window.location.hash.substr(1);

    // TODO; add session ID
    $.post('/api/instructions/new', {'size': 0}, function (data) {
      if (data.error) {
        // not enough space, handle gracefully or something like that
      } else {
        // figure out provider and whatnot
        var account = data.account;
        var provider = account.provider;
        var token = account.token;
        $.post('/api/update/new',
          {
            filename: name, // actually folder name
            isDir: true,
            path: folder,
            provider: 'dropbox',
            cloudId: (folder + '/' + name).replace('//', '/'),
            size: 0,
            accountId: data.account.id
          },
          function (data) {
            list();
          }
        );
      }
    });
  };

  function renderFileUploadRow(file, folder) {
    return $row = $('<div/>')
      .append($('<span class="fileuploadname" />').text((folder ? folder + '/' : '') + file.name))
      .append($('<div class="progress_track"><div class="progress"></div></div>'))
      .append($('<span class="size" />').text(formatFileSize(file.size)))
  };

  function renderFileSizeErrorRow(file, folder) {
    return $row = $('<div class="error" />')
      .append($('<span class="fileuploadname" />').text('Error: ' + (folder ? folder + '/' : '') + file.name))
      .append($('<span/>').html(' file size - <b>' + formatFileSize(file.size) + '</b>' + ' exceeds max upload size of <b>' + formatFileSize(MAX_UPLOAD_SIZE) + '</b>'));
  };

  function list() {
    var hashval = window.location.hash.substr(1);
    $.get('/api/folder/' + hashval, function (data) {
      var files = data.files;
      files = files.sort(function (a,b) {
        return a.name < b.name ? -1 : a.name == b.name ? 0 : 1;
      });
      $tbody.empty();
      $('#breadcrumb').empty().html(renderBreadcrumbs(hashval));
      if (data.status) {
        $.each(data.files, function (k, v) {
          $tbody.append(renderFileRow(v));
        });
        !data.files.length && $tbody.append('<tr><td class="empty" colspan=5>This folder is empty</td</td>')
      } else {
        console.warn('some stupid error, who knows');
        console.log(data);
      }
      $('#table').retablesort();
    }, 'json');
  };

  function renderFileRow(data) {
    var $link = $('<a class="name" />')
      .attr('href', data.isDir ? data.path + data.name : data.provider === 'dropbox' ?
        'http://dropbox.com/home' + data.path + data.name : '.' + data.path)
      .text(data.name);
    var $dl_link = $('<a/>').attr('href', '?do=download&file=' + encodeURIComponent(data.path))
      .addClass('download').text('download');
    var $delete_link = $('<a href="#" />').attr('data-file', data.path).addClass('delete').text('delete');
    var $html = $('<tr />')
      .addClass(data.isDir ? 'isDir' : '')
      .append($('<td class="first" />').append($link))
      .append($('<td/>').attr('data-sort', data.isDir ? -1 : data.size)
        .html($('<span class="size" />').text(data.isDir ? '--' : formatFileSize(data.size))))
      .append($('<td/>').attr('data-sort', data.changeDate).text(formatTimestamp(data.changeDate)))
      .append($('<td/>').append($dl_link).append($delete_link))
    return $html;
  };

  function renderBreadcrumbs(path) {
    var base = "",
      $html = $('<div/>').append($('<a href=#>Home</a></div>'));
    $.each(path.split('/'), function (k, v) {
      if (v) {
        $html.append($('<span/>').text(' ▸ '))
          .append($('<a/>').attr('href', '#' + base + v).text(v));
        base += v + '/';
      }
    });
    return $html;
  };

  function formatTimestamp(unix_timestamp) {
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var d = new Date(unix_timestamp);
    return [m[d.getMonth()], ' ', d.getDate(), ', ', d.getFullYear(), " ", (d.getHours() % 12 || 12), ":", (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(),
      " ", d.getHours() >= 12 ? 'PM' : 'AM'
    ].join('');
  };

  function formatFileSize(bytes) {
    var s = ['bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB'];
    for (var pos = 0; bytes >= 1000; pos++, bytes /= 1024);
    var d = Math.round(bytes * 10);
    return pos ? [parseInt(d / 10), ".", d % 10, " ", s[pos]].join('') : bytes + ' bytes';
  };

  setInterval(function() {
    console.log('tick');
    var path = window.location.hash.replace('//', '/').replace('#', '');
    list();
  }, 5000);
});