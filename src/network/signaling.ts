import mqtt from 'mqtt';
import type {MqttClient} from 'mqtt';
import {createTopicStrategy, selfId} from '@trystero-p2p/core';
import type {JoinRoomConfig} from '@trystero-p2p/core';

// Trystero's standard MQTT adapter announces only once a minute. Passive guests
// need a short discovery interval for late joins and page reloads in this probe.
type Relay = {client: MqttClient; handlers: Map<string, (topic: string, message: string) => void>};
const relays = new Map<string, Relay>();
export {selfId};
export const getRelaySockets = () => Object.fromEntries([...relays].map(([url, r]) =>
  [url, {readyState: r.client.connected ? WebSocket.OPEN : WebSocket.CONNECTING}]));

export const joinRoom = createTopicStrategy<Relay, JoinRoomConfig>({
  steadyAnnounceIntervalMs: 5000,
  init: config => (config.relayConfig?.urls ?? []).map(url => {
    const relay: Relay = {client: mqtt.connect(url, {reconnectPeriod: 2000, connectTimeout: 12000, queueQoSZero: false}), handlers: new Map()};
    relays.set(url, relay);
    relay.client.on('message', (topic, data) => {
      // Signaling only: no position, player name, or game state goes to MQTT.
      if (data.byteLength < 65536) relay.handlers.get(topic)?.(topic, data.toString());
    });
    relay.client.on('error', () => { /* Availability is exposed in the UI/report. MQTT retries. */ });
    return relay;
  }),
  subscribeTopic: (relay, topic, onMessage) => {
    relay.handlers.set(topic, onMessage);
    // MQTT queues subscriptions until connected and restores them on reconnect.
    // Return cleanup immediately: an unreachable broker must not block room.leave().
    relay.client.subscribe(topic, {qos: 0}, () => {});
    return () => {
      relay.handlers.delete(topic);
      relay.client.unsubscribe(topic);
      if (!relay.handlers.size) {relay.client.end(true); for (const [url, r] of relays) if (r === relay) relays.delete(url);}
    };
  },
  publishTopic: (relay, topic, message) => {
    if (relay.client.connected) relay.client.publish(topic, typeof message === 'string' ? message : JSON.stringify(message), {retain:false});
  },
});
