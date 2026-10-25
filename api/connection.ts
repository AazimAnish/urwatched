import { connectionResponse } from '../server/connection.ts';

export default {
  fetch(request: Request) {
    return connectionResponse(request, process.env.VERCEL === '1');
  },
};
