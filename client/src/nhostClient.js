import { NhostClient } from '@nhost/nhost-js';

const subdomain = import.meta.env.VITE_NHOST_SUBDOMAIN;
const region = import.meta.env.VITE_NHOST_REGION;

if (!subdomain || !region) {
  console.error(
    "⚠️ VoiceScribe: Nhost subdomain or region environment variables are missing! Make sure to add VITE_NHOST_SUBDOMAIN and VITE_NHOST_REGION to your environment variables."
  );
}

const nhost = new NhostClient({
  subdomain: subdomain || 'placeholder-subdomain',
  region: region || 'ap-south-1',
});

export default nhost;
