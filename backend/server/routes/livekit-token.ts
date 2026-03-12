import { Router } from 'express';
import { AccessToken } from 'livekit-server-sdk';

const router = Router();

router.post('/api/livekit-token', async (req, res) => {
  try {
    const { roomName, participantName, role } = req.body;

    if (!roomName || !participantName || !role) {
      res.status(400).json({ error: 'roomName, participantName, and role are required' });
      return;
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      res.status(500).json({ error: 'LiveKit credentials not configured' });
      return;
    }

    const identity = `${role}-${participantName}`;
    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      metadata: JSON.stringify({ role }),
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    const jwt = await token.toJwt();
    res.json({ token: jwt });
  } catch (err) {
    console.error('[livekit-token] Error:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
