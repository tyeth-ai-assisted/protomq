import protobuf from "protobufjs"
import { readFileSync } from "fs"


// Load proto bundle via readFileSync to avoid JSON import assertion issues
// across different Node.js versions (assert vs with syntax)
const protobufJSON = JSON.parse(readFileSync(new URL("./protobufs/bundle.json", import.meta.url)))
const protobufRoot = protobuf.Root.fromJSON(protobufJSON)

export default protobufRoot

// The bundle namespace varies depending on how it was generated:
// - npm run import-protos: "signal.BrokerToDevice"
// - npx pbjs from wippersnapper protos: "wippersnapper.signal.BrokerToDevice"
// Try both paths to be resilient.
const tryLookup = (name) => {
  try { return protobufRoot.lookupType(name) } catch (e) {
    try { return protobufRoot.lookupType(`wippersnapper.${name}`) } catch (e2) {
      throw new Error(`Proto type not found as "${name}" or "wippersnapper.${name}"`)
    }
  }
}

export const
  BrokerToDevice = tryLookup("signal.BrokerToDevice"),
  DeviceToBroker = tryLookup("signal.DeviceToBroker")

// V1 devices use the same DeviceToBroker/BrokerToDevice proto types (which contain
// both V1 flat fields like checkinRequest at id 30 AND V2 envelope fields like checkin
// at id 1). The difference is purely topic routing, not proto schema. So we reuse the
// same types for both V1 and V2 topic handlers.
export const V1BrokerToDevice = BrokerToDevice
export const V1DeviceToBroker = DeviceToBroker
