require('dotenv').config()
const { providers, Contract, BigNumber, utils } = require('ethers')
const fetch = require('isomorphic-fetch')
const erc20Abi = require('../abis/ERC20.json')
const swapAbi = require('../abis/Swap.json')

const STABLE_TOKEN_DAYS = 18250
const ETH_TOKEN_DAYS = 12
const CAMPAIGN_START_TIMESTAMP = BigNumber.from(1663693200) // Sep 20 17:00 UTC

function shiftBNDecimals (bn, shiftAmount) {
  if (shiftAmount < 0) throw new Error('shiftAmount must be positive')
  return bn.mul(BigNumber.from(10).pow(shiftAmount))
}

function hasCampaignStarted (blockTimestamp) {
  blockTimestamp = BigNumber.from(blockTimestamp)
  return (blockTimestamp.eq(CAMPAIGN_START_TIMESTAMP) || blockTimestamp.gt(CAMPAIGN_START_TIMESTAMP))
}

async function makeRequest() {
  const query = `
    query Accounts {
      accounts(first: 1000) {
        id
        account
        totalBalance
        tokenSeconds
        completed
        lastUpdated
      }
    }
  `
  const url = 'https://api.thegraph.com/subgraphs/name/hop-protocol/hop-galaxy-op'
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: {}
    })
  })
  const json = await res.json()
  return json.data.accounts
}

const tokens = {
  '0x2e17b8193566345a2Dd467183526dEdc42d2d5A8': '0x3c0FFAca566fCcfD9Cc95139FEF6CBA143795963',
  '0xF753A50fc755c6622BBCAa0f59F0522f264F006e': '0xeC4B41Af04cF917b54AEb6Df58c0f8D78895b5Ef',
  '0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92': '0xF181eD90D6CfaC84B8073FdEA6D34Aa744B41810',
  '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849': '0xaa30D6bba6285d0585722e2440Ff89E23EF68864'
}

const tokenDecimals = {
  '0x2e17b8193566345a2Dd467183526dEdc42d2d5A8': 6,
  '0xF753A50fc755c6622BBCAa0f59F0522f264F006e': 6,
  '0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92': 18,
  '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849': 18
}

async function getLatestState() {
  const accounts = await makeRequest()
  const provider = new providers.StaticJsonRpcProvider('https://mainnet.optimism.io')
  const block = await provider.getBlock()
  const blockTimestamp = block.timestamp

  for (const {account, tokenSeconds, lastUpdated} of accounts) {
    let totalBalance = BigNumber.from(0)
    for (const lpTokenAddress in tokens) {
      const decimals = tokenDecimals[lpTokenAddress]
      const lpToken = new Contract(lpTokenAddress, erc20Abi, provider)
      const lpBalance = await lpToken.balanceOf(account)
      if (lpBalance.eq(0)) {
        continue
      }

      const swapAddress = tokens[lpTokenAddress]
      const swapContract = new Contract(swapAddress, swapAbi, provider)
      let tokenAmount = await swapContract.calculateRemoveLiquidityOneToken(account, lpBalance, 0)
      tokenAmount = shiftBNDecimals(tokenAmount, 18 - decimals)

      const isEth = lpTokenAddress === '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'
      if (isEth) {
        const rate = BigInt.fromI64(STABLE_TOKEN_DAYS).div(BigInt.fromI64(ETH_TOKEN_DAYS))
        tokenAmount = rate.times(tokenAmount)
      }

      totalBalance = totalBalance.add(tokenAmount)
    }

    const _totalBalance = Number(utils.formatUnits(totalBalance.toString(), 18))
    const _tokenSeconds = Number(tokenSeconds) + ((blockTimestamp - Number(lastUpdated)) * _totalBalance)
    console.log(account, _totalBalance, _tokenSeconds)
  }
}

async function getEventsDebug() {
  const account = process.env.ACCOUNT_DEBUG
  const provider = new providers.StaticJsonRpcProvider(process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io')
  const block = await provider.getBlock()

  let totalBalance = BigNumber.from(0)
  let tokenSeconds = BigNumber.from(0)
  let lastUpdated = 0
  let logs = []
  for (const lpTokenAddress in tokens) {
    const lpToken = new Contract(lpTokenAddress, erc20Abi, provider)
    console.log(lpTokenAddress)

    const startBlockNumber = 0
    const endBlockNumber = block.number

    const filter = lpToken.filters.Transfer(null, [account, account])
    const _logs = await lpToken.queryFilter(
      filter,
      startBlockNumber,
      endBlockNumber
    )
    logs.push(..._logs)

    /*
    const batchSize = 2000
    const logs = []
    let start = startBlockNumber
    let end = start + batchSize
    while (end <= endBlockNumber && start < endBlockNumber) {
      const _logs = await lpToken.queryFilter(
        filter,
        start,
        end
      )
      console.log(start, end, _logs.length, new Date().toUTCString())
      logs.push(..._logs)
      start = end
      end = Math.min(start + batchSize, endBlockNumber)
      start = Math.min(start, endBlockNumber)
    }
    */
  }

  logs = logs.sort((a, b) => {
    if (a.blockNumber > b.blockNumber) return 1
    if (a.blockNumber < b.blockNumber) return -1

    if (a.logIndex > b.logIndex) return 1
    if (a.logIndex < b.logIndex) return -1
  })

  /*
  logs.push({
    blockNumber: 25381264,
    address: '0x2e17b8193566345a2Dd467183526dEdc42d2d5A8',
    args: {
      from: account,
      to: account,
      value: BigNumber.from(0),
    }
  })
  */

    for (const log of logs) {
      const lpTokenAddress = log.address
    const decimals = tokenDecimals[lpTokenAddress]
        console.log('fromtoamount', log.args.from, log.args.to, utils.formatUnits(log.args.value.toString(), 18), lpTokenAddress)
      const lpBalance = log.args.value

      const swapAddress = tokens[lpTokenAddress]
      const swapContract = new Contract(swapAddress, swapAbi, provider)
      const blockTag = log.blockNumber
      const block = await provider.getBlock(blockTag)
      const blockTimestamp = Number(block.timestamp.toString())
      let tokenAmount = await swapContract.calculateRemoveLiquidityOneToken(account, lpBalance, 0, { blockTag })
      tokenAmount = shiftBNDecimals(tokenAmount, 18 - decimals)

      const isEth = lpTokenAddress === '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'
      if (isEth) {
        const rate = BigNumber.from(STABLE_TOKEN_DAYS).div(BigNumber.from(ETH_TOKEN_DAYS))
        tokenAmount = rate.mul(tokenAmount)
      }

      totalBalance = totalBalance.add(tokenAmount)

      const campaignStarted = hasCampaignStarted(blockTimestamp)
      if (campaignStarted) {
        if (BigNumber.from(lastUpdated).lt(CAMPAIGN_START_TIMESTAMP)) {
          console.log('HERE')
          lastUpdated = blockTimestamp // Number(CAMPAIGN_START_TIMESTAMP.toString())
        }

        console.log('HERE0', totalBalance.toString())
        console.log('HERE1', blockTimestamp, lastUpdated, blockTimestamp - lastUpdated)
        console.log('HERE2', BigNumber.from(blockTimestamp - lastUpdated).mul(totalBalance).toString())
        tokenSeconds = tokenSeconds.add(BigNumber.from(blockTimestamp - lastUpdated).mul(totalBalance))
      }

      lastUpdated = blockTimestamp

      console.log('totalBalance:', totalBalance.toString(), utils.formatUnits(totalBalance.toString(), 18))
      console.log('tokenSeconds:', utils.formatUnits(tokenSeconds.toString(), 18), utils.formatUnits(tokenSeconds.toString(), 18) / 86400)
      console.log('lastUpdated:', lastUpdated.toString())
    }

    console.log('---')
    console.log('totalBalance:', totalBalance.toString())
    console.log('tokenSeconds:', tokenSeconds.toString())
    console.log('lastUpdated:', lastUpdated.toString())
}

// getLatestState().catch(console.error)
getEventsDebug().catch(console.error)
