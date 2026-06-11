// The bouncer passcode is kept on the device and sent with every
// toggle_ticket call — the server validates it on each state change,
// so passing the gate once grants nothing by itself.
const STORAGE_KEY = 'partysecurity_bouncer_passcode';
const LEGACY_FLAG_KEY = 'partysecurity_bouncer_ok';

export function getBouncerPasscode(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setBouncerPasscode(passcode: string) {
  try {
    localStorage.setItem(STORAGE_KEY, passcode);
  } catch {
    // localStorage disabled — they will get prompted again next visit
  }
}

export function clearBouncerPasscode() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_FLAG_KEY);
  } catch {
    // ignore
  }
}
