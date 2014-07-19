import logging
import os
import signal
import sys
import time

from daemonize import Daemonize
import file_watcher
from watchdog.events import LoggingEventHandler
from watchdog.observers import Observer

logger = logging.getLogger(__name__)

def start_watchdog():
    try:
        watcher = file_watcher.FileWatcher(watch_path, logger)
        watcher.start()
    except Exception as e:
        logger.exception("OOPS")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print 'Usage: python app.py start|stop [args]'
        sys.exit(1)
    command = sys.argv[1]
    pid = '/tmp/cumulonimbus.pid'
    formatter = logging.Formatter(
        "%(asctime)s %(threadName)-11s %(levelname)-10s %(message)s")
    logger.setLevel(logging.DEBUG)
    logger.propogate = False
    fh = logging.FileHandler('log/cumulonimbus/cumulonimbus.log', 'w')
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(formatter)
    logger.addHandler(fh)
    keep_fds = [fh.stream.fileno()]
    daemon = Daemonize(app="cumulonimbus",
                       pid=pid,
                       action=start_watchdog,
                       keep_fds=keep_fds,
                       logger=logger)
    if command == 'start':
        if len(sys.argv) < 3:
            print 'Usage: python app.py start <path_to_watch>'
            sys.exit(1)
        watch_path = sys.argv[2]
        daemon.start()
    else:
        pidfile = open(pid, 'r')
        pid_num = int(pidfile.readline())
        os.kill(pid_num, signal.SIGKILL)
