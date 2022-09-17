import { Address, BigInt } from "@graphprotocol/graph-ts"
import { ERC20, Transfer } from "../generated/ERC20/ERC20"
import { AccountEntity } from "../generated/schema"

export function updateBigIntDecimals(amount: BigInt, decimals: number): BigInt {
  return amount.div(BigInt.fromI64(10).pow(decimals as u8))
}

export function handleTransfer(event: Transfer): void {
  const blockTimestamp = event.params._event.block.timestamp
  const fromAddress = event.params.from.toHexString()
  const toAddress = event.params.to.toHexString()

  const tokenAddress = event.address
  const contract = ERC20.bind(tokenAddress)
  let callResult = contract.try_decimals()
  let decimals = callResult.value
  let transferAmount = updateBigIntDecimals(event.params.value, decimals)

  const isEth = tokenAddress.equals(Address.fromHexString('0x5C2048094bAaDe483D0b1DA85c3Da6200A88a849'))
  if (isEth) {
   const rate = BigInt.fromI64(36500).div(BigInt.fromI64(24))
   transferAmount = rate.times(transferAmount)
  }

  {
    let id = fromAddress
    let entity = AccountEntity.load(id)
    if (entity == null) {
      entity = new AccountEntity(id)
    }

    let totalBalance = entity.totalBalance
    let tokenDays = entity.tokenDays
    let lastUpdated = entity.lastUpdated

    totalBalance = totalBalance.minus(transferAmount)
    tokenDays = tokenDays.plus((blockTimestamp.minus(lastUpdated)).times(totalBalance))

    entity.account = fromAddress
    entity.lastUpdated = blockTimestamp
    entity.totalBalance = totalBalance

    entity.save()
  }

  {
    let id = toAddress
    let entity = AccountEntity.load(id)
    if (entity == null) {
      entity = new AccountEntity(id)
    }

    let totalBalance = entity.totalBalance
    let tokenDays = entity.tokenDays
    let lastUpdated = entity.lastUpdated

    totalBalance = totalBalance.plus(transferAmount)
    tokenDays = tokenDays.plus((blockTimestamp.minus(lastUpdated)).times(totalBalance))

    entity.account = toAddress
    entity.lastUpdated = blockTimestamp
    entity.totalBalance = totalBalance

    entity.save()
  }
}
