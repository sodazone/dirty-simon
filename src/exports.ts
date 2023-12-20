type RuntimeFunction = (ptr: number, size: number) => bigint
export interface Exports {
  __heap_base: {
    value: number
  }
  Core_initialize_block: RuntimeFunction
  Core_execute_block: RuntimeFunction
  BlockBuilder_apply_extrinsic: RuntimeFunction
}
