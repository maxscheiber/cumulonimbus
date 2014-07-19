import logging
import time

import watchdog.events
from watchdog.observers import Observer


class CumulonimbusFSEventHandler(watchdog.events.FileSystemEventHandler):

    def __init__(self, logger):
        super(CumulonimbusFSEventHandler, self).__init__()
        self.logger = logger

    # call hook to add file
    def on_created(self, event):
        super(CumulonimbusFSEventHandler, self).on_created(event)
        what = 'directory' if event.is_directory else 'file'
        self.logger.info("Created %s: %s", what, event.src_path)


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
        self.event_handler = CumulonimbusFSEventHandler(self.logger)

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
