require('dotenv').config()
const { runMapping } = require('./index')

const account = process.env.ACCOUNT_DEBUG
const rpcUrl = process.env.OPTIMISM_RPC_URL

describe('test', () => {
  it('mapping', async () => {
    await runMapping(account, rpcUrl)
    expect(true).toBe(true)
  }, 10 * 60 * 1000)
})
