import logging
import os
import time

import dropbox
import requests
import watchdog.events
from watchdog.observers import Observer



class CumulonimbusFSEventHandler(watchdog.events.FileSystemEventHandler):

    def __init__(self, logger, watch_directory, cookies):
        super(CumulonimbusFSEventHandler, self).__init__()
        self.logger = logger
        self.watch_directory = watch_directory
        self.cookies = cookies

    # call hook to add file
    def on_created(self, event):
        super(CumulonimbusFSEventHandler, self).on_created(event)
        try:
            params = dict(size=os.path.getsize(event.src_path))
            r = requests.post('http://localhost:8080/api/instructions/new',
                              params=params, cookies=self.cookies)
            if 'account' not in r.json():
               self.logger.error("COULD NOT CREATE FILE")
               return
            provider = r.json()['account']['provider']
            account_id = r.json()['account']['id']
            dropbox_client = dropbox.client.DropboxClient(r.json()['account']['token'])
            file_name = event.src_path[len(self.watch_directory):]
            path_to_dropbox_file = file_name
            response = dropbox_client.put_file(path_to_dropbox_file, event.src_path)
            file_path, upload_path = self._get_file_name_and_upload_path(file_name)
            rev = response['rev']
            update_params=dict(filename=file_path,
                               path=upload_path,
                               provider=provider,
                               cloudId=rev,
                               size=response['bytes'],
                               accountId=account_id)
            self.logger.debug(update_params)
            r = requests.post('http://localhost:8080/api/update/new',
                              params=params,
                              cookies=self.cookies)
            self.logger.debug(r.text)
        except Exception as e:
            self.logger.exception("OOPS")

    # call hook to delete file
    def on_deleted(self, event):
        super(CumulonimbusFSEventHandler, self).on_deleted(event)
        try:
            file_name = event.src_path[len(self.watch_directory):]
            path_to_dropbox_file = file_name
            file_path, upload_path = self._get_file_name_and_upload_path(file_name)
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
            file_path, upload_path = self._get_file_name_and_upload_path(file_name)
            rev = response['rev']
            update_params=dict(filename=file_path,
                               path=upload_path,
                               provider=provider,
                               cloudId=rev,
                               size=response['bytes'],
                               accountId=account_id)
            self.logger.debug(update_params)
            r = requests.post('http://localhost:8080/api/update/modify',
                              params=params,
                              cookies=self.cookies)
            self.logger.debug(r.text)
        except Exception as e:
            self.logger.exception("OOPS")


    def _get_file_name_and_upload_path(self, file_name):
        if not event.is_directory:
            upload_path = '/'.join(file_name.split('/')[:-1])
            if upload_path == '':
                upload_path = '/'
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
