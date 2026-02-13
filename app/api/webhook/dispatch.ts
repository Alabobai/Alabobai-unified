export const config = {
  runtime: 'edge',
}

import webhookHandler from '../webhook'

export default async function handler(req: Request) {
  return webhookHandler(req)
}
