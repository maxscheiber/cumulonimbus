import httplib2
import json
import logging
import os
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
        self._create_accounts_map(self.cookies)

    def _create_accounts_map(self, cookies):
        r = requests.get('http://localhost:8080/api/accounts', cookies=cookies)
        response_json = r.json()
        accounts = r['accounts']
        self.accounts = {}
        self.dropbox_clients = {}
        self.box_clients = {}
        self.gdrive_clients = {}
        for account in accounts:
            self.accounts[account['id']] = (account['provider'], account['token'])
            if account['provider'] == 'dropbox':
                self.dropbox_clients[account['id']] = dropbox.client.DropboxClient(account['token'])
            elif account['provider'] = 'box':
                self.box_clients[account['id']] = box.BoxClient(account['token'])
            else:
                credentials.oauth2client.client.AccessTokenCredentials(access_token=access_token,
                                                                       user_agent='Cumulonimbus/1.0')
                http = httplib2.Http()
                http = credentials.authorize(http)
                self.gdrive_clients[account['id']] = apiclient.discovery.build('drive', 'v2', http)


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
                dropbox_client = self.dropbox_clients[account_id]
                path_to_dropbox_file = file_name
                if event.is_directory:
                    response = dropbox_client.file_create_folder(path_to_dropbox_file)
                else:
                    response = dropbox_client.put_file(path_to_dropbox_file, event.src_path)
                rev = response['rev']
                size = response['bytes']
            elif provider == 'box':
                box_clients = self.box_clients[account_id]
                res = self._upload_box_file(box_client=box_client,
                                            full_path=event.src_path,
                                            file_path=file_name,
                                            is_directory=event.is_directory)
                rev = res['rev']
                size = res['size']
            elif provider == 'gdrive':
                gdrive_client = self.gdrive_clients[account_id]
                res = self._upload_gdrive_file(gdrive_client=gdrive_client,
                                         full_path=event.src_path,
                                         file_path=file_name,
                                         is_directory=event.is_directory)
                rev = res['id']
                if 'fileSize' in res:
                    size = res['fileSize']
                else:
                    size = 0

            file_path, upload_path = self._get_file_name_and_upload_path(event, file_name)
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
            path_to_dropbox_file = file_name
            file_path, upload_path = self._get_file_name_and_upload_path(event, file_name)
            # TODO(ashu): update params
            delete_params = dict(filename=file_path, path=upload_path)
            r = requests.post('http://localhost:8080/api/instructions/delete',
                              params=delete_params,
                              cookies=self.cookies)
            response_json = r.json()
            if 'account' not in response_json:
                self.logger.error("COULD NOT DELETE FILE")
                return
            provider = response_json['account']['provider']
            dropbox_client = dropbox.client.DropboxClient(response_json['account']['token'])
            response = dropbox_client.file_delete(path_to_dropbox_file)
            # TODO(ashu): update delete endpoint call
        except Exception as e:
            self.logger.exception("OOPS")

    def on_moved(self, event):
        try:
            src_file_name = event.src_path[len(self.watch_directory):]
            dest_file_name = event.dest_path[len(self.watch_directory):]
            response = self.dropbox_client.file_move(src_file_name, dest_file_name)
        except Exception as e:
            self.logger.exception("OOPS")

    def on_modified(self, event):
        try:
            params = dict(size=os.path.getsize(event.src_path))
            r = requests.post('http://localhost:8080/api/instructions/modify',
                              params=params, cookies=self.cookies)
            if 'account' not in r.json():
               self.logger.error("COULD NOT MODIFY FILE")
               return
            provider = r.json()['account']['provider']
            account_id = r.json()['account']['id']
            dropbox_client = dropbox.client.DropboxClient(r.json()['account']['token'])
            file_name = event.src_path[len(self.watch_directory):]
            path_to_dropbox_file = file_name
            response = dropbox_client.put_file(path_to_dropbox_file, event.src_path, overwrite=True)
            file_path, upload_path = self._get_file_name_and_upload_path(event, file_name)
            rev = response['rev']
            update_params=dict(filename=file_path,
                               path=upload_path,
                               provider=provider,
                               cloudId=rev,
                               size=response['bytes'],
                               accountId=account_id)
            r = requests.post('http://localhost:8080/api/update/modify',
                              params=params,
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
        file_path = file_path[1:]
        folders = file_path.split('/')
        # put in root folder
        if len(folders) == 1:
            file_name = folders[0]
            if not is_directory:
                self.logger.debug("FILE_PATH: %s", file_path)
                self.logger.debug("FILENAME: %s", file_name)
                media_body = apiclient.http.MediaFileUpload(full_path)
                body = dict(title=file_name, description='A file')
                res = gdrive_client.files().insert(body=body, media_body=media_body, convert=True).execute()
                return res
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
            self.logger.debug("FOLDER: %s", folder)
            if index == 0:
                q = "title = '%s' and mimeType = 'application/vnd.google-apps.folder' and trashed = false" % folder
                param = dict(q=q)
                files = gdrive_client.files().list(**param).execute()
                items = files['items']
                if len(items) == 0:
                    self.logger.debug("INSERTING FOLDER: %s", folder)
                    body = dict(title=folder, mimeType="application/vnd.google-apps.folder")
                    res = gdrive_client.files().insert(body=body).execute()
                    parent_id = res['id']
                else:
                    parent_id = items[0]['id']
            elif index == len(folders) - 1:
                if not is_directory:
                    media_body = apiclient.http.MediaFileUpload(full_path)
                    body = dict(title=folder, description='A file', parents=[{'id': parent_id}])
                    res = gdrive_client.files().insert(body=body, media_body=media_body, convert=True).execute()
                    return res
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
