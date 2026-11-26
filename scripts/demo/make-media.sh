#!/usr/bin/env bash
# Convert Playwright recordings (.out/raw/<scene>.webm) into the files used by the README:
#   docs/demo/<scene>.mp4          full video (H.264, plays in any browser / GitHub file viewer)
#   docs/demo/<scene>-preview.gif  short animated preview shown inline in the README
#   docs/demo/<scene>.jpg          poster frame
set -euo pipefail
cd "$(dirname "$0")"
OUT=../../docs/demo
mkdir -p "$OUT"
for scene in "${@:-infra distributor customer}"; do
  for s in $scene; do
    in=.out/raw/$s.webm
    speed=3; [[ $s == distributor ]] && speed=4
    [[ -f $in ]] || { echo "missing $in"; continue; }
    ffmpeg -loglevel error -y -i "$in" -c:v libx264 -preset slow -crf 28 -tune animation -pix_fmt yuv420p -movflags +faststart -an "$OUT/$s.mp4"
    ffmpeg -loglevel error -y -ss 4 -i "$in" -frames:v 1 -vf scale=1280:-2 -q:v 3 "$OUT/$s.jpg"
    # preview: 3-4x speed, 5 fps, 720px wide, 96-color palette
    ffmpeg -loglevel error -y -i "$in" -vf "setpts=PTS/$speed,fps=5,scale=720:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=96:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "$OUT/$s-preview.gif"
    printf '%-12s mp4 %6s  gif %6s  duration %ss\n' "$s" "$(du -h "$OUT/$s.mp4" | cut -f1)" "$(du -h "$OUT/$s-preview.gif" | cut -f1)" \
      "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT/$s.mp4" | cut -d. -f1)"
  done
done
