import { MemPool, MemPoolStats } from './allocator'
import { fromPointerSize, toPointerSize } from './interface'

export class Memory {
  memory: WebAssembly.Memory
  _heap?: MemPool

  constructor (memory: WebAssembly.Memory) {
    this.memory = memory
  }

  read (ptrSize: bigint): Uint8Array {
    const [ptr, size] = fromPointerSize(ptrSize)
    return this.get(ptr, size)
  }

  write (bytes: Uint8Array): bigint {
    const ptr = this.malloc(bytes.length)
    this.set(ptr, bytes)
    return toPointerSize(ptr, bytes.length)
  }

  setHeapBase (heapBase: number): void {
    this._heap = new MemPool({
      memory: this.memory,
      start: heapBase
    })
  }

  stats (): Readonly<MemPoolStats> {
    return this.heap.stats()
  }

  malloc (bytes: number): number {
    return this.heap.malloc(bytes)
  }

  free (ptr: number): boolean {
    return this.heap.free(ptr)
  }

  set (ptr: number, value: Uint8Array): void {
    this.heap.set(ptr, value)
  }

  get (ptr: number, size: number): Uint8Array {
    return this.heap.get(ptr, size)
  }

  private get heap (): MemPool {
    if (this._heap === undefined) {
      throw new Error('Heap not initialized')
    }
    return this._heap
  }
}

export function createMemory (
  descriptor: WebAssembly.MemoryDescriptor = {
    initial: 23,
    maximum: 65536
  }
): Memory {
  const memory = new WebAssembly.Memory(descriptor)
  return new Memory(memory)
}
