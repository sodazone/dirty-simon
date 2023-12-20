import {
  blake2AsU8a, keccakAsU8a, xxhashAsU8a
} from '@polkadot/util-crypto'
import { Memory } from './memory'
import { getPointer } from './interface'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default function crypto (memory: Memory) {
  const twox = (bitLength: 64 | 128 | 256, dataPtr: bigint): number => {
    const data = memory.read(dataPtr)
    const hash = xxhashAsU8a(data, bitLength)

    console.log(`TWOX${bitLength}`,
      Buffer.from(data).toString(),
      Buffer.from(hash).toString('hex')
    )

    const ptrSize = memory.write(hash)

    return getPointer(ptrSize)
  }

  const blake2 = (bitLength: 128 | 256, dataPtr: bigint): number => {
    const data = memory.read(dataPtr)
    const hash = blake2AsU8a(data, bitLength)

    console.log(`BLAKE2-${bitLength}`,
      Buffer.from(data).toString(),
      Buffer.from(hash).toString('hex')
    )

    return getPointer(memory.write(hash))
  }

  return {
    ext_hashing_blake2_256_version_1: (dataPtr: bigint): number => {
      return blake2(256, dataPtr)
    },
    ext_hashing_blake2_128_version_1: (dataPtr: bigint): number => {
      return blake2(128, dataPtr)
    },
    ext_hashing_keccak_256_version_1: (dataPtr: bigint): number => {
      const data = memory.read(dataPtr)
      const hash = keccakAsU8a(data)
      return getPointer(memory.write(hash))
    },
    ext_hashing_twox_64_version_1: (dataPtr: bigint): number =>
      twox(64, dataPtr),
    ext_hashing_twox_128_version_1: (dataPtr: bigint): number =>
      twox(128, dataPtr),
    ext_hashing_twox_256_version_1: (dataPtr: bigint): number =>
      twox(256, dataPtr)
  }
}
