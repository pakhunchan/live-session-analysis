import express from 'express';
import cors from 'cors';
import recommendationsRouter from './routes/recommendations.js';

const app = express();

app.use(cors());
app.use(express.json());
app.use(recommendationsRouter);

export { app };
