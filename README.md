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

Query using Galxe expected [format](https://www.notion.so/bulletlabs/Subgraph-setup-on-Galxe-2764f9a8a089444b9f1589b62e821f6a):

```gql
{
  receiveds(where: {
    recipient: ""
  }) {
    id
    recipient
  }
  fulfilleds(where: {
    user: ""
  }) {
    id
  }
}
```

## Expression

```js
function (resp) {
  if (resp != null && resp.fulfilleds != null && resp.fulfilleds.length > 0) {
    return 1
  }
  return 0
}
```

## Steps subgraph does

on LP token transfer event
1. get saddle swap contract for that token bridge
1. calculate canonical tokenAmount using saddle swap calculateRemoveLiquidityOneToken
1. normalize canonical tokenAmount to 18 decimals
1. if it's eth tokenAmount, multiply tokenAmount by 18250/12
1. if it's a new entity, set totalBalance to initialBalance, lastUpdated to current blockTime, and tokenSeconds to 0

    1. initialBalance is reading all the LP token balances for that account and
    1. calculate canonical tokenAmount using saddle swap calculateRemoveLiquidityOneToken for each LP token balance and
    1. normalize each canonical tokenAmount to 18 decimals and
    1. for eth tokenAmount, multiply tokenAmount by 18250/12 and
    1. sum all the canonical tokenAmounts as initialBalance

1. if it's not a new entity, set totalBalance equal to totalBalance-tokenAmount for transfer event fromAddress account or totalBalance+tokenAmount for transfer event toAddress account, and set tokenSeconds=(tokenSeconds+(blockTimestamp-lastUpdated)*totalBalance)

## LP examples

```
$18,250 completes quest in 1 days
$9,125 completes quest in 2 days
$6,083 completes quest in 3 days
$4,562 completes quest in 4 days
$3,650 completes quest in 5 days
$3,041 completes quest in 6 days
$2,607 completes quest in 7 days
$2,281 completes quest in 8 days
$2,027 completes quest in 9 days
$1,825 completes quest in 10 days
$1,659 completes quest in 11 days
$1,520 completes quest in 12 days
$1,403 completes quest in 13 days
$1,303 completes quest in 14 days
$1,216 completes quest in 15 days
$1,140 completes quest in 16 days
$1,073 completes quest in 17 days
$1,013 completes quest in 18 days

12 ETH completes quest in 1 days
6 ETH completes quest in 2 days
4 ETH completes quest in 3 days
3 ETH completes quest in 4 days
2.4 ETH completes quest in 5 days
2 ETH completes quest in 6 days
1.71 ETH completes quest in 7 days
1.5 ETH completes quest in 8 days
1.33 ETH completes quest in 9 days
1.2 ETH completes quest in 10 days
1.09 ETH completes quest in 11 days
1 ETH completes quest in 12 days
```

## Links

- https://thegraph.com/hosted-service/subgraph/hop-protocol/hop-galaxy-op
