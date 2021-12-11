const fs = require('fs');

const tickersFile = 'data/tickers.json';
const tickers = fs.existsSync(tickersFile) ? JSON.parse(fs.readFileSync(tickersFile)) : [];
const ticker = process.argv[2];

if (tickers.find(t => t === ticker)) {
  fs.writeFileSync(tickersFile, JSON.stringify(tickers.filter(t => t !== ticker)));
}
