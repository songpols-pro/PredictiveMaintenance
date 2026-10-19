// Local MQTT broker for development (no Docker, no cloud account needed). MQTT 3.1.1 only.
// Applies the same rule the production broker's ACL must apply: a gateway connects with
// client id "{project}.{gateway}" and may publish only under pdm/v1/{project}/{gateway}/.

import { createServer } from "node:net";
import { Aedes } from "aedes";
import { TOPIC_ROOT, parseTopic } from "../../../pdm-app/src/lib/telemetry/contract";

const port = Number(process.env.MQTT_PORT ?? 1883);

const broker = await Aedes.createBroker({
  authorizePublish(client, packet, callback) {
    const topic = parseTopic(packet.topic);
    const owner = client?.id.split(".");
    if (packet.topic.startsWith(`${TOPIC_ROOT}/`) && (!topic || owner?.length !== 2 || owner[0] !== topic.project || owner[1] !== topic.gateway)) {
      console.warn(`✗ refused: ${client?.id ?? "?"} may not publish to ${packet.topic}`);
      return callback(new Error("not authorized"));
    }
    callback(null);
  },
});

broker.on("client", (c) => console.log(`+ ${c.id}`));
broker.on("clientDisconnect", (c) => console.log(`- ${c.id}`));
broker.on("keepaliveTimeout", (c) => console.log(`! ${c.id} keepalive timeout (its Last Will is published)`));

createServer(broker.handle).listen(port, () => console.log(`Dev MQTT broker on mqtt://127.0.0.1:${port}  (Ctrl+C to stop)`));
