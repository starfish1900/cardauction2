"""
Synthesizes the narration, one clip per segment of script/script.json, with the Kokoro voice
am_michael, then lays the clips on a timeline: each scene starts with a short lead-in, segments
follow each other with their pauses, and a scene may hold at its end for the animation.

Writes public/audio/voice/*.wav, public/audio/narration.wav (the whole track), src/timeline.json
(read by the animation) and out/subtitles.srt.

  python3 audio/voice.py --model <dir with kokoro-v1.0.onnx and voices-v1.0.bin>

With --lang fr it lays out the French narration instead: the clips audio/voice_fr.py made in
public/fr/audio/voice/, then public/fr/audio/narration.wav, src/fr/timeline.json,
src/fr/subtitles.json and out/fr/subtitles.srt.
"""
import argparse, json, os, re, time
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RATE = 24_000
LEAD = 0.6  # silence at the start of every scene, while it appears
VOICE, SPEED = "am_michael", 0.88

parser = argparse.ArgumentParser()
parser.add_argument("--model", help="the Kokoro model directory (English)")
parser.add_argument("--only", help="re-synthesize only segments whose text contains this")
parser.add_argument("--lang", choices=["en", "fr"], default="en")
args = parser.parse_args()
FR = args.lang == "fr"

# The French version keeps its files beside the English ones, under fr/.
sub = "fr" if FR else ""
script = json.load(open(os.path.join(ROOT, "script", "script.fr.json" if FR else "script.json")))
voice_dir = os.path.join(ROOT, "public", sub, "audio", "voice")
narration_path = os.path.join(ROOT, "public", sub, "audio", "narration.wav")
timeline_path = os.path.join(ROOT, "src", sub, "timeline.json")
subtitles_path = os.path.join(ROOT, "src", sub, "subtitles.json")
srt_path = os.path.join(ROOT, "out", sub, "subtitles.srt")
for d in (voice_dir, os.path.dirname(srt_path)):
    os.makedirs(d, exist_ok=True)
if not FR:
    from kokoro_onnx import Kokoro

    if not args.model:
        parser.error("--model is required for the English voice")
    kokoro = Kokoro(os.path.join(args.model, "kokoro-v1.0.onnx"), os.path.join(args.model, "voices-v1.0.bin"))


def clip_path(scene_id, index):
    return os.path.join(voice_dir, f"{scene_id}-{index:02d}.wav")


started = time.time()
if FR:
    # audio/voice_fr.py made the clips; each key ends with the words it says.
    stale = [clip_path(sc["id"], i) for sc in script["scenes"] for i, seg in enumerate(sc["segments"])
             if not os.path.exists(clip_path(sc["id"], i) + ".txt")
             or not open(clip_path(sc["id"], i) + ".txt").read().endswith("|" + seg["speech"].replace("CardAuction", "Card Auction"))]
    if stale:
        raise SystemExit(f"{len(stale)} French clips are missing or out of date, first {stale[0]}: run audio/voice_fr.py")
for scene in [] if FR else script["scenes"]:
    for i, seg in enumerate(scene["segments"]):
        path = clip_path(scene["id"], i)
        cache = path + ".txt"
        key = f"{VOICE}|{SPEED}|{seg['speech']}"
        fresh = os.path.exists(path) and os.path.exists(cache) and open(cache).read() == key
        if fresh and not (args.only and args.only in seg["text"]):
            continue
        samples, rate = kokoro.create(seg["speech"], voice=VOICE, speed=SPEED, lang="en-us")
        assert rate == RATE
        # Trim what the model leaves around the words, keeping a few milliseconds.
        loud = np.nonzero(np.abs(samples) > 0.01)[0]
        if len(loud):
            samples = samples[max(0, loud[0] - 240) : loud[-1] + 480]
        sf.write(path, samples, RATE)
        open(cache, "w").write(key)
print(f"voice ready in {time.time() - started:.0f} s")

def tighten(audio):
    """Cuts the quiet tail (breath, room tone) the French voice often leaves after its last word,
    so the pauses are the script's own: after the last loud stretch, the clip ends at the first
    100 ms of silence."""
    w = int(0.02 * RATE)
    n = len(audio) // w
    if n == 0:
        return audio
    db = 20 * np.log10(np.sqrt(np.mean(audio[: n * w].reshape(n, w) ** 2, axis=1)) + 1e-9)
    loud = np.nonzero(db > -35)[0]
    if not len(loud):
        return audio
    end = len(audio)
    quiet = 0
    for k in range(loud[-1] + 1, n):
        quiet = quiet + 1 if db[k] < -55 else 0
        if quiet == 5:
            end = (k - 4) * w + int(0.05 * RATE)
            break
    out = audio[:end].copy()
    fade = min(len(out), int(0.03 * RATE))
    out[len(out) - fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    return out


# The timeline.
t = 0.0
track = []
timeline = {"fps": 30, "scenes": []}
for scene in script["scenes"]:
    entry = {"id": scene["id"], "title": scene["title"], "start": round(t, 3), "segments": []}
    t += LEAD
    track.append(np.zeros(int(LEAD * RATE), dtype=np.float32))
    for i, seg in enumerate(scene["segments"]):
        audio, _ = sf.read(clip_path(scene["id"], i), dtype="float32")
        if FR:
            audio = tighten(audio)
        start, end = t, t + len(audio) / RATE
        entry["segments"].append(
            {"id": seg.get("id"), "text": seg["text"], "start": round(start, 3), "end": round(end, 3),
             **({"anchors": seg["anchors"]} if seg.get("anchors") else {})}
        )
        track.append(audio)
        gap = seg["gap"]
        track.append(np.zeros(int(gap * RATE), dtype=np.float32))
        t = end + gap
    if scene.get("hold"):
        track.append(np.zeros(int(scene["hold"] * RATE), dtype=np.float32))
        t += scene["hold"]
    entry["end"] = round(t, 3)
    timeline["scenes"].append(entry)
timeline["duration"] = round(t, 3)
narration = np.concatenate(track)
sf.write(narration_path, narration, RATE)
json.dump(timeline, open(timeline_path, "w"), indent=1, ensure_ascii=not FR)


# Subtitles: one cue per segment; a long one is split into cues of at most two lines, at the
# clause boundaries where possible, with lines of similar length. A run of numbers counted aloud
# (96, 97, ...) builds up on one line as they are spoken.
def fmt(seconds):
    ms = int(round(seconds * 1000))
    h, ms = divmod(ms, 3_600_000)
    m, ms = divmod(ms, 60_000)
    s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


WIDTH = 44
WEAK_END = {"a", "an", "the", "and", "or", "to", "of", "in", "on", "at", "for", "from", "with",
            "your", "their", "its", "is", "are", "be", "by", "but", "as", "that", "this", "no",
            "one", "two", "all", "you", "it", "if", "so", "can", "may", "must", "then", "new",
            "plus", "minus", "own"}
BOUND_AFTER_NUMBER = {"to", "steps", "marks", "cards", "of", "and", "is"}
if FR:
    WEAK_END = {"le", "la", "les", "l'", "un", "une", "des", "de", "du", "d'", "à", "au", "aux", "et", "ou",
                "en", "dans", "sur", "pour", "par", "avec", "sans", "votre", "vos", "sa", "son", "ses",
                "que", "qui", "ne", "n'", "pas", "plus", "moins", "ce", "cette", "il", "elle", "on", "vous",
                "se", "si", "mais", "donc", "car", "est", "sont", "peut", "doit", "deux", "chaque", "entre",
                "jusqu'à", "après", "avant", "puis", "nouvelle", "nouveau", "toute", "tout", "mon", "ma"}
    BOUND_AFTER_NUMBER = {"à", "crans", "cran", "cartes", "graduations", "de", "et", "est", "secondes",
                          "plus", "moins", "donne", "revient"}


def split_words(text):
    """Words, with the no-break spaces of French typography kept inside them."""
    return [w for w in text.split(" ") if w]


def is_number(word):
    return word.strip(".,:;!?").isdigit()


def break_cost(before, after=""):
    """How bad it is to break a line or a cue between these two words."""
    if before.endswith((".", "!", "?", ":")):
        return 0
    if before.endswith((",", ";")):
        return 2
    cost = 7
    word = before.lower().strip("\"'")
    if FR and "'" in word:
        word = word.split("'")[-1]  # "d'une" ends like "une"
    if word in WEAK_END:
        cost += 10
    # Keep "1 to 10", "plus 10", "13 cards" together.
    if is_number(after) or (is_number(before) and after.lower().strip(".,:;") in BOUND_AFTER_NUMBER):
        cost += 6
    return cost


def lines_for(words):
    """The chunk's words on one line, or on two of similar length, with how awkward the break
    is; None if they need three lines."""
    text = " ".join(words)
    if len(text) <= WIDTH:
        return [text], 0.0
    best = None
    for i in range(1, len(words)):
        a, b = " ".join(words[:i]), " ".join(words[i:])
        if len(a) > WIDTH or len(b) > WIDTH:
            continue
        cost = abs(len(a) - len(b)) * 0.12 + break_cost(words[i - 1], words[i])
        if best is None or cost < best[1]:
            best = ([a, b], cost)
    return best


def chunks_for(text):
    """Splits a segment into cues: few of them, cut at clause boundaries, none very short."""
    words = split_words(text)
    n = len(words)
    best = [(0.0, [])] + [None] * n  # best[j]: cost and cut points for words[:j]
    for j in range(1, n + 1):
        for i in range(j):
            if best[i] is None:
                continue
            fit = lines_for(words[i:j])
            if fit is None:
                continue
            size = len(" ".join(words[i:j]))
            cost = best[i][0] + 6 + max(0, 20 - size) * 0.6 + fit[1] * 1.5
            if j < n:
                cost += break_cost(words[j - 1], words[j]) * 2
            if best[j] is None or cost < best[j][0]:
                best[j] = (cost, best[i][1] + [(i, j)])
    return [words[i:j] for i, j in best[n][1]]


# Cues a segment of the script gives itself, instead of the automatic split.
given_cues = {
    (sc["id"], s.get("id")): s["cues"] for sc in script["scenes"] for s in sc["segments"] if s.get("cues")
}
cues = []
for scene in timeline["scenes"]:
    counted = []
    for seg in scene["segments"]:
        text, start, end = seg["text"], seg["start"], seg["end"]
        if re.fullmatch(r"n\d\d", seg.get("id") or ""):
            counted.append(text)
            cues.append([start, end, " ".join(counted)])
            continue
        counted = []
        given = given_cues.get((scene["id"], seg.get("id")))
        chunks = [split_words(c.replace("\n", " ")) for c in given] if given else chunks_for(text)
        total = sum(len(" ".join(c)) for c in chunks)
        at = start
        for k, c in enumerate(chunks):
            span = (end - start) * len(" ".join(c)) / total
            lines = given[k].split("\n") if given else lines_for(c)[0]
            cues.append([at, at + span, "\n".join(lines)])
            at += span
# Each cue stays up a moment after its words, never over the next one.
for k, cue in enumerate(cues):
    nxt = cues[k + 1][0] if k + 1 < len(cues) else cue[1] + 1
    cue[1] = min(cue[1] + 0.4, nxt) if nxt - cue[1] > 0.02 else cue[1]
if FR:
    # The typographic apostrophe, as on screen.
    cues = [[a, b, text.replace("'", "\u2019")] for a, b, text in cues]
with open(srt_path, "w") as f:
    for n, (a, b, text) in enumerate(cues, 1):
        f.write(f"{n}\n{fmt(a)} --> {fmt(b)}\n{text}\n\n")
json.dump([{"start": round(a, 3), "end": round(b, 3), "text": text} for a, b, text in cues],
          open(subtitles_path, "w"), indent=1, ensure_ascii=not FR)
m, s = divmod(timeline["duration"], 60)
print(f"{len(cues)} subtitle cues; total {int(m)}:{s:04.1f}")
