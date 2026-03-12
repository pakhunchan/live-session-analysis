import { createServer } from 'http';
import { app } from './app.js';
import { attachMetricsRelay } from './ws/metricsRelay.js';

const PORT = process.env.PORT ?? 3001;

const server = createServer(app);
attachMetricsRelay(server);

server.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});
