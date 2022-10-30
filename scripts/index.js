require('dotenv').config()
const { providers, Contract, BigNumber, utils } = require('ethers')
const fetch = require('isomorphic-fetch')
const { DateTime } = require('luxon')
const erc20Abi = require('../abis/ERC20.json')
const swapAbi = require('../abis/Swap.json')

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

const SECONDS_IN_DAY = 86400
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

async function getLpBalance (contractAddress, account, provider, blockTag) {
  const contract = new Contract(contractAddress, erc20Abi, provider)
  return contract.balanceOf(account, { blockTag })
}

function getTokenDecimals (lpTokenAddress) {
  let tokenDecimals = 0
  if (lpTokenAddress.toLowerCase() === '0x2e17b8193566345a2Dd467183526dEdc42d2d5A8'.toLowerCase()) {
    tokenDecimals = 6
  }
  if (lpTokenAddress.toLowerCase() === '0xF753A50fc755c6622BBCAa0f59F0522f264F006e'.toLowerCase()) {
    tokenDecimals = 6
  }
  if (lpTokenAddress.toLowerCase() === '0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92'.toLowerCase()) {
    tokenDecimals = 18
  }
  if (lpTokenAddress.toLowerCase() === '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'.toLowerCase()) {
    tokenDecimals = 18
  }

  if (tokenDecimals === 0) {
    throw new Error('expected tokenDecimals to be set')
  }

  return tokenDecimals
}

function getSwapAddress (lpTokenAddress) {
  let swapAddress = '0x0000000000000000000000000000000000000000'
  if (lpTokenAddress.toLowerCase() === '0x2e17b8193566345a2Dd467183526dEdc42d2d5A8'.toLowerCase()) {
    swapAddress = '0x3c0FFAca566fCcfD9Cc95139FEF6CBA143795963'
  } else if (lpTokenAddress.toLowerCase() === '0xF753A50fc755c6622BBCAa0f59F0522f264F006e'.toLowerCase()) {
    swapAddress = '0xeC4B41Af04cF917b54AEb6Df58c0f8D78895b5Ef'
  } else if (lpTokenAddress.toLowerCase() === '0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92'.toLowerCase()) {
    swapAddress = '0xF181eD90D6CfaC84B8073FdEA6D34Aa744B41810'
  } else if (lpTokenAddress.toLowerCase() === '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'.toLowerCase()) {
    swapAddress = '0xaa30D6bba6285d0585722e2440Ff89E23EF68864'
  } else {
    throw new Error('unrecognized address')
  }

  return swapAddress
}

function getIsEth (lpTokenAddress) {
  let isEth = false
  if (lpTokenAddress.toLowerCase() === '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'.toLowerCase()) {
    isEth = true
  }

  return isEth
}

async function calculateAmountFromLp(swapContract, account, lpAmount, blockTag) {
  try {
    const amountResult = await swapContract.calculateRemoveLiquidityOneToken(account, lpAmount, 0, { blockTag })
    return amountResult
  } catch (err) {
    console.log('error', account, lpAmount.toString(), blockTag)
    console.trace()
    throw err
  }

  /*
  const virtualPrice = await swapContract.getVirtualPrice({ blockTag })
  const amountResult = lpAmount.mul(virtualPrice)
  return amountResult
  */
}

async function getNormalizedLpBalance (lpTokenAddress, account, provider, blockTag) {
  const lpBalance = await getLpBalance(lpTokenAddress, account, provider, blockTag)
  const tokenDecimals = getTokenDecimals(lpTokenAddress)
  const swapAddress = getSwapAddress(lpTokenAddress)
  const isEth = getIsEth(lpTokenAddress)
  const swapContract = new Contract(swapAddress, swapAbi, provider)
  let tokenAmount = BigNumber.from(0)
  if (lpBalance.gt(BigNumber.from(0))) {
    // const amountResult = await swapContract.calculateRemoveLiquidityOneToken(account, lpBalance, 0, { blockTag })
    const amountResult = await calculateAmountFromLp(swapContract, account, lpBalance, blockTag)

    // convert to 18 decimals
    tokenAmount = shiftBNDecimals(amountResult, 18 - tokenDecimals)
  }

  if (isEth) {
    const rate = BigNumber.from(STABLE_TOKEN_DAYS).div(BigNumber.from(ETH_TOKEN_DAYS))
    tokenAmount = rate.mul(tokenAmount)
  }

  return tokenAmount
}

async function getInitialBalance (account, provider, blockTag) {
  const usdcLpBalance = await getNormalizedLpBalance('0x2e17b8193566345a2Dd467183526dEdc42d2d5A8', account, provider, blockTag)
  const usdtLpBalance = await getNormalizedLpBalance('0xF753A50fc755c6622BBCAa0f59F0522f264F006e', account, provider, blockTag)
  const daiLpBalance = await getNormalizedLpBalance('0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92', account, provider, blockTag)
  const ethLpBalance = await getNormalizedLpBalance('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849', account, provider, blockTag)
  const initialBalance = usdcLpBalance.add(usdtLpBalance).add(daiLpBalance).add(ethLpBalance)
  return initialBalance
}

function hasCompleted (tokenSeconds) {
  return tokenSeconds.gt((BigNumber.from(STABLE_TOKEN_DAYS).mul(BigNumber.from(SECONDS_IN_DAY))).mul(BigNumber.from(10).pow(18)))
}

function getTokenDays (_tokenSeconds) {
  const tokenSeconds = Number(utils.formatUnits(_tokenSeconds.toString(), 18))
  const tokenDays = tokenSeconds / SECONDS_IN_DAY
  return tokenDays
}

function checkShouldSkip (address, checkZeroAddress) {
  address = address.toLowerCase()
  const zeroAddress = '0x0000000000000000000000000000000000000000'
  if (checkZeroAddress) {
    if (address === zeroAddress) {
      return true
    }
  }
  if (
    address === '0x09992Dd7B32f7b35D347DE9Bdaf1919a57d38E82'.toLowerCase() || // SNX OP rewards
    address === '0x95d6A95BECfd98a7032Ed0c7d950ff6e0Fa8d697'.toLowerCase() || // ETH HOP rewards
    address === '0xf587B9309c603feEdf0445aF4D3B21300989e93a'.toLowerCase() || // USDC HOP rewards
    address === '0x392B9780cFD362bD6951edFA9eBc31e68748b190'.toLowerCase() || // DAI HOP rewards
    address === '0xAeB1b49921E0D2D96FcDBe0D486190B2907B3e0B'.toLowerCase() || // USDT HOP rewards
    address === '0x25a5A48C35e75BD2EFf53D94f0BB60d5A00E36ea'.toLowerCase() // SNX HOP rewards
  ) {
    return true
  }

  return false
}

async function handleTransfer (event, provider, entities) {
  const blockTimestamp = event.blockTimestamp
  const fromAddress = event.args.from.toLowerCase()
  const toAddress = event.args.to.toLowerCase()
  const transferLpAmount = BigNumber.from(event.args.value)
  const lpTokenAddress = event.address
  const blockTag = event.blockNumber

  const tokenDecimals = getTokenDecimals(lpTokenAddress)
  const swapAddress = getSwapAddress(lpTokenAddress)
  const isEth = getIsEth(lpTokenAddress)

  let tokenAmount = BigNumber.from(0)
  {
    const swapContract = new Contract(swapAddress, swapAbi, provider)
    if (transferLpAmount.gt(BigNumber.from(0))) {
      // const amountResult = await swapContract.calculateRemoveLiquidityOneToken(fromAddress, transferLpAmount, 0, { blockTag })
      const amountResult = await calculateAmountFromLp(swapContract, fromAddress, transferLpAmount, blockTag)

      // convert to 18 decimals
      tokenAmount = shiftBNDecimals(amountResult, 18 - tokenDecimals)
    }
  }

  if (isEth) {
    const rate = BigNumber.from(STABLE_TOKEN_DAYS).div(BigNumber.from(ETH_TOKEN_DAYS))
    tokenAmount = rate.mul(tokenAmount)
  }

  {
    const shouldSkip = checkShouldSkip(fromAddress, true) || checkShouldSkip(toAddress)
    if (!shouldSkip) {
      const id = fromAddress
      let entity = entities[id]
      let isNew = false
      if (!entity) {
        isNew = true
        entity = { id }

        const initialBalance = await getInitialBalance(fromAddress, provider, blockTag)
        entity.totalBalance = initialBalance
        entity.lastUpdated = BigNumber.from(blockTimestamp)
        entity.tokenSeconds = BigNumber.from(0)
        entity._eventCount = BigNumber.from(0)
        const relativeTime = DateTime.fromSeconds(blockTimestamp).toRelative()
        console.log('set new (from)', id, relativeTime, 'initial', initialBalance.toString(), utils.formatUnits(initialBalance.toString(), 18))
      }

      let totalBalance = entity.totalBalance
      let tokenSeconds = entity.tokenSeconds
      let lastUpdated = entity.lastUpdated

      const campaignStarted = hasCampaignStarted(blockTimestamp)
      if (campaignStarted) {
        console.log('event after start date (from)', event.transactionHash, utils.formatUnits(event.args.value.toString(), 18))
        if (lastUpdated.lt(CAMPAIGN_START_TIMESTAMP)) {
          lastUpdated = CAMPAIGN_START_TIMESTAMP
        }

        tokenSeconds = tokenSeconds.add((BigNumber.from(blockTimestamp).sub(lastUpdated)).mul(totalBalance))
      }

      if (!isNew) {
        console.log('totalBalanceSub', utils.formatUnits(totalBalance, 18), utils.formatUnits(tokenAmount, 18), utils.formatUnits(totalBalance.sub(tokenAmount), 18))
        totalBalance = totalBalance.sub(tokenAmount)
        /*
        if (totalBalance.lt(0)) {
          totalBalance = BigNumber.from(0)
        }
        */
      }

      entity.account = fromAddress
      entity.lastUpdated = BigNumber.from(blockTimestamp)
      entity.totalBalance = totalBalance
      entity.tokenSeconds = tokenSeconds
      entity.completed = hasCompleted(tokenSeconds)
      entity._eventCount = entity._eventCount.add(BigNumber.from(1)) // for debugging

      console.log('entity update', getPrettifiedEntity(entity))

      entities[id] = entity
    }
  }

  {
    const shouldSkip = checkShouldSkip(toAddress, true) || checkShouldSkip(fromAddress)
    if (!shouldSkip) {
      const id = toAddress
      let entity = entities[id]
      let isNew = false
      if (!entity) {
        isNew = true
        entity = { id }

        const initialBalance = await getInitialBalance(toAddress, provider, blockTag)
        entity.totalBalance = initialBalance
        entity.lastUpdated = BigNumber.from(blockTimestamp)
        entity.tokenSeconds = BigNumber.from(0)
        entity._eventCount = BigNumber.from(0)
        const relativeTime = DateTime.fromSeconds(blockTimestamp).toRelative()
        console.log('set new (to)', id, relativeTime, 'initial', initialBalance.toString(), utils.formatUnits(initialBalance.toString(), 18))
      }

      let totalBalance = entity.totalBalance
      let tokenSeconds = entity.tokenSeconds
      let lastUpdated = entity.lastUpdated

      const campaignStarted = hasCampaignStarted(blockTimestamp)
      if (campaignStarted) {
        console.log('event after start date (to)', event.transactionHash, utils.formatUnits(event.args.value.toString(), 18))
        if (lastUpdated.lt(CAMPAIGN_START_TIMESTAMP)) {
          console.log('lastUpdated is before campaign start', lastUpdated)
          lastUpdated = CAMPAIGN_START_TIMESTAMP
        }

        const timeDiff = BigNumber.from(blockTimestamp).sub(lastUpdated)
        console.log('event after start date time diff', timeDiff.toString())
        tokenSeconds = tokenSeconds.add((timeDiff).mul(totalBalance))
        console.log('event after start date tokenSeconds', getTokenDays(tokenSeconds))
      }

      if (!isNew) {
        console.log('totalBalanceSub', utils.formatUnits(totalBalance, 18), utils.formatUnits(tokenAmount, 18), utils.formatUnits(totalBalance.add(tokenAmount), 18))
        totalBalance = totalBalance.add(tokenAmount)
      }

      entity.account = toAddress
      entity.lastUpdated = BigNumber.from(blockTimestamp)
      entity.totalBalance = totalBalance
      entity.tokenSeconds = tokenSeconds
      entity.completed = hasCompleted(tokenSeconds)
      entity._eventCount = entity._eventCount.add(BigNumber.from(1)) // for debugging

      entities[id] = entity
    }
  }
}

async function fetchLogsForAccount (account, provider) {
  console.log('account', account)
  if (!account) {
    throw new Error('account required')
  }
  const block = await provider.getBlock()

  let logs = []
  for (const lpTokenAddress in tokens) {
    const lpToken = new Contract(lpTokenAddress, erc20Abi, provider)
    console.log('getting logs for lp', lpTokenAddress)

    const startBlockNumber = 0
    const endBlockNumber = block.number

    for (let i = 0; i < 2; i++) {
      let filter = lpToken.filters.Transfer(null, [account])
      if (i === 1) {
        filter = lpToken.filters.Transfer([account], null)
      }
      const _logs = await lpToken.queryFilter(
        filter,
        startBlockNumber,
        endBlockNumber
      )

      for (const _log of _logs) {
        const block = await _log.getBlock()
        _log.blockTimestamp = block.timestamp
        for (const l of _logs) {
          if (l.transactionHash === _log.transactionHash) {
            continue
          }
        }
        logs.push(_log)
      }
    }
  }

  logs = logs.sort((a, b) => {
    if (a.blockTimestamp > b.blockTimestamp) return 1
    if (a.blockTimestamp < b.blockTimestamp) return -1

    if (a.logIndex > b.logIndex) return 1
    if (a.logIndex < b.logIndex) return -1
    return 0
  })

  console.log('logs', logs.length)
  // console.log('logs', logs.map(x => x.blockTimestamp))

  return logs
}

function getPrettifiedEntity (entity) {
  const account = entity.account
  const totalBalance = entity.totalBalance.toString()
  const totalBalanceFormatted = utils.formatUnits(entity.totalBalance.toString(), 18)
  const lastUpdated = entity.lastUpdated.toString()
  const tokenSeconds = entity.tokenSeconds.toString()
  const tokenSecondsFormatted = Number(utils.formatUnits(entity.tokenSeconds.toString(), 18))
  const tokenDaysFormatted = tokenSecondsFormatted / SECONDS_IN_DAY
  const eventCount = Number(entity._eventCount.toString())
  const completed = entity.completed
  return {
    account,
    totalBalance,
    totalBalanceFormatted,
    lastUpdated,
    tokenSeconds,
    tokenSecondsFormatted,
    tokenDaysFormatted,
    eventCount,
    completed
  }
}

async function makeRequest () {
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
      Accept: 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: {}
    })
  })
  const json = await res.json()
  return json.data.accounts
}

async function getLatestStateDebug () {
  const accounts = await makeRequest()
  const provider = new providers.StaticJsonRpcProvider('https://mainnet.optimism.io')
  const block = await provider.getBlock()
  const blockTimestamp = block.timestamp

  for (const { account, tokenSeconds, lastUpdated } of accounts) {
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
      // let tokenAmount = await swapContract.calculateRemoveLiquidityOneToken(account, lpBalance, 0, { blockTag })
      let tokenAmount = await calculateAmountFromLp(swapContract, account, lpBalance, blockTag)
      tokenAmount = shiftBNDecimals(tokenAmount, 18 - decimals)

      const isEth = lpTokenAddress === '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'
      if (isEth) {
        const rate = BigNumber.from(STABLE_TOKEN_DAYS).div(BigNumber.from(ETH_TOKEN_DAYS))
        tokenAmount = rate.mul(tokenAmount)
      }

      totalBalance = totalBalance.add(tokenAmount)
    }

    const _totalBalance = Number(utils.formatUnits(totalBalance.toString(), 18))
    const _tokenSeconds = Number(tokenSeconds) + ((blockTimestamp - Number(lastUpdated)) * _totalBalance)
    console.log(account, _totalBalance, _tokenSeconds)
  }
}

async function getInitialBalanceDebug () {
  const accounts = await makeRequest()
  const provider = new providers.StaticJsonRpcProvider('https://mainnet.optimism.io')
  const block = await provider.getBlock()
  const blockTimestamp = block.timestamp

  for (const { account, tokenSeconds, lastUpdated } of accounts) {
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
      // let tokenAmount = await swapContract.calculateRemoveLiquidityOneToken(account, lpBalance, 0)
      let tokenAmount = await calculateAmountFromLp(swapContract, account, lpBalance)
      tokenAmount = shiftBNDecimals(tokenAmount, 18 - decimals)

      const isEth = lpTokenAddress === '0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'
      if (isEth) {
        const rate = BigNumber.from(STABLE_TOKEN_DAYS).div(BigNumber.from(ETH_TOKEN_DAYS))
        tokenAmount = rate.mul(tokenAmount)
      }

      totalBalance = totalBalance.add(tokenAmount)
    }

    const _totalBalance = Number(utils.formatUnits(totalBalance.toString(), 18))
    const _tokenSeconds = Number(tokenSeconds) + ((blockTimestamp - Number(lastUpdated)) * _totalBalance)
    console.log(account, _totalBalance, _tokenSeconds)
  }
}

async function getEventsDebug () {
  const account = process.env.ACCOUNT_DEBUG
  const provider = new providers.StaticJsonRpcProvider(process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io')
  const block = await provider.getBlock()

  const entity = {}
  entity.account = account.toLowerCase()
  entity.totalBalance = BigNumber.from(0)
  entity.tokenSeconds = BigNumber.from(0)
  entity.lastUpdated = 0
  entity.eventCount = 0
  let eventCount = 0

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
    return 0
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

  let lastUpdated = 0
  let tokenSeconds = 0
  let totalBalance = 0

  for (const log of logs) {
    eventCount++
    const lpTokenAddress = log.address
    const decimals = tokenDecimals[lpTokenAddress]
    console.log('fromtoamount', log.args.from, log.args.to, utils.formatUnits(log.args.value.toString(), 18), lpTokenAddress)
    const lpBalance = log.args.value

    const swapAddress = tokens[lpTokenAddress]
    const swapContract = new Contract(swapAddress, swapAbi, provider)
    const blockTag = log.blockNumber
    const block = await provider.getBlock(blockTag)
    const blockTimestamp = Number(block.timestamp.toString())
    // let tokenAmount = await swapContract.calculateRemoveLiquidityOneToken(account, lpBalance, 0, { blockTag })
    let tokenAmount = await calculateAmountFromLp(swapContract, account, lpBalance, blockTag)
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
        // lastUpdated = blockTimestamp
        lastUpdated = Number(CAMPAIGN_START_TIMESTAMP.toString())
      }

      console.log('HERE0', totalBalance.toString(), utils.formatUnits(totalBalance.toString(), 18))
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
  console.log('totalBalance:', totalBalance.toString(), utils.formatUnits(totalBalance.toString(), 18))
  console.log('tokenSeconds:', tokenSeconds.toString(), utils.formatUnits(tokenSeconds.toString(), 18))
  console.log('lastUpdated:', lastUpdated.toString())
  console.log('eventCount:', eventCount)
}

async function runMapping (account, rpcUrl, startTimestamp = 0, endTimestamp = Math.floor(Date.now() / 1000)) {
  const provider = new providers.StaticJsonRpcProvider(rpcUrl || 'https://mainnet.optimism.io')
  const logs = await fetchLogsForAccount(account, provider)

  const triggerEvent = false
  if (triggerEvent) {
    logs.push({
      blockTimestamp: Math.floor(Date.now() / 1000),
      address: '0x2e17b8193566345a2Dd467183526dEdc42d2d5A8',
      args: {
        from: account,
        to: '0x0000000000000000000000000000000000000000',
        value: '0'
      }
    })
  }

  let filtered = logs.filter((x) => {
    console.log(x.blockTimestamp)
    return x.blockTimestamp >= startTimestamp && x.blockTimestamp <= endTimestamp
  })

  console.log('logsCount:', filtered.length)

  const entities = {}

  for (const log of filtered) {
    console.log('log:', log.args.from, log.args.to, utils.formatUnits(log.args.value.toString(), 18))
    await handleTransfer(log, provider, entities)
  }

  for (const key in entities) {
    const entity = entities[key]
    const prettied = getPrettifiedEntity(entity)
    console.log(prettied)
    return prettied
  }
}

module.exports = { runMapping }
