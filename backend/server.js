const path = require('node:path');
const { EventEmitter } = require('node:events');
const { serial, FromPgn, toActisenseSerialFormat, pgnToActisenseSerialFormat, toPgn } = require('@canboat/canboatjs');

const express = require('express');
const app = express();
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.json());

const parser = new FromPgn({
  format: 1 // format == FORMAT_COALESCED
});
class ActisenseEmit extends EventEmitter {
  constructor() {
    super();
  }
  setProviderError(providerId, msg) {
    // Crash and burn for now
    throw new Error(msg);
  }
}

const actisenseEmit = new ActisenseEmit();
const actisense = new serial({
  app: actisenseEmit,
  device: '/dev/ttyUSB0',
  plainText: true,
  disableSetTransmitPGNs: true
});


const outputReady = new Promise(resolve => {
  actisenseEmit.on('nmea2000OutAvailable', () => {
    resolve();
  });
});

let deviceInfo = false;
async function requestDeviceInfo() {
  let msg = toPgn({
    pgn: 59904,
    fields: {
      pgn: 126996
    }
  });
  msg = toActisenseSerialFormat(59904, msg, 255, 1, 6);
  await outputReady;
  actisenseEmit.emit('nmea2000out', msg);
  actisense.on('data', function requestDeviceInfoDataHandler(data) {
    if (Number(data.split(',')[2]) === 126996) {
      const parsed = parser.parseString(data);
      if (parsed.fields.modelId === 'SSC300') {
        deviceInfo = {
          productCode: parsed.fields.productCode,
          softwareVersionCode: parsed.fields.softwareVersionCode,
          modelVersion: parsed.fields.modelVersion,
          modelSerialCode: parsed.fields.modelSerialCode
        };
        actisenseEmit.off('nmea2000out', requestDeviceInfoDataHandler);
      }
    }
  });
}

let latestCalibrationStatus = 'Not started';
async function initiateReset() {
  const msgStr = '01 00 ef 01 f8 04 01 89 98 02 7e 0a 03 01 00 f0'.replaceAll(' ', '');
  const msg = toActisenseSerialFormat(126208, Buffer.from(msgStr, 'hex'), 96, 1, 7);
  await outputReady;
  actisenseEmit.emit('nmea2000out', msg);
  actisense.on('data', data => {
    if (Number(data.split(',')[2]) === 126720) {
      const parsed = parser.parseString(data);
      latestCalibrationStatus = parsed.fields.status;
    }
  });
}

let latestHeading = 0;
actisense.on('data', data => {
  if (Number(data.split(',')[2]) === 127250) {
    const parsed = parser.parseString(data);
    latestHeading = Math.round(parsed.fields.heading * (180/Math.PI) * 1000) / 1000;
  }
});

async function setInstallationOffset(heading) {
  let headingBytes = Math.floor(heading * 10).toString(16).padStart(4, '0');
  const headingBytesReversed = `${headingBytes[2]}${headingBytes[3]}${headingBytes[0]}${headingBytes[1]}`;
  const msgStr = `01 00 ef 01 f8 04 01 89 98 02 7e 0a 03 01 00 24 ${headingBytesReversed}`.replaceAll(' ', '');
  const msg = toActisenseSerialFormat(126208, Buffer.from(msgStr, 'hex'), 96, 1, 7);
  await outputReady;
  actisenseEmit.emit('nmea2000out', msg);
}

app.get('/status', (req, res) => {
  res.json({status: latestCalibrationStatus, heading: latestHeading, deviceInfo});
});

app.get('/heading', (req, res) => {
  res.json({heading: latestHeading});
});

app.post('/start-calibration', (req, res) => {
  console.log('Starting device calibration...')
  initiateReset();
  res.status(200).send();
});

app.post('/set-offset', (req, res) => {
  console.log('Setting device offset...');
  const payload = req.body;
  if (!payload) {
    res.status(400).send('Missing body');
    return;
  }
  const heading = payload.heading;
  if (typeof heading === 'undefined') {
    res.status(400).send('No heading field');
  }
  if (typeof heading !== 'number') {
    res.status(400).send('Heading must be number');
    return;
  }
  if (heading > 359 || heading < 0) {
    res.status(400).send('Invalid heading');
    return;
  }
  setInstallationOffset(heading);
  res.status(200).send();
});

requestDeviceInfo();

app.listen(8080);