const mqtt = require('mqtt');
const config = require('../config');

function mqttInit() {
  if (!config.mqtt || !config.mqtt.enabled) return false;
  // console.log('Connecting to MQTT...');
  const client = mqtt.connect(`mqtt://${config.mqtt.host}`, {
    port: config.mqtt.port,
    username: config.mqtt.username,
    password: config.mqtt.password,
  });

  client.on('connect', () => {
    // console.log('MQTT connected to ' + config.mqtt.host);
  });

  client.on('offline', () => {
    console.log('MQTT offline', 'warn');
  });

  return client;
}

module.exports = mqttInit();