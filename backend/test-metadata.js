import fetch from 'node-fetch'; // Next.js fetch polyfill is global, so we can just use fetch

async function getEmail() {
  try {
    const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/email', {
      headers: { 'Metadata-Flavor': 'Google' }
    });
    const email = await res.text();
    console.log("Email:", email);
  } catch (e) {
    console.error(e);
  }
}
getEmail();
