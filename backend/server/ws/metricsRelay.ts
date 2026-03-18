import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { InterruptionDetector } from './interruptionDetector.js';
import { SessionAccumulator } from './sessionAccumulator.js';

interface RoomConnection {
  ws: WebSocket;
  role: 'tutor' | 'student';
  clockOffset: number;
}

interface Room {
  connections: RoomConnection[];
  interruptionDetector: InterruptionDetector;
  sessionAccumulator: SessionAccumulator;
  interruptionBroadcastTimer: ReturnType<typeof setInterval> | null;
  ttlTimer: ReturnType<typeof setTimeout> | null;
}

// Module-level rooms map so other modules (e.g. recommendations endpoint) can look up rooms
const rooms = new Map<string, Room>();

/** Look up a room's accumulator and interruption detector by name */
export function getRoomData(roomName: string): { accumulator: SessionAccumulator; detector: InterruptionDetector } | null {
  const room = rooms.get(roomName);
  if (!room) return null;
  return { accumulator: room.sessionAccumulator, detector: room.interruptionDetector };
}

/** Delete a room and cancel any pending TTL timer */
export function deleteRoom(roomName: string): void {
  const room = rooms.get(roomName);
  if (!room) return;
  if (room.ttlTimer) clearTimeout(room.ttlTimer);
  rooms.delete(roomName);
  console.log(`[metricsRelay] room "${roomName}" deleted after recommendations fetched`);
}

export function attachMetricsRelay(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws/metrics' });

  // Heartbeat ping every 30s
  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    }
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws) => {
    let roomName: string | null = null;
    let role: 'tutor' | 'student' | null = null;
    let conn: RoomConnection | null = null;

    ws.on('message', (raw) => {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === 'join' && typeof msg.roomName === 'string' && (msg.role === 'tutor' || msg.role === 'student')) {
        roomName = msg.roomName;
        role = msg.role as 'tutor' | 'student';

        if (!rooms.has(roomName)) {
          const detector = new InterruptionDetector();
          const accumulator = new SessionAccumulator(roomName);
          const room: Room = {
            connections: [],
            interruptionDetector: detector,
            sessionAccumulator: accumulator,
            interruptionBroadcastTimer: null,
            ttlTimer: null,
          };

          // Broadcast interruption counts to tutors every 1s + check for bursts
          room.interruptionBroadcastTimer = setInterval(() => {
            const counts = detector.getCounts();
            const payload = JSON.stringify({ type: 'interruptions', counts });
            for (const c of room.connections) {
              if (c.role === 'tutor' && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(payload);
              }
            }
            accumulator.checkInterruptions(detector);
          }, 1000);

          rooms.set(roomName, room);
        }

        // Cancel TTL timer if someone rejoins a room in cooldown — reset session data
        const existingRoom = rooms.get(roomName)!;
        if (existingRoom.ttlTimer) {
          clearTimeout(existingRoom.ttlTimer);
          existingRoom.ttlTimer = null;
          // Reset accumulator and detector for a fresh session
          existingRoom.sessionAccumulator = new SessionAccumulator(roomName);
          existingRoom.interruptionDetector = new InterruptionDetector();
          console.log(`[metricsRelay] room "${roomName}" TTL cancelled — session data reset for new session`);
        }

        // Restart broadcast timer if it was cleared during empty-room cleanup
        if (!existingRoom.interruptionBroadcastTimer) {
          const detector = existingRoom.interruptionDetector;
          const accumulator = existingRoom.sessionAccumulator;
          existingRoom.interruptionBroadcastTimer = setInterval(() => {
            const counts = detector.getCounts();
            const payload = JSON.stringify({ type: 'interruptions', counts });
            for (const c of existingRoom.connections) {
              if (c.role === 'tutor' && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(payload);
              }
            }
            accumulator.checkInterruptions(detector);
          }, 1000);
        }

        conn = { ws, role, clockOffset: 0 };
        existingRoom.connections.push(conn);
        console.log(`[metricsRelay] ${role} joined room "${roomName}" (${existingRoom.connections.length} in room)`);
        return;
      }

      // Clock-sync: respond immediately with server timestamp
      if (msg.type === 'clock-sync' && typeof msg.clientTs === 'number') {
        const serverTs = Date.now();

        // Rough server-side offset estimate (one-way, no RTT correction).
        // Used as fallback when the client's NTP-style clockOffset isn't available.
        if (conn) {
          conn.clockOffset = serverTs - (msg.clientTs as number);
        }

        ws.send(JSON.stringify({
          type: 'clock-sync-ack',
          clientTs: msg.clientTs,
          serverTs,
        }));
        return;
      }

      if (msg.type === 'metrics' && roomName && role) {
        const serverTimestamp = Date.now();

        // Stamp t3 (server receive) on traced messages
        const data = msg.data as Record<string, unknown> | undefined;
        if (data?._trace && typeof data._trace === 'object') {
          (data._trace as Record<string, unknown>).t3_serverRecv = serverTimestamp;
        }

        const room = rooms.get(roomName);
        if (!room) return;

        // Feed audio data points into the interruption detector
        if (data?.source === 'audio' && typeof data.isSpeaking === 'boolean' && typeof data.timestamp === 'number') {
          const clientClockOffset = (data._trace as Record<string, unknown> | undefined)?.clockOffset;
          const offset = typeof clientClockOffset === 'number' ? clientClockOffset : (conn?.clockOffset ?? 0);
          // Use isSpeakingRaw (unheld) for interruption detection to avoid
          // speech-hold delay inflating overlap duration. Fall back to isSpeaking
          // for backwards compatibility with older clients.
          const speakingForInterruption = typeof data.isSpeakingRaw === 'boolean'
            ? data.isSpeakingRaw
            : data.isSpeaking;
          room.interruptionDetector.push({
            participant: role,
            isSpeaking: speakingForInterruption,
            correctedTs: (data.timestamp as number) + offset,
          });
        }

        // Feed all data points into session accumulator
        if (data && (data.source === 'video' || data.source === 'audio')) {
          room.sessionAccumulator.ingest({
            participant: role,
            source: data.source as 'video' | 'audio',
            timestamp: data.timestamp as number,
            eyeContact: data.eyeContact as number | undefined,
            faceDetected: data.faceDetected as boolean | undefined,
            faceConfidence: data.faceConfidence as number | undefined,
            expressionEnergy: data.expressionEnergy as number | undefined,
            isSpeaking: data.isSpeaking as boolean | undefined,
            voiceEnergy: data.voiceEnergy as number | undefined,
          });
        }

        if (role === 'student') {
          // Stamp t4 (server forward) just before sending
          if (data?._trace && typeof data._trace === 'object') {
            (data._trace as Record<string, unknown>).t4_serverFwd = Date.now();
          }

          const relay = JSON.stringify({
            type: 'metrics',
            data: msg.data,
            serverTimestamp,
          });

          // Forward student metrics to tutors in the same room
          const source = (data as Record<string, unknown>)?.source;
          console.log(`[metricsRelay] relaying student ${source} metrics to tutors`);
          for (const c of room.connections) {
            if (c.role === 'tutor' && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(relay);
            }
          }
        }
      }
    });

    ws.on('close', () => {
      if (roomName) {
        const room = rooms.get(roomName);
        if (room) {
          room.connections = room.connections.filter((c) => c.ws !== ws);
          console.log(`[metricsRelay] ${role} left room "${roomName}" (${room.connections.length} remaining)`);
          if (room.connections.length === 0) {
            room.interruptionDetector.flush();
            if (room.interruptionBroadcastTimer) {
              clearInterval(room.interruptionBroadcastTimer);
              room.interruptionBroadcastTimer = null;
            }
            // Start 30-minute TTL instead of deleting immediately
            // (allows the recommendations endpoint to fetch the summary)
            const TTL_MS = 30 * 60 * 1000;
            room.ttlTimer = setTimeout(() => {
              rooms.delete(roomName!);
              console.log(`[metricsRelay] room "${roomName}" TTL expired, cleaned up`);
            }, TTL_MS);
            console.log(`[metricsRelay] room "${roomName}" empty, starting ${TTL_MS / 60_000}min TTL`);
          }
        }
      }
    });
  });

  console.log('[metricsRelay] WebSocket relay attached at /ws/metrics');
}
