import { Address, BigInt } from "@graphprotocol/graph-ts"
import { ERC20, Transfer } from "../generated/ERC20/ERC20"
import { Swap } from "../generated/Swap/Swap"
import { Account, Received, Fulfilled } from "../generated/schema"

const SECONDS_IN_DAY = 86400
const STABLE_TOKEN_DAYS = 18250
const ETH_TOKEN_DAYS = 12 // STABLE_TOKEN_DAYS / 1500
const SNX_TOKEN_DAYS = 7300 // STABLE_TOKEN_DAYS / 2.50
const CAMPAIGN_START_TIMESTAMP = BigInt.fromI64(1663693200) // Sep 20 17:00 UTC

export function shiftBNDecimals (bn: BigInt, shiftAmount: number): BigInt {
  if (shiftAmount < 0) throw new Error('shiftAmount must be positive')
  return bn.times(BigInt.fromI64(10).pow(shiftAmount as u8))
}

export function getLpBalance(contractAddress: string, account: Address): BigInt {
  const contract = ERC20.bind(Address.fromString(contractAddress))
  const balanceCallResult = contract.try_balanceOf(account)
  let amountResult = BigInt.fromI64(0)
  if (balanceCallResult.reverted) {
    // throw new Error('call reverted in getLpBalance. account=' + account.toHexString() + ', contractAddress=' + contractAddress)
  } else {
    amountResult = balanceCallResult.value
  }
  return amountResult
}

export function getTokenDecimals(lpTokenAddress: Address): number {
  let tokenDecimals = 0
  if (
    lpTokenAddress.equals(Address.fromString('0x2e17b8193566345a2Dd467183526dEdc42d2d5A8')) || // usdc
    lpTokenAddress.equals(Address.fromString('0x3c0FFAca566fCcfD9Cc95139FEF6CBA143795963')) // saddle
  ) {
    tokenDecimals = 6
  }
  if (
    lpTokenAddress.equals(Address.fromString('0xF753A50fc755c6622BBCAa0f59F0522f264F006e')) || // usdt
    lpTokenAddress.equals(Address.fromString('0xeC4B41Af04cF917b54AEb6Df58c0f8D78895b5Ef')) // saddle
  ) {
    tokenDecimals = 6
  }
  if (
    lpTokenAddress.equals(Address.fromString('0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92')) || // dai
    lpTokenAddress.equals(Address.fromString('0xF181eD90D6CfaC84B8073FdEA6D34Aa744B41810')) // saddle
  ) {
    tokenDecimals = 18
  }
  if (
    lpTokenAddress.equals(Address.fromString('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849')) || // eth
    lpTokenAddress.equals(Address.fromString('0xaa30D6bba6285d0585722e2440Ff89E23EF68864')) // saddle
  ) {
    tokenDecimals = 18
  }
  if (
    lpTokenAddress.equals(Address.fromString('0xe63337211DdE2569C348D9B3A0acb5637CFa8aB3')) || // snx
    lpTokenAddress.equals(Address.fromString('0x1990BC6dfe2ef605Bfc08f5A23564dB75642Ad73')) // saddle
  ) {
    tokenDecimals = 18
  }

  if (tokenDecimals == 0) {
    throw new Error('expected tokenDecimals to be set')
  }

  return tokenDecimals
}

export function getSwapAddress(lpTokenAddress: Address): Address {
  let swapAddress = Address.fromString('0x0000000000000000000000000000000000000000')
  if (lpTokenAddress.equals(Address.fromString('0x2e17b8193566345a2Dd467183526dEdc42d2d5A8'))) {
    swapAddress = Address.fromString('0x3c0FFAca566fCcfD9Cc95139FEF6CBA143795963')
  } else if (lpTokenAddress.equals(Address.fromString('0xF753A50fc755c6622BBCAa0f59F0522f264F006e'))) {
    swapAddress = Address.fromString('0xeC4B41Af04cF917b54AEb6Df58c0f8D78895b5Ef')
  } else if (lpTokenAddress.equals(Address.fromString('0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92'))) {
    swapAddress = Address.fromString('0xF181eD90D6CfaC84B8073FdEA6D34Aa744B41810')
  } else if (lpTokenAddress.equals(Address.fromString('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'))) {
    swapAddress = Address.fromString('0xaa30D6bba6285d0585722e2440Ff89E23EF68864')
  } else if (lpTokenAddress.equals(Address.fromString('0xe63337211DdE2569C348D9B3A0acb5637CFa8aB3'))) {
    swapAddress = Address.fromString('0x1990BC6dfe2ef605Bfc08f5A23564dB75642Ad73')
  } else {
    throw new Error('unrecognized address')
  }

  return swapAddress
}

export function getIsEth(lpTokenAddress: Address): boolean {
  let isEth = false
  if (lpTokenAddress.equals(Address.fromString('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'))) {
    isEth = true
  }

  return isEth
}

export function getIsSnx(lpTokenAddress: Address): boolean {
  let isSnx = false
  if (lpTokenAddress.equals(Address.fromString('0xe63337211DdE2569C348D9B3A0acb5637CFa8aB3'))) {
    isSnx = true
  }

  return isSnx
}

export function calculateAmountFromLp (swapContract: Swap, account: Address, lpAmount: BigInt):BigInt {
  const callResult = swapContract.try_calculateRemoveLiquidityOneToken(account, lpAmount, 0)
  let amountResult = BigInt.fromI64(0)
  if (callResult.reverted) {
    // throw new Error('call reverted in calculateAmountFromLp')
  } else {
    amountResult = callResult.value
  }

  const tokenDecimals = getTokenDecimals(swapContract._address)
  const lpFeeBN = BigInt.fromI64(4).times(BigInt.fromI64(10).pow(tokenDecimals as u8))
  const lpFeeAmount = amountResult
    .times(lpFeeBN)
    .div(BigInt.fromI64(1).times(BigInt.fromI64(10).pow(tokenDecimals as u8)))
    .div(BigInt.fromI64(10000))

  return amountResult.plus(lpFeeAmount)
}

export function getNormalizedLpBalance(lpTokenAddress: string, account: Address): BigInt {
  const lpBalance = getLpBalance(lpTokenAddress, account)
  const tokenDecimals = getTokenDecimals(Address.fromString(lpTokenAddress))
  const swapAddress = getSwapAddress(Address.fromString(lpTokenAddress))
  const isEth = getIsEth(Address.fromString(lpTokenAddress))
  const isSnx = getIsSnx(Address.fromString(lpTokenAddress))
  const swapContract = Swap.bind(swapAddress)
  let tokenAmount = BigInt.fromI64(0)
  if (lpBalance.gt(BigInt.fromI64(0))) {
    const amountResult = calculateAmountFromLp(swapContract, account, lpBalance)

    // convert to 18 decimals
    tokenAmount = shiftBNDecimals(amountResult, 18 - tokenDecimals)
  }

  if (isEth) {
   const rate = BigInt.fromI64(STABLE_TOKEN_DAYS).div(BigInt.fromI64(ETH_TOKEN_DAYS))
   tokenAmount = rate.times(tokenAmount)
  } else if (isSnx) {
   const rate = BigInt.fromI64(STABLE_TOKEN_DAYS).div(BigInt.fromI64(SNX_TOKEN_DAYS))
   tokenAmount = rate.times(tokenAmount)
  }

  return tokenAmount
}

export function getInitialBalance(account: Address): BigInt {
  const usdcLpBalance = getNormalizedLpBalance('0x2e17b8193566345a2Dd467183526dEdc42d2d5A8', account)
  const usdtLpBalance = getNormalizedLpBalance('0xF753A50fc755c6622BBCAa0f59F0522f264F006e', account)
  const daiLpBalance = getNormalizedLpBalance('0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92', account)
  const ethLpBalance = getNormalizedLpBalance('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849', account)
  const snxLpBalance = getNormalizedLpBalance('0xe63337211DdE2569C348D9B3A0acb5637CFa8aB3', account)
  const initialBalance = usdcLpBalance.plus(usdtLpBalance).plus(daiLpBalance).plus(ethLpBalance).plus(snxLpBalance)
  return initialBalance
}

function hasCampaignStarted (blockTimestamp: BigInt): boolean {
  return (blockTimestamp.equals(CAMPAIGN_START_TIMESTAMP) || blockTimestamp.gt(CAMPAIGN_START_TIMESTAMP))
}

function hasCompleted (tokenSeconds: BigInt): boolean {
  return tokenSeconds.gt((BigInt.fromI64(STABLE_TOKEN_DAYS).times(BigInt.fromI64(SECONDS_IN_DAY))).times(BigInt.fromI64(10).pow(18)))
}

function checkShouldSkip (address: Address, checkZeroAddress: boolean = false): boolean {
  if (checkZeroAddress) {
    const zeroAddress = Address.fromString('0x0000000000000000000000000000000000000000')
    if (address.equals(zeroAddress)) {
      return false
    }
  }
  if (
    address.equals(Address.fromString('0x09992Dd7B32f7b35D347DE9Bdaf1919a57d38E82')) || // SNX OP rewards
    address.equals(Address.fromString('0x95d6A95BECfd98a7032Ed0c7d950ff6e0Fa8d697')) || // ETH HOP rewards
    address.equals(Address.fromString('0xf587B9309c603feEdf0445aF4D3B21300989e93a')) || // USDC HOP rewards
    address.equals(Address.fromString('0x392B9780cFD362bD6951edFA9eBc31e68748b190')) || // DAI HOP rewards
    address.equals(Address.fromString('0xAeB1b49921E0D2D96FcDBe0D486190B2907B3e0B')) || // USDT HOP rewards
    address.equals(Address.fromString('0x25a5A48C35e75BD2EFf53D94f0BB60d5A00E36ea')) // SNX HOP rewards
  ) {
    return true
  }

  return false
}

export function handleTransfer(event: Transfer): void {
  const blockTimestamp = event.params._event.block.timestamp
  const fromAddress = event.params.from
  const toAddress = event.params.to
  const transferLpAmount = event.params.value
  const lpTokenAddress = event.address

  const tokenDecimals = getTokenDecimals(lpTokenAddress)
  const swapAddress = getSwapAddress(lpTokenAddress)
  const isEth = getIsEth(lpTokenAddress)
  const isSnx = getIsSnx(lpTokenAddress)

  let tokenAmount = BigInt.fromI64(0)
  {
    const swapContract = Swap.bind(swapAddress)
    if (transferLpAmount.gt(BigInt.fromI64(0))) {
      const amountResult = calculateAmountFromLp(swapContract, fromAddress, transferLpAmount)

      // convert to 18 decimals
      tokenAmount = shiftBNDecimals(amountResult, 18 - tokenDecimals)
    }
  }

  if (isEth) {
   const rate = BigInt.fromI64(STABLE_TOKEN_DAYS).div(BigInt.fromI64(ETH_TOKEN_DAYS))
   tokenAmount = rate.times(tokenAmount)
  } else if (isSnx) {
   const rate = BigInt.fromI64(STABLE_TOKEN_DAYS).div(BigInt.fromI64(SNX_TOKEN_DAYS))
   tokenAmount = rate.times(tokenAmount)
  }

  {
    const shouldSkip = checkShouldSkip(fromAddress, true) || checkShouldSkip(toAddress)
    if (!shouldSkip) {
      const id = fromAddress.toHexString()
      let entity = Account.load(id)
      let isNew = false
      if (entity == null) {
        isNew = true
        entity = new Account(id)

        const initialBalance = getInitialBalance(fromAddress)
        entity.totalBalance = initialBalance
        entity.lastUpdated = blockTimestamp
        entity.tokenSeconds = BigInt.fromI64(0)
      }

      let totalBalance = entity.totalBalance
      let tokenSeconds = entity.tokenSeconds
      let lastUpdated = entity.lastUpdated

      const campaignStarted = hasCampaignStarted(blockTimestamp)
      if (campaignStarted) {
        if (lastUpdated.lt(CAMPAIGN_START_TIMESTAMP)) {
          lastUpdated = CAMPAIGN_START_TIMESTAMP
        }

        tokenSeconds = tokenSeconds.plus((blockTimestamp.minus(lastUpdated)).times(totalBalance))
      }

      if (!isNew) {
        totalBalance = totalBalance.minus(tokenAmount)
      }

      entity.account = fromAddress.toHexString()
      entity.lastUpdated = blockTimestamp
      entity.totalBalance = totalBalance
      entity.tokenSeconds = tokenSeconds
      entity.completed = hasCompleted(tokenSeconds)
      entity._eventCount = entity._eventCount.plus(BigInt.fromI64(1)) // for debugging

      entity.save()

      let receivedEntity = Received.load(id)
      if (receivedEntity == null) {
        receivedEntity = new Received(id)
        receivedEntity.recipient = fromAddress.toHexString()
        receivedEntity.save()
      }
      if (entity.completed) {
        let fulfilledEntity = Fulfilled.load(id)
        if (fulfilledEntity == null) {
          fulfilledEntity = new Fulfilled(id)
          fulfilledEntity.user = fromAddress.toHexString()
          fulfilledEntity.save()
        }
      }
    }
  }

  {
    const shouldSkip = checkShouldSkip(toAddress, true) || checkShouldSkip(fromAddress)
    if (!shouldSkip) {
      const id = toAddress.toHexString()
      let entity = Account.load(id)
      let isNew = false
      if (entity == null) {
        isNew = true
        entity = new Account(id)

        const initialBalance = getInitialBalance(toAddress)
        entity.totalBalance = initialBalance
        entity.lastUpdated = blockTimestamp
        entity.tokenSeconds = BigInt.fromI64(0)
      }

      let totalBalance = entity.totalBalance
      let tokenSeconds = entity.tokenSeconds
      let lastUpdated = entity.lastUpdated

      const campaignStarted = hasCampaignStarted(blockTimestamp)
      if (campaignStarted) {
        if (lastUpdated.lt(CAMPAIGN_START_TIMESTAMP)) {
          lastUpdated = CAMPAIGN_START_TIMESTAMP
        }

        tokenSeconds = tokenSeconds.plus((blockTimestamp.minus(lastUpdated)).times(totalBalance))
      }

      if (!isNew) {
        totalBalance = totalBalance.plus(tokenAmount)
      }

      entity.account = toAddress.toHexString()
      entity.lastUpdated = blockTimestamp
      entity.totalBalance = totalBalance
      entity.tokenSeconds = tokenSeconds
      entity.completed = hasCompleted(tokenSeconds)
      entity._eventCount = entity._eventCount.plus(BigInt.fromI64(1)) // for debugging

      entity.save()

      let receivedEntity = Received.load(id)
      if (receivedEntity == null) {
        receivedEntity = new Received(id)
        receivedEntity.recipient = toAddress.toHexString()
        receivedEntity.save()
      }
      if (entity.completed) {
        let fulfilledEntity = Fulfilled.load(id)
        if (fulfilledEntity == null) {
          fulfilledEntity = new Fulfilled(id)
          fulfilledEntity.user = toAddress.toHexString()
          fulfilledEntity.save()
        }
      }
    }
  }
}
