import { DateTime } from 'luxon';
import type { getConfig } from './config';

export async function getLastFetchTime(
  env: Env,
  config: ReturnType<typeof getConfig>
) {
  // Retrieve the last processed timestamp (or epoch if none)
  const lastRetrievalKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;
  const lastRetrievalDate =
    (await env.AGENT_CACHE.get(lastRetrievalKey)) ?? fallbackDate;
  const lastRetrievalTime = DateTime.fromISO(lastRetrievalDate)
    .toUTC()
    .toMillis();

  console.log(
    `[DEBUG] Last retrieval time: ${new Date(lastRetrievalTime).toISOString()}`
  );

  return lastRetrievalTime;
}

export async function setLastFetchTime(
  env: Env,
  config: ReturnType<typeof getConfig>,
  lastFetchTime?: string | null
) {
  const lastRetrievalKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;

  console.log(
    `[DEBUG] Setting last fetch time to: ${lastFetchTime ?? fallbackDate}`
  );

  await env.AGENT_CACHE.put(lastRetrievalKey, lastFetchTime ?? fallbackDate);
}
