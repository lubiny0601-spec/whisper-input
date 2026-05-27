import {
  isShortcutModifierKey,
  modifierPrimaryFromCode,
  modifiersFromKeyboardLikeEvent,
  primaryFromKeyboardLikeEvent,
} from './ShortcutRecorder';

function assertEqual<T>(actual: T, expected: T, name: string) {
  if (actual !== expected) {
    throw new Error(`${name}: expected ${expected}, got ${actual}`);
  }
}

function assertDeepEqual(actual: unknown, expected: unknown, name: string) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${name}: expected ${expectedJson}, got ${actualJson}`);
  }
}

{
  assertEqual(
    isShortcutModifierKey('AltGraph'),
    true,
    'Windows right Alt / AltGr is treated as a modifier during recording',
  );
  assertEqual(
    modifierPrimaryFromCode('AltRight', 'AltGraph', { isMac: false, isWindows: true }),
    'RightAlt',
    'AltGraph on the physical right Alt key records RightAlt on Windows',
  );
  assertEqual(
    primaryFromKeyboardLikeEvent({
      key: 'AltGraph',
      code: 'AltRight',
      metaKey: false,
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
    }),
    '',
    'AltGraph is not recorded as a plain primary key',
  );
  assertDeepEqual(
    modifiersFromKeyboardLikeEvent({
      key: 'AltGraph',
      code: 'AltRight',
      metaKey: false,
      ctrlKey: true,
      altKey: true,
      shiftKey: false,
    }, { isMac: false, isWindows: true }),
    [],
    'AltGraph does not add synthetic ctrl/alt modifiers to a single-key shortcut',
  );
}
