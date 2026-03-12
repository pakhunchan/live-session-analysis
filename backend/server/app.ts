import express from 'express';
import cors from 'cors';
import recommendationsRouter from './routes/recommendations.js';
import livekitTokenRouter from './routes/livekit-token.js';
import healthRouter from './routes/health.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(recommendationsRouter);
app.use(livekitTokenRouter);
app.use(healthRouter);

export { app };
