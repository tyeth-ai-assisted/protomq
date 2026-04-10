import protobuf from "protobufjs"
import protobufJSON from "./protobufs/bundle.json" with { type: "json" }


const protobufRoot = protobuf.Root.fromJSON(protobufJSON)

export default protobufRoot

export const
  BrokerToDevice = protobufRoot.lookupType("signal.BrokerToDevice"),
  DeviceToBroker = protobufRoot.lookupType("signal.DeviceToBroker")

// V1 devices use the same DeviceToBroker/BrokerToDevice proto types (which contain
// both V1 flat fields like checkinRequest at id 30 AND V2 envelope fields like checkin
// at id 1). The difference is purely topic routing, not proto schema. So we reuse the
// same types for both V1 and V2 topic handlers.
export const V1BrokerToDevice = BrokerToDevice
export const V1DeviceToBroker = DeviceToBroker
