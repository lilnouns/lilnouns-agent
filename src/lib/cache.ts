import { DateTime } from 'luxon';
import type { getConfig } from './config';
import { createLogger } from './logger';

/**
 * Retrieves the last fetch timestamp from the cache.
 *
 * Gets the timestamp of the last successful message fetch operation from the
 * agent cache, falling back to a configured default date if no timestamp exists.
 *
 * @param {Env} env - The environment object containing cache dependencies.
 * @param {ReturnType<typeof getConfig>} config - The configuration object with cache keys and defaults.
 * @return {Promise<number>} A promise that resolves to the last fetch time in milliseconds.
 */
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

/**
 * Sets the last fetch timestamp in the cache.
 *
 * Stores the timestamp of the last successful message fetch operation in the
 * agent cache, using the provided date or falling back to a configured default.
 *
 * @param {Env} env - The environment object containing cache dependencies.
 * @param {ReturnType<typeof getConfig>} config - The configuration object with cache keys and defaults.
 * @param {string | null} [lastFetchDate] - The ISO date string to store, or null to use default.
 * @return {Promise<void>} A promise that resolves when the timestamp is stored.
 */
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
