/* eslint-disable @typescript-eslint/naming-convention */
import { readFileSync } from 'fs'

import { createImports } from './imports.js'
import { createMemory } from './memory.js'
import { Exports } from './exports.js'
import { createStorage } from './storage.js'
import { dataPath } from './util.js'
import { fromPointerSize } from './interface.js'

const memory = createMemory()
const storage = createStorage(memory)
const imports = createImports({
  memory,
  storage
})

const wasm = readFileSync(dataPath('kusama.wasm'))
const module = new WebAssembly.Module(wasm)
const instance = await WebAssembly.instantiate(module, imports)

const exports = instance.exports as unknown as Exports
const heapBase = exports.__heap_base.value

memory.setHeapBase(heapBase)

console.log(memory.stats())
console.log(instance.exports)

const {
  Core_execute_block
} = exports

const {
  genesis: { raw: { top } }
} = JSON.parse(readFileSync(
  dataPath('kusama.json')
).toString())

storage.loadFromTop(top)

const block = readFileSync(dataPath('test-block.bin'))
const ptrSiz = memory.write(block)
const [ptr, size] = fromPointerSize(ptrSiz)

Core_execute_block(ptr, size)

process.exit(0)
