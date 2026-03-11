import type { SessionSummary } from '../types/session';

type SummaryInput = Omit<SessionSummary, 'recommendations'>;

/**
 * Fetch coaching recommendations from OpenAI, falling back to rule-based
 * recommendations on failure or missing API key.
 */
export async function fetchRecommendations(
  summary: SummaryInput,
  apiKey: string,
): Promise<string[]> {
  try {
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
          {
            role: 'system',
            content: `You are a tutoring coach analyzing a completed tutoring session. Given session metrics, provide 3-5 specific, actionable recommendations for the tutor to improve future sessions. Be concise (1-2 sentences each). Focus on concrete behaviors, not abstract advice. Return a JSON array of strings.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              durationMinutes: Math.round(summary.durationMs / 60_000),
              engagementScore: summary.engagementScore,
              totalInterruptions: summary.totalInterruptions,
              talkTimeRatio: summary.talkTimeRatio,
              avgStudentEyeContact: summary.avgMetrics.student?.eyeContactScore,
              avgStudentEnergy: summary.avgMetrics.student?.energyScore,
              avgTutorEyeContact: summary.avgMetrics.tutor?.eyeContactScore,
              avgTutorEnergy: summary.avgMetrics.tutor?.energyScore,
              keyMoments: summary.keyMoments.map(m => ({
                type: m.type,
                description: m.description,
                timestampSec: Math.round((m.timestamp - (summary.keyMoments[0]?.timestamp ?? m.timestamp)) / 1000),
              })),
              nudgesTriggered: summary.nudgesTriggered.map(n => n.type),
            }),
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? '';

    // Parse JSON array from response (handle markdown code blocks)
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed) && parsed.every((item: unknown) => typeof item === 'string')) {
        return parsed;
      }
    }

    // If response isn't a clean JSON array, split by newlines
    return content
      .split('\n')
      .map((line: string) => line.replace(/^\d+\.\s*/, '').trim())
      .filter((line: string) => line.length > 10)
      .slice(0, 5);
  } catch (err) {
    console.warn('[Recommendations] OpenAI call failed, using rule-based fallback:', err);
    return generateFallbackRecommendations(summary);
  }
}

/** Rule-based recommendations when OpenAI is unavailable */
export function generateFallbackRecommendations(summary: SummaryInput): string[] {
  const recs: string[] = [];

  if (summary.talkTimeRatio.tutor > 0.7) {
    recs.push(
      'Try asking more open-ended questions to increase student participation — the tutor spoke for over 70% of the session.',
    );
  }

  if ((summary.avgMetrics.student?.eyeContactScore ?? 1) < 0.4) {
    recs.push(
      'Student eye contact was low on average. Consider checking in more frequently to re-engage, or use visual aids to draw attention back.',
    );
  }

  if (summary.totalInterruptions > 5) {
    recs.push(
      `There were ${summary.totalInterruptions} interruptions during the session. Practice pausing after questions to give the student time to respond.`,
    );
  }

  if ((summary.avgMetrics.student?.energyScore ?? 1) < 0.35) {
    recs.push(
      'Student energy was consistently low. Try incorporating brief activities or topic changes to boost engagement.',
    );
  }

  const attentionDrops = summary.keyMoments.filter(m => m.type === 'attention_drop').length;
  if (attentionDrops >= 2) {
    recs.push(
      `Student attention dropped ${attentionDrops} times. Break complex explanations into smaller chunks with comprehension checks.`,
    );
  }

  if (summary.engagementScore < 40) {
    recs.push(
      'Overall engagement was below 40%. Consider starting sessions with a warm-up question and varying your teaching pace.',
    );
  }

  const longSilences = summary.keyMoments.filter(m => m.type === 'long_silence').length;
  if (longSilences > 0) {
    recs.push(
      'Extended silences were detected. If the student seems stuck, offer a hint or rephrase the question to reduce pressure.',
    );
  }

  // Always return at least one recommendation
  if (recs.length === 0) {
    recs.push(
      'Session metrics look solid! Continue maintaining good eye contact and balanced talk time.',
    );
  }

  return recs.slice(0, 5);
}
