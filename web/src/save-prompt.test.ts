import { describe, expect, test } from 'vitest';
import { createSavePromptState } from './save-prompt.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}

describe('save prompt state', () => {
  test('stays quiet until a guest has harvested', () => {
    const state = createSavePromptState(memoryStorage());
    expect(state.isDue()).toBe(false);
    state.noteHarvest();
    expect(state.isDue()).toBe(true);
  });

  test('is offered once: answering it keeps it closed after later harvests and reloads', () => {
    const storage = memoryStorage();
    const state = createSavePromptState(storage);
    state.noteHarvest();
    state.settle();
    expect(state.isDue()).toBe(false);
    state.noteHarvest();
    expect(state.isDue()).toBe(false);
    expect(createSavePromptState(storage).isDue()).toBe(false);
  });

  test('remembers a pending prompt across a reload', () => {
    const storage = memoryStorage();
    createSavePromptState(storage).noteHarvest();
    expect(createSavePromptState(storage).isDue()).toBe(true);
  });

  test('still works for the session when browser storage is blocked', () => {
    const blocked = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const state = createSavePromptState(blocked);
    state.noteHarvest();
    expect(state.isDue()).toBe(true);
    state.settle();
    expect(state.isDue()).toBe(false);
  });
});
