require('dotenv').config()
const { runMapping } = require('./index')

const rpcUrl = process.env.OPTIMISM_RPC_URL

describe('test random account 1', () => {
  const account = '0x470c4462c67a3fab03901b81c0b96909f8330ca6'
  it('should return as completed', async () => {
    const startTimestamp = 0
    const endTimestamp = 1664471655
    const result = await runMapping(account, rpcUrl, startTimestamp, endTimestamp)
    console.log(result)
    expect(result.completed).toBe(true)
  }, 10 * 60 * 1000)
  it('should return as not completed', async () => {
    const startTimestamp = 0
    const endTimestamp = 1664471655 - 1
    const result = await runMapping(account, rpcUrl, startTimestamp, endTimestamp)
    expect(result.completed).toBe(false)
  }, 10 * 60 * 1000)
})

describe('test random account 2', () => {
  const account = '0xd6decaf8fd3f2f3b7eeed8b3d289a6afb680df27'
  it('should return as not completed', async () => {
    const startTimestamp = 0
    const endTimestamp = 1664788718
    const result = await runMapping(account, rpcUrl, startTimestamp, endTimestamp)
    expect(result.completed).toBe(false)
  }, 10 * 60 * 1000)
})

describe('test random account 3', () => {
  const account = '0xcea4e535d03086dbaa04c71675129654e92cc055'
  it('should return as completed', async () => {
    const startTimestamp = 0
    const endTimestamp = 1664788718
    const result = await runMapping(account, rpcUrl, startTimestamp, endTimestamp)
    expect(result.completed).toBe(true)
  }, 10 * 60 * 1000)
})

describe('test random account 4', () => {
  const account = '0x11f0f6b2bb2032f349940d7f87ad1b3ee13cffee'
  it('should return as completed', async () => {
    const startTimestamp = 0
    const endTimestamp = 1667180030
    const result = await runMapping(account, rpcUrl, startTimestamp, endTimestamp)
    console.log(result)
    expect(result.completed).toBe(true)
  }, 10 * 60 * 1000)
  it('should not return as completed', async () => {
    const startTimestamp = 0
    const endTimestamp = 1667098494 - 1
    const result = await runMapping(account, rpcUrl, startTimestamp, endTimestamp)
    console.log(result)
    expect(result.completed).toBe(false)
  }, 10 * 60 * 1000)
})

describe('test random account 5', () => {
  const account = '0x93242bb2b8f429a21c8d194ad88e7c4745e395a1'
  it('should return as completed', async () => {
    const startTimestamp = 0
    const endTimestamp = 1668883740
    const result = await runMapping(account, rpcUrl, startTimestamp, endTimestamp)
    expect(result.completed).toBe(true)
  }, 10 * 60 * 1000)
})
