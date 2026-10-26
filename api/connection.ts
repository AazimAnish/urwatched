import { connectionResponse } from '../server/connection.ts';

export default {
  fetch(request: Request) {
    // This entry point runs on Vercel; Vite uses its separate local adapter.
    return connectionResponse(request, true);
  },
};
