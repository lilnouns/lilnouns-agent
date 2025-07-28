import { DateTime } from 'luxon';
import type { getConfig } from './config';
import { createLogger } from './logger';

export async function getLastFetchTime(
  env: Env,
  config: ReturnType<typeof getConfig>
) {
  const logger = createLogger(env).child({
    module: 'cache',
    function: 'getLastFetchTime',
  });

  // Retrieve the last processed timestamp (or epoch if none)
  const lastFetchKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;
  const lastFetchDate =
    (await env.AGENT_CACHE.get(lastFetchKey)) ?? fallbackDate;
  const lastFetchMillis = DateTime.fromISO(lastFetchDate).toUTC().toMillis();

  logger.debug(
    { lastFetchTime: new Date(lastFetchMillis).toISOString() },
    'Retrieved last fetch time'
  );

  return lastFetchMillis;
}

export async function setLastFetchTime(
  env: Env,
  config: ReturnType<typeof getConfig>,
  lastFetchDate?: string | null
) {
  const logger = createLogger(env).child({
    module: 'cache',
    function: 'setLastFetchTime',
  });

  const lastFetchKey = config.agent.cacheKeys.lastFetch;
  const fallbackDate = config.agent.defaults.fallbackDate;
  const valueToSet = lastFetchDate ?? fallbackDate;

  logger.debug({ newFetchTime: valueToSet }, 'Setting last fetch time');

  await env.AGENT_CACHE.put(lastFetchKey, valueToSet);
}
