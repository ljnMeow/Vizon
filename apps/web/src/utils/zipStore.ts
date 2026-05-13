/**
 * 极简 ZIP Store 模式实现。
 *
 * 范围：
 * - 不支持压缩
 * - 足够覆盖 `scene.json + 贴图文件` 的打包场景
 * - 可直接运行在浏览器端，且不依赖第三方库
 *
 * 存在原因：
 * - 让项目包格式逻辑保持本地可控、便于调试
 * - 避免为了一个窄场景引入完整 zip 库
 */
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 生成 zip 时的单个文件条目。 */
type ZipEntry = {
  path: string;
  data: Uint8Array;
  lastModified?: number;
};

/** 计算 ZIP 本地头与中央目录都需要的 CRC32 校验值。 */
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
 * 生成一个只使用 Store 模式的 ZIP 包。
 *
 * 输出结构：
 * - 本地文件头 + 文件内容
 * - 中央目录项
 * - 中央目录结束记录
 */
export function createStoredZip(entries: ZipEntry[]) {
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const fileName = encoder.encode(entry.path);
    const payload = entry.data;
    const checksum = crc32(payload);
    const { dosDate, dosTime } = toDosDateTime(entry.lastModified ?? Date.now());

    const localHeader = new Uint8Array(30 + fileName.length);
    const localView = new DataView(localHeader.buffer);
    writeU32(localView, 0, 0x04034b50);
    writeU16(localView, 4, 20);
    writeU16(localView, 6, 0);
    writeU16(localView, 8, 0);
    writeU16(localView, 10, dosTime);
    writeU16(localView, 12, dosDate);
    writeU32(localView, 14, checksum);
    writeU32(localView, 18, payload.length);
    writeU32(localView, 22, payload.length);
    writeU16(localView, 26, fileName.length);
    writeU16(localView, 28, 0);
    localHeader.set(fileName, 30);

    const centralHeader = new Uint8Array(46 + fileName.length);
    const centralView = new DataView(centralHeader.buffer);
    writeU32(centralView, 0, 0x02014b50);
    writeU16(centralView, 4, 20);
    writeU16(centralView, 6, 20);
    writeU16(centralView, 8, 0);
    writeU16(centralView, 10, 0);
    writeU16(centralView, 12, dosTime);
    writeU16(centralView, 14, dosDate);
    writeU32(centralView, 16, checksum);
    writeU32(centralView, 20, payload.length);
    writeU32(centralView, 24, payload.length);
    writeU16(centralView, 28, fileName.length);
    writeU16(centralView, 30, 0);
    writeU16(centralView, 32, 0);
    writeU16(centralView, 34, 0);
    writeU16(centralView, 36, 0);
    writeU32(centralView, 38, 0);
    writeU32(centralView, 42, localOffset);
    centralHeader.set(fileName, 46);

    localChunks.push(localHeader, payload);
    centralChunks.push(centralHeader);
    localOffset += localHeader.length + payload.length;
  }

  const centralDirectory = concatChunks(centralChunks);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  writeU32(endView, 0, 0x06054b50);
  writeU16(endView, 4, 0);
  writeU16(endView, 6, 0);
  writeU16(endView, 8, entries.length);
  writeU16(endView, 10, entries.length);
  writeU32(endView, 12, centralDirectory.length);
  writeU32(endView, 16, localOffset);
  writeU16(endView, 20, 0);

  return concatChunks([...localChunks, centralDirectory, endRecord]);
}

/**
 * 解析一个只使用 Store 模式的 ZIP 包。
 *
 * 返回值：
 * - `Map<path, bytes>`，便于项目包导入时按路径直接查文件
 *
 * 边界保护：
 * - 如果遇到非 Store 模式的条目，会直接抛错，避免静默读错数据
 */
export function parseStoredZip(bytes: Uint8Array) {
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

    if (compressionMethod !== 0) {
      throw new Error('Unsupported zip package: only store mode is supported.');
    }

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error('Unsupported zip package: invalid local header.');
    }

    const localFileNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    files.set(fileName, bytes.slice(dataStart, dataStart + compressedSize));

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return files;
}
