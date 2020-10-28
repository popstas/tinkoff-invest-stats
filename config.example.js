module.exports = {
  mqtt: {
    enabled: true,
    host: '',
    port: 1883,
    username: '',
    password: '',
    topic: 'tinkoff'
  },
  influxdb: {
    enabled: true,
    host: 'localhost',
    port: 8086,
    username: 'user',
    password: 'pass',
    database: 'db',
    measurement: 'tinkoff_invest',
    defaultTags: {
      host: 'hostname'
    }
  },
  tinkoff: {
    secretToken: '',
  },
};
