const OpenAPI = require('@tinkoff/invest-openapi-js-sdk');
const axios = require('axios');
const fs = require('fs');
const config = require('../config');
const mqtt = require('./mqtt');
const influxdb = require('./influxdb');

const apiURL = 'https://api-invest.tinkoff.ru/openapi';
const socketURL = 'wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws';
const secretToken = config.tinkoff.secretToken;
const api = new OpenAPI({ apiURL, secretToken, socketURL });

const usdCacheFile = 'data/usd.json';
let usdRub = 0;
let eurRub = 0;

function countPortfolioStats(items) {
  const stats = {
    buy: 0,
    profit: 0,
    total: 0,
    percent: 0,
    stocks: []
  };
  for (let item of items) {
    const iStats = countItemStats(item);
    stats.buy += iStats.buy;
    stats.profit += iStats.profit;

    stats.stocks.push(iStats);
  }

  stats.total = stats.buy + stats.profit;
  stats.percent =
    stats.profit > 0
      ? (stats.total / stats.buy - 1) * 100
      : (1 - (stats.total / stats.buy)) * -100;
  // stats.percent += '%';

  return stats;
}

function countItemStats(item) {
  const stats = { name: item.name, ticker: item.ticker };

  stats.buy = item.averagePositionPrice.value * item.balance;
  if (item.averagePositionPrice.currency === 'USD') {
    stats.buy = stats.buy * usdRub;
  }
  if (item.averagePositionPrice.currency === 'EUR') {
    stats.buy = stats.buy * eurRub;
  }

  stats.profit = item.expectedYield.value;
  if (item.expectedYield.currency === 'USD') {
    stats.profit = stats.profit * usdRub;
  }
  if (item.expectedYield.currency === 'EUR') {
    stats.profit = stats.profit * eurRub;
  }

  stats.total = stats.buy + stats.profit;
  stats.percent =
    stats.profit > 0
      ? (stats.total / stats.buy - 1) * 100
      : (1 - (stats.total / stats.buy)) * -100;

  return stats;
}

async function getCurrenciesCbr() {
  let cache = fs.existsSync(usdCacheFile) ? JSON.parse(fs.readFileSync(usdCacheFile)) : {};
  if(Date.now() - cache.time > 3600 * 1000) cache = {};
  if(cache.usd) return cache;

  const res = await axios.get('https://www.cbr-xml-daily.ru/daily_json.js');
  cache.usd = res.data.Valute.USD.Value;
  cache.eur = res.data.Valute.EUR.Value;
  cache.time = Date.now();
  fs.writeFileSync(usdCacheFile, JSON.stringify(cache));
  return cache;
}

async function run() {
  const data = [];

  const curr = await getCurrenciesCbr();
  usdRub = curr.usd;
  eurRub = curr.eur;
  if (!usdRub) throw Error('Cannot get cbr usd');
  if (!eurRub) throw Error('Cannot get cbr eur');

  // const { figi } = await api.searchOne({ ticker: 'AAPL' });
  const accounts = await api.accounts();
  const points = [];
  const stocksMap = {};

  for (let acc of accounts.accounts) {
    const portfolio = await api.makeRequest('/portfolio?brokerAccountId=' + acc.brokerAccountId);

    const obj = countPortfolioStats(portfolio.positions);
    obj.name = acc.brokerAccountType == 'Tinkoff' ? 'brk' : 'iis';

    if (mqtt) {
      mqtt.publish(`${config.mqtt.topic}/${obj.name}/buy`, `${parseInt(obj.buy)}`);
      mqtt.publish(`${config.mqtt.topic}/${obj.name}/total`, `${parseInt(obj.total)}`);
      mqtt.publish(`${config.mqtt.topic}/${obj.name}/profit`, `${parseInt(obj.profit)}`);
      mqtt.publish(`${config.mqtt.topic}/${obj.name}/percent`, Number(obj.percent).toFixed(2));

      // let count = 0;

      for (let stock of obj.stocks) {
        mqtt.publish(`${config.mqtt.topic}/stocks/${stock.ticker}/buy`, `${parseInt(stock.buy)}`);
        mqtt.publish(`${config.mqtt.topic}/stocks/${stock.ticker}/total`, `${parseInt(stock.total)}`);
        mqtt.publish(`${config.mqtt.topic}/stocks/${stock.ticker}/profit`, `${parseInt(stock.profit)}`);
        mqtt.publish(`${config.mqtt.topic}/stocks/${stock.ticker}/percent`, Number(stock.percent).toFixed(2));
      }

      // console.log(`${count} / ${obj.stocks.length}`);
    }

    if (influxdb) {
      const data = {
        measurement: config.influxdb.measurement,
        tags: {
          host: config.influxdb.defaultTags.host,
          type: 'total',
          ticker: obj.name,
        },
        fields: {
          name: acc.brokerAccountType,
          buy: obj.buy,
          total: obj.total,
          profit: obj.profit,
          percent: obj.percent,
        },
      };
      points.push(data);

      for (let stock of obj.stocks) {
        const point = {
          measurement: config.influxdb.measurement,
          tags: {
            host: config.influxdb.defaultTags.host,
            type: 'stock',
            ticker: stock.ticker,
          },
          fields: {
            name: stock.name,
            buy: stock.buy,
            total: stock.total,
            profit: stock.profit,
            percent: stock.percent,
          }
        };

        // суммируем бумаги на разных счетах, если они есть
        const exists = stocksMap[stock.ticker];
        if (exists) {
          point.fields = {
            name: stock.name,
            buy: stock.buy + exists.fields.buy,
            total: stock.total + exists.fields.total,
            profit: stock.profit + exists.fields.profit,
          }

          point.fields.percent =
          point.fields.profit > 0
            ? (point.fields.total / point.fields.buy - 1) * 100
            : (1 - (point.fields.total / point.fields.buy)) * -100;
        }
        stocksMap[stock.ticker] = point; // не кладём сразу в points, чтобы просуммировать
      }
    }

    data.push(obj);
  }

  if (influxdb) {
    for (let ticker in stocksMap) {
      const point = stocksMap[ticker];
      points.push(point);
    }
    influxdb.writePoints(points);
  }

  console.log(JSON.stringify(data));

  setTimeout(() => process.exit(0), 10000);
};

try {
  run();
} catch (e) {
  console.error(e);
}
