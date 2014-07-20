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
        # USE REQUESTS TO GET TOKENS
        dropbox_access_token = 'mDjIFTg3VrUAAAAAAAAABez1I9Q7RGLhOScZQjDo9EdB1x4RK0tMCV7cwaMQzOfq'
        self.dropbox_client = dropbox.client.DropboxClient(dropbox_access_token)
        self.watch_directory = watch_directory
        self.cookies = cookies

    # call hook to add file
    def on_created(self, event):
        super(CumulonimbusFSEventHandler, self).on_created(event)
        # USE REQUESTS TO CALL HOOK
        try:
            params = dict(size=os.path.getsize(event.src_path))
            r = requests.post('http://localhost:8080/api/instructions/new',
                              params=params)
            self.logger.debug(r.text)
            file_name = event.src_path[len(self.watch_directory):]
            path_to_dropbox_file = file_name
            response = self.dropbox_client.put_file(path_to_dropbox_file, event.src_path)
        except Exception as e:
            self.logger.exception("OOPS")

    # call hook to delete file
    def on_deleted(self, event):
        super(CumulonimbusFSEventHandler, self).on_deleted(event)
        # USE REQUESTS TO CALL HOOK
        try:
            file_name = event.src_path[len(self.watch_directory):]
            path_to_dropbox_file = file_name
            response = self.dropbox_client.file_delete(path_to_dropbox_file)
        except Exception as e:
            self.logger.exception("OOPS")

    def on_moved(self, event):
        try:
            src_file_name = event.src_path[len(self.watch_directory):]
            dest_file_name = event.dest_path[len(self.watch_directory):]
            response = self.dropbox_client.file_move(src_file_name, dest_file_name)
        except Exception as e:
            self.logger.exception("OOPS")



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
        self.logger.debug("starting observer.")
        try:
            self.observer.schedule(self.event_handler, self.watch_directory, recursive=True)
            self.logger.debug("after schedule")
            self.observer.start()
        except Exception as e:
            self.logger.exception("OOPS")

        try:
            while True:
                time.sleep(1)
        except KeyboardInterrupt:
            self.observer.stop()
        self.observer.join()
