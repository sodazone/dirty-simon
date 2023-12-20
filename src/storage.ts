import { TypeRegistry, Option } from '@polkadot/types'
import { compactToU8a } from '@polkadot/util'

import { Memory } from './memory'
import { hex, u8a } from './util'

const registry = new TypeRegistry()

export interface Storage {
  loadFromTop: (top: any) => void
  append: (kPtrSiz: bigint, vPtrSiz: bigint) => void
  exists: (ptrSize: bigint) => number
  nextKey: (prefix: string) => Uint8Array
  get: (ptrSize: bigint) => bigint
  set: (keyPtr: bigint, valuePtr: bigint) => void
  clear: (key: Uint8Array) => void
}

class DummyStorage implements Storage {
  data: Record<string, Uint8Array> = {}
  memory: Memory

  constructor (memory: Memory) {
    this.memory = memory
  }

  loadFromTop (top: any): void {
    Object.entries(top).forEach(([key, value]) => {
      this.data[key.slice(2)] = u8a(value as string)
    })
  }

  exists (ptrSize: bigint): number {
    const key = this.memory.read(ptrSize)
    const value = this.data[hex(key)]

    console.log('EXISTS', hex(key), value)

    return value === undefined ? 0 : 1
  }

  append (keyPtr: bigint, valuePtr: bigint): void {
    const key = hex(this.memory.read(keyPtr))
    const value = this.memory.read(valuePtr)

    console.log('APPEND', key, ':', hex(value))

    const current = this.data[key]
    if (current === undefined) {
      this.data[key] = value
    } else {
      this.data[key] = Buffer.concat([
        current,
        value
      ])
    }
  }

  nextKey (prefix: string): Uint8Array {
    const nextKey = Object.keys(this.data).find(key => (
      key.startsWith(prefix)
    ))
    if (nextKey === undefined) { return Uint8Array.of(0) }

    const enc = new Option(registry, 'Vec<u8>', `0x01${hex(compactToU8a(nextKey.length / 2))}${nextKey}`)

    console.log('NEXT KEY', nextKey)

    return enc.toU8a()
  }

  get (ptrSize: bigint): bigint {
    const key = hex(this.memory.read(ptrSize))
    const value = this.data[key]

    if (key === '42b50b77ef717947e7043bb52127d665e2b2d1966457295060d0b3c7e44dca63') {
      const enc = new Option(registry, 'Vec<u8>',
        Buffer.concat([
          Uint8Array.of(0x01),
          compactToU8a(0x01),
          Uint8Array.of(0x00)
        ]))
      return this.memory.write(enc.toU8a())
    }

    if (value === undefined) {
      console.log('GET', key, ': NONE')
      return this.memory.write(Uint8Array.of(0x00))
    } else {
      console.log('GET', key, ':', hex(value))

      const enc = new Option(registry, 'Vec<u8>',
        Buffer.concat([
          Uint8Array.of(0x01),
          compactToU8a(value.length),
          value
        ]))
      return this.memory.write(enc.toU8a())
    }
  }

  set (keyPtr: bigint, valuePtr: bigint): void {
    const key = hex(this.memory.read(keyPtr))
    const value = this.memory.read(valuePtr)

    console.log('SET', key, ':', hex(value))

    this.data[key] = value
  }

  clear (key: Uint8Array): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete this.data[hex(key)]
  }
}

export function createStorage (memory: Memory): Storage {
  return new DummyStorage(memory)
}
