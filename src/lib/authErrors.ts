/**
 * Foutmeldingen van Supabase Auth in begrijpelijk Nederlands, met waar
 * nodig de instelling die een beheerder in Supabase moet aanpassen.
 */

const BY_CODE: Record<string, string> = {
  signup_disabled:
    'Nieuwe accounts zijn uitgeschakeld. Een beheerder moet in Supabase “Allow new users to sign up” aanzetten (Authentication → Sign In / Providers).',
  email_provider_disabled:
    'Inloggen met e-mail staat uit. Een beheerder moet in Supabase de e-mailprovider aanzetten (Authentication → Sign In / Providers → Email).',
  invalid_credentials: 'E-mailadres of wachtwoord klopt niet.',
  user_already_exists: 'Er bestaat al een account met dit e-mailadres. Gebruik “Inloggen”.',
  email_exists: 'Er bestaat al een account met dit e-mailadres. Gebruik “Inloggen”.',
  email_not_confirmed:
    'Dit e-mailadres is nog niet bevestigd. Een beheerder kan in Supabase “Confirm email” uitzetten (Authentication → Sign In / Providers → Email).',
  weak_password: 'Dit wachtwoord is te zwak. Kies een langer wachtwoord met letters en cijfers.',
  email_address_invalid: 'Dit e-mailadres is ongeldig.',
  email_address_not_authorized:
    'Supabase mag naar dit e-mailadres geen bevestigingsmail sturen. Een beheerder moet in Supabase “Confirm email” uitzetten.',
  over_email_send_rate_limit: 'Er werden te veel e-mails verstuurd. Probeer het over een uur opnieuw.',
  over_request_rate_limit: 'Te veel pogingen. Wacht even en probeer opnieuw.',
  user_banned: 'Dit account is geblokkeerd.',
};

const BY_MESSAGE: Array<[RegExp, string]> = [
  [/signups not allowed/i, BY_CODE.signup_disabled],
  [/invalid login credentials/i, BY_CODE.invalid_credentials],
  [/user already registered/i, BY_CODE.user_already_exists],
  [/email not confirmed/i, BY_CODE.email_not_confirmed],
  [/rate limit/i, BY_CODE.over_request_rate_limit],
  [/failed to fetch|networkerror|load failed/i, 'Geen verbinding met de server. Controleer de wifi en probeer opnieuw.'],
];

export function authErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  if (!error) return 'Er ging iets mis.';
  if (error.code && BY_CODE[error.code]) return BY_CODE[error.code];
  const message = error.message ?? '';
  for (const [pattern, text] of BY_MESSAGE) if (pattern.test(message)) return text;
  return message || 'Er ging iets mis.';
}
