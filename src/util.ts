import path from 'path'

const DIR = import.meta.dir

export function u8a (hex: string): Uint8Array {
  return Buffer.from(
    hex.indexOf('x') === 1
      ? hex.slice(2)
      : hex, 'hex'
  )
}

export function hex (bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex')
}

export function str (bytes: Uint8Array): string {
  return Buffer.from(bytes).toString()
}

export function dataPath (file: string): string {
  return path.resolve(DIR, '../data', file)
}
