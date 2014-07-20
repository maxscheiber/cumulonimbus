from collections import defaultdict
import httplib2
import json
import logging
import os
import shutil
import signal
import time

import apiclient.discovery
import apiclient.http
import box
import dropbox
import oauth2client.client
import requests
import watchdog.events
from watchdog.observers import Observer



class CumulonimbusFSEventHandler(watchdog.events.FileSystemEventHandler):

    def __init__(self, logger, watch_directory, cookies):
        super(CumulonimbusFSEventHandler, self).__init__()
        self.logger = logger
        self.watch_directory = watch_directory
        self.cookies = cookies
        self._create_accounts_map()
        self._sync_filesystem()
        signal.signal(signal.SIGALRM, self._sync_handler)
        signal.alarm(5)

    def _create_accounts_map(self):
        r = requests.get('http://localhost:8080/api/accounts', cookies=self.cookies)
        response_json = r.json()
        accounts = response_json['accounts']
        self.accounts = {}
        self.dropbox_clients = {}
        self.box_clients = {}
        self.gdrive_clients = {}
        self.names_to_ids = {}
        for account in accounts:
            self.accounts[account['id']] = (account['provider'], account['token'])
            if account['provider'] == 'dropbox':
                self.dropbox_clients[account['id']] = dropbox.client.DropboxClient(account['token'])
            elif account['provider'] == 'box':
                self.box_clients[account['id']] = box.BoxClient(account['token'])
            else:
                credentials = oauth2client.client.AccessTokenCredentials(access_token=account['token'],
                                                                       user_agent='Cumulonimbus/1.0')
                http = httplib2.Http()
                http = credentials.authorize(http)
                self.gdrive_clients[account['id']] = apiclient.discovery.build('drive', 'v2', http)

    def _create_change_times_map(self):
        f = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                              'change_times.txt'), 'r')
        lines = f.readlines()
        for line in lines:
            parts = line.split('\t')
            path = parts[0]
            change_time = parts[1]
            self.change_map[path] = long(change_time)
        f.close()

    def _sync_filesystem(self):
        r = requests.get('http://localhost:8080/api/tree/', cookies=self.cookies)
        response_json = r.json()
        self.change_map = defaultdict(long)
        if os.path.isfile(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                       'change_times.txt')):
            self._create_change_times_map()
        change_times_file = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                              'change_times.txt'), 'w')
        files = response_json['files']
        for f in files:
            if f['isDir']:
                continue
            provider = f['provider']
            account_id = f['account']
            f['path'] = f['path'].replace('//', '/')
            if len(f['path']) >= 1 and f['path'][0] == '/':
                file_path = os.path.join(self.watch_directory, f['path'][1:], f['name'])
            else:
                file_path = os.path.join(self.watch_directory, f['path'], f['name'])
            fs_path = '/' + f['path'] + f['name']
            if self.change_map[fs_path] < long(f['changeDate']):
                if not os.path.exists(os.path.dirname(file_path)):
                    os.makedirs(os.path.dirname(file_path))
                out = open(file_path, 'w')
                if provider == 'dropbox':
                    client = self.dropbox_clients[account_id]
                    with client.get_file(fs_path) as dropbox_f:
                        out.write(dropbox_f.read())
                elif provider == 'gdrive':
                    client = self.gdrive_clients[account_id]
                    gdrive_f = client.files().get(fileId=f['cloudId']).execute()
                    download_url = gdrive_f['downloadUrl']
                    if download_url:
                       resp, content = client._http.request(download_url)
                       if resp.status == 200:
                          out.write(content)
                else:
                    continue
                self.change_map[fs_path] = long(f['changeDate'])
                self.names_to_ids[fs_path] = f['cloudId']
                out.close()
            change_times_file.write(fs_path + '\t' + str(f['changeDate']) + '\n')
        change_times_file.close()

    def _sync_handler(self, signum, frame):
        self._create_accounts_map()
        self._sync_filesystem_timer()
        signal.alarm(5)

    def _sync_filesystem_timer(self):
        r = requests.get('http://localhost:8080/api/tree/', cookies=self.cookies)
        response_json = r.json()
        change_times_file = open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                              'change_times.txt'), 'w')
        files = response_json['files']
        all_files = self.change_map.keys()
        new_files = []
        for f in files:
            if f['isDir']:
                continue
            provider = f['provider']
            account_id = f['account']
            f['path'] = f['path'].replace('//', '/')
            file_path = os.path.join(self.watch_directory, f['path'][1:], f['name'])
            fs_path = f['path'] + f['name']
            new_files.append(fs_path)
            if self.change_map[fs_path] < long(f['changeDate']):
                if not os.path.exists(os.path.dirname(file_path)):
                    os.makedirs(os.path.dirname(file_path))
                out = open(file_path, 'w')
                if provider == 'dropbox':
                    if account_id not in self.dropbox_clients:
                        r = requests.get('http://localhost:8080/api/accounts', cookies=self.cookies)
                        response_json = r.json()
                        accounts = response_json['accounts']
                        for account in accounts:
                            if account['id'] == account_id:
                                self.dropbox_clients[account_id] = dropbox.client.DropboxClient(account['token'])
                    client = self.dropbox_clients[account_id]
                    with client.get_file(fs_path) as dropbox_f:
                        out.write(dropbox_f.read())
                elif provider == 'gdrive':
                    if account_id not in self.gdrive_clients:
                        r = requests.get('http://localhost:8080/api/accounts', cookies=self.cookies)
                        response_json = r.json()
                        accounts = response_json['accounts']
                        for account in accounts:
                            if account['id'] == account_id:
                                credentials = oauth2client.client.AccessTokenCredentials(access_token=account['token'],
                                                                                       user_agent='Cumulonimbus/1.0')
                                http = httplib2.Http()
                                http = credentials.authorize(http)
                                self.gdrive_clients[account['id']] = apiclient.discovery.build('drive', 'v2', http)

                    client = self.gdrive_clients[account_id]
                    gdrive_f = client.files().get(fileId=f['cloudId']).execute()
                    if 'downloadUrl' in gdrive_f:
                        download_url = gdrive_f['downloadUrl']
                        if download_url:
                           resp, content = client._http.request(download_url)
                           if resp.status == 200:
                              out.write(content)
                else:
                    continue
                self.change_map[fs_path] = long(f['changeDate'])
                self.names_to_ids[fs_path] = f['cloudId']
                out.close()
            change_times_file.write(fs_path + '\t' + str(f['changeDate']) + '\n')
        change_times_file.close()

        s = set(new_files)
        files_to_remove = [f for f in all_files if f not in s]
        for f in files_to_remove:
            full_path = os.path.join(self.watch_directory, f[1:])
            if os.path.exists(full_path):
                if os.path.isdir(full_path):
                    shutil.rmtree(path=full_path)
                else:
                    os.remove(full_path)

    # call hook to add file
    def on_created(self, event):
        super(CumulonimbusFSEventHandler, self).on_created(event)
        try:
            params = dict(size=os.path.getsize(event.src_path))
            headers = {'Content-type': 'application/json', 'Accept': 'text/plain'}
            r = requests.post('http://localhost:8080/api/instructions/new',
                              data=json.dumps(params),
                              headers=headers,
                              cookies=self.cookies)
            response_json = r.json()
            if 'account' not in response_json:
               self.logger.error("COULD NOT CREATE FILE")
               return
            provider = response_json['account']['provider']
            account_id = response_json['account']['id']
            file_name = event.src_path[len(self.watch_directory):]
            if provider == 'dropbox':
                self.logger.debug('creating on dropbox')
                dropbox_client = self.dropbox_clients[account_id]
                path_to_dropbox_file = file_name
                if event.is_directory:
                    response = dropbox_client.file_create_folder(path_to_dropbox_file)
                else:
                    try:
                        response = dropbox_client.get_file(path_to_dropbox_file)
                        return
                    except dropbox.rest.ErrorResponse as e:
                        if e.status == 404:
                            response = dropbox_client.put_file(path_to_dropbox_file, event.src_path)
                        else:
                            self.logger.exception("OOPS")
                rev = response['rev']
                size = response['bytes']
            elif provider == 'box':
                self.logger.debug('created on box')
                box_clients = self.box_clients[account_id]
                res = self._upload_box_file(box_client=box_client,
                                            full_path=event.src_path,
                                            file_path=file_name,
                                            is_directory=event.is_directory)
                rev = res['rev']
                size = res['size']
            elif provider == 'gdrive':
                self.logger.debug('creating on drive')
                if account_id in self.gdrive_clients:
                    gdrive_client = self.gdrive_clients[account_id]
                else:
                    credentials = oauth2client.client.AccessTokenCredentials(access_token=response_json['account']['token'],
                                                                             user_agent='Cumulonimbus/1.0')
                    http = httplib2.Http()
                    http = credentials.authorize(http)
                    self.gdrive_clients[account_id] = apiclient.discovery.build('drive', 'v2', http)
                    gdrive_client = self.gdrive_clients[account_id]

                res = self._upload_gdrive_file(gdrive_client=gdrive_client,
                                         full_path=event.src_path,
                                         file_path=file_name,
                                         is_directory=event.is_directory)
                if res is None:
                    return
                rev = res['id']
                if 'fileSize' in res:
                    size = res['fileSize']
                else:
                    size = 0

            file_path, upload_path = self._get_file_name_and_upload_path(event, file_name)
            self.names_to_ids[file_name] = rev
            update_params=dict(filename=file_path,
                               path=upload_path,
                               provider=provider,
                               cloudId=rev,
                               size=size,
                               accountId=account_id)
            r = requests.post('http://localhost:8080/api/update/new',
                              data=json.dumps(update_params),
                              headers=headers,
                              cookies=self.cookies)
        except Exception as e:
            self.logger.exception("OOPS")

    # call hook to delete file
    def on_deleted(self, event):
        super(CumulonimbusFSEventHandler, self).on_deleted(event)
        try:
            file_name = event.src_path[len(self.watch_directory):]
            file_name = file_name.replace('//', '/')
            self.change_map.pop(file_name, None)
            self.names_to_ids.pop(file_name, None)
            file_path, upload_path = self._get_file_name_and_upload_path(event, file_name)
            delete_params = dict(name=file_path, path=upload_path)
            headers = {'Content-type': 'application/json', 'Accept': 'text/plain'}
            r = requests.post('http://localhost:8080/api/instructions/delete',
                              data=json.dumps(delete_params),
                              headers=headers,
                              cookies=self.cookies)
            response_json = r.json()
            if response_json == 500:
                self.logger.error("GOT DELETE 500 from people")
                return
            if 'file' not in response_json:
                self.logger.error("COULD NOT DELETE FILE")
                return
            provider = response_json['file']['account']['provider']
            account_id = response_json['file']['account']['_id']
            file_name = event.src_path[len(self.watch_directory):]
            if provider == 'dropbox':
                dropbox_client = self.dropbox_clients[account_id]
                path_to_dropbox_file = file_name
                response = dropbox_client.file_delete(path_to_dropbox_file)
            elif provider == 'box':
                box_clients = self.box_clients[account_id]
                res = self._upload_box_file(box_client=box_client,
                                            full_path=event.src_path,
                                            file_path=file_name,
                                            is_directory=event.is_directory)
            elif provider == 'gdrive':
                gdrive_client = self.gdrive_clients[account_id]
                res = gdrive_client.files().delete(fileId=response_json['file']['cloudId'])
            update_params=dict(filename=file_path,
                               path=upload_path,
                               isDir=event.is_directory)
            r = requests.post('http://localhost:8080/api/update/delete',
                              data=json.dumps(update_params),
                              headers=headers,
                              cookies=self.cookies)
        except Exception as e:
            self.logger.exception("OOPS")

    def _upload_box_file(self, box_client, full_path, file_path, is_directory):
        folders = file_path.split('/')
        # put in root folder
        if folders[0] == '':
            file_name = folders[-1]
            resp = box_client.upload_file(filename=file_name, fileobj=full_path)
            return resp
        parent_id = 0
        for index, folder in enumerate(folders):
            if index == 0:
                params = dict(query=folder, type='folder')
                search_res = box_client._request("get", "search", params).json()
                if search_res['total_count'] == 0:
                    res = box_client.create_folder(name=folder)
                    parent_id = res['id']
                else:
                    parent_id = search_res['entries'][0]['id']
            elif index == len(folders)-1:
                if not is_directory:
                    res = box_client.upload_file(filename=file_name, fileobj=full_path, parent=parent_id)
                    return res
                else:
                    params = dict(query=folder, type='folder')
                    search_res = box_client._request("get", "search", params).json()
                    if search_res['total_count'] == 0:
                        res = box_client.create_folder(name=folder, parent=parent_id)
                        return res
                    else:
                        return search_res['entries'][0]
            else:
                params = dict(query=folder, type='folder')
                search_res = box_client._request("get", "search", params).json()
                if search_res['total_count'] == 0:
                    res = box_client.create_folder(name=folder, parent=parent_id)
                    parent_id = res['id']
                else:
                    parent_id = search_res['entries'][0]['id']


    def _upload_gdrive_file(self, gdrive_client, full_path, file_path, is_directory):
        file_path = file_path.replace('//', '/')
        file_path = file_path[1:]
        folders = file_path.split('/')
        # put in root folder
        if len(folders) == 1:
            file_name = folders[0]
            if not is_directory:
                if not file_path in self.names_to_ids:
                    self.logger.debug("ADDING NEW FILE: %s", file_path)
                    media_body = apiclient.http.MediaFileUpload(full_path)
                    body = dict(title=file_name, description='A file')
                    res = gdrive_client.files().insert(body=body, media_body=media_body, convert=True).execute()
                    return res
                else:
                    return None
            else:
                q = "title = '%s' and mimeType = 'application/vnd.google-apps.folder' and trashed = false" % file_name
                param = dict(q=q)
                files = gdrive_client.files().list(**param).execute()
                items = files['items']
                if len(items) == 0:
                    body = dict(title=file_name,
                                mimeType="application/vnd.google-apps.folder")
                    res = gdrive_client.files().insert(body=body).execute()
                    return res
                else:
                    return items[0]
        parent_id = 0
        for index, folder in enumerate(folders):
            if index == 0:
                q = "title = '%s' and mimeType = 'application/vnd.google-apps.folder' and trashed = false" % folder
                param = dict(q=q)
                files = gdrive_client.files().list(**param).execute()
                items = files['items']
                if len(items) == 0:
                    body = dict(title=folder, mimeType="application/vnd.google-apps.folder")
                    res = gdrive_client.files().insert(body=body).execute()
                    parent_id = res['id']
                else:
                    parent_id = items[0]['id']
            elif index == len(folders) - 1:
                if not is_directory:
                    if not file_path in self.names_to_ids:
                        self.logger.debug("ADDING NEW FILE: %s", file_path)
                        media_body = apiclient.http.MediaFileUpload(full_path)
                        body = dict(title=folder, description='A file', parents=[{'id': parent_id}])
                        res = gdrive_client.files().insert(body=body, media_body=media_body, convert=True).execute()
                        return res
                    else:
                        return None
                else:
                    q = "title = '%s' and mimeType = 'application/vnd.google-apps.folder' and trashed = false" % folder
                    param = dict(q=q)
                    files = gdrive_client.files().list(**param).execute()
                    items = files['items']
                    if len(items) == 0:
                        body = dict(title=folder,
                                    mimeType="application/vnd.google-apps.folder",
                                    parents=[{'id': parent_id}])
                        res = gdrive_client.files().insert(body=body).execute()
                        return res
                    else:
                        return items[0]
            else:
                q = "title = '%s' and mimeType = 'application/vnd.google-apps.folder' and trashed = false" % folder
                param = dict(q=q)
                files = gdrive_client.files().list(**param).execute()
                items = files['items']
                if len(items) == 0:
                    body = dict(title=folder,
                                mimeType="application/vnd.google-apps.folder",
                                parents=[{'id': parent_id}])
                    res = gdrive_client.files().insert(body=body).execute()
                    parent_id = res['id']
                else:
                    parent_id = items[0]['id']


    def _get_file_name_and_upload_path(self, event, file_name):
        if not event.is_directory:
            upload_path = '/' + '/'.join(file_name.split('/')[:-1])
            file_path = file_name.split('/')[-1]
        else:
            upload_path = file_name
            file_path = ''
        return file_path, upload_path




class FileWatcher(object):
    def __init__(self, watch_directory, logger=None, cookies=None):
        self.watch_directory = watch_directory
        if logger:
            self.logger = logger
        else:
            self.logger = logging.getLogger(__name__)
            formatter = logging.Formatter(
                "%(asctime)s %(threadName)-11s %(levelname)-10s %(message)s")
            self.logger.setLevel(logging.DEBUG)
            self.logger.propogate = False
            fh = logging.FileHandler(
                    '/Users/asgoel/Documents/Ashu/cumulonimbus/desktop/log/cumulonimbus/cumulonimbus.log', 'w')
            fh.setLevel(logging.DEBUG)
            fh.setFormatter(formatter)
            self.logger.addHandler(fh)
        self.cookies = cookies
        self.event_handler = CumulonimbusFSEventHandler(logger=self.logger,
                                                        watch_directory=self.watch_directory,
                                                        cookies=self.cookies)

    def start(self):
        self.observer = Observer()
        self.observer.schedule(self.event_handler, self.watch_directory, recursive=True)
        self.observer.start()

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.observer.stop()
        self.observer.join()
