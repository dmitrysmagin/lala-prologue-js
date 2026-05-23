import { AssetLoader } from './AssetManager';

export interface TextData {
  lines: string[];
  data: string;
  metadata: Map<string, string>;
}

export class TXTLoader implements AssetLoader<TextData> {
  getName(): string {
    return 'TXT';
  }

  load(data: Uint8Array): TextData {
    const text = new TextDecoder('utf-8').decode(data);
    const lines = text.split('\n').map(line => line.trim());
    
    const metadata = new Map<string, string>();
    const contentLines: string[] = [];

    for (const line of lines) {
      if (line.includes(':')) {
        const [key, ...valueParts] = line.split(':');
        const value = valueParts.join(':').trim();
        metadata.set(key.trim(), value);
      } else if (line.length > 0) {
        contentLines.push(line);
      }
    }

    return {
      lines: contentLines,
      data: text,
      metadata
    };
  }
}