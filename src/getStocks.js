const OpenAPI = require('@tinkoff/invest-openapi-js-sdk');
const fs = require('fs');
const config = require('../config');
const mqtt = require('./mqtt');
const influxdb = require('./influxdb');

const apiURL = 'https://api-invest.tinkoff.ru/openapi';
const socketURL = 'wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws';
const secretToken = config.tinkoff.secretToken;
const api = new OpenAPI({ apiURL, secretToken, socketURL });

const stocksCacheFile = 'data/stocks.json';

async function getFigiByTickers(tickers) {
  let cache = fs.existsSync(stocksCacheFile) ? JSON.parse(fs.readFileSync(stocksCacheFile)) : {};

  for (let ticker of config.tickers) {
    if (cache[ticker]) continue;
    const res = await api.search({ticker});

    if (res.instruments.length === 0) {
      console.error('figi by ticker not found: ' + ticker);
      continue;
    }

    cache[ticker] = res.instruments[0].figi;
  }

  fs.writeFileSync(stocksCacheFile, JSON.stringify(cache));
  return cache;
}

async function run() {
  const data = [];

  const figiByTicker = await getFigiByTickers(config.tickers);

  for (let ticker in figiByTicker) {
    const figi = figiByTicker[ticker];
    // const res = await api.search({figi});
    const offset = 0 // 20 hours: 72000000;
    const from = new Date(Date.now() - 180000 - offset).toISOString();
    const to = new Date(Date.now() - 60000 - offset).toISOString();
    const res = await api.candlesGet({from, to, figi});

    if (res.candles.length === 0) continue;

    if (mqtt) {
      const current = parseInt(res.candles[0].c);
      mqtt.publish(`${config.mqtt.topic}/current/${ticker}`, `${current}`);
    }

    /* if (influxdb) {
      const points = [];

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
        points.push({
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
        });
      }

      influxdb.writePoints(points);
    } */

    data.push(res);
  }

  console.log(JSON.stringify(data));

  setTimeout(() => process.exit(0), 10000);
};

try {
  run();
} catch (e) {
  console.error(e);
}
