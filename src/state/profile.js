/**
 * Player profile: pure logic, no DOM, no framework.
 *
 * The profile is a versioned JSON envelope, read defensively so a tampered or
 * outdated save is discarded instead of trusted. The `Storage` is injected so
 * the module stays testable and so a remote backend can replace it later.
 */

export const PROFILE_STORAGE_KEY = 'battleship.v3.profile';
export const PROFILE_VERSION = 1;
export const MAX_NAME_LENGTH = 24;

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 12;
const ID_PATTERN = /^[a-z0-9]{12}$/;

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {() => number} [random] Source of numbers in [0, 1), injected for tests.
 * @returns {string} A new random profile id.
 */
export function generateProfileId(random = Math.random) {
  let id = '';

  for (let index = 0; index < ID_LENGTH; index += 1) {
    id += ID_ALPHABET[Math.floor(random() * ID_ALPHABET.length) % ID_ALPHABET.length];
  }

  return id;
}

/**
 * @param {unknown} value
 * @returns {string|null} The trimmed, length-bounded name, or null when unusable.
 */
export function normalizeName(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const name = value.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);

  return name.length > 0 ? name : null;
}

/**
 * @param {string} name
 * @param {{ id?: string, createdAt?: number, random?: () => number }} [options]
 * @returns {object|null} A new profile, or null when the name is empty.
 */
export function createProfile(name, { id, createdAt = Date.now(), random } = {}) {
  const normalized = normalizeName(name);

  if (!normalized) {
    return null;
  }

  return { id: id ?? generateProfileId(random), name: normalized, createdAt };
}

/**
 * @param {object} profile
 * @param {string} name
 * @returns {object} The same profile with a new name, or the input when the name is unusable.
 */
export function renameProfile(profile, name) {
  const normalized = normalizeName(name);

  if (!normalized || normalized === profile.name) {
    return profile;
  }

  return { ...profile, name: normalized };
}

/**
 * @param {unknown} payload
 * @returns {object|null} A valid profile, or null when the payload is unusable.
 */
export function parseSavedProfile(payload) {
  if (!isRecord(payload) || payload.version !== PROFILE_VERSION || !isRecord(payload.profile)) {
    return null;
  }

  const { id, name, createdAt } = payload.profile;
  const normalized = normalizeName(name);

  if (typeof id !== 'string' || !ID_PATTERN.test(id) || !normalized) {
    return null;
  }

  if (!Number.isFinite(createdAt) || createdAt < 0) {
    return null;
  }

  return { id, name: normalized, createdAt };
}

/**
 * @param {object} profile
 * @returns {string} The versioned JSON envelope written to storage.
 */
export function serializeProfile(profile) {
  return JSON.stringify({ version: PROFILE_VERSION, profile });
}

/**
 * @param {Storage} [storage]
 * @param {object} profile
 * @returns {boolean} False when the profile could not be written.
 */
export function saveProfile(storage, profile) {
  if (!storage || !parseSavedProfile({ version: PROFILE_VERSION, profile })) {
    return false;
  }

  try {
    storage.setItem(PROFILE_STORAGE_KEY, serializeProfile(profile));
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {Storage} [storage]
 * @returns {object|null} The saved profile, or null when there is none.
 */
export function loadProfile(storage) {
  if (!storage) {
    return null;
  }

  let payload;

  try {
    const raw = storage.getItem(PROFILE_STORAGE_KEY);

    if (!raw) {
      return null;
    }

    payload = JSON.parse(raw);
  } catch {
    clearProfile(storage);
    return null;
  }

  const profile = parseSavedProfile(payload);

  if (!profile) {
    clearProfile(storage);
    return null;
  }

  return profile;
}

/**
 * @param {Storage} [storage]
 * @returns {void}
 */
export function clearProfile(storage) {
  try {
    storage?.removeItem(PROFILE_STORAGE_KEY);
  } catch {
    // A storage that refuses writes leaves nothing to clean up.
  }
}
