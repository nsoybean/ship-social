import { defineConfig } from '@hey-api/openapi-ts';

export default defineConfig({
  input: './openapi.yaml',
  output: {
    path: './lib/api-client',
    postProcess: ['prettier'],
  },
  plugins: [
    '@hey-api/typescript',
    {
      name: '@hey-api/sdk',
      transformer: false,
    },
    {
      name: '@hey-api/client-fetch',
    },
  ],
});
