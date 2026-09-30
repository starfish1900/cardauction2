"""
Synthesizes the French narration, one clip per segment of script/script.fr.json, as 24 kHz WAV
files in public/fr/audio/voice/. Each clip has a .txt key (engine, voice and words), so a new run
voices again only the segments that changed. Then `python3 audio/voice.py --lang fr` lays the
clips on the timeline and writes the French subtitles.

  <python with chatterbox-tts> audio/voice_fr.py --engine chatterbox --ref <reference voice.wav>
  python3 audio/voice_fr.py --engine piper --model <fr_FR-*.onnx>   (a quick draft voice)

Chatterbox (MIT licence) speaks in the voice of a short reference recording.
"""
import argparse, json, os, time, zlib
import numpy as np
import soundfile as sf

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RATE = 24_000
# How the voice should say the game's name: the English words, as a French speaker says them.
NAME = "Card Auction"

parser = argparse.ArgumentParser()
parser.add_argument("--engine", choices=["chatterbox", "piper"], required=True)
parser.add_argument("--ref", help="chatterbox: the reference recording of the voice")
parser.add_argument("--model", help="piper: the .onnx voice")
parser.add_argument("--speaker", type=int, default=None, help="piper: speaker id")
parser.add_argument("--length-scale", type=float, default=1.0, help="piper: >1 speaks slower")
parser.add_argument("--exaggeration", type=float, default=0.5, help="chatterbox: expressiveness")
parser.add_argument("--cfg", type=float, default=0.5, help="chatterbox: guidance weight")
parser.add_argument("--only", help="voice again only the segments whose text contains this")
parser.add_argument("--seed", type=int, default=0, help="chatterbox: added to each segment's seed")
parser.add_argument("--candidates", help="clips to voice again as candidate takes (a,b,...), into --out")
parser.add_argument("--takes", default="1-3", help="with --candidates: the take numbers to try, e.g. 1-3")
parser.add_argument("--out", help="with --candidates: where the candidate takes go (<clip>.t<take>.wav)")
parser.add_argument("--limit", type=int, default=0,
                    help="stop after this many clips (the model's memory grows as it works)")
args = parser.parse_args()

script = json.load(open(os.path.join(ROOT, "script", "script.fr.json")))
voice_dir = os.path.join(ROOT, "public", "fr", "audio", "voice")
os.makedirs(voice_dir, exist_ok=True)

if args.engine == "chatterbox":
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS

    torch.set_num_threads(os.cpu_count() or 2)
    model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    ref_name = os.path.basename(args.ref)
    engine = f"chatterbox|{ref_name}|{args.exaggeration}|{args.cfg}|{args.seed}"

    def synth(speech, seed):
        torch.manual_seed(seed)
        wav = model.generate(speech, language_id="fr", audio_prompt_path=args.ref,
                             exaggeration=args.exaggeration, cfg_weight=args.cfg)
        return wav.squeeze(0).numpy().astype(np.float32), model.sr
else:
    import io, wave
    from piper import PiperVoice, SynthesisConfig

    piper = PiperVoice.load(args.model)
    engine = f"piper|{os.path.basename(args.model)}|{args.speaker}|{args.length_scale}"

    def synth(speech, seed):
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            piper.synthesize_wav(speech, wf, syn_config=SynthesisConfig(
                speaker_id=args.speaker, length_scale=args.length_scale))
        buf.seek(0)
        with wave.open(buf, "rb") as wf:
            rate = wf.getframerate()
            pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
        return pcm.astype(np.float32) / 32768.0, rate


def to_rate(samples, rate):
    if rate == RATE:
        return samples
    from math import gcd
    from scipy.signal import resample_poly

    g = gcd(RATE, rate)
    return resample_poly(samples, RATE // g, rate // g).astype(np.float32)


def voice(speech, seed):
    samples, rate = synth(speech, seed)
    samples = to_rate(samples, rate)
    # Trim what the model leaves around the words, keeping a few milliseconds.
    loud = np.nonzero(np.abs(samples) > 0.01)[0]
    if len(loud):
        samples = samples[max(0, loud[0] - 240): loud[-1] + 480]
    return samples


def seed_of(scene_id, i, take):
    # A line's seed; another "take" (in the script) is another reading of the same words.
    return zlib.crc32(f"{scene_id}/{i}".encode()) + args.seed + 1000 * take


started, made = time.time(), 0
if args.candidates:
    names = args.candidates.split(",")
    first, last = (int(n) for n in args.takes.split("-"))
    os.makedirs(args.out, exist_ok=True)
    for scene in script["scenes"]:
        for i, seg in enumerate(scene["segments"]):
            name = f"{scene['id']}-{i:02d}"
            if name not in names:
                continue
            for take in range(first, last + 1):
                samples = voice(seg["speech"].replace("CardAuction", NAME), seed_of(scene["id"], i, take))
                sf.write(os.path.join(args.out, f"{name}.t{take}.wav"), samples, RATE)
                print(f"{name} take {take}: {len(samples) / RATE:.1f} s", flush=True)
    raise SystemExit(0)

for scene in script["scenes"]:
    for i, seg in enumerate(scene["segments"]):
        path = os.path.join(voice_dir, f"{scene['id']}-{i:02d}.wav")
        speech = seg["speech"].replace("CardAuction", NAME)
        take = seg.get("take", 0)
        key = f"{engine}|take{take}|{speech}" if take else f"{engine}|{speech}"
        cache = path + ".txt"
        fresh = os.path.exists(path) and os.path.exists(cache) and open(cache).read() == key
        if fresh and not (args.only and args.only in seg["text"]):
            continue
        samples = voice(speech, seed_of(scene["id"], i, take))
        sf.write(path, samples, RATE)
        open(cache, "w").write(key)
        made += 1
        print(f"{scene['id']}-{i:02d}: {len(samples) / RATE:.1f} s  {seg['text'][:60]}", flush=True)
        if args.limit and made >= args.limit:
            break
    else:
        continue
    break
print(f"{made} clips voiced in {time.time() - started:.0f} s")
