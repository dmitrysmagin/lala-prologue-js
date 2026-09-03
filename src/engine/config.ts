/**
 * Global runtime config — shared across engine modules.
 * gameSpeed: physics tick rate anchored to wall-clock time, NOT to RAF frames:
 *            ticks/sec = 60 * gameSpeed (0.8 → 48 tps), identical on 60Hz/120Hz/etc.
 *            Rendering still runs every RAF; multiple ticks per frame catch up lag.
 *            Music/SFX are browser-native, unaffected.
 * scrollEnabled: toggle between flip-screen (false) and smooth-scroll (true) engines.
 */
export const config = {
  gameSpeed: 0.8,
  scrollEnabled: true,
};
