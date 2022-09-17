import { Address, BigInt } from "@graphprotocol/graph-ts"
import { ERC20, Transfer } from "../generated/ERC20/ERC20"
import { AccountEntity } from "../generated/schema"

export function updateBigIntDecimals(amount: BigInt, decimals: number): BigInt {
  return amount.div(BigInt.fromI64(10).pow(decimals as u8))
}

export function getLpBalance(contractAddress: string, account: Address): BigInt {
  const contract = ERC20.bind(Address.fromString(contractAddress))
  const balanceCallResult = contract.try_balanceOf(account)
  const decimalsCallResult = contract.try_decimals()
  const decimals = decimalsCallResult.value
  const balance = updateBigIntDecimals(balanceCallResult.value, decimals)
  return balance
}

export function handleTransfer(event: Transfer): void {
  const blockTimestamp = event.params._event.block.timestamp
  const fromAddress = event.params.from
  const toAddress = event.params.to

  const tokenAddress = event.address
  const contract = ERC20.bind(tokenAddress)
  const callResult = contract.try_decimals()
  const decimals = callResult.value
  let transferAmount = updateBigIntDecimals(event.params.value, decimals)

  const isEth = tokenAddress.equals(Address.fromString('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'))
  if (isEth) {
   const rate = BigInt.fromI64(36500).div(BigInt.fromI64(24))
   transferAmount = rate.times(transferAmount)
  }

  {
    const id = fromAddress.toHexString()
    let entity = AccountEntity.load(id)
    if (entity == null) {
      entity = new AccountEntity(id)

      const usdcLpBalance = getLpBalance('0x2e17b8193566345a2Dd467183526dEdc42d2d5A8', fromAddress)
      const usdtLpBalance = getLpBalance('0xF753A50fc755c6622BBCAa0f59F0522f264F006e', fromAddress)
      const daiLpBalance = getLpBalance('0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92', fromAddress)
      const ethLpBalance = getLpBalance('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849', fromAddress)
      const initialBalance = usdcLpBalance.plus(usdtLpBalance).plus(daiLpBalance).plus(ethLpBalance)
      entity.totalBalance = initialBalance
    }

    let totalBalance = entity.totalBalance
    let tokenDays = entity.tokenDays
    let lastUpdated = entity.lastUpdated

    totalBalance = totalBalance.minus(transferAmount)
    tokenDays = tokenDays.plus((blockTimestamp.minus(lastUpdated)).times(totalBalance))

    entity.account = fromAddress.toHexString()
    entity.lastUpdated = blockTimestamp
    entity.totalBalance = totalBalance

    entity.save()
  }

  {
    const id = toAddress.toHexString()
    let entity = AccountEntity.load(id)
    if (entity == null) {
      entity = new AccountEntity(id)

      const usdcLpBalance = getLpBalance('0x2e17b8193566345a2Dd467183526dEdc42d2d5A8', toAddress)
      const usdtLpBalance = getLpBalance('0xF753A50fc755c6622BBCAa0f59F0522f264F006e', toAddress)
      const daiLpBalance = getLpBalance('0x22D63A26c730d49e5Eab461E4f5De1D8BdF89C92', toAddress)
      const ethLpBalance = getLpBalance('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849', toAddress)
      const initialBalance = usdcLpBalance.plus(usdtLpBalance).plus(daiLpBalance).plus(ethLpBalance)
      entity.totalBalance = initialBalance
    }

    let totalBalance = entity.totalBalance
    let tokenDays = entity.tokenDays
    let lastUpdated = entity.lastUpdated

    totalBalance = totalBalance.plus(transferAmount)
    tokenDays = tokenDays.plus((blockTimestamp.minus(lastUpdated)).times(totalBalance))

    entity.account = toAddress.toHexString()
    entity.lastUpdated = blockTimestamp
    entity.totalBalance = totalBalance

    entity.save()
  }
}
