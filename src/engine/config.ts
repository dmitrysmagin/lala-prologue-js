/**
 * Global runtime config — shared across engine modules.
 * gameSpeed: multiplier for physics/logic tick rate (1.0 = default).
 *            Rendering always runs at display refresh rate.
 *            Music/SFX are browser-native, unaffected.
 * scrollEnabled: toggle between flip-screen (false) and smooth-scroll (true) engines.
 */
export const config = {
  gameSpeed: 0.4,
  scrollEnabled: true,
};
