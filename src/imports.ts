import createCrypto from './crypto.js'
import { getPointer, toPointerSize } from './interface.js'
import { Memory } from './memory.js'
import { Storage } from './storage.js'
import { hex, str, u8a } from './util.js'

const DEFAULT_TABLE: WebAssembly.TableDescriptor = {
  initial: 0,
  element: 'anyfunc'
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createImports ({
  memory,
  storage
}: {
  memory: Memory
  storage: Storage
}) {
  const table = new WebAssembly.Table(DEFAULT_TABLE)
  const crypto = createCrypto(memory)

  const imports = {
    env: new Proxy({
      memory: memory.memory,
      memoryBase: 0,
      table,
      tableBase: 0,
      ext_allocator_free_version_1: (ptr: number): void => {
        memory.free(ptr)
      },
      ext_allocator_malloc_version_1: (size: number): number => {
        return memory.malloc(size)
      },
      ext_storage_clear_prefix_version_2: (ptrSize: bigint): bigint => {
        console.log('CLEAR prefix', hex(memory.read(ptrSize)))
        return toPointerSize(0, 8)
      },
      ext_storage_next_key_version_1: (ptrSize: bigint): bigint => {
        const prefix = hex(memory.read(ptrSize))
        return memory.write(storage.nextKey(prefix))
      },
      ext_storage_clear_version_1: (ptrSize: bigint): void => {
        const key = memory.read(ptrSize)
        console.log('CLEAR', hex(key))
        storage.clear(key)
      },
      ext_storage_exists_version_1: (ptrSize: bigint): number => {
        return storage.exists(ptrSize)
      },
      ext_storage_append_version_1: (kPtrSiz: bigint, vPtrSiz: bigint): void => {
        storage.append(kPtrSiz, vPtrSiz)
      },
      ext_storage_get_version_1: (ptrSize: bigint): bigint => {
        return storage.get(ptrSize)
      },
      ext_storage_set_version_1: (key: bigint, value: bigint): void => {
        storage.set(key, value)
      },
      ext_trie_blake2_256_ordered_root_version_2: (items: bigint): number => {
        const key = memory.read(items)
        console.log('TX ROOT', hex(key))
        const h = u8a('4040404040404040404040404040404040404040404040404040404040404040')
        return getPointer(memory.write(h))
      },
      ext_storage_root_version_2: (version: bigint): bigint => {
        console.log('STORAGE ROOT', version)
        const h = u8a('fabb0c6e92d29e8bb2167f3c6fb0ddeb956a4278a3cf853661af74a076fc9cb7')
        return memory.write(h)
      },
      ext_logging_log_version_1: (level: number, target: bigint, message: bigint): void => {
        console.log(
          str(memory.read(target)),
          str(memory.read(message))
        )
      },
      ext_misc_print_utf8_version_1: (message: bigint): void => {
        console.log(
          str(memory.read(message))
        )
      },
      ext_misc_print_hex_version_1: (message: bigint): void => {
        console.log(
          hex(memory.read(message))
        )
      },
      ...crypto
    }, {
      get (target: any, prop: string | symbol) {
        if (target[prop] !== undefined) {
          return target[prop]
        }
        return (args: any) => {
          console.error('NOT IMPL:', args, prop)
        }
      }
    })
  }
  return imports
}
