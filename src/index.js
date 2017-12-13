const _ = require('lodash')
const argv = require('yargs').argv
const Graph = require('./asset-graph')
const KrakenClient = require('./exchanges/kraken/')

const creds = require('../.kraken')

// main
;(async () => {
  const INTERVAL = argv.interval ? parseFloat(argv.interval) : 2 // check interval in seconds
  const MIN_ROI = argv.minRoi ? parseFloat(argv.minRoi) : 1 // return of investment
  const MIN_TRX = argv.minTransactions ? parseInt(argv.minTransactions, 10) : 3
  const MAX_TRX = argv.maxTransactions ? parseInt(argv.maxTransactions, 10) : 4

  const exchange = new KrakenClient(creds)
  const graph = await setupGraph(exchange)

  setInterval(async () => {
    try {
      await updateWeights(graph, exchange)
      findProfitableArbitrage(graph, MIN_TRX, MAX_TRX, MIN_ROI)
    } catch (e) {
      // console.error(e)
    }
  }, INTERVAL * 1000)
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

function findProfitableArbitrage (graph, minTrx, maxTrx, minRoi) {
  const arbitrage = graph.findHighestROIArbitrage('EUR', minTrx, maxTrx)

  if (arbitrage.roi > minRoi) {
    console.log(
      'Found profitable arbitrage: ',
      `${_.map(arbitrage, e => e.toString()).join(' > ')} = ROI: ${arbitrage.roi}%`
    )
  }
}
