import { getDb } from './mongo.js';
import { isMatchCompletedEvent } from './events.js';

const webhookUrl = process.env.WEBHOOK_URL;

/**
 * Handles one MatchCompletedEvent: persists a notification record, then
 * (only if WEBHOOK_URL is actually configured) dispatches it to a real
 * endpoint. No webhook target is configured anywhere in this project yet -
 * faking a call to nowhere would be worse than not having it, so this stays
 * a genuine no-op with a log line until a real target exists.
 */
export async function handleMatchCompleted(payload: unknown): Promise<void> {
  if (!isMatchCompletedEvent(payload)) {
    throw new Error(`payload is not a recognizable MatchCompletedEvent: ${JSON.stringify(payload)}`);
  }

  const doc = {
    applicationId: payload.ApplicationId,
    userId: payload.UserId,
    status: payload.Status,
    matchScore: payload.MatchScore,
    gapAnalysisPreview: payload.GapAnalysis?.slice(0, 280) ?? null,
    completedAt: payload.CompletedAt,
    receivedAt: new Date().toISOString(),
  };

  await getDb().collection('notifications').insertOne(doc);
  console.log(
    `[handler] recorded notification for application ${payload.ApplicationId} (${payload.Status})`,
  );

  if (webhookUrl) {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doc),
    });
    if (!res.ok) {
      throw new Error(`webhook dispatch failed: ${res.status} ${res.statusText}`);
    }
    console.log(`[handler] dispatched webhook for application ${payload.ApplicationId}`);
  }
}
