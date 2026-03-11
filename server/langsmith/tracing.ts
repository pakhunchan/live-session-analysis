import { traceable } from 'langsmith/traceable';

interface SummaryInput {
  sessionId: string;
  durationMs: number;
  avgMetrics: {
    tutor: { eyeContactScore?: number; energyScore?: number };
    student: { eyeContactScore?: number; energyScore?: number };
  };
  totalInterruptions: number;
  talkTimeRatio: { tutor: number; student: number };
  engagementScore: number;
  keyMoments: Array<{
    timestamp: number;
    type: string;
    description: string;
    metrics: Record<string, unknown>;
  }>;
  nudgesTriggered: Array<{ type: string; [key: string]: unknown }>;
}

function formatMetricsPrompt(summary: SummaryInput): string {
  return JSON.stringify({
    durationMinutes: Math.round(summary.durationMs / 60_000),
    engagementScore: summary.engagementScore,
    totalInterruptions: summary.totalInterruptions,
    talkTimeRatio: summary.talkTimeRatio,
    avgStudentEyeContact: summary.avgMetrics.student?.eyeContactScore,
    avgStudentEnergy: summary.avgMetrics.student?.energyScore,
    avgTutorEyeContact: summary.avgMetrics.tutor?.eyeContactScore,
    avgTutorEnergy: summary.avgMetrics.tutor?.energyScore,
    keyMoments: summary.keyMoments.map((m) => ({
      type: m.type,
      description: m.description,
      timestampSec: Math.round(
        (m.timestamp - (summary.keyMoments[0]?.timestamp ?? m.timestamp)) / 1000,
      ),
    })),
    nudgesTriggered: summary.nudgesTriggered.map((n) => n.type),
  });
}

const SYSTEM_PROMPT = `You are a tutoring coach analyzing a completed tutoring session. Given session metrics, provide 3-5 specific, actionable recommendations for the tutor to improve future sessions. Be concise (1-2 sentences each). Focus on concrete behaviors, not abstract advice. Return a JSON array of strings.`;

function parseRecommendations(content: string): string[] {
  // Try JSON array extraction first (handles markdown code blocks)
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed) && parsed.every((item: unknown) => typeof item === 'string')) {
      return parsed;
    }
  }

  // Fallback: split by newlines
  return content
    .split('\n')
    .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
    .filter((line: string) => line.length > 10)
    .slice(0, 5);
}

export const generateRecommendationsTraced = traceable(
  async (summary: SummaryInput): Promise<string[]> => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not set');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        max_tokens: 600,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: formatMetricsPrompt(summary) },
        ],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';
    return parseRecommendations(content);
  },
  { name: 'generate_recommendations', run_type: 'llm' },
);
