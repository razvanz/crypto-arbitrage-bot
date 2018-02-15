const _ = require('lodash')
const argv = require('yargs').argv
const Graph = require('./asset-graph')
const KrakenClient = require('./exchanges/kraken/')

const creds = require('../.kraken')

const CURRENCY = argv.currency || 'EUR'
const INTERVAL = (argv.interval ? parseFloat(argv.interval) : 2) * 1000
const MIN_ROI = argv.minRoi ? parseFloat(argv.minRoi) : 1 // return of investment
const MIN_TRX = argv.minTransactions ? parseInt(argv.minTransactions, 10) : 3
const MAX_TRX = argv.maxTransactions ? parseInt(argv.maxTransactions, 10) : 4

// main
;(async () => {
  const exchange = new KrakenClient(creds)
  const balances = await exchange.getBalance()
  // const currencyBalance = _.get(_.find(balances, { name: CURRENCY }), 'amount')

  console.log('Account balances: ', _.map(balances, b => `${b.name}=${b.amount}`).join(' '))

  // Require balance in currency
  // if (!currencyBalance) {
  //   throw new Error(`Zero balance available for currency: ${CURRENCY}`)
  // }

  // For now fail if there are balances in other currencies. Just to avoid issues.
  // if (balances.length > 1) {
  //   throw new Error(`Found balances in other currencies than: ${CURRENCY}`)
  // }

  const graph = await setupGraph(exchange)
  scheduleCalculation(graph, exchange)
})()

async function setupGraph (exchange) {
  const graph = new Graph()

  // Setup asset nodes
  _.forEach(
    await exchange.getAssets(),
    asset => graph.node(asset.name, asset)
  )

  // Setup asset pair edges
  _.forEach(await exchange.getAssetPairs(), pair => {
    graph.edge(pair.base_name, pair.quote_name, _.defaults({}, pair, { isPair: true }))
    graph.edge(pair.quote_name, pair.base_name, pair)
  })

  return graph
}

async function scheduleCalculation (graph, exchange) {
  setTimeout(async () => {
    try {
      await updateWeights(graph, exchange)
      findProfitableArbitrage(graph)
    } catch (e) {}

    scheduleCalculation(graph, exchange)
  }, INTERVAL)
}

async function updateWeights (graph, exchange) {
  const pairs = _(graph.edges)
    .filter(e => `${e.id1}${e.id2}` === e.data.pair_code)
    .map(e => ({ base: e.id1, quote: e.id2 }))
    .value()

  _(await exchange.getPrices(pairs))
    .forEach(p => {
      const edge1 = _.find(graph.edges, { id1: p.base_name, id2: p.quote_name })
      const edge2 = _.find(graph.edges, { id1: p.quote_name, id2: p.base_name })

      edge1.weight = p.bid_price * (1 - edge1.data.fee_taker / 100)
      edge2.weight = 1 / (p.ask_price * (1 - edge1.data.fee_taker / 100))
    })
}

function findProfitableArbitrage (graph) {
  const arbitrage = graph.findHighestROIArbitrage(CURRENCY, MIN_TRX, MAX_TRX)

  if (arbitrage.roi > MIN_ROI) {
    console.log(
      new Date().toISOString(),
      `${CURRENCY} > ${_.map(arbitrage, e => e.id2).join(' > ')} = ROI: ${arbitrage.roi}%`
    )

    return arbitrage
  }
}
