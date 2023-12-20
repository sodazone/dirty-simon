import { writeFileSync } from 'fs'
import { compactToU8a } from '@polkadot/util'

import { dataPath, u8a } from '../src/util'

writeFileSync(dataPath('test-block.bin'),
  Buffer.concat([
    // Parent Hash
    u8a('b0a8d493285c2df73290dfb7e61f870f17b41801197a149ca93654499ea3dafe'),
    // Number
    compactToU8a(0x01),
    // State Root
    u8a('fabb0c6e92d29e8bb2167f3c6fb0ddeb956a4278a3cf853661af74a076fc9cb7'),
    // Extrinsics Root
    u8a('4040404040404040404040404040404040404040404040404040404040404040'),
    // Digest Length
    compactToU8a(0x01),
    // Disgest Item
    u8a('0642414245340201000000ef55a50f00000000'),
    // Extrinsics Length
    compactToU8a(0x01),
    // Set Timestamp
    u8a('280402000b90110eb36e01')
  ])
)
