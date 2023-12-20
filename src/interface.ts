export type PtrSize = [ptr: number, size: number]

export function toPointerSize (ptr: number, size: number): bigint {
  return BigInt(ptr) | (BigInt(size) << 32n)
}

export function fromPointerSize (ptrSize: bigint): PtrSize {
  return [
    getPointer(ptrSize),
    getSize(ptrSize)
  ]
}

export function getPointer (ptrSize: bigint): number {
  return Number(BigInt.asIntN(32, ptrSize))
}

export function getSize (ptrSize: bigint): number {
  return Number(ptrSize >> 32n)
}
