import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './authErrors';

describe('foutmeldingen bij inloggen', () => {
  it('legt uit dat nieuwe accounts uitgeschakeld zijn, ook zonder foutcode', () => {
    expect(authErrorMessage({ code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toMatch(/Allow new users to sign up/);
    expect(authErrorMessage({ message: 'Signups not allowed for this instance' })).toMatch(/Allow new users to sign up/);
  });

  it('vertaalt gekende fouten en laat onbekende ongewijzigd', () => {
    expect(authErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('E-mailadres of wachtwoord klopt niet.');
    expect(authErrorMessage({ message: 'User already registered' })).toMatch(/Inloggen/);
    expect(authErrorMessage({ message: 'Iets nieuws' })).toBe('Iets nieuws');
    expect(authErrorMessage(null)).toBe('Er ging iets mis.');
  });
});
