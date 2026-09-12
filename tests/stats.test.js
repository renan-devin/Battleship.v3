import { describe, expect, it } from 'vitest';

import { createInitialState } from '../src/state/index.js';
import {
  STATS_STORAGE_KEY,
  STATS_VERSION,
  clearStats,
  createEmptyStats,
  createMatchRecord,
  loadStats,
  parseMatchRecord,
  rankProfiles,
  recordMatch,
  saveStats,
  serializeStats,
  summarizeProfile,
} from '../src/state/stats.js';

function createStorage(initial = {}) {
  const entries = new Map(Object.entries(initial));

  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
    get size() {
      return entries.size;
    },
  };
}

function finished(phase, { difficulty = 'easy', shots = 30 } = {}) {
  return {
    ...createInitialState(),
    phase,
    difficulty,
    turn: null,
    playerShots: Array.from({ length: shots }, (_unused, index) => ({
      row: Math.floor(index / 10),
      column: index % 10,
      hit: false,
      shipId: null,
    })),
  };
}

function record(profileId, outcome, shots, difficulty = 'easy', playedAt = 1) {
  return { profileId, outcome, difficulty, shots, playedAt };
}

describe('createMatchRecord', () => {
  it('captures the outcome, difficulty and player shot count', () => {
    const state = finished('victory', { difficulty: 'hard', shots: 40 });

    expect(createMatchRecord(state, { profileId: 'p1', playedAt: 5 })).toEqual(
      record('p1', 'victory', 40, 'hard', 5),
    );
  });

  it('carries the commander name when given', () => {
    const record = createMatchRecord(finished('victory'), { profileId: 'p1', profileName: 'Ana' });

    expect(record.profileName).toBe('Ana');
    expect(
      createMatchRecord(finished('victory'), { profileId: 'p1', profileName: '' }),
    ).not.toHaveProperty('profileName');
  });

  it('records defeats too', () => {
    expect(createMatchRecord(finished('defeat', { shots: 12 }), { profileId: 'p1' }).outcome).toBe(
      'defeat',
    );
  });

  it('returns null while the match is still running or without a profile', () => {
    expect(createMatchRecord(createInitialState(), { profileId: 'p1' })).toBeNull();
    expect(createMatchRecord(finished('victory'), { profileId: '' })).toBeNull();
  });
});

describe('recordMatch', () => {
  it('appends without mutating the history', () => {
    const stats = createEmptyStats();
    const next = recordMatch(stats, record('p1', 'victory', 30));

    expect(stats).toEqual([]);
    expect(next).toHaveLength(1);
    expect(recordMatch(next, null)).toBe(next);
  });
});

describe('saveStats and loadStats', () => {
  it('round trips the history', () => {
    const storage = createStorage();
    const stats = [record('p1', 'victory', 30), record('p2', 'defeat', 10, 'hard')];

    expect(saveStats(storage, stats)).toBe(true);
    expect(loadStats(storage)).toEqual(stats);
  });

  it('starts empty when nothing was saved or the storage is missing', () => {
    expect(loadStats(createStorage())).toEqual([]);
    expect(loadStats(null)).toEqual([]);
    expect(saveStats(null, [])).toBe(false);
    expect(saveStats(createStorage(), 'nope')).toBe(false);
    expect(() => clearStats(null)).not.toThrow();
  });

  it('drops only the malformed entries', () => {
    const storage = createStorage({
      [STATS_STORAGE_KEY]: serializeStats([
        record('p1', 'victory', 30),
        record('p1', 'victory', 5),
        record('p1', 'draw', 30),
        record('p1', 'defeat', 30, 'nightmare'),
        record('', 'defeat', 30),
        record('p1', 'defeat', 101),
        { ...record('p1', 'defeat', 30), profileName: 7 },
        'garbage',
      ]),
    });

    expect(loadStats(storage)).toEqual([record('p1', 'victory', 30)]);
  });

  it.each([
    ['unparsable JSON', '{not json'],
    ['a non-object payload', '[]'],
    ['another version', JSON.stringify({ version: 0, matches: [] })],
    ['a missing list', JSON.stringify({ version: STATS_VERSION })],
  ])('discards %s and starts clean', (_label, raw) => {
    const storage = createStorage({ [STATS_STORAGE_KEY]: raw });

    expect(loadStats(storage)).toEqual([]);
    expect(storage.size).toBe(0);
  });

  it('parseMatchRecord rejects non-objects', () => {
    expect(parseMatchRecord(null)).toBeNull();
    expect(parseMatchRecord(3)).toBeNull();
  });
});

describe('summarizeProfile', () => {
  const stats = [
    record('p1', 'victory', 40),
    record('p1', 'victory', 30, 'hard'),
    record('p1', 'defeat', 12),
    record('p2', 'defeat', 20),
  ];

  it('counts victories, defeats and the best and average winning shots', () => {
    expect(summarizeProfile(stats, 'p1')).toEqual({
      profileId: 'p1',
      played: 3,
      victories: 2,
      defeats: 1,
      bestShots: 30,
      averageShots: 35,
    });
  });

  it('filters by difficulty', () => {
    expect(summarizeProfile(stats, 'p1', { difficulty: 'hard' })).toMatchObject({
      played: 1,
      victories: 1,
      bestShots: 30,
    });
  });

  it('leaves the shot figures empty without a victory', () => {
    expect(summarizeProfile(stats, 'p2')).toMatchObject({
      victories: 0,
      defeats: 1,
      bestShots: null,
      averageShots: null,
    });
    expect(summarizeProfile(stats, 'ghost').played).toBe(0);
  });
});

describe('rankProfiles', () => {
  it('orders by victories, then by fewer average shots per victory', () => {
    const stats = [
      record('slow', 'victory', 60),
      record('slow', 'victory', 60),
      record('fast', 'victory', 30),
      record('fast', 'victory', 40),
      record('loser', 'defeat', 10),
      record('single', 'victory', 17),
    ];

    expect(rankProfiles(stats).map((entry) => entry.profileId)).toEqual([
      'fast',
      'slow',
      'single',
      'loser',
    ]);
    expect(rankProfiles(stats)[0]).toMatchObject({ rank: 1, averageShots: 35, bestShots: 30 });
  });

  it('breaks an average tie with the best single victory, then fewer defeats', () => {
    const stats = [
      record('a', 'victory', 30),
      record('a', 'victory', 50),
      record('b', 'victory', 40),
      record('b', 'victory', 40),
      record('c', 'victory', 40),
      record('c', 'victory', 40),
      record('c', 'defeat', 5),
    ];

    expect(rankProfiles(stats).map((entry) => entry.profileId)).toEqual(['a', 'b', 'c']);
  });

  it('attaches names and honours the difficulty filter', () => {
    const stats = [record('p1', 'victory', 30, 'hard'), record('p2', 'victory', 20, 'easy')];
    const ranking = rankProfiles(stats, { difficulty: 'hard', names: { p1: 'Ana' } });

    expect(ranking).toEqual([expect.objectContaining({ profileId: 'p1', name: 'Ana', rank: 1 })]);
  });

  it('falls back to the latest name recorded with the matches', () => {
    const stats = [
      { ...record('p1', 'victory', 30, 'easy', 1), profileName: 'Old' },
      { ...record('p1', 'defeat', 30, 'easy', 2), profileName: 'New' },
      record('p2', 'defeat', 30),
    ];

    expect(rankProfiles(stats).map((entry) => entry.name)).toEqual(['New', null]);
    expect(rankProfiles(stats, { names: { p1: 'Current' } })[0].name).toBe('Current');
  });

  it('is empty without history', () => {
    expect(rankProfiles([])).toEqual([]);
  });
});
