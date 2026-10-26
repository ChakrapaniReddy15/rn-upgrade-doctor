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

export type AxmlAttrValue = string | number | boolean | { ref: number };

export interface AxmlNodeInput {
  name: string;
  /** Attribute name -> value. Names starting with "android:" use the Android namespace and get a resource ID. */
  attrs?: Record<string, AxmlAttrValue>;
  children?: AxmlNodeInput[];
}

/** android.R.attr IDs for the attributes the tests use. */
const ANDROID_ATTR_IDS: Record<string, number> = {
  name: 0x01010003,
  debuggable: 0x0101000f,
  exported: 0x01010010,
  minSdkVersion: 0x0101020c,
  versionCode: 0x0101021b,
  versionName: 0x0101021c,
  targetSdkVersion: 0x01010270,
  usesCleartextTraffic: 0x010104ec,
  networkSecurityConfig: 0x01010527,
};

/**
 * Build a binary XML (AXML) document like aapt2 does: string pool, resource map for android: attributes,
 * namespace chunks and element chunks. `stripNames` empties the android: attribute names (as some shrinkers do),
 * so readers must use the resource IDs.
 */
export function makeAxml(root: AxmlNodeInput, options: { utf8?: boolean; stripNames?: boolean } = {}): Buffer {
  const ANDROID_NS = 'http://schemas.android.com/apk/res/android';
  // Resource-mapped attribute names must come first in the string pool.
  const androidAttrs = new Set<string>();
  const collect = (n: AxmlNodeInput): void => {
    for (const key of Object.keys(n.attrs ?? {})) if (key.startsWith('android:')) androidAttrs.add(key.slice(8));
    n.children?.forEach(collect);
  };
  collect(root);
  const mapped = [...androidAttrs];
  const strings: string[] = mapped.map((a) => (options.stripNames ? '' : a));
  const index = (s: string): number => {
    const found = strings.indexOf(s, mapped.length);
    if (found !== -1) return found;
    strings.push(s);
    return strings.length - 1;
  };
  const attrIndex = (key: string): number => (key.startsWith('android:') ? mapped.indexOf(key.slice(8)) : index(key));
  const nsPrefix = index('android');
  const nsUri = index(ANDROID_NS);

  const u16 = (v: number) => { const b = Buffer.alloc(2); b.writeUInt16LE(v); return b; };
  const u32 = (v: number) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); return b; };
  const chunk = (type: number, headerSize: number, body: Buffer[]) => {
    const content = Buffer.concat(body);
    return Buffer.concat([u16(type), u16(headerSize), u32(8 + content.length), content]);
  };
  const node = (type: number, ext: Buffer[]) => chunk(type, 16, [u32(1), u32(0xffffffff), ...ext]);

  const elements: Buffer[] = [];
  const emit = (n: AxmlNodeInput): void => {
    const attrs = Object.entries(n.attrs ?? {}).map(([key, value]) => {
      const ns = key.startsWith('android:') ? nsUri : 0xffffffff;
      let raw = 0xffffffff;
      let dataType: number;
      let data: number;
      if (typeof value === 'string') {
        dataType = 0x03;
        data = index(value);
        raw = data;
      } else if (typeof value === 'boolean') {
        dataType = 0x12;
        data = value ? 0xffffffff : 0;
      } else if (typeof value === 'number') {
        dataType = 0x10;
        data = value;
      } else {
        dataType = 0x01;
        data = value.ref;
      }
      return Buffer.concat([u32(ns), u32(attrIndex(key)), u32(raw), u16(8), Buffer.from([0, dataType]), u32(data)]);
    });
    const nameIdx = index(n.name);
    elements.push(
      node(0x0102, [u32(0xffffffff), u32(nameIdx), u16(20), u16(20), u16(attrs.length), u16(0), u16(0), u16(0), ...attrs]),
    );
    n.children?.forEach(emit);
    elements.push(node(0x0103, [u32(0xffffffff), u32(nameIdx)]));
  };
  emit(root);

  const encoded = strings.map((s) => {
    if (options.utf8) {
      const bytes = Buffer.from(s, 'utf8');
      return Buffer.concat([Buffer.from([s.length, bytes.length]), bytes, Buffer.from([0])]);
    }
    return Buffer.concat([u16(s.length), Buffer.from(s, 'utf16le'), u16(0)]);
  });
  const offsets: Buffer[] = [];
  let offset = 0;
  for (const e of encoded) {
    offsets.push(u32(offset));
    offset += e.length;
  }
  let stringData = Buffer.concat(encoded);
  if (stringData.length % 4) stringData = Buffer.concat([stringData, Buffer.alloc(4 - (stringData.length % 4))]);
  const pool = chunk(0x0001, 28, [
    u32(strings.length), u32(0), u32(options.utf8 ? 0x100 : 0), u32(28 + strings.length * 4), u32(0),
    ...offsets, stringData,
  ]);
  const resourceMap = chunk(0x0180, 8, mapped.map((a) => u32(ANDROID_ATTR_IDS[a] ?? 0)));
  const nsStart = node(0x0100, [u32(nsPrefix), u32(nsUri)]);
  const nsEnd = node(0x0101, [u32(nsPrefix), u32(nsUri)]);
  return chunk(0x0003, 8, [pool, resourceMap, nsStart, ...elements, nsEnd]);
}
