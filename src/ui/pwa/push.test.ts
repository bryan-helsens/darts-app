import { describe, expect, it } from 'vitest';
import { urlBase64ToUint8Array } from './push';

describe('urlBase64ToUint8Array', () => {
  it('zet base64url (zonder opvulling) om naar bytes', () => {
    expect([...urlBase64ToUint8Array('AQID')]).toEqual([1, 2, 3]);
    // "-" en "_" zijn "+" en "/" in gewone base64; de opvulling wordt aangevuld.
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
    // Een publieke VAPID-sleutel is 65 bytes (ongecomprimeerd punt, begint met 0x04).
    const key = urlBase64ToUint8Array('BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U');
    expect(key.length).toBe(65);
    expect(key[0]).toBe(4);
  });
});
