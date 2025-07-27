import { DateTime } from 'luxon';
import type { getConfig } from './config';

export async function getLastFetchTime(
  env: Env,
  config: ReturnType<typeof getConfig>
) {
  // Retrieve the last processed timestamp (or epoch if none)
  const lastFetchKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;
  const lastFetchDate =
    (await env.AGENT_CACHE.get(lastFetchKey)) ?? fallbackDate;
  const lastFetchMillis = DateTime.fromISO(lastFetchDate).toUTC().toMillis();

  console.log(
    `[DEBUG] Last retrieval time: ${new Date(lastFetchMillis).toISOString()}`
  );

  return lastFetchMillis;
}

export async function setLastFetchTime(
  env: Env,
  config: ReturnType<typeof getConfig>,
  lastFetchDate?: string | null
) {
  const lastFetchKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;

  console.log(
    `[DEBUG] Setting last fetch time to: ${lastFetchDate ?? fallbackDate}`
  );

  await env.AGENT_CACHE.put(lastFetchKey, lastFetchDate ?? fallbackDate);
}
