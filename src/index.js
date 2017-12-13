const _ = require('lodash')
const argv = require('yargs').argv
const Graph = require('./asset-graph')
const KrakenClient = require('./exchanges/kraken/')

const creds = require('../.kraken')
const INTERVAL = (argv.interval ? parseFloat(argv.interval) : 2) * 1000
const MIN_ROI = argv.minRoi ? parseFloat(argv.minRoi) : 1 // return of investment
const MIN_TRX = argv.minTransactions ? parseInt(argv.minTransactions, 10) : 2
const MAX_TRX = argv.maxTransactions ? parseInt(argv.maxTransactions, 10) : 3

// main
;(async () => {
  const exchange = new KrakenClient(creds)
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
  const arbitrage = graph.findHighestROIArbitrage('EUR', MIN_TRX, MAX_TRX)

  if (arbitrage.roi > MIN_ROI) {
    console.log(
      'Found profitable arbitrage: ',
      `${_.map(arbitrage, e => e.toString()).join(' > ')} = ROI: ${arbitrage.roi}%`
    )
  }
}
