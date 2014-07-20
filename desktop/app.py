import logging
import json
import os
import signal
import sys
import time

import requests
from watchdog.events import LoggingEventHandler
from watchdog.observers import Observer

import file_watcher

logger = logging.getLogger(__name__)

def start_watchdog():
    try:
        watcher = file_watcher.FileWatcher(watch_directory=watch_path,
                                           logger=logger,
                                           cookies=cookies)
        watcher.start()
    except Exception as e:
        logger.exception("OOPS")

if __name__ == '__main__':
    pid = '/tmp/cumulonimbus.pid'
    if len(sys.argv) < 2:
        print 'Usage: python app.py <path_to_watch>'
        sys.exit(1)
    username = raw_input('Username: ')
    password = raw_input('Password: ')
    #username=''
    #password=''
    info = dict(username=username, password=password)
    breakpoint = True
    r = requests.post('http://localhost:8080/api/login', params=info)
    if r.json()['message'] == 'Bad login credentials':
        print 'Invalid username and/or password.'
        sys.exit(1)
    cookies = r.cookies
    watch_path = os.path.abspath(sys.argv[1])
    formatter = logging.Formatter(
        "%(asctime)s %(threadName)-11s %(levelname)-10s %(message)s")
    logger.setLevel(logging.DEBUG)
    logger.propogate = False
    fh = logging.FileHandler('log/cumulonimbus/cumulonimbus.log', 'w')
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(formatter)
    logger.addHandler(fh)
    start_watchdog()
