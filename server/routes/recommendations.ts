import { Router } from 'express';
import { generateRecommendationsTraced } from '../langsmith/tracing.js';

const router = Router();

router.post('/api/recommendations', async (req, res) => {
  try {
    const summary = req.body;

    if (!summary || typeof summary.durationMs !== 'number') {
      res.status(400).json({ error: 'Invalid summary input' });
      return;
    }

    const recommendations = await generateRecommendationsTraced(summary);
    res.json({ recommendations });
  } catch (err) {
    console.error('[recommendations] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
