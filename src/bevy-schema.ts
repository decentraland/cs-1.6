import { Schemas } from '@dcl/sdk/ecs'

export function schema<T>(
  codec: { encode(value: T): { finish(): Uint8Array }; decode(bytes: Uint8Array, length?: number): T },
  name: string
) {
  return {
    serialize(value: T, builder: Parameters<typeof Schemas.String.serialize>[1]) {
      builder.writeBuffer(codec.encode(value).finish(), false)
    },
    deserialize(reader: Parameters<typeof Schemas.String.deserialize>[0]) {
      return codec.decode(reader.buffer(), reader.remainingBytes())
    },
    create() {
      return codec.decode(new Uint8Array())
    },
    jsonSchema: {
      type: 'object' as const,
      properties: {},
      serializationType: 'protocol-buffer' as const,
      protocolBuffer: name
    }
  }
}
