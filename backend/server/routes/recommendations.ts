import { Router } from 'express';
import { generateRecommendationsTraced } from '../langsmith/tracing.js';
import { getRoomData } from '../ws/metricsRelay.js';
import type { SummaryInput } from '../../../shared/types.js';

const router = Router();

router.post('/api/recommendations', async (req, res) => {
  try {
    const { roomName } = req.body;

    if (!roomName || typeof roomName !== 'string') {
      res.status(400).json({ error: 'Missing roomName' });
      return;
    }

    const roomData = getRoomData(roomName);
    if (!roomData) {
      res.status(404).json({ error: `Room "${roomName}" not found or already expired` });
      return;
    }

    const summary = roomData.accumulator.getSessionSummary(roomData.detector) as SummaryInput;
    const recommendations = await generateRecommendationsTraced(summary);

    // Mark as fetched so TTL cleanup can proceed
    roomData.accumulator.markFetched();

    res.json({ recommendations, summary });
  } catch (err) {
    console.error('[recommendations] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
