import mqtt from 'mqtt';
import type {MqttClient} from 'mqtt';
import {createTopicStrategy, selfId} from '@trystero-p2p/core';
import type {JoinRoomConfig} from '@trystero-p2p/core';

// Trystero's standard MQTT adapter announces only once a minute. Passive guests
// need a short discovery interval for late joins and page reloads in this probe.
type SignalCounts = {subscriptions: number; subscriptionErrors: number; announcementsSent: number; announcementsReceived: number; signalsSent: number; signalsReceived: number};
type Relay = {counts: SignalCounts; client: MqttClient; handlers: Map<string, (topic: string, message: string) => void>};
const relays = new Map<string, Relay>();
export {selfId};
export const getRelaySockets = () => Object.fromEntries([...relays].map(([url, r]) =>
  [url, {readyState: r.client.connected ? WebSocket.OPEN : WebSocket.CONNECTING}]));

export const getSignalingDiagnostics = () => [...relays].map(([url, relay]) => ({name: new URL(url).hostname, connected: relay.client.connected, ...relay.counts}));

export const joinRoom = createTopicStrategy<Relay, JoinRoomConfig>({
  steadyAnnounceIntervalMs: 5000,
  init: config => (config.relayConfig?.urls ?? []).map(url => {
    const relay: Relay = {counts: {subscriptions:0,subscriptionErrors:0,announcementsSent:0,announcementsReceived:0,signalsSent:0,signalsReceived:0}, client: mqtt.connect(url, {reconnectPeriod: 2000, connectTimeout: 12000, queueQoSZero: false}), handlers: new Map()};
    relays.set(url, relay);
    relay.client.on('message', (topic, data) => {
      // Signaling only: no position, player name, or game state goes to MQTT.
      if (data.byteLength < 65536) relay.handlers.get(topic)?.(topic, data.toString());
    });
    relay.client.on('error', () => { /* Availability is exposed in the UI/report. MQTT retries. */ });
    return relay;
  }),
  subscribeTopic: (relay, topic, onMessage, context) => {
    relay.handlers.set(topic, (topic, message) => {
      if(context.kind === 'self') relay.counts.signalsReceived++;
      else {try {if(JSON.parse(message).peerId !== selfId) relay.counts.announcementsReceived++;} catch {}}
      onMessage(topic, message);
    });
    // MQTT queues subscriptions until connected and restores them on reconnect.
    // Return cleanup immediately: an unreachable broker must not block room.leave().
    relay.client.subscribe(topic, {qos: 0}, (error, granted) => {
      if(error || granted?.some(g => Number(g.qos) >= 128)) relay.counts.subscriptionErrors++;
      else relay.counts.subscriptions++;
    });
    return () => {
      relay.handlers.delete(topic);
      relay.client.unsubscribe(topic);
      if (!relay.handlers.size) {relay.client.end(true); for (const [url, r] of relays) if (r === relay) relays.delete(url);}
    };
  },
  publishTopic: (relay, topic, message, context) => {
    if (relay.client.connected) {
      if(context.kind === 'signal') relay.counts.signalsSent++; else relay.counts.announcementsSent++;
      relay.client.publish(topic, typeof message === 'string' ? message : JSON.stringify(message), {retain:false});
    }
  },
});
