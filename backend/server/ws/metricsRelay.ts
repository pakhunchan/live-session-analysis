import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';

interface RoomConnection {
  ws: WebSocket;
  role: 'tutor' | 'student';
}

interface Room {
  connections: RoomConnection[];
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
          rooms.set(roomName, { connections: [] });
        }
        rooms.get(roomName)!.connections.push({ ws, role });
        console.log(`[metricsRelay] ${role} joined room "${roomName}" (${rooms.get(roomName)!.connections.length} in room)`);
        return;
      }

      // Clock-sync: respond immediately with server timestamp
      if (msg.type === 'clock-sync' && typeof msg.clientTs === 'number') {
        ws.send(JSON.stringify({
          type: 'clock-sync-ack',
          clientTs: msg.clientTs,
          serverTs: Date.now(),
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
          for (const conn of room.connections) {
            if (conn.role === 'tutor' && conn.ws.readyState === WebSocket.OPEN) {
              conn.ws.send(relay);
            }
          }
        }
        // Tutor metrics: stamped and stored (future logging) but NOT echoed back
      }
    });

    ws.on('close', () => {
      if (roomName) {
        const room = rooms.get(roomName);
        if (room) {
          room.connections = room.connections.filter((c) => c.ws !== ws);
          console.log(`[metricsRelay] ${role} left room "${roomName}" (${room.connections.length} remaining)`);
          if (room.connections.length === 0) {
            rooms.delete(roomName);
          }
        }
      }
    });
  });

  console.log('[metricsRelay] WebSocket relay attached at /ws/metrics');
}
