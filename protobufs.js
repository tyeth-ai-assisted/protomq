import protobuf from "protobufjs"
import protobufJSON from "./protobufs/bundle.json" with { type: "json" }
import protobufV1JSON from "./protobufs-v1/bundle.json" with { type: "json" }


// V2 proto root (nested signal envelopes)
const protobufRoot = protobuf.Root.fromJSON(protobufJSON)

export default protobufRoot

export const
  BrokerToDevice = protobufRoot.lookupType("signal.BrokerToDevice"),
  DeviceToBroker = protobufRoot.lookupType("signal.DeviceToBroker")

// V1 proto root (flat message keys, older firmware)
const protobufV1Root = protobuf.Root.fromJSON(protobufV1JSON)

export const
  V1BrokerToDevice = protobufV1Root.lookupType("signal.BrokerToDevice"),
  V1DeviceToBroker = protobufV1Root.lookupType("signal.DeviceToBroker")
