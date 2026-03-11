import express from 'express';
import cors from 'cors';
import recommendationsRouter from './routes/recommendations.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());
app.use(recommendationsRouter);

app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});
