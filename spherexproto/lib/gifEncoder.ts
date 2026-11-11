/**
 * Lightweight, zero-dependency in-browser GIF89a encoder.
 * Encodes an array of HTMLCanvasElement or ImageData frames into an animated GIF Blob.
 */

// Simple LZW compressor for GIF89a
function lzwEncode(minCodeSize: number, pixelIndices: Uint8Array): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;

  let codeSize = minCodeSize + 1;
  let nextCode = eoiCode + 1;
  const maxTableSize = 4096;

  // Dictionary mapping string prefix + char to code
  const dictionary = new Map<string, number>();
  for (let i = 0; i < clearCode; i++) {
    dictionary.set(String.fromCharCode(i), i);
  }

  const outputBits: number[] = [];
  let bitCount = 0;
  let currentBitBuffer = 0;

  function writeBits(code: number, bits: number) {
    currentBitBuffer |= (code << bitCount);
    bitCount += bits;
    while (bitCount >= 8) {
      outputBits.push(currentBitBuffer & 0xFF);
      currentBitBuffer >>= 8;
      bitCount -= 8;
    }
  }

  // Initial Clear code
  writeBits(clearCode, codeSize);

  let prefix = '';
  for (let i = 0; i < pixelIndices.length; i++) {
    const char = String.fromCharCode(pixelIndices[i]);
    const combo = prefix + char;

    if (dictionary.has(combo)) {
      prefix = combo;
    } else {
      writeBits(dictionary.get(prefix)!, codeSize);

      if (nextCode < maxTableSize) {
        dictionary.set(combo, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) {
          codeSize++;
        }
      } else {
        // Table full: output Clear code and reset dictionary
        writeBits(clearCode, codeSize);
        dictionary.clear();
        for (let j = 0; j < clearCode; j++) {
          dictionary.set(String.fromCharCode(j), j);
        }
        codeSize = minCodeSize + 1;
        nextCode = eoiCode + 1;
      }
      prefix = char;
    }
  }

  if (prefix !== '') {
    writeBits(dictionary.get(prefix)!, codeSize);
  }

  // End of information code
  writeBits(eoiCode, codeSize);

  // Flush remaining bits
  if (bitCount > 0) {
    outputBits.push(currentBitBuffer & 0xFF);
  }

  // Package into GIF sub-blocks (maximum 255 bytes per sub-block)
  const result: number[] = [minCodeSize];
  let offset = 0;
  while (offset < outputBits.length) {
    const chunkSize = Math.min(255, outputBits.length - offset);
    result.push(chunkSize);
    for (let k = 0; k < chunkSize; k++) {
      result.push(outputBits[offset + k]);
    }
    offset += chunkSize;
  }
  result.push(0x00); // Block terminator

  return new Uint8Array(result);
}

export interface GifFrameInput {
  imageData: ImageData;
  delayMs: number;
}

/**
 * Creates an animated GIF from a list of frames.
 */
export function createAnimatedGif(frames: GifFrameInput[]): Blob {
  if (frames.length === 0) {
    throw new Error('At least one frame is required');
  }

  const width = frames[0].imageData.width;
  const height = frames[0].imageData.height;

  // Build a uniform 216-color palette (6x6x6 RGB cube) + 40 grayscales = 256 colors
  const palette: [number, number, number][] = [];
  const levels = [0, 51, 102, 153, 204, 255];
  for (const r of levels) {
    for (const g of levels) {
      for (const b of levels) {
        palette.push([r, g, b]);
      }
    }
  }
  // Fill remaining slots up to 256 with grayscale shades
  for (let g = 0; palette.length < 256; g += 6) {
    palette.push([g, g, g]);
  }

  // Fast color quantization lookup
  function findNearestPaletteIndex(r: number, g: number, b: number): number {
    let nearestIdx = 0;
    let minDistance = Infinity;
    for (let i = 0; i < 256; i++) {
      const pr = palette[i][0];
      const pg = palette[i][1];
      const pb = palette[i][2];
      const dist = (r - pr) * (r - pr) + (g - pg) * (g - pg) + (b - pb) * (b - pb);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIdx = i;
        if (dist === 0) break;
      }
    }
    return nearestIdx;
  }

  const bytes: number[] = [];

  // 1. Header: 'GIF89a'
  const header = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
  bytes.push(...header);

  // 2. Logical Screen Descriptor
  bytes.push(width & 0xFF, (width >> 8) & 0xFF);
  bytes.push(height & 0xFF, (height >> 8) & 0xFF);
  // Packed field: Global Color Table Flag (1), 8 bits/pixel (111), Sort Flag (0), GCT Size 256 (111) = 0xF7
  bytes.push(0xF7);
  bytes.push(0x00); // Background color index
  bytes.push(0x00); // Pixel aspect ratio

  // 3. Global Color Table (256 * 3 bytes)
  for (let i = 0; i < 256; i++) {
    bytes.push(palette[i][0], palette[i][1], palette[i][2]);
  }

  // 4. Netscape 2.0 Application Extension (Infinite loop)
  bytes.push(0x21, 0xFF, 0x0B); // Extension introducer, Application extension, 11 bytes
  const netscapeStr = 'NETSCAPE2.0';
  for (let i = 0; i < netscapeStr.length; i++) {
    bytes.push(netscapeStr.charCodeAt(i));
  }
  bytes.push(0x03, 0x01, 0x00, 0x00); // Sub-block length, Loop sub-block, 0 = loop forever
  bytes.push(0x00); // Block terminator

  // 5. Encode each frame
  frames.forEach(frame => {
    const delayHundredths = Math.max(2, Math.round(frame.delayMs / 10));

    // Graphic Control Extension
    bytes.push(0x21, 0xF9, 0x04);
    bytes.push(0x04); // Packed: Disposal method = Do Not Dispose (00000100)
    bytes.push(delayHundredths & 0xFF, (delayHundredths >> 8) & 0xFF); // Delay time
    bytes.push(0x00); // Transparent color index
    bytes.push(0x00); // Block terminator

    // Image Descriptor
    bytes.push(0x2C);
    bytes.push(0x00, 0x00); // Image Left = 0
    bytes.push(0x00, 0x00); // Image Top = 0
    bytes.push(width & 0xFF, (width >> 8) & 0xFF);
    bytes.push(height & 0xFF, (height >> 8) & 0xFF);
    bytes.push(0x00); // No local color table

    // Quantize pixels to palette indices
    const data = frame.imageData.data;
    const pixelIndices = new Uint8Array(width * height);
    for (let p = 0; p < pixelIndices.length; p++) {
      const idx = p * 4;
      pixelIndices[p] = findNearestPaletteIndex(data[idx], data[idx + 1], data[idx + 2]);
    }

    // LZW Compression
    const encoded = lzwEncode(8, pixelIndices);
    for (let b = 0; b < encoded.length; b++) {
      bytes.push(encoded[b]);
    }
  });

  // 6. Trailer: 0x3B (GIF terminator)
  bytes.push(0x3B);

  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

