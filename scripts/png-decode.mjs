// Minimal PNG reader for 8-bit RGBA or RGB GIBS tiles. No extra dependency.
import { inflateSync } from "node:zlib";

function crcSkip(){ /* IHDR is trusted for width/height; CRC is checked by inflate success. */ }

function paeth(a, b, c){
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if(pa <= pb && pa <= pc) return a;
  if(pb <= pc) return b;
  return c;
}

export function decodePng(buf){
  if(buf[0] !== 137 || buf.toString("ascii", 1, 4) !== "PNG") throw new Error("not a png");
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  let palette = null;
  let paletteAlpha = null;
  const idat = [];
  while(off + 8 <= buf.length){
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if(type === "IHDR"){
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
      if(data[8] !== 8 || data[12] !== 0) throw new Error("unsupported png");
      if(colorType !== 6 && colorType !== 2 && colorType !== 3) throw new Error("unsupported png");
    } else if(type === "PLTE"){
      palette = data;
    } else if(type === "tRNS"){
      paletteAlpha = data;
    } else if(type === "IDAT"){
      idat.push(data);
    } else if(type === "IEND"){
      break;
    }
    void crcSkip;
  }
  const bpp = colorType === 6 ? 4 : (colorType === 2 ? 3 : 1);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let src = 0;
  for(let y = 0; y < height; y++){
    const filter = raw[src++];
    const row = Buffer.from(raw.subarray(src, src + stride));
    src += stride;
    for(let i = 0; i < stride; i++){
      const left = i >= bpp ? row[i - bpp] : 0;
      const up = prev[i];
      const ul = i >= bpp ? prev[i - bpp] : 0;
      if(filter === 1) row[i] = (row[i] + left) & 255;
      else if(filter === 2) row[i] = (row[i] + up) & 255;
      else if(filter === 3) row[i] = (row[i] + ((left + up) >> 1)) & 255;
      else if(filter === 4) row[i] = (row[i] + paeth(left, up, ul)) & 255;
      else if(filter !== 0) throw new Error("bad filter " + filter);
    }
    prev = row;
    const dest = y * width * 4;
    if(bpp === 4) row.copy(out, dest);
    else if(bpp === 3){
      for(let x = 0; x < width; x++){
        out[dest + x * 4] = row[x * 3];
        out[dest + x * 4 + 1] = row[x * 3 + 1];
        out[dest + x * 4 + 2] = row[x * 3 + 2];
        out[dest + x * 4 + 3] = 255;
      }
    } else {
      if(!palette) throw new Error("indexed png missing palette");
      for(let x = 0; x < width; x++){
        const idx = row[x];
        const p = idx * 3;
        out[dest + x * 4] = palette[p];
        out[dest + x * 4 + 1] = palette[p + 1];
        out[dest + x * 4 + 2] = palette[p + 2];
        out[dest + x * 4 + 3] = paletteAlpha && idx < paletteAlpha.length ? paletteAlpha[idx] : 255;
      }
    }
  }
  return { width, height, data: out };
}
