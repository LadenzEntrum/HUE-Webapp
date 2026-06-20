<?php
// Copy this file to /volume1/hue-config.php on the Synology (OUTSIDE the web root).
// That path is above /volume1/web/ so it is never HTTP-accessible and is never
// overwritten by a deploy rsync.
//
// On dsmuc, run once via SSH:
//   cp /path/to/this/file /volume1/hue-config.php
//   # then fill in the values below
//   chmod 600 /volume1/hue-config.php

$HUE_BRIDGE_IP = '192.168.76.199';
$HUE_USERNAME  = 'your-username-here';  // from .secrets/hue.json
