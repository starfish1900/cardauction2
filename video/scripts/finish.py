"""
Finishes the rendered tutorial:

  1. evens out the loudness of the soundtrack (-16 LUFS, peaks under -1.5 dBTP), video copied as is:
     out/cardauction-tutorial.mp4, the clean version;
  2. lays the subtitle band (rendered separately: out/band.mp4) over the bottom of the picture:
     out/cardauction-tutorial-subtitled.mp4, the version with burned-in subtitles;
  3. copies the subtitles next to them: out/cardauction-tutorial.en.srt.

  python3 scripts/finish.py [--skip-band]

The French version is rendered with its subtitles (the TutorialSubtitled composition, with
REMOTION_LANG=fr) to out/fr/tutorial-raw.mp4; `python3 scripts/finish.py --lang fr` evens out its
sound into out/fr/cardauction-tutoriel-fr.mp4.
"""
import json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FR = "--lang" in sys.argv and sys.argv[sys.argv.index("--lang") + 1] == "fr"
OUT = os.path.join(ROOT, "out", "fr") if FR else os.path.join(ROOT, "out")
RAW = os.path.join(OUT, "tutorial-raw.mp4")
CLEAN = os.path.join(OUT, "cardauction-tutoriel-fr.mp4" if FR else "cardauction-tutorial.mp4")
BAND = os.path.join(OUT, "band.mp4")
SUBTITLED = os.path.join(OUT, "cardauction-tutorial-subtitled.mp4")
TARGET = "I=-16:TP=-1.5:LRA=11"


def run(*args):
    print("+", " ".join(args), flush=True)
    return subprocess.run(args, check=True, capture_output=True, text=True)


# 1. Two-pass loudness normalization of the whole mix.
measure = run("ffmpeg", "-hide_banner", "-nostats", "-i", RAW, "-af", f"loudnorm={TARGET}:print_format=json", "-f", "null", "-")
stats = json.loads(re.search(r"\{[^{}]*\}\s*$", measure.stderr).group(0))
print("measured:", {k: stats[k] for k in ("input_i", "input_tp", "input_lra", "input_thresh")})
second = (
    f"loudnorm={TARGET}:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}"
    f":measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}"
    f":offset={stats['target_offset']}"
)
run("ffmpeg", "-hide_banner", "-y", "-i", RAW, "-map", "0:v", "-map", "0:a", "-c:v", "copy",
    "-af", second, "-ar", "48000", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", CLEAN)

if FR:  # the French render already has its subtitles
    print("done")
    sys.exit(0)

# 2. The subtitle band over the bottom 150 pixels.
if "--skip-band" not in sys.argv:
    run("ffmpeg", "-hide_banner", "-y", "-i", CLEAN, "-i", BAND, "-filter_complex", "[0:v][1:v]overlay=0:930:shortest=1[v]",
        "-map", "[v]", "-map", "0:a", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart", SUBTITLED)

# 3. The subtitles.
shutil.copyfile(os.path.join(OUT, "subtitles.srt"), os.path.join(OUT, "cardauction-tutorial.en.srt"))
print("done")
