/* eslint-disable @typescript-eslint/strict-boolean-expressions, no-sequences */
const STATE_FREE = 0
const STATE_USED = 1
const STATE_TOP = 2
const STATE_END = 3
const STATE_ALIGN = 4
const STATE_FLAGS = 5
const STATE_MIN_SPLIT = 6

const MASK_COMPACT = 1
const MASK_SPLIT = 2

const SIZEOF_STATE = 7 * 4

const MEM_BLOCK_SIZE = 0
const MEM_BLOCK_NEXT = 1

const SIZEOF_MEM_BLOCK = 2 * 4

const PAGE_SIZE = 65536
const MAX_WASM_PAGES = (4 * 1024 * 1024 * 1024 / PAGE_SIZE) // 4GB

type Pow2 =
  | 0x1
  | 0x2
  | 0x4
  | 0x8
  | 0x10
  | 0x20
  | 0x40
  | 0x80
  | 0x100
  | 0x200
  | 0x400
  | 0x800
  | 0x1000
  | 0x2000
  | 0x4000
  | 0x8000
  | 0x10000
  | 0x20000
  | 0x40000
  | 0x80000
  | 0x100000
  | 0x200000
  | 0x400000
  | 0x800000
  | 0x1000000
  | 0x2000000
  | 0x4000000
  | 0x8000000
  | 0x10000000
  | 0x20000000
  | 0x40000000
  | 0x80000000

/**
 * Aligns `addr` to next multiple of `size`. The latter must be a power
 * of 2.
 *
 * @param addr - value to align
 * @param size - alignment value
 */
const align = (addr: number, size: Pow2): number => (
  size--, (addr + size) & ~size
)

export interface MemPoolOpts {
  /**
   * Web assembly memory
   */
  memory: WebAssembly.Memory

  /**
   * Anchor index (byte address) inside the array buffer. The MemPool
   * stores its internal state from the given address and heap space
   * starts at least 32 bytes later (depending on chosen `align`
   * value). Unlike allocator state variables, `start`` cannot be
   * saved inside the array buffer itself. If the ArrayBuffer is
   * passed to other consumers they must use the same start value.
   * MUST be multiple of 4.
   *
   * @defaultValue 0
   */
  start?: number

  /**
   * Byte address (+1) of the end of the memory region managed by the
   * {@link MemPool}.
   *
   * @defaultValue end of the backing ArrayBuffer
   */
  end?: number

  /**
   * Number of bytes to align memory blocks to. MUST be a power of 2
   * and >= 8. Use 16 if the pool is being used for allocating memory
   * used in SIMD operations.
   *
   * @defaultValue 8
   */
  align?: Pow2

  /**
   * Flag to configure memory block compaction. If true,
   * adjoining free blocks (in terms of address space) will be merged
   * to minimize fragementation.
   *
   * @defaultValue true
   */
  compact?: boolean
  /**
   * Flag to configure memory block splitting. If true, and when the
   * allocator is re-using a previously freed block larger than the
   * requested size, the block will be split to minimize wasted/unused
   * memory. The splitting behavior can further customized via the
   * `minSplit` option.
   *
   * @defaultValue true
   */
  split?: boolean

  /**
   * Only used if `split` behavior is enabled. Defines min number of
   * excess bytes available in a block for memory block splitting to
   * occur.
   *
   * @defaultValue 16, MUST be > 8
   */
  minSplit?: number
}

export interface MemPoolStats {
  /**
   * Free block stats.
   */
  free: { count: number, size: number }
  /**
   * Used block stats.
   */
  used: { count: number, size: number }
  /**
   * Current top address.
   */
  top: number
  /**
   * Bytes available
   */
  available: number
  /**
   * Total pool size.
   */
  total: number
}

export class MemPool {
  buf: ArrayBufferLike
  mem: WebAssembly.Memory

  protected readonly start: number
  protected u8: Uint8Array
  protected u32: Uint32Array
  protected state: Uint32Array

  constructor (opts: MemPoolOpts) {
    this.mem = opts.memory
    this.start = opts.start != null ? align(Math.max(opts.start, 0), 4) : 0

    this.buf = this.mem.buffer
    this.u8 = new Uint8Array(this.buf)
    this.u32 = new Uint32Array(this.buf)
    this.state = new Uint32Array(this.buf, this.start, SIZEOF_STATE / 4)

    const _align = opts.align ?? 8
    if (_align < 8) {
      throw new Error(`invalid alignment: ${_align}, must be a pow2 and >= 8`)
    };
    const top = this.initialTop(_align)
    const resolvedEnd =
        opts.end != null
          ? Math.min(opts.end, this.buf.byteLength)
          : this.buf.byteLength

    if (top >= resolvedEnd) {
      throw new Error(
          `insufficient address range (0x${this.start.toString(
            16
          )} - 0x${resolvedEnd.toString(16)})`
      )
    }

    this.align = _align
    this.doCompact = opts.compact !== false
    this.doSplit = opts.split !== false
    this.minSplit = opts.minSplit ?? 16
    this.end = resolvedEnd
    this.top = top
    this._free = 0
    this._used = 0
  }

  get (ptr: number, size: number): Uint8Array {
    return this.u8.slice(ptr, ptr + size)
  }

  set (ptr: number, value: Uint8Array): void {
    this.u8.set(value, ptr)
  }

  stats (): Readonly<MemPoolStats> {
    const listStats = (block: number): {
      count: number
      size: number
    } => {
      let count = 0
      let size = 0
      while (block > 0) {
        count++
        size += this.blockSize(block)
        block = this.blockNext(block)
      }
      return { count, size }
    }
    const free = listStats(this._free)
    return {
      free,
      used: listStats(this._used),
      top: this.top,
      available: this.end - this.top + free.size,
      total: this.buf.byteLength
    }
  }

  malloc (bytes: number): number {
    if (bytes <= 0) {
      return 0
    }
    const paddedSize = align(bytes + SIZEOF_MEM_BLOCK, this.align)
    const end = this.end
    let top = this.top
    let block = this._free
    let prev = 0
    while (block > 0) {
      const blockSize = this.blockSize(block)
      const isTop = block + blockSize >= top
      if (isTop || blockSize >= paddedSize) {
        return this.mallocTop(
          block,
          prev,
          blockSize,
          paddedSize,
          isTop
        )
      }
      prev = block
      block = this.blockNext(block)
    }

    block = top
    top = block + paddedSize

    if (top > end) {
      this.growPages(paddedSize)
    }

    this.initBlock(block, paddedSize, this._used)
    this._used = block
    this.top = top

    return blockDataAddress(block)
  }

  private growPages (bytes: number): void {
    const requiredPages = this.pagesFromBytes(bytes)
    const currentPages = this.pagesFromBytes(this.mem.buffer.byteLength)

    if (currentPages >= MAX_WASM_PAGES) {
      throw new Error('Max pages already reached.')
    }

    if (requiredPages > MAX_WASM_PAGES) {
      throw new Error(
        `Failed to grow memory from ${currentPages} pages to at least ${
          requiredPages
        } pages due to the maximum limit of ${MAX_WASM_PAGES} pages`
      )
    }

    let nextPages = Math.min(currentPages * 2, MAX_WASM_PAGES)
    nextPages = Math.max(nextPages, requiredPages)

    this.mem.grow(nextPages - currentPages)

    this.buf = this.mem.buffer
    this.u8 = new Uint8Array(this.buf)
    this.u32 = new Uint32Array(this.buf)
    this.state = new Uint32Array(this.buf, this.start, SIZEOF_STATE / 4)
  }

  private pagesFromBytes (bytes: number): number {
    const pages = (bytes + PAGE_SIZE - 1) / PAGE_SIZE
    if (pages > Number.MAX_SAFE_INTEGER) {
      throw new Error('Allocator ran out of space')
    }
    return pages
  }

  private mallocTop (
    block: number,
    prev: number,
    blockSize: number,
    paddedSize: number,
    isTop: boolean
  ): number {
    if (isTop && block + paddedSize > this.end) return 0
    if (prev !== 0) {
      this.unlinkBlock(prev, block)
    } else {
      this._free = this.blockNext(block)
    }
    this.setBlockNext(block, this._used)
    this._used = block
    if (isTop) {
      this.top = block + this.setBlockSize(block, paddedSize)
    } else if (this.doSplit) {
      const excess = blockSize - paddedSize
      excess >= this.minSplit &&
        this.splitBlock(block, paddedSize, excess)
    }
    return blockDataAddress(block)
  }

  free (ptr: number): boolean {
    const addr = blockSelfAddress(ptr)
    let block = this._used
    let prev = 0
    while (block > 0) {
      if (block === addr) {
        if (prev !== 0) {
          this.unlinkBlock(prev, block)
        } else {
          this._used = this.blockNext(block)
        }
        this.insert(block)
        this.doCompact && this.compact()
        return true
      }
      prev = block
      block = this.blockNext(block)
    }
    return false
  }

  freeAll (): void {
    this._free = 0
    this._used = 0
    this.top = this.initialTop()
  }

  release (): boolean {
    delete (this as any).u8
    delete (this as any).u32
    delete (this as any).state
    delete (this as any).buf
    return true
  }

  protected get align (): Pow2 {
    return this.state[STATE_ALIGN] as Pow2
  }

  protected set align (x: Pow2) {
    this.state[STATE_ALIGN] = x
  }

  protected get end (): number {
    return this.state[STATE_END]
  }

  protected set end (x: number) {
    this.state[STATE_END] = x
  }

  protected get top (): number {
    return this.state[STATE_TOP]
  }

  protected set top (x: number) {
    this.state[STATE_TOP] = x
  }

  protected get _free (): number {
    return this.state[STATE_FREE]
  }

  protected set _free (block: number) {
    this.state[STATE_FREE] = block
  }

  protected get _used (): number {
    return this.state[STATE_USED]
  }

  protected set _used (block: number) {
    this.state[STATE_USED] = block
  }

  protected get doCompact (): boolean {
    return !!(this.state[STATE_FLAGS] & MASK_COMPACT)
  }

  protected set doCompact (flag: boolean) {
    flag
      ? (this.state[STATE_FLAGS] |= 1 << (MASK_COMPACT - 1))
      : (this.state[STATE_FLAGS] &= ~MASK_COMPACT)
  }

  protected get doSplit (): boolean {
    return !!(this.state[STATE_FLAGS] & MASK_SPLIT)
  }

  protected set doSplit (flag: boolean) {
    flag
      ? (this.state[STATE_FLAGS] |= 1 << (MASK_SPLIT - 1))
      : (this.state[STATE_FLAGS] &= ~MASK_SPLIT)
  }

  protected get minSplit (): number {
    return this.state[STATE_MIN_SPLIT]
  }

  protected set minSplit (x: number) {
    if (x <= SIZEOF_MEM_BLOCK) {
      throw new Error(`illegal min split threshold: ${x}, require at least ${
        SIZEOF_MEM_BLOCK + 1
      }`)
    };
    this.state[STATE_MIN_SPLIT] = x
  }

  protected blockSize (block: number): number {
    return this.u32[(block >> 2) + MEM_BLOCK_SIZE]
  }

  /**
   * Sets & returns given block size.
   *
   * @param block -
   * @param size -
   */
  protected setBlockSize (block: number, size: number): number {
    this.u32[(block >> 2) + MEM_BLOCK_SIZE] = size
    return size
  }

  protected blockNext (block: number): number {
    return this.u32[(block >> 2) + MEM_BLOCK_NEXT]
  }

  /**
   * Sets block next pointer to `next`. Use zero to indicate list end.
   *
   * @param block -
   */
  protected setBlockNext (block: number, next: number): void {
    this.u32[(block >> 2) + MEM_BLOCK_NEXT] = next
  }

  /**
   * Initializes block header with given `size` and `next` pointer. Returns `block`.
   *
   * @param block -
   * @param size -
   * @param next -
   */
  protected initBlock (block: number, size: number, next: number): number {
    const idx = block >>> 2
    this.u32[idx + MEM_BLOCK_SIZE] = size
    this.u32[idx + MEM_BLOCK_NEXT] = next
    return block
  }

  protected unlinkBlock (prev: number, block: number): void {
    this.setBlockNext(prev, this.blockNext(block))
  }

  protected splitBlock (block: number, blockSize: number, excess: number): void {
    this.insert(
      this.initBlock(
        block + this.setBlockSize(block, blockSize),
        excess,
        0
      )
    )
    this.doCompact && this.compact()
  }

  protected initialTop (_align = this.align): number {
    return (
      align(this.start + SIZEOF_STATE + SIZEOF_MEM_BLOCK, _align) -
      SIZEOF_MEM_BLOCK
    )
  }

  /**
   * Traverses free list and attempts to recursively merge blocks
   * occupying consecutive memory regions. Returns true if any blocks
   * have been merged. Only called if `compact` option is enabled.
   */
  protected compact (): boolean {
    let block = this._free
    let prev = 0
    let scan = 0
    let scanPrev: number
    let res = false
    while (block > 0) {
      scanPrev = block
      scan = this.blockNext(block)
      while (scan && scanPrev + this.blockSize(scanPrev) === scan) {
        scanPrev = scan
        scan = this.blockNext(scan)
      }
      if (scanPrev !== block) {
        const newSize = scanPrev - block + this.blockSize(scanPrev)
        this.setBlockSize(block, newSize)
        const next = this.blockNext(scanPrev)
        let tmp = this.blockNext(block)
        while (tmp && tmp !== next) {
          const tn = this.blockNext(tmp)
          this.setBlockNext(tmp, 0)
          tmp = tn
        }
        this.setBlockNext(block, next)
        res = true
      }
      // re-adjust top if poss
      if (block + this.blockSize(block) >= this.top) {
        this.top = block
        prev
          ? this.unlinkBlock(prev, block)
          : (this._free = this.blockNext(block))
      }
      prev = block
      block = this.blockNext(block)
    }
    return res
  }

  /**
   * Inserts given block into list of free blocks, sorted by address.
   *
   * @param block -
   */
  protected insert (block: number): void {
    let ptr = this._free
    let prev = 0
    while (ptr) {
      if (block <= ptr) break
      prev = ptr
      ptr = this.blockNext(ptr)
    }
    if (prev) {
      this.setBlockNext(prev, block)
    } else {
      this._free = block
    }
    this.setBlockNext(block, ptr)
  }
}

/**
 * Returns a block's data address, based on given alignment.
 *
 * @param blockAddress -
 */
const blockDataAddress = (blockAddress: number): number =>
  blockAddress > 0 ? blockAddress + SIZEOF_MEM_BLOCK : 0

/**
 * Returns block start address for given data address and alignment.
 *
 * @param dataAddress -
 */
const blockSelfAddress = (dataAddress: number): number =>
  dataAddress > 0 ? dataAddress - SIZEOF_MEM_BLOCK : 0
