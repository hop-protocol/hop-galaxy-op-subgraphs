import { Address, BigInt } from "@graphprotocol/graph-ts"
import { ERC20, Transfer } from "../generated/ERC20/ERC20"
import { Swap } from "../generated/Swap/Swap"
import { Account } from "../generated/schema"

const STABLE_TOKEN_DAYS = 36500
const ETH_TOKEN_DAYS = 24

export function shiftBNDecimals (bn: BigInt, shiftAmount: number): BigInt {
  if (shiftAmount < 0) throw new Error('shiftAmount must be positive')
  return bn.times(BigInt.fromI64(10).pow(shiftAmount as u8))
}

export function getLpBalance(contractAddress: string, account: Address): BigInt {
  const contract = ERC20.bind(Address.fromString(contractAddress))
  const balanceCallResult = contract.try_balanceOf(account)
  if (balanceCallResult.reverted) {
    throw new Error('call reverted in getLpBalance')
  }
  return balanceCallResult.value
}

export function getTokenDecimals(lpTokenAddress: Address): number {
  let tokenDecimals = 0
  if (lpTokenAddress.equals(Address.fromString('0x2e17b8193566345a2Dd467183526dEdc42d2d5A8'))) {
    tokenDecimals = 6
  }
  if (lpTokenAddress.equals(Address.fromString('0xF753A50fc755c6622BBCAa0f59F0522f264F006e'))) {
    tokenDecimals = 6
  }
  if (lpTokenAddress.equals(Address.fromString('0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92'))) {
    tokenDecimals = 18
  }
  if (lpTokenAddress.equals(Address.fromString('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'))) {
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

export function getNormalizedLpBalance(lpTokenAddress: string, account: Address): BigInt {
  const lpBalance = getLpBalance(lpTokenAddress, account)
  const tokenDecimals = getTokenDecimals(Address.fromString(lpTokenAddress))
  const swapAddress = getSwapAddress(Address.fromString(lpTokenAddress))
  const isEth = getIsEth(Address.fromString(lpTokenAddress))
  const swapContract = Swap.bind(swapAddress)
  let tokenAmount = BigInt.fromI64(0)
  if (lpBalance.gt(BigInt.fromI64(0))) {
    const callResult = swapContract.try_calculateRemoveLiquidityOneToken(account, lpBalance, 0)
    if (callResult.reverted) {
      throw new Error('call reverted in getNormalizedLpBalance')
    }
    const amountResult = callResult.value

    // convert to 18 decimals
    tokenAmount = shiftBNDecimals(amountResult, 18 - tokenDecimals)
  }

  if (isEth) {
   const rate = BigInt.fromI64(STABLE_TOKEN_DAYS).div(BigInt.fromI64(ETH_TOKEN_DAYS))
   tokenAmount = rate.times(tokenAmount)
  }

  return tokenAmount
}

export function getInitialBalance(account: Address): BigInt {
  const usdcLpBalance = getNormalizedLpBalance('0x2e17b8193566345a2Dd467183526dEdc42d2d5A8', account)
  const usdtLpBalance = getNormalizedLpBalance('0xF753A50fc755c6622BBCAa0f59F0522f264F006e', account)
  const daiLpBalance = getNormalizedLpBalance('0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92', account)
  const ethLpBalance = getNormalizedLpBalance('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849', account)
  const initialBalance = usdcLpBalance.plus(usdtLpBalance).plus(daiLpBalance).plus(ethLpBalance)
  return initialBalance
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

  let tokenAmount = BigInt.fromI64(0)
  {
    const swapContract = Swap.bind(swapAddress)
    if (transferLpAmount.gt(BigInt.fromI64(0))) {
      const callResult = swapContract.try_calculateRemoveLiquidityOneToken(fromAddress, transferLpAmount, 0)
      let amountResult = BigInt.fromI64(0)
      if (callResult.reverted) {
        // throw new Error('call reverted in handleTransfer')
      } else {
        amountResult = callResult.value
      }

      // convert to 18 decimals
      tokenAmount = shiftBNDecimals(amountResult, 18 - tokenDecimals)
    }
  }

  if (isEth) {
   const rate = BigInt.fromI64(STABLE_TOKEN_DAYS).div(BigInt.fromI64(ETH_TOKEN_DAYS))
   tokenAmount = rate.times(tokenAmount)
  }

  const zeroAddress = Address.fromString('0x0000000000000000000000000000000000000000')
  {
    if (!fromAddress.equals(zeroAddress)) {
      const id = fromAddress.toHexString()
      let entity = Account.load(id)
      let isNew = false
      if (entity == null) {
        isNew = true
        entity = new Account(id)

        const initialBalance = getInitialBalance(fromAddress)
        entity.totalBalance = initialBalance
        entity.lastUpdated = blockTimestamp
        entity.tokenDays = BigInt.fromI64(0)
      }

      let totalBalance = entity.totalBalance
      let tokenDays = entity.tokenDays
      let lastUpdated = entity.lastUpdated

      if (!isNew) {
        totalBalance = totalBalance.minus(tokenAmount)
      }

      tokenDays = tokenDays.plus((blockTimestamp.minus(lastUpdated)).times(totalBalance))

      entity.account = fromAddress.toHexString()
      entity.lastUpdated = blockTimestamp
      entity.totalBalance = totalBalance
      entity.tokenDays = tokenDays
      entity.completed = tokenDays.gt(BigInt.fromI64(STABLE_TOKEN_DAYS)) || tokenDays.equals(BigInt.fromI64(STABLE_TOKEN_DAYS))
      entity._eventCount = entity._eventCount.plus(BigInt.fromI64(1)) // for debugging

      entity.save()
    }
  }

  {
    if (!toAddress.equals(zeroAddress)) {
      const id = toAddress.toHexString()
      let entity = Account.load(id)
      let isNew = false
      if (entity == null) {
        isNew = true
        entity = new Account(id)

        const initialBalance = getInitialBalance(toAddress)
        entity.totalBalance = initialBalance
        entity.lastUpdated = blockTimestamp
        entity.tokenDays = BigInt.fromI64(0)
      }

      let totalBalance = entity.totalBalance
      let tokenDays = entity.tokenDays
      let lastUpdated = entity.lastUpdated

      if (!isNew) {
        totalBalance = totalBalance.plus(tokenAmount)
      }

      tokenDays = tokenDays.plus((blockTimestamp.minus(lastUpdated)).times(totalBalance))

      entity.account = toAddress.toHexString()
      entity.lastUpdated = blockTimestamp
      entity.totalBalance = totalBalance
      entity.tokenDays = tokenDays
      entity.completed = tokenDays.gt(BigInt.fromI64(STABLE_TOKEN_DAYS)) || tokenDays.equals(BigInt.fromI64(STABLE_TOKEN_DAYS))
      entity._eventCount = entity._eventCount.plus(BigInt.fromI64(1)) // for debugging

      entity.save()
    }
  }
}
