import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // 1. .env 파일의 변수를 불러옵니다 (로컬용)
    const env = loadEnv(mode, '.', '');
    
    // 2. Vercel(process.env)이나 로컬(env) 어디서든 키를 찾아냅니다.
    const finalApiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        // 3. 찾아낸 키를 앱에 확실하게 심어줍니다.
        'process.env.API_KEY': JSON.stringify(finalApiKey),
        'process.env.GEMINI_API_KEY': JSON.stringify(finalApiKey)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
