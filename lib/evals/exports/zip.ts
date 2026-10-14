import { createHash } from "node:crypto";
import { crc32, deflateRaw } from "node:zlib";
import { promisify } from "node:util";

const deflate = promisify(deflateRaw);

/** Bounds for one archive; exceeding any of them stops the build with `ZipLimitError`. */
export type ZipLimits = { maxUncompressedBytes: number; maxZipBytes: number; maxEntries: number };

export class ZipLimitError extends Error {
  constructor(readonly limit: keyof ZipLimits) {
    super("export_too_large");
    this.name = "ZipLimitError";
  }
}

type Entry = { name: Buffer; crc: number; compressed: number; size: number; offset: number; method: number };
export type ZipFile = { path: string; bytes: number; sha256: string };

/**
 * A small ZIP writer (PKWARE APPNOTE 6.3, no ZIP64) for exports: each file is
 * deflated on the libuv thread pool as it is added and only the compressed
 * bytes are kept, so memory stays near the archive's size rather than the
 * sum of its inputs. Names are UTF-8 (flag bit 11), timestamps the export's.
 */
export class ZipWriter {
  private chunks: Buffer[] = [];
  private entries: Entry[] = [];
  private offset = 0;
  private uncompressed = 0;
  readonly files: ZipFile[] = [];
  private readonly dosTime: number;
  private readonly dosDate: number;

  constructor(private readonly limits: ZipLimits, at = new Date()) {
    this.dosTime = (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2);
    this.dosDate = ((Math.max(1980, at.getUTCFullYear()) - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate();
  }

  get uncompressedBytes() {
    return this.uncompressed;
  }

  get size() {
    return this.offset;
  }

  async add(path: string, content: string | Buffer) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/.test(path) || path.split("/").some((part) => part === "" || part === "." || part === "..")) {
      throw new Error("zip_path_invalid");
    }
    if (this.entries.length + 1 > this.limits.maxEntries) throw new ZipLimitError("maxEntries");
    const bytes = typeof content === "string" ? Buffer.from(content, "utf8") : content;
    this.uncompressed += bytes.length;
    if (this.uncompressed > this.limits.maxUncompressedBytes) throw new ZipLimitError("maxUncompressedBytes");
    const deflated = bytes.length ? await deflate(bytes, { level: 6 }) : Buffer.alloc(0);
    // Stored when deflate does not help (already-compressed bytes).
    const method = deflated.length < bytes.length ? 8 : 0;
    const data = method === 8 ? deflated : bytes;
    const name = Buffer.from(path, "utf8");
    const crc = crc32(bytes) >>> 0;
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0x0800, 6);
    header.writeUInt16LE(method, 8);
    header.writeUInt16LE(this.dosTime, 10);
    header.writeUInt16LE(this.dosDate, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(bytes.length, 22);
    header.writeUInt16LE(name.length, 26);
    header.writeUInt16LE(0, 28);
    const added = header.length + name.length + data.length;
    // The central directory is about 100 bytes per entry; keep room for it.
    if (this.offset + added + (this.entries.length + 1) * 300 + 22 > this.limits.maxZipBytes) throw new ZipLimitError("maxZipBytes");
    this.chunks.push(header, name, data);
    this.entries.push({ name, crc, compressed: data.length, size: bytes.length, offset: this.offset, method });
    this.offset += added;
    this.files.push({ path, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
  }

  /** The archive's bytes; the writer is spent afterwards. */
  finish(): Buffer {
    const central: Buffer[] = [];
    let size = 0;
    for (const entry of this.entries) {
      const record = Buffer.alloc(46);
      record.writeUInt32LE(0x02014b50, 0);
      record.writeUInt16LE(20, 4);
      record.writeUInt16LE(20, 6);
      record.writeUInt16LE(0x0800, 8);
      record.writeUInt16LE(entry.method, 10);
      record.writeUInt16LE(this.dosTime, 12);
      record.writeUInt16LE(this.dosDate, 14);
      record.writeUInt32LE(entry.crc, 16);
      record.writeUInt32LE(entry.compressed, 20);
      record.writeUInt32LE(entry.size, 24);
      record.writeUInt16LE(entry.name.length, 28);
      record.writeUInt16LE(0, 30);
      record.writeUInt16LE(0, 32);
      record.writeUInt16LE(0, 34);
      record.writeUInt16LE(0, 36);
      record.writeUInt32LE(0, 38);
      record.writeUInt32LE(entry.offset, 42);
      central.push(record, entry.name);
      size += record.length + entry.name.length;
    }
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.entries.length, 8);
    end.writeUInt16LE(this.entries.length, 10);
    end.writeUInt32LE(size, 12);
    end.writeUInt32LE(this.offset, 16);
    end.writeUInt16LE(0, 20);
    if (this.entries.length > 0xffff || this.offset + size + end.length > Math.min(this.limits.maxZipBytes, 0xffffffff)) {
      throw new ZipLimitError("maxZipBytes");
    }
    const archive = Buffer.concat([...this.chunks, ...central, end]);
    this.chunks = [];
    return archive;
  }
}
