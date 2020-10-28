const Influx = require('influx');
const config = require('./config');

function influxdbInit() {
  if (!config.influxdb || !config.influxdb.enabled) return false;
  const influx = new Influx.InfluxDB({
    host: config.influxdb.host,
    port: config.influxdb.port,
    database: config.influxdb.database,
    username: config.influxdb.username,
    password: config.influxdb.password,
    schema: [
      {
        measurement: config.influxdb.measurement,
        fields: {
          name: Influx.FieldType.STRING,
          buy: Influx.FieldType.FLOAT,
          total: Influx.FieldType.FLOAT,
          profit: Influx.FieldType.FLOAT,
          percent: Influx.FieldType.FLOAT,
        },
        tags: [
          'host', 'type', 'ticker', 
        ]
      }
    ]
  });

  return influx;
}

module.exports = influxdbInit();