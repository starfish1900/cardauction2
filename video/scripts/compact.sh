#!/bin/sh
# Smaller copies of the two finished videos (about 28 MiB each, for sending as attachments):
# two-pass H.264 at 380 kb/s for the picture and 80 kb/s AAC for the sound.
set -e
cd "$(dirname "$0")/../out"
mkdir -p share
for name in cardauction-tutorial-subtitled cardauction-tutorial; do
  ffmpeg -hide_banner -loglevel error -y -i "$name.mp4" -c:v libx264 -preset slow -tune animation -b:v 380k \
    -x264-params keyint=300:min-keyint=30 -pass 1 -passlogfile "share/$name" -an -f null /dev/null
  ffmpeg -hide_banner -loglevel error -y -i "$name.mp4" -c:v libx264 -preset slow -tune animation -b:v 380k \
    -x264-params keyint=300:min-keyint=30 -pass 2 -passlogfile "share/$name" -c:a aac -b:a 80k \
    -movflags +faststart "share/$name.mp4"
  rm -f "share/$name"-*.log "share/$name"-*.mbtree
done
cp cardauction-tutorial.en.srt share/
ls -la share
