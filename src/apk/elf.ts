/**
 * Minimal ELF reader: just enough of the header and program headers to check PT_LOAD alignment.
 * Layout from the System V ABI / ELF specification (elf.h).
 */

export const PAGE_16K = 16 * 1024;
const PT_LOAD = 1;

export interface ElfInfo {
  is64Bit: boolean;
  /** p_align of every PT_LOAD segment. */
  loadAligns: number[];
}

/** Bytes needed to read the program headers, or undefined if `header` (at least 64 bytes) is not ELF. */
export function programHeadersEnd(header: Buffer): number | undefined {
  const info = readIdent(header);
  if (!info) return undefined;
  const { is64Bit, le } = info;
  const phoff = is64Bit ? Number(readU64(header, 0x20, le)) : readU32(header, 0x1c, le);
  const phentsize = readU16(header, is64Bit ? 0x36 : 0x2a, le);
  const phnum = readU16(header, is64Bit ? 0x38 : 0x2c, le);
  return phoff + phentsize * phnum;
}

/** Parse an ELF file prefix that contains the header and all program headers. Throws if it is not valid ELF. */
export function parseElf(buf: Buffer): ElfInfo {
  const info = readIdent(buf);
  if (!info) throw new Error('not an ELF file');
  const { is64Bit, le } = info;

  const phoff = is64Bit ? Number(readU64(buf, 0x20, le)) : readU32(buf, 0x1c, le);
  const phentsize = readU16(buf, is64Bit ? 0x36 : 0x2a, le);
  const phnum = readU16(buf, is64Bit ? 0x38 : 0x2c, le);
  if (phoff + phentsize * phnum > buf.length) throw new Error('truncated program headers');

  const loadAligns: number[] = [];
  for (let i = 0; i < phnum; i++) {
    const at = phoff + i * phentsize;
    if (readU32(buf, at, le) !== PT_LOAD) continue;
    // Elf64_Phdr: p_type, p_flags, p_offset, p_vaddr, p_paddr, p_filesz, p_memsz, p_align (8 bytes each after the first two)
    // Elf32_Phdr: p_type, p_offset, p_vaddr, p_paddr, p_filesz, p_memsz, p_flags, p_align (4 bytes each)
    loadAligns.push(is64Bit ? Number(readU64(buf, at + 0x30, le)) : readU32(buf, at + 0x1c, le));
  }
  return { is64Bit, loadAligns };
}

function readIdent(buf: Buffer): { is64Bit: boolean; le: boolean } | undefined {
  if (buf.length < 0x34 || buf.readUInt32BE(0) !== 0x7f454c46) return undefined; // "\x7fELF"
  const cls = buf[4];
  const data = buf[5];
  if ((cls !== 1 && cls !== 2) || (data !== 1 && data !== 2)) return undefined;
  if (cls === 2 && buf.length < 0x40) return undefined;
  return { is64Bit: cls === 2, le: data === 1 };
}

function readU16(buf: Buffer, at: number, le: boolean): number {
  return le ? buf.readUInt16LE(at) : buf.readUInt16BE(at);
}
function readU32(buf: Buffer, at: number, le: boolean): number {
  return le ? buf.readUInt32LE(at) : buf.readUInt32BE(at);
}
function readU64(buf: Buffer, at: number, le: boolean): bigint {
  return le ? buf.readBigUInt64LE(at) : buf.readBigUInt64BE(at);
}
