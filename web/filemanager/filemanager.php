<?php
/********************************
Simple PHP File Manager
Copyright John Campbell (jcampbell1)

Liscense: MIT
********************************/

// must be in UTF-8 or `basename` doesn't work
setlocale(LC_ALL,'en_US.UTF-8');

$tmp = realpath($_REQUEST['file']);
if($tmp === false)
    err(404,'File or Directory Not Found');
if(substr($tmp, 0,strlen(__DIR__)) !== __DIR__)
    err(403,"Forbidden");

if(!$_COOKIE['_sfm_xsrf'])
    setcookie('_sfm_xsrf',bin2hex(openssl_random_pseudo_bytes(16)));
if($_POST) {
    if($_COOKIE['_sfm_xsrf'] !== $_POST['xsrf'] || !$_POST['xsrf'])
        err(403,"XSRF Failure");
}

$file = $_REQUEST['file'] ?: '.';
if($_GET['do'] == 'list') {
    if (is_dir($file)) {
        $directory = $file;
        $result = array();
        $files = array_diff(scandir($directory), array('.','..'));
        foreach($files as $entry) if($entry !== basename(__FILE__)) {
            $i = $directory . '/' . $entry;
            $stat = stat($i);
            $result[] = array(
                'mtime' => $stat['mtime'],
                'size' => $stat['size'],
                'name' => basename($i),
                'path' => preg_replace('@^\./@', '', $i),
                'is_dir' => is_dir($i),
                'is_deleteable' => (!is_dir($i) && is_writable($directory)) || 
                                   (is_dir($i) && is_writable($directory) && is_recursively_deleteable($i)),
                'is_readable' => is_readable($i),
                'is_writable' => is_writable($i),
                'is_executable' => is_executable($i),
            );
        }
    } else {
        err(412,"Not a Directory");
    }
    echo json_encode(array('success' => true, 'is_writable' => is_writable($file), 'results' =>$result));
    exit;
} elseif ($_POST['do'] == 'delete') {
    rmrf($file);
    exit;
} elseif ($_POST['do'] == 'mkdir') {
    chdir($file);
    @mkdir($_POST['name']);
    exit;
} elseif ($_POST['do'] == 'upload') {
    var_dump($_POST);
    var_dump($_FILES);
    var_dump($_FILES['file_data']['tmp_name']);
    var_dump(move_uploaded_file($_FILES['file_data']['tmp_name'], $file.'/'.$_FILES['file_data']['name']));
    exit;
} elseif ($_GET['do'] == 'download') {
    $filename = basename($file);
    header('Content-Type: ' . mime_content_type($file));
    header('Content-Length: '. filesize($file));
    header(sprintf('Content-Disposition: attachment; filename=%s',
        strpos('MSIE',$_SERVER['HTTP_REFERER']) ? rawurlencode($filename) : "\"$filename\"" ));
    ob_flush();
    readfile($file);
    exit;
}
function rmrf($dir) {
    if(is_dir($dir)) {
        $files = array_diff(scandir($dir), array('.','..'));
        foreach ($files as $file)
            rmrf("$dir/$file");
        rmdir($dir);
    } else {
        unlink($dir);
    }
}
function is_recursively_deleteable($d) {
    $stack = array($d);
    while($dir = array_pop($stack)) {
        if(!is_readable($dir) || !is_writable($dir)) 
            return false;
        $files = array_diff(scandir($dir), array('.','..'));
        foreach($files as $file) if(is_dir($file)) {
            $stack[] = "$dir/$file";
        }
    }
    return true;
}

function err($code,$msg) {
    echo json_encode(array('error' => array('code'=>intval($code), 'msg' => $msg)));
    exit;
}

function asBytes($ini_v) {
    $ini_v = trim($ini_v);
    $s = array('g'=> 1<<30, 'm' => 1<<20, 'k' => 1<<10);
    return intval($ini_v) * ($s[strtolower(substr($ini_v,-1))] ?: 1);
}
$MAX_UPLOAD_SIZE = min(asBytes(ini_get('post_max_size')), asBytes(ini_get('upload_max_filesize')));
?>