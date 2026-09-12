import { describe, expect, it } from 'vitest';

import { createInitialState } from '../src/state/index.js';
import { createProfile } from '../src/state/profile.js';
import {
  createLocalMatchRepository,
  createLocalProfileRepository,
  createLocalStatsRepository,
  createRemoteRepositories,
} from '../src/state/repository.js';

function createStorage() {
  const entries = new Map();

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
}

describe('local repositories', () => {
  it('store and clear the profile', async () => {
    const repository = createLocalProfileRepository(createStorage());
    const profile = createProfile('Ana', { createdAt: 1 });

    expect(await repository.getProfile()).toBeNull();
    expect(await repository.saveProfile(profile)).toBe(true);
    expect(await repository.getProfile()).toEqual(profile);

    await repository.clearProfile();

    expect(await repository.getProfile()).toBeNull();
  });

  it('store and clear the statistics', async () => {
    const repository = createLocalStatsRepository(createStorage());
    const stats = [
      { profileId: 'p1', outcome: 'defeat', difficulty: 'easy', shots: 3, playedAt: 1 },
    ];

    expect(await repository.getStats()).toEqual([]);
    expect(await repository.saveStats(stats)).toBe(true);
    expect(await repository.getStats()).toEqual(stats);

    await repository.clearStats();

    expect(await repository.getStats()).toEqual([]);
  });

  it('store and clear the match in progress', async () => {
    const repository = createLocalMatchRepository(createStorage());
    const state = createInitialState();

    expect(await repository.getMatch()).toBeNull();
    expect(await repository.saveMatch(state)).toBe(true);
    expect(await repository.getMatch()).toEqual(state);

    await repository.clearMatch();

    expect(await repository.getMatch()).toBeNull();
  });

  it('degrade gracefully without a storage', async () => {
    expect(await createLocalProfileRepository(null).getProfile()).toBeNull();
    expect(await createLocalStatsRepository(null).getStats()).toEqual([]);
    expect(await createLocalMatchRepository(null).saveMatch(createInitialState())).toBe(false);
  });
});

describe('remote repositories', () => {
  it('are not available yet', () => {
    expect(() => createRemoteRepositories({ baseUrl: 'https://example.test' })).toThrow();
  });
});
