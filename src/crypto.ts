import {
  blake2AsU8a, keccakAsU8a, sr25519Verify, ed25519Verify, xxhashAsU8a, secp256k1Recover
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
    ed25519_verify: (msgPtr: number, msgLen: number, sigPtr: number, pubkeyPtr: number): number => {
      const m = memory.get(msgPtr, msgLen)
      const s = memory.get(sigPtr, 64)
      const p = memory.get(pubkeyPtr, 32)

      try {
        return ed25519Verify(m, s, p) ? 0 : 5
      } catch (error) {
        return 5
      }
    },
    ext_hashing_keccak_256_version_1: (dataPtr: bigint): number => {
      const data = memory.read(dataPtr)
      const hash = keccakAsU8a(data)
      return getPointer(memory.write(hash))
    },
    secp256k1_ecdsa_recover: (msgPtr: number, sigPtr: number, pubkeyPtr: number): number => {
      const m = memory.get(msgPtr, 32)
      const s = memory.get(sigPtr, 65)

      try {
        const publicKey = secp256k1Recover(m, s, 0)

        memory.set(pubkeyPtr, publicKey)
      } catch (error) {
        return 5
      }

      return 0
    },
    sr25519_verify: (msgPtr: number, msgLen: number, sigPtr: number, pubkeyPtr: number): number => {
      const m = memory.get(msgPtr, msgLen)
      const s = memory.get(sigPtr, 64)
      const p = memory.get(pubkeyPtr, 32)

      try {
        return sr25519Verify(m, s, p) ? 0 : 5
      } catch (error) {
        return 5
      }
    },
    ext_hashing_twox_64_version_1: (dataPtr: bigint): number =>
      twox(64, dataPtr),
    ext_hashing_twox_128_version_1: (dataPtr: bigint): number =>
      twox(128, dataPtr),
    ext_hashing_twox_256_version_1: (dataPtr: bigint): number =>
      twox(256, dataPtr)
  }
}
