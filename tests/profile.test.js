import { describe, expect, it } from 'vitest';

import {
  MAX_NAME_LENGTH,
  PROFILE_STORAGE_KEY,
  PROFILE_VERSION,
  clearProfile,
  createProfile,
  generateProfileId,
  loadProfile,
  normalizeName,
  parseSavedProfile,
  renameProfile,
  saveProfile,
  serializeProfile,
} from '../src/state/profile.js';

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

describe('createProfile', () => {
  it('generates an id and keeps the trimmed name', () => {
    const profile = createProfile('  Admiral   Nelson  ', { createdAt: 42 });

    expect(profile).toEqual({
      id: expect.stringMatching(/^[a-z0-9]{12}$/),
      name: 'Admiral Nelson',
      createdAt: 42,
    });
  });

  it('refuses an empty name', () => {
    expect(createProfile('')).toBeNull();
    expect(createProfile('   ')).toBeNull();
    expect(createProfile(undefined)).toBeNull();
  });

  it('caps the name length', () => {
    expect(createProfile('x'.repeat(100)).name).toHaveLength(MAX_NAME_LENGTH);
  });

  it('uses the injected random source for the id', () => {
    expect(generateProfileId(() => 0)).toBe('a'.repeat(12));
    expect(createProfile('Ana', { random: () => 0 }).id).toBe('a'.repeat(12));
  });
});

describe('normalizeName and renameProfile', () => {
  it('normalizes whitespace', () => {
    expect(normalizeName(' a \n b ')).toBe('a b');
    expect(normalizeName(7)).toBeNull();
  });

  it('keeps the id when renaming and ignores unusable names', () => {
    const profile = createProfile('Ana', { id: 'abcdefghijkl', createdAt: 1 });

    expect(renameProfile(profile, 'Bia')).toEqual({ ...profile, name: 'Bia' });
    expect(renameProfile(profile, '   ')).toBe(profile);
    expect(renameProfile(profile, 'Ana')).toBe(profile);
  });
});

describe('saveProfile and loadProfile', () => {
  it('round trips a profile', () => {
    const storage = createStorage();
    const profile = createProfile('Ana', { createdAt: 1 });

    expect(saveProfile(storage, profile)).toBe(true);
    expect(loadProfile(storage)).toEqual(profile);
  });

  it('returns null when nothing was saved or the storage is missing', () => {
    expect(loadProfile(createStorage())).toBeNull();
    expect(loadProfile(null)).toBeNull();
    expect(saveProfile(null, createProfile('Ana'))).toBe(false);
    expect(() => clearProfile(null)).not.toThrow();
  });

  it('refuses to save an invalid profile', () => {
    const storage = createStorage();

    expect(saveProfile(storage, { id: 'nope', name: 'Ana', createdAt: 1 })).toBe(false);
    expect(storage.size).toBe(0);
  });

  it('reports a storage that refuses to write', () => {
    const failing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
      removeItem: () => {},
    };

    expect(saveProfile(failing, createProfile('Ana'))).toBe(false);
  });

  it('clears the saved profile', () => {
    const storage = createStorage();

    saveProfile(storage, createProfile('Ana'));
    clearProfile(storage);

    expect(loadProfile(storage)).toBeNull();
  });
});

describe('corrupted profiles', () => {
  it.each([
    ['unparsable JSON', '{not json'],
    ['a non-object payload', '"ana"'],
    ['another version', JSON.stringify({ version: 0, profile: createProfile('Ana') })],
    ['a missing profile', JSON.stringify({ version: PROFILE_VERSION })],
    ['an empty name', serializeProfile({ id: 'abcdefghijkl', name: '  ', createdAt: 1 })],
    ['a malformed id', serializeProfile({ id: 'ABC', name: 'Ana', createdAt: 1 })],
    ['a bad timestamp', serializeProfile({ id: 'abcdefghijkl', name: 'Ana', createdAt: 'now' })],
  ])('discards %s', (_label, raw) => {
    const storage = createStorage({ [PROFILE_STORAGE_KEY]: raw });

    expect(loadProfile(storage)).toBeNull();
    expect(storage.size).toBe(0);
  });

  it('parseSavedProfile rejects anything that is not a versioned envelope', () => {
    expect(parseSavedProfile(null)).toBeNull();
    expect(parseSavedProfile([])).toBeNull();
    expect(parseSavedProfile({ profile: createProfile('Ana') })).toBeNull();
  });
});
