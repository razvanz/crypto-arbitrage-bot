const _ = require('lodash')
const debug = require('debug')('gdax')
const promiseRetry = require('promise-retry')
const GdaxApi = require('gdax')

class Gdax {
  constructor (credentials) {
    this.authedClient = new GdaxApi.AuthenticatedClient(credentials.api_key, credentials.secret_key, credentials.passphrase, 'https://api.gdax.com')
  }
  /**
   * Retrieve assets: https://api.kraken.com/0/public/Assets
   * @return {Promise<Array<Object>>} Asset list
   */
  async getAssets () {
    return [{
      name: 'BTC',
      decimals: 5
    }, {
      name: 'ETH',
      decimals: 5
    }, {
      name: 'LTC',
      decimals: 5
    }]
  }

  /**
   * Retrieve asset pairs: https://api.kraken.com/0/public/AssetPairs
   * @return {Promise<Array<Object>>} Asset pairs list
   */
  async getAssetPairs () {
    return _(await this.request('AssetPairs'))
      .filter(pair => !pair.altname.endsWith('.d'))
      .map(pair => ({
        base_name: this.stripAssetType(pair.base),
        base_type: (pair.base.startsWith('X') && 'crypto') || (pair.base.startsWith('Z') && 'fiat'),
        quote_name: this.stripAssetType(pair.quote),
        quote_type: (pair.quote.startsWith('X') && 'crypto') || (pair.quote.startsWith('Z') && 'fiat'),
        pair_code: pair.altname,
        decimals: pair.pair_decimals,
        fee_taker: pair.fees[0][1], // take highest fee
        fee_maker: pair.fees_maker[0][1], // take highest fee
        fee_volume_currency: this.stripAssetType(pair.fee_volume_currency)
      }))
      .value()
  }

  /**
   * Retrieve pair prices: https://api.kraken.com/0/public/Ticker
   * @param  {String}                   pair   Comma separated pairs
   * @return {Promise<Array<Object>>}          Asset pairs prices
   */
  async getPrices (pair) {
    if (!Array.isArray(pair)) pair = [pair]

    // Helps later on sorting out the pairs
    const assets = _.reduce(pair, (all, p) => _.union(all, [p.base, p.quote]), [])
    const query = { pair: _.map(pair, p => `${p.base}${p.quote}`).join(',') }

    return _(await this.request('Ticker', query))
      .map((price, code) => {
        const base = _.find(assets,
          a => (code.startsWith(a) || code.startsWith(`X${a}`) || code.startsWith(`Z${a}`)) &&
            (code.startsWith('USDT') ? a === 'USDT' : a) // special case for USDT
        )
        const quote = _.find(assets,
          a => (code.endsWith(a) || code.endsWith(`X${a}`) || code.endsWith(`Z${a}`)) &&
            (code.endsWith('USDT') ? a === 'USDT' : a) // special case for USDT
        )

        return {
          base_name: base,
          quote_name: quote,
          ask_price: parseFloat(price.a[0]),
          bid_price: parseFloat(price.b[0])
        }
      })
      .value()
  }

  /**
   * Perform a kraken request
   * @param  {String}           action  Action translated to called API endpoint
   * @param  {Object}           params  Data to be send in the request
   * @return {Promise<Object>}          Kraken response
   */
  request (...args) {
    return promiseRetry((retry, idx) => {
      if (idx > 1) {
        debug('retry request: %s %j', ...args)
      }

      return this.api(...args)
        .then(response => response.result)
        .catch(retry)
    }, { retries: 2, minTimeout: 1, maxTimeout: 5000 })
  }

  stripAssetType (asset) {
    return asset.length > 3 && (asset.startsWith('X') || asset.startsWith('Z'))
      ? asset.slice(-3)
      : asset
  }
}

module.exports = Gdax
