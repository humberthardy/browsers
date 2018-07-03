#!/bin/bash

# Build All Containers
CURR_DIR=$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )

set -e

if  [ -d "$CURR_DIR/base-browser" ]; then
    cd $CURR_DIR/base-browser/audio
    ./build-webrtc.sh 
    cd $CURR_DIR/base-browser
    $CURR_DIR/build-me.sh
fi

BROWSER_DIRS=$(find $CURR_DIR -type f -name Dockerfile)

echo "Building $BROWSER_DIRS"

for dir in $BROWSER_DIRS
do
   echo "----------------"
   echo " Building $dir"
   echo "----------------"

    dir=`dirname $dir`
    if [ -f "$dir/skip" ]; then
       continue
    fi
    cd $dir
    $CURR_DIR/build-me.sh
done


