import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import { InterruptionDetector } from './interruptionDetector.js';

interface RoomConnection {
  ws: WebSocket;
  role: 'tutor' | 'student';
  clockOffset: number;
}

interface Room {
  connections: RoomConnection[];
  interruptionDetector: InterruptionDetector;
  interruptionBroadcastTimer: ReturnType<typeof setInterval> | null;
}

export function attachMetricsRelay(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws/metrics' });
  const rooms = new Map<string, Room>();

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
          const room: Room = {
            connections: [],
            interruptionDetector: detector,
            interruptionBroadcastTimer: null,
          };

          // Broadcast interruption counts to tutors every 1s
          room.interruptionBroadcastTimer = setInterval(() => {
            const counts = detector.getCounts();
            const payload = JSON.stringify({ type: 'interruptions', counts });
            for (const c of room.connections) {
              if (c.role === 'tutor' && c.ws.readyState === WebSocket.OPEN) {
                c.ws.send(payload);
              }
            }
          }, 1000);

          rooms.set(roomName, room);
        }

        conn = { ws, role, clockOffset: 0 };
        rooms.get(roomName)!.connections.push(conn);
        console.log(`[metricsRelay] ${role} joined room "${roomName}" (${rooms.get(roomName)!.connections.length} in room)`);
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
          room.interruptionDetector.push({
            participant: role,
            isSpeaking: data.isSpeaking,
            correctedTs: (data.timestamp as number) + offset,
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
            }
            rooms.delete(roomName);
          }
        }
      }
    });
  });

  console.log('[metricsRelay] WebSocket relay attached at /ws/metrics');
}
