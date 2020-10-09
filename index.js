const OpenAPI = require('@tinkoff/invest-openapi-js-sdk');
const config = require('./config');
const mqtt = require('./mqtt');

const apiURL = 'https://api-invest.tinkoff.ru/openapi';
const socketURL = 'wss://api-invest.tinkoff.ru/openapi/md/v1/md-openapi/ws';
const secretToken = config.tinkoff.secretToken;
const api = new OpenAPI({ apiURL, secretToken, socketURL });

function countPortfolioStats(items) {
  const stats = {
    buy: 0,
    profit: 0,
    total: 0,
    percent: 0,
  };
  for (let item of items) {
    stats.buy += item.averagePositionPrice.value * item.balance;
    stats.profit += item.expectedYield.value;
  }

  stats.total = stats.buy + stats.profit;
  stats.percent =
    stats.profit > 0
      ? Number((stats.total / stats.buy - 1) * 100).toFixed(2)
      : Number((stats.total / stats.buy) * 100 * -1).toFixed(2);
  // stats.percent += '%';

  return stats;
}

!(async function run() {
  try {
    const data = [];

    // const { figi } = await api.searchOne({ ticker: 'AAPL' });
    const res = await api.accounts();

    for (let acc of res.accounts) {
      const res = await api.makeRequest('/portfolio?brokerAccountId=' + acc.brokerAccountId);

      const obj = countPortfolioStats(res.positions);
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
