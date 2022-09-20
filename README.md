# hop-galaxy-op

> The hop subgraph for Galaxy campaign on optimism that calculates how long an account has LP'd for in terms of token days

## Development

```sh
npm run codegen
npm run build
```

## Deployment

```sh
npm run codegen
npm run build
graph auth --product hosted-service <access-token>
graph deploy --product hosted-service hop-protocol/hop-galaxy-op
```

## GraphQL query example


```gql
{
  accounts(first: 1000) {
    id
    account
    totalBalance
    tokenSeconds
    completed
    lastUpdated
  }
}
```

## Steps subgraph does

on LP token transfer event
1. get saddle swap contract for that token bridge
1. calculate canonical tokenAmount using saddle swap calculateRemoveLiquidityOneToken
1. normalize canonical tokenAmount to 18 decimals
1. if it's eth tokenAmount, multiply tokenAmount by 36500/24
1. if it's a new entity, set totalBalance to initialBalance, lastUpdated to current blockTime, and tokenSeconds to 0

    1. initialBalance is reading all the LP token balances for that account and
    1. calculate canonical tokenAmount using saddle swap calculateRemoveLiquidityOneToken for each LP token balance and
    1. normalize each canonical tokenAmount to 18 decimals and
    1. for eth tokenAmount, multiply tokenAmount by 36500/24 and
    1. sum all the canonical tokenAmounts as initialBalance

1. if it's not a new entity, set totalBalance equal to totalBalance-tokenAmount for transfer event fromAddress account or totalBalance+tokenAmount for transfer event toAddress account, and set tokenSeconds=(tokenSeconds+(blockTimestamp-lastUpdated)*totalBalance)

## LP examples

USDC/DAI/USDT

* $100 for 365 days
* $200 for 6 months
* $400 for 3 months
* $1,200 for 1 month

ETH

* 0.066 ETH for 365 days
* 0.132 ETH for 6 months
* 0.264 ETH for 3 months
* 0.792 ETH for 1 month

## Links

- https://thegraph.com/hosted-service/subgraph/hop-protocol/hop-galaxy-op
