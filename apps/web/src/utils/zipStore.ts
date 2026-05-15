/**
 * ZIP 包读写工具。
 *
 * 支持两种压缩模式：
 * - Store（compressionMethod=0）：不压缩，直接存储
 * - Deflate（compressionMethod=8）：通过 fflate 进行 raw deflate 压缩
 *
 * 使用场景：
 * - 场景文本（scene.json）：启用 deflate，压缩率约 70-80%
 * - 贴图二进制：保持 Store 模式（PNG/JPG/WebP 已是压缩格式，再压无益）
 *
 * 向后兼容：parseZip 同时支持 method=0 和 method=8，可正常读取旧版 Store 模式包。
 */
// deflateSync/inflateSync 是 fflate 的 raw DEFLATE（无 zlib/gzip 头），
// 这正是 ZIP 规范要求的压缩方式（compressionMethod=8）。
import { deflateSync, inflateSync } from 'fflate';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 生成 zip 时的单个文件条目。 */
export type ZipEntry = {
  path: string;
  data: Uint8Array;
  lastModified?: number;
  /** true 时对该条目启用 deflate 压缩（compressionMethod=8），默认 false（Store 模式）。 */
  compress?: boolean;
};

/** 计算 ZIP 本地头与中央目录都需要的 CRC32 校验值。CRC 始终基于未压缩的原始数据。 */
function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ -1) >>> 0;
}

/** 把 JS 时间戳转换成 ZIP 头里使用的 DOS 日期与时间字段。 */
function toDosDateTime(timestamp: number) {
  const date = new Date(timestamp);
  const year = Math.max(1980, date.getFullYear());
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  const dosTime = (hours << 11) | (minutes << 5) | seconds;
  const dosDate = ((year - 1980) << 9) | (month << 5) | day;
  return { dosDate, dosTime };
}

/** 以 little-endian 顺序写入 16 位无符号整数。 */
function writeU16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

/** 以 little-endian 顺序写入 32 位无符号整数。 */
function writeU32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value, true);
}

/** 把多个二进制分片拼接成一个连续的 Uint8Array。 */
function concatChunks(chunks: Uint8Array[]) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * 生成一个支持 Store 与 Deflate 模式的 ZIP 包。
 *
 * 输出结构：
 * - 本地文件头 + 文件内容（压缩或原始）
 * - 中央目录项
 * - 中央目录结束记录
 *
 * 当条目 compress=true 时使用 raw deflate（level 6）压缩，否则直接存储（Store 模式）。
 */
export function createZip(entries: ZipEntry[]) {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileName = encoder.encode(entry.path);
    const uncompressed = entry.data;
    // compress=true 时用 raw deflate 压缩；其余保持 Store 模式
    const payload = entry.compress ? deflateSync(uncompressed, { level: 6 }) : uncompressed;
    const compressionMethod = entry.compress ? 8 : 0;
    // CRC-32 始终基于未压缩原始数据（ZIP 规范要求）
    const checksum = crc32(uncompressed);
    const { dosDate, dosTime } = toDosDateTime(entry.lastModified ?? Date.now());

    // 本地文件头（30 字节固定 + 文件名）
    const localHeader = new Uint8Array(30 + fileName.length);
    const localView = new DataView(localHeader.buffer);
    writeU32(localView, 0, 0x04034b50);          // 本地文件头签名
    writeU16(localView, 4, 20);                   // 需要的版本
    writeU16(localView, 6, 0);                    // 通用标志位
    writeU16(localView, 8, compressionMethod);    // 压缩方式：0=Store, 8=Deflate
    writeU16(localView, 10, dosTime);
    writeU16(localView, 12, dosDate);
    writeU32(localView, 14, checksum);
    writeU32(localView, 18, payload.length);      // 压缩后字节数
    writeU32(localView, 22, uncompressed.length); // 未压缩字节数
    writeU16(localView, 26, fileName.length);
    writeU16(localView, 28, 0);                   // 扩展字段长度
    localHeader.set(fileName, 30);

    // 中央目录项（46 字节固定 + 文件名）
    const centralHeader = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(centralHeader.buffer);
    writeU32(centralView, 0, 0x02014b50);         // 中央目录签名
    writeU16(centralView, 4, 20);                 // 制作版本
    writeU16(centralView, 6, 20);                 // 需要的版本
    writeU16(centralView, 8, 0);                  // 通用标志位
    writeU16(centralView, 10, compressionMethod); // 压缩方式，与本地头一致
    writeU16(centralView, 12, dosTime);
    writeU16(centralView, 14, dosDate);
    writeU32(centralView, 16, checksum);
    writeU32(centralView, 20, payload.length);    // 压缩后字节数
    writeU32(centralView, 24, uncompressed.length); // 未压缩字节数
    writeU16(centralView, 28, fileName.length);
    writeU16(centralView, 30, 0);                 // 扩展字段长度
    writeU16(centralView, 32, 0);                 // 注释长度
    writeU16(centralView, 34, 0);                 // 起始磁盘号
    writeU16(centralView, 36, 0);                 // 内部文件属性
    writeU32(centralView, 38, 0);                 // 外部文件属性
    writeU32(centralView, 42, localOffset);       // 本地头偏移量
    centralHeader.set(fileName, 46);

    localChunks.push(localHeader, payload);
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + payload.length;
  }

  const centralDirectory = concatChunks(centralChunks);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeU32(endView, 0, 0x06054b50);               // 中央目录结束签名
  writeU16(endView, 4, 0);                         // 当前磁盘号
  writeU16(endView, 6, 0);                         // 中央目录起始磁盘号
  writeU16(endView, 8, entries.length);            // 本磁盘条目数
  writeU16(endView, 10, entries.length);           // 总条目数
  writeU32(endView, 12, centralDirectory.length);  // 中央目录大小
  writeU32(endView, 16, localOffset);              // 中央目录偏移
  writeU16(endView, 20, 0);                        // 注释长度

  return concatChunks([...localChunks, centralDirectory, endRecord]);
}

/**
 * 解析 ZIP 包，支持 Store（method=0）和 Deflate（method=8）两种模式。
 *
 * 返回值：
 * - `Map<path, bytes>`，解压后的原始字节，便于按路径直接查找文件
 *
 * 边界保护：
 * - 遇到既非 Store 也非 Deflate 的条目时抛错，避免静默读错数据
 */
export function parseZip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocdOffset = -1;

  for (let offset = bytes.length - 22; offset >= 0; offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) {
    throw new Error('Unsupported zip package: missing end record.');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralDirOffset = view.getUint32(eocdOffset + 16, true);
  const files = new Map<string, Uint8Array>();
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('Unsupported zip package: invalid central directory.');
    }

    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const fileNameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const fileNameBytes = bytes.slice(cursor + 46, cursor + 46 + fileNameLength);
    const fileName = decoder.decode(fileNameBytes);

    // 仅支持 Store（0）和 Deflate（8），其他方式拒绝解析
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error('Unsupported zip package: unsupported compression method.');
    }

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error('Unsupported zip package: invalid local header.');
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const rawData = bytes.slice(dataStart, dataStart + compressedSize);
    // method=8 时用 raw inflate 解压，method=0 直接返回原始字节
    files.set(fileName, compressionMethod === 8 ? inflateSync(rawData) : rawData);

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return files;
}

/**
 * @deprecated 请使用 parseZip，此函数保留以兼容历史调用方。
 * parseZip 完全兼容旧版 Store 模式包，行为一致。
 */
export const parseStoredZip = parseZip;

/**
 * @deprecated 请使用 createZip，此函数保留以兼容历史调用方。
 * createZip 在未设置 compress=true 时与此函数行为完全一致。
 */
export const createStoredZip = (entries: Omit<ZipEntry, 'compress'>[]) => createZip(entries);
