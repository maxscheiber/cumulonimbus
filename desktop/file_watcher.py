import logging
import time

import dropbox
import requests
import watchdog.events
from watchdog.observers import Observer



class CumulonimbusFSEventHandler(watchdog.events.FileSystemEventHandler):

    def __init__(self, logger, watch_directory):
        super(CumulonimbusFSEventHandler, self).__init__()
        self.logger = logger
        # USE REQUESTS TO GET TOKENS
        dropbox_access_token = 'mDjIFTg3VrUAAAAAAAAABez1I9Q7RGLhOScZQjDo9EdB1x4RK0tMCV7cwaMQzOfq'
        self.dropbox_client = dropbox.client.DropboxClient(dropbox_access_token)
        self.watch_directory = watch_directory

    # call hook to add file
    def on_created(self, event):
        super(CumulonimbusFSEventHandler, self).on_created(event)
        # USE REQUESTS TO CALL HOOK
        file_name = event.src_path[len(self.watch_directory):]
        path_to_dropbox_file = '/' + file_name
        response = self.dropbox_client.put_file(path_to_dropbox_file, event.src_path)

    # call hook to delete file
    def on_deleted(self, event):
        super(CumulonimbusFSEventHandler, self).on_deleted(event)
        # USE REQUESTS TO CALL HOOK
        try:
            file_name = event.src_path[len(self.watch_directory):]
            self.logger.debug(file_name)
            path_to_dropbox_file = '/' + file_name
            response = self.dropbox_client.file_delete(path_to_dropbox_file)
        except Exception as e:
            self.logger.exception("OOPS")



class FileWatcher(object):
    def __init__(self, watch_directory, logger=None):
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
        self.event_handler = CumulonimbusFSEventHandler(self.logger, self.watch_directory)

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
