/**
 * Eenmalig: een sleutelpaar (VAPID) voor de pushmeldingen maken.
 *
 *   npm run vapid
 *
 * Zet beide waarden in Netlify (Site configuration > Environment variables) en
 * deploy opnieuw. Bewaar de privésleutel nergens anders (niet in git). Een
 * nieuw paar maken betekent dat iedereen de meldingen opnieuw moet aanzetten.
 */

import webpush from 'web-push';

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
