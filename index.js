const OpenAPI = require('@tinkoff/invest-openapi-js-sdk');
const axios = require('axios');
const fs = require('fs');
const config = require('./config');
const mqtt = require('./mqtt');

const apiURL = 'https://api-invest.tinkoff.ru/openapi';
const socketURL = 'wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws';
const secretToken = config.tinkoff.secretToken;
const api = new OpenAPI({ apiURL, secretToken, socketURL });

const usdCacheFile = 'data/usd.json';
let usdRub = 0;

function countPortfolioStats(items) {
  const stats = {
    buy: 0,
    profit: 0,
    total: 0,
    percent: 0,
  };
  for (let item of items) {
    const iStats = countItemPrice(item);
    stats.buy += iStats.buy;
    stats.profit += iStats.profit;
  }

  stats.total = stats.buy + stats.profit;
  stats.percent =
    stats.profit > 0
      ? Number((stats.total / stats.buy - 1) * 100).toFixed(2)
      : Number((stats.total / stats.buy) * 100 * -1).toFixed(2);
  // stats.percent += '%';

  return stats;
}

function countItemPrice(item) {
  let buy = item.averagePositionPrice.value * item.balance;
  if (item.averagePositionPrice.currency === 'USD') {
    buy = buy * usdRub;
  }

  let profit = item.expectedYield.value;
  if (item.expectedYield.currency === 'USD') {
    profit = profit * usdRub;
  }

  return {buy, profit};
}

async function getUsdRubCbr() {
  let cache = fs.existsSync(usdCacheFile) ? JSON.parse(fs.readFileSync(usdCacheFile)) : {};
  if(Date.now() - cache.time > 3600 * 1000) cache = {};
  if(cache.usd) return cache.usd;

  const res = await axios.get('https://www.cbr-xml-daily.ru/daily_json.js');
  cache.usd = res.data.Valute.USD.Value;
  cache.time = Date.now();
  fs.writeFileSync(usdCacheFile, JSON.stringify(cache));
  return cache.usd;
}

!(async function run() {
  try {
    const data = [];

    usdRub = await getUsdRubCbr();
    if (!usdRub) throw Error('Cannot get cbr usd');

    // const { figi } = await api.searchOne({ ticker: 'AAPL' });
    const accounts = await api.accounts();

    for (let acc of accounts.accounts) {
      const portfolio = await api.makeRequest('/portfolio?brokerAccountId=' + acc.brokerAccountId);

      const obj = countPortfolioStats(portfolio.positions);
      obj.name = acc.brokerAccountType == 'Tinkoff' ? 'brk' : 'iis';

      mqtt.publish(`${config.mqtt.topic}/${obj.name}/buy`, `${parseInt(obj.buy)}`);
      mqtt.publish(`${config.mqtt.topic}/${obj.name}/total`, `${parseInt(obj.total)}`);
      mqtt.publish(`${config.mqtt.topic}/${obj.name}/profit`, `${parseInt(obj.profit)}`);
      mqtt.publish(`${config.mqtt.topic}/${obj.name}/percent`, obj.percent);
      data.push(obj);
    }

    console.log(JSON.stringify(data));
  } catch (e) {
    console.error(e);
  }

  setTimeout(() => process.exit(0), 10000);
})();
