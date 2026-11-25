// Mengemas folder extension/ menjadi public/downloads/flow-connect-bridge.zip
// (zip "stored+deflate" sederhana, tanpa dependency tambahan).
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { deflateRawSync } from 'node:zlib'

const SRC = 'extension'
const OUT_DIR = 'public/downloads'
const OUT = join(OUT_DIR, 'flow-connect-bridge.zip')
const ROOT = 'flow-connect-bridge/'

const table = new Uint32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (buf) => {
  let c = 0xffffffff
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

const walk = (dir) =>
  readdirSync(dir).sort().flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1 // tanggal tetap → zip deterministik
const locals = [], centrals = []
let offset = 0
for (const file of walk(SRC)) {
  const name = Buffer.from(ROOT + relative(SRC, file).split(sep).join('/'))
  const data = readFileSync(file)
  const comp = deflateRawSync(data, { level: 9 })
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6)
  local.writeUInt16LE(8, 8); local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12)
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22)
  local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28)
  locals.push(local, name, comp)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(8, 10); central.writeUInt16LE(DOS_TIME, 12)
  central.writeUInt16LE(DOS_DATE, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20)
  central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(offset, 42)
  centrals.push(central, name)
  offset += local.length + name.length + comp.length
}
const cd = Buffer.concat(centrals)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(centrals.length / 2, 8); end.writeUInt16LE(centrals.length / 2, 10)
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, Buffer.concat([...locals, cd, end]))
console.log(`✓ ${OUT} (${centrals.length / 2} file)`)
