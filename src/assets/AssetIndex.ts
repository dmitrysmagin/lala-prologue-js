export interface AssetIndex {
  pcx: string[];
  fnt: string[];
  bma: string[];
  map: string[];
  txt: string[];
  wav: string[];
}

export const defaultAssetIndex: AssetIndex = {
  pcx: [
    'GFX/SPRITES.PCX',
    'GFX/BACKGROUND.PCX',
    'GFX/UI.PCX'
  ],
  fnt: [
    'GFX/LALA.FNT'
  ],
  bma: [
    'GFX/BMAP.BMA'
  ],
  map: [
    'MAP/LALA.MAP'
  ],
  txt: [
    'GFX/SPRMAP.TXT',
    'GFX/SPRPROP.TXT',
    'MAP/TILEPROP.TXT',
    'MAP/ENEMS.TXT',
    'MAP/HOTSPOTS.TXT'
  ],
  wav: [
    'SFX/JUMP.WAV',
    'SFX/ATTACK.WAV',
    'SFX/HIT.WAV',
    'SFX/COIN.WAV',
    'SFX/POWERUP.WAV',
    'SFX/DEATH.WAV',
    'SFX/LEVELCOMPLETE.WAV',
    'SFX/DOOR.WAV',
    'SFX/ITEMGET.WAV',
    'SFX/EXPLOSION.WAV'
  ]
};