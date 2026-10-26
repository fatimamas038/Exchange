declare global {
  namespace NodeJS {
    interface ProcessEnv {
      PORT: string;
      DATABASE: string;
      PGUSER: string;
      PASSWORD: string;
      NODE_ENV: 'development' | 'production';
      HOST: string;
    }
  }
}

export {};

