import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateRawSync } from 'node:zlib';

export async function tempDir(prefix: string): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(path.join(tmpdir(), `rn-doctor-${prefix}-`));
  return { dir, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** Write files relative to `dir`, creating folders; objects are written as JSON. */
export async function writeTree(dir: string, files: Record<string, string | object | Buffer>): Promise<void> {
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, typeof content === 'string' || Buffer.isBuffer(content) ? content : JSON.stringify(content));
  }
}

/** A minimal little-endian ELF shared object prefix with the given PT_LOAD alignments. */
export function makeElf(options: { is64Bit: boolean; loadAligns: number[] }): Buffer {
  const { is64Bit, loadAligns } = options;
  const ehsize = is64Bit ? 64 : 52;
  const phentsize = is64Bit ? 56 : 32;
  const phdrs = [{ type: 6, align: 8 }, ...loadAligns.map((align) => ({ type: 1, align }))]; // PT_PHDR + PT_LOADs
  const buf = Buffer.alloc(ehsize + phentsize * phdrs.length + 32);
  buf.writeUInt32BE(0x7f454c46, 0);
  buf[4] = is64Bit ? 2 : 1;
  buf[5] = 1; // little endian
  buf[6] = 1;
  buf.writeUInt16LE(3, 16); // ET_DYN
  if (is64Bit) {
    buf.writeBigUInt64LE(BigInt(ehsize), 0x20);
    buf.writeUInt16LE(ehsize, 0x34);
    buf.writeUInt16LE(phentsize, 0x36);
    buf.writeUInt16LE(phdrs.length, 0x38);
  } else {
    buf.writeUInt32LE(ehsize, 0x1c);
    buf.writeUInt16LE(ehsize, 0x28);
    buf.writeUInt16LE(phentsize, 0x2a);
    buf.writeUInt16LE(phdrs.length, 0x2c);
  }
  phdrs.forEach((ph, i) => {
    const at = ehsize + i * phentsize;
    buf.writeUInt32LE(ph.type, at);
    if (is64Bit) buf.writeBigUInt64LE(BigInt(ph.align), at + 0x30);
    else buf.writeUInt32LE(ph.align, at + 0x1c);
  });
  return buf;
}

export interface ZipInput {
  name: string;
  data: Buffer;
  /** Store uncompressed (method 0) instead of deflating. */
  stored?: boolean;
  /** For stored entries: pad the local header so the data starts at a multiple of this. */
  alignTo?: number;
  /** Extra bytes added after aligning to `alignTo`, to place the data deliberately off the boundary. */
  misalignBy?: number;
}

/** Build a zip file in memory (enough of the format for yauzl). */
export function makeZip(inputs: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const input of inputs) {
    const name = Buffer.from(input.name);
    const body = input.stored ? input.data : deflateRawSync(input.data);
    const crc = crc32(input.data);
    let extra = Buffer.alloc(0);
    if (input.stored && input.alignTo) {
      const dataStart = offset + 30 + name.length;
      const pad = ((input.alignTo - (dataStart % input.alignTo)) % input.alignTo) + (input.misalignBy ?? 0);
      // An extra field needs a 4-byte header, so pad to the next aligned offset that leaves room for one.
      const size = pad === 0 ? 0 : pad < 4 ? pad + input.alignTo : pad;
      extra = Buffer.alloc(size);
      if (size > 0) {
        extra.writeUInt16LE(0xd935, 0);
        extra.writeUInt16LE(size - 4, 2);
      }
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(input.stored ? 0 : 8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(input.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(extra.length, 28);
    locals.push(local, name, extra, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(input.stored ? 0 : 8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(input.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += 30 + name.length + extra.length + body.length;
  }

  const centralDir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(inputs.length, 8);
  end.writeUInt16LE(inputs.length, 10);
  end.writeUInt32LE(centralDir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, end]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
