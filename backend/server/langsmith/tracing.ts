import { traceable } from 'langsmith/traceable';
import type { SummaryInput } from '../../../shared/types.js';

function formatMetricsPrompt(summary: SummaryInput): string {
  const durationMin = Math.max(1, Math.round(summary.durationMs / 60_000));
  return JSON.stringify({
    durationMinutes: durationMin,
    engagementScore: summary.engagementScore,
    interruptionsPerMinute: +(summary.totalInterruptions / durationMin).toFixed(2),
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

const SYSTEM_PROMPT = `You are a tutoring coach analyzing a completed tutoring session. Given session metrics, provide 3-5 specific, actionable recommendations for the tutor to improve future sessions. Be concise (1-2 sentences each). Focus on concrete behaviors, not abstract advice. Return a JSON array of strings.

IMPORTANT: Only recommend changes for metrics that are actually problematic. Do NOT suggest improvements for metrics that are already in the "good" range.

## Metric interpretation

engagementScore (0-100):
  >= 80: Good. No action needed.
  60-79: Moderate. Could improve.
  < 60: Low. Needs attention.

interruptionsPerMinute:
  Low (near 0): Smooth turn-taking. No action needed.
  Moderate (occasional): Brief mention of turn-taking awareness.
  High (frequent): Strongly recommend explicit turn-taking strategies — pause after questions, use verbal cues like "what do you think?" to signal turns.

keyMoments:
  energy_drop: Student disengaged. Note the pattern — are drops clustered or spread out?
  attention_drop: Student looked away for extended period.
  long_silence: Extended pause — could be thinking time or confusion. If student-specific, the student hasn't spoken for an extended period.
  interruption_burst: Multiple interruptions in quick succession.

nudgesTriggered: Coaching alerts that fired during the session. If many of the same type, it indicates a recurring issue.`;

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

export const callLlmRaw = traceable(
  async (prompt: string): Promise<string> => {
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
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? '';
  },
  { name: 'llm_connectivity_check', run_type: 'llm' },
);

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
