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
