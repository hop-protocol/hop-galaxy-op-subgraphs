const { providers, Contract, BigNumber, utils } = require('ethers')
const fetch = require('isomorphic-fetch')
const erc20Abi = require('../abis/ERC20.json')
const swapAbi = require('../abis/Swap.json')

function shiftBNDecimals (bn, shiftAmount) {
  if (shiftAmount < 0) throw new Error('shiftAmount must be positive')
  return bn.mul(BigNumber.from(10).pow(shiftAmount))
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

const STABLE_TOKEN_DAYS = 36500
const ETH_TOKEN_DAYS = 24

async function main() {
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

main().catch(console.error)
