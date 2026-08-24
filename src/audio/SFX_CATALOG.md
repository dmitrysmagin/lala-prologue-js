# SFX Catalog — LaLa (DirectQB) → Web Audio stub

> **Status 2026-08-24: All SFX are stubbed** — `SoundEffects` logs but does not play.
> Original WAVs remain in `public/SFX/` and `lala-qb/SFX/` for reference.
> `EFFECTS.S3M` is **not** used for audible output (see § FM effects).

Source audit: `lala-qb/LALA.BAS:47-56` (DQBloadSound), `lala-qb/ENGINE.BAS` (all `DQBplaySound`/`DQBstopVoice`),
`lala-qb/FMENGINE.BAS:15,267` (EFFECTS.S3M FM instruments).

## Quick map: slot → file → occasion

| Slot | File | Event | QB trigger | Voice | Freq | Loop | Duration | Replacement character |
|------|------|-------|------------|-------|------|------|----------|-----------------------|
| 1 | `SFX/BOLT.WAV` | Keyhole unlock / bolt | `ENGINE.BAS:678` `DQBplaySound 1,2,11025,ONCE` when `engineDetectKeyHole` removes `behaviour==10` tile (player has keys, pressing toward lock) | 2 | 11025 | ONCE | 0.42 s, 8.7 KB | Metallic mechanical click / bolt throw. Search: `cc0 metal bolt lock` `ui lock`. |
| 2 | `SFX/HIT.WAV` | Enemy collision hit | `ENGINE.BAS:539` `DQBplaySound 2,4,11025,ONCE` in `engineMoveEnems` AABB ±14 px, non-platform type | 4 | 11025 | ONCE | 0.35 s, 7.9 KB | Short thud / punch . Paired with AH (voice 3). Search: `cc0 hit thud 8-bit`. |
| 3 | `SFX/JUMP.WAV` | Player jump | `ENGINE.BAS:602` `DQBplaySound 3,1,11025+RND*1024,ONCE` when `Ctrl`/`↑` while grounded initiates `player.jumping` | 1 | 11025±1024 (pitch jitter) | ONCE | 0.27 s, 7.1 KB | Bright pop / blip with random pitch. Need 2-3 variants for variety. Search: `cc0 jump retro 8bit`. |
| 4 | `SFX/KEY.WAV` | Key pickup | `ENGINE.BAS:175` `DQBplaySound 4,4,11025,ONCE` hotspot `t==2` within ±15 px | 4 | 11025 | ONCE | 0.42 s, 4.6 KB | Chime / coin pickup high. Search: `cc0 pickup key chime`. |
| 5 | `SFX/LIFE.WAV` | Extra-life pickup | `ENGINE.BAS:178` `DQBplaySound 5,4,11025,ONCE` hotspot `t==3`, adds `prefs.refill` | 4 | 11025 | ONCE | 0.80 s, 9.0 KB | Upbeat jingle / 1-up. Slightly longer. Search: `cc0 extra life jingle`. |
| 6 | `SFX/OBJECT.WAV` | Object / potion pickup | `ENGINE.BAS:172` `DQBplaySound 6,4,11025,ONCE` hotspot `t==1`, `player.objects++` toward `maxObjs=15` | 4 | 11025 | ONCE | 0.80 s, 8.7 KB | Shimmer / collect. Most frequent reward sound. Search: `cc0 item collect potion`. |
| 7 | `SFX/PINCHE.WAV` | Spike / evil tile damage | `ENGINE.BAS:685` `DQBplaySound 7,4,11025,ONCE` when on `behaviour==1` tile (any corner) | 4 | 11025 | ONCE | 0.27 s, 7.1 KB | Sharp sting / spike. Paired with AH. Search: `cc0 spike hurt`. |
| 8 | `SFX/AH.WAV` | Pain vocal | `ENGINE.BAS:540`/`687` `DQBplaySound 8,3,11025,ONCE` ( + `+RND*1024` on evil tile). Triggered on enemy hit or evil tile while `STATENORMAL`; enters `STATEFLICKER` 128 frames, `lives--` | 3 | 11025 / 11025+RND*1024 | ONCE | 0.34 s, 3.7 KB | Vocal “ah” / hurt grunt. Consider replacing with non-vocal to avoid licensing. Search: `cc0 hurt vocal` or `ouch 8-bit`. |
| 9 | `SFX/AMBIENT1.WAV` | Ambient bed L1 | `ENGINE.BAS:115` `DQBplaySound 9,5,11025,LOOPED` (bgL1) started when `flag==1`, `236 DQBstopVoice 5` on exit | 5 | 11025 | LOOPED | 4.67 s, 51 KB | Low drone / cave wind. Must be seamless loop. Search: `cc0 ambient cave loop seamless`. |
| 10 | `SFX/AMBIENT2.WAV` | Ambient bed L2 | `ENGINE.BAS:116` `16` `DQBplaySound 10,6,11025,LOOPED` (bgL2), `237 DQBstopVoice 6` | 6 | 11025 | LOOPED | 5.81 s, 63 KB | Textural layer over L1 (e.g. drips). Seamless loop. Search: `cc0 ambient texture loop`. |

### Voices & polyphony
DirectQB SB driver was initialized `DQBinstallSB(0,6,11025,AUTO,AUTO,AUTO)` — 6 voices (1..6). Mapping is fixed per event above; voice 1 dedicated to jump, 2 to bolt, 3 to AH, 4 shared for HIT/KEY/LIFE/OBJECT/PINCHE (short, unlikely to overlap), 5/6 for ambient loops. Port should preserve voice arg for `stopVoice` semantics but Web Audio can ignore it and just track per-sound source.

### File format (original)
All WAVs are `PCM U8, 11025 Hz, mono, 8-bit` (see `ffprobe` above). `DQBplaySound` pitch-shifts via `freq` param: `playbackRate = freq / 11025`. Only JUMP and evil-tile AH use `+RND*1024` jitter — port should expose `freq` param.

## FM effects — EFFECTS.S3M

- Path: `MUSIC/EFFECTS.S3M` (`lala-qb/MUSIC/EFFECTS.S3M`, kept in `public/MUSIC/`)
- Header: `Type S3M 3.20`, title empty, `ordNum=0`, `insNum=4`, `patNum=0`, 4 FM instruments named per S3M instrument header `GM..`? Inspect with `xxd` — not needed.
- Runtime usage: `FMENGINE.BAS:15 const efffile = "MUSIC\\EFFECTS.S3M"`, loaded in `FMinit` (`FMload efffile` line 110) into slots 71..74 (`adldata(70+x)`). `FMplayeffect(ind)` (line 267) can trigger one of 4 effect patterns via `FMplayrowfrom` on channels with `effres`, but **no call site exists** in `LALA.BAS` or `ENGINE.BAS` — the sub is dead code in this game.
- Disk render: `adplay -O disk -d EFFECTS.wav --16bit -f 44100 --once EFFECTS.S3M` produces 2.1 KB (header + silence) because no patterns exist to play. We keep the file but do **not** convert to `.wav/.ogg` for playback.
- Decision: keep `EFFECTS.S3M` as archive only; game SFX will be sourced as individual WAVs via `SoundEffects`. If FM instruments are ever needed, export them as one-shots from an S3M tracker, not via EFFECTS.S3M playback.

## Stub behaviour (current)

- `src/audio/sound-effects.ts:SoundEffects` is muted (`stubAudible=false`).
  - `init()` does **not** create `AudioContext`.
  - `load(slot,url)` logs `[sfx] stub load` instead of fetching.
  - `play(slot,loop,freq)` logs `[sfx] stub play: <event> [slot N]` at `console.debug` level.
  - `playByName(name)` semantic helper, `loadAll()` bulk loader, `setAudible(true)` to re-enable original WAVs for A/B comparison.
- `src/engine/game-loop.ts` currently has **no** sound calls in Phase 7 (player/enemy physics not yet ported). Hotspot collection increments `objects/keys/lives` without sound — hook points marked for future:
  ```ts
  // TODO sfx: sfx.playByName('OBJECT') etc. after hs.s = false
  ```
- `src/main.ts` does not instantiate `SoundEffects` yet — will be added at Phase 12 integration.

## How to replace — checklist for later

1. **License**: prefer CC0 / CC-BY 4.0 (attribution) from freesound.org, opengameart.org, pixabay.com. Record source URL + license in this file per row when replaced.
2. **Technical**: normalize to `WAV 44.1 kHz 16-bit mono` or `OGG Vorbis q6`; store under `public/SFX/` replacing existing names or adding `SFX_ALT/` and update `SFX_SLOT` mapping. Keep `11025` pitch reference in code for Web Audio `playbackRate`.
3. **Seamless loops**: AMBIENT1/2 must be edited to zero-cross, loop point inaudible. Test with `loop=true` in `music-player.ts`-style `AudioBufferSourceNode`.
4. **JUMP variants**: provide 2-3 pitch variants or keep jitter via `freq = 11025 + Math.random()*1024`.
5. **Vocal replacement**: AH.WAV is a human voice — consider synth “hurt” to avoid personality rights.
6. **Testing**: enable `sfx.setAudible(true); await sfx.loadAll()` in `main.ts` and exercise each trigger (jump, enemy touch, hotspot, bolt, spike). Verify polyphony (voice 4 sharing) no cut-off artifacts — Web Audio creates new source per play, so no need to emulate `DQBstopVoice` beyond ambient loops.
7. **Fallback**: if a replacement file 404s, `SoundEffects.load` already warns and `play` becomes no-op — game continues muted.

## References

- `lala-qb/LALA.BAS:47-56` sound loading table
- `lala-qb/ENGINE.BAS:115-116` ambient, `172-178` hotspots, `539-541` enemy, `602` jump, `678` bolt, `685-688` evil tile
- `lala-qb/FMENGINE.BAS:15,110,267` EFFECTS.S3M handling
- File durations via `ffprobe -v error -show_entries stream=duration,codec_name,sample_rate` on `public/SFX/*.WAV`
- Render info: `adplay -O disk -d DESORUIN.wav --16bit -f 44100 --once` (see git log 2026-08-24)
