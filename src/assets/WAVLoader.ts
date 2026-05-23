import { AssetLoader } from './AssetManager';

export interface WAVHeader {
  chunkId: string;
  chunkSize: number;
  format: string;
  subchunk1Id: string;
  subchunk1Size: number;
  audioFormat: number;
  numChannels: number;
  sampleRate: number;
  byteRate: number;
  blockAlign: number;
  bitsPerSample: number;
  subchunk2Id: string;
  subchunk2Size: number;
}

export interface WAVData {
  header: WAVHeader;
  samples: Int16Array;
  duration: number;
  size: number;
}

export class WAVLoader implements AssetLoader<WAVData> {
  getName(): string {
    return 'WAV';
  }

  load(data: Uint8Array): WAVData {
    const header: WAVHeader = {
      chunkId: String.fromCharCode(data[0], data[1], data[2], data[3]),
      chunkSize: data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24),
      format: String.fromCharCode(data[8], data[9], data[10], data[11]),
      subchunk1Id: String.fromCharCode(data[12], data[13], data[14], data[15]),
      subchunk1Size: data[16] | (data[17] << 8) | (data[18] << 16) | (data[19] << 24),
      audioFormat: data[20] | (data[21] << 8),
      numChannels: data[22] | (data[23] << 8),
      sampleRate: data[24] | (data[25] << 8) | (data[26] << 16) | (data[27] << 24),
      byteRate: data[28] | (data[29] << 8) | (data[30] << 16) | (data[31] << 24),
      blockAlign: data[32] | (data[33] << 8),
      bitsPerSample: data[34] | (data[35] << 8),
      subchunk2Id: String.fromCharCode(data[36], data[37], data[38], data[39]),
      subchunk2Size: data[40] | (data[41] << 8) | (data[42] << 16) | (data[43] << 24)
    };

    if (header.chunkId !== 'RIFF') {
      throw new Error('Invalid WAV file: missing RIFF header');
    }
    if (header.format !== 'WAVE') {
      throw new Error('Invalid WAV file: missing WAVE format');
    }
    if (header.subchunk1Id !== 'fmt ') {
      throw new Error('Invalid WAV file: missing fmt chunk');
    }
    if (header.subchunk2Id !== 'data') {
      throw new Error('Invalid WAV file: missing data chunk');
    }

    const sampleCount = header.subchunk2Size / (header.bitsPerSample / 8);
    const samples = new Int16Array(sampleCount);

    for (let i = 0; i < sampleCount; i++) {
      const offset = 44 + i * 2;
      samples[i] = data[offset] | (data[offset + 1] << 8);
    }

    const duration = sampleCount / header.sampleRate;

    return {
      header,
      samples,
      duration,
      size: header.subchunk2Size
    };
  }
}