# The CardAuction video tutorial

An 8½-minute narrated tutorial: every rule of the game, then how to play in the app. Made with
[Remotion](https://www.remotion.dev) (the animation, drawn with the app's own card faces), the
Kokoro voice `am_michael` (the narration) and screenshots of the real app.

| Step    | Command                                                              | Makes                                                                            |
| ------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Script  | `python3 script/script.py`                                           | `script/script.json`, from the scenes written in the script                      |
| Voice   | `python3 audio/voice.py --model <dir>`                               | the narration, `src/timeline.json` (when each line is said), the subtitles       |
| Sounds  | `python3 audio/sfx.py`                                               | `public/audio/sfx/*.wav`, synthesized                                            |
| Screens | `capture/` (see its files)                                           | `public/screens/*.png` and `src/screens.json`, from a local server and web build |
| Preview | `npx remotion studio src/index.ts`                                   | the video in a browser, frame by frame                                           |
| Stills  | `node scripts/stills.mjs <dir> <scene@seconds>…`                     | review stills at half size                                                       |
| Render  | `npx remotion render src/index.ts Tutorial out/tutorial-raw.mp4`     | the clean video                                                                  |
| Band    | `npx remotion render src/index.ts SubtitleBand out/band.mp4 --muted` | the subtitle band alone                                                          |
| Finish  | `python3 scripts/finish.py`                                          | the final files in `out/` (see below)                                            |

`<dir>` holds `kokoro-v1.0.onnx` and `voices-v1.0.bin` from the kokoro-onnx releases on GitHub.

The final files:

- `out/cardauction-tutorial.mp4`: the clean version, sound evened out to -16 LUFS;
- `out/cardauction-tutorial-subtitled.mp4`: the same with the subtitles burned into the band at
  the bottom, where nothing that teaches is ever drawn;
- `out/cardauction-tutorial.en.srt`: the subtitles, for a player or a video site.

The animation follows the narration: each scene of `src/scenes/` places its moves at the words
they illustrate (`useMarks(scene).at(line)` and `.word(line, words)`), so a change of script
only needs the voice step again, then a render.

## The French version

The same scenes in French. With `REMOTION_LANG=fr`, the video reads its French files: the
narration and the subtitles (`src/fr/`, `public/fr/audio/`), the texts on screen
(`src/fr/strings.json`, keyed by the English text, through `tr()`), and screenshots of the app in
French (`public/fr/screens/`, `src/fr/screens.json`).

| Step    | Command                                                                                       | Makes                                                                              |
| ------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Script  | `python3 script/script_fr.py`                                                                 | `script/script.fr.json`, with the French words for each anchor the scenes wait for |
| Voice   | `<python> audio/voice_fr.py --engine chatterbox --ref audio/voix-fr.wav`                      | the clips, in `public/fr/audio/voice/`                                             |
| Layout  | `python3 audio/voice.py --lang fr`                                                            | the narration, `src/fr/timeline.json` and the French subtitles                     |
| Screens | `CAPTURE_LANG=fr` with the capture script                                                     | `public/fr/screens/*.png` and `src/fr/screens.json`, the app in French             |
| Stills  | `REMOTION_LANG=fr node scripts/stills.mjs <dir> <scene@seconds>…`                             | review stills                                                                      |
| Render  | `REMOTION_LANG=fr npx remotion render src/index.ts TutorialSubtitled out/fr/tutorial-raw.mp4` | the video, with its subtitles                                                      |
| Finish  | `python3 scripts/finish.py --lang fr`                                                         | `out/fr/cardauction-tutoriel-fr.mp4`, sound evened out to -16 LUFS                 |

`<python>` has `chatterbox-tts` installed. The French voice is Chatterbox Multilingual (MIT
licence), speaking in the voice of `audio/voix-fr.wav`, a short sample of the Piper voice
`fr_FR-tom-medium`. A line of the script names English words the animation waits for (`anchors`),
so the scenes stay the same in both languages.
