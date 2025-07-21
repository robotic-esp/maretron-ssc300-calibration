const path = require('node:path');
const { EventEmitter } = require('node:events');
const { serial, FromPgn, toActisenseSerialFormat } = require('@canboat/canboatjs');

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

let latestCalibrationStatus = 'Not started';
function initiateReset() {
  const msgStr = '01 00 ef 01 f8 04 01 89 98 02 7e 0a 03 01 00 f0'.replaceAll(' ', '');
  const msg = toActisenseSerialFormat(126208, Buffer.from(msgStr, 'hex'), 96, 1, 7);
  actisenseEmit.on('nmea2000OutAvailable', () => {
    actisenseEmit.emit('nmea2000out', msg);
  });
  actisense.on('data', data => {
    if (data.split(',')[2] === 126720) {
      const parsed = parser.parseString(data);
      latestCalibrationStatus = parsed.fields.status;
    }
  });
}

let latestHeading = 0;
function setInstallationOffset(heading) {
  let headingBytes = Math.floor(heading * 10).toString(16).padStart(4, '0');
  const headingBytesReversed = `${headingBytes[2]}${headingBytes[3]}${headingBytes[0]}${headingBytes[1]}`;
  const msgStr = `01 00 ef 01 f8 04 01 89 98 02 7e 0a 03 01 00 24 ${headingBytesReversed}`.replaceAll(' ', '');
  const msg = toActisenseSerialFormat(126208, Buffer.from(msgStr, 'hex'), 96, 1, 7);
  actisenseEmit.on('nmea2000OutAvailable', () => {
    actisenseEmit.emit('nmea2000out', msg);
  });
  actisense.on('data', data => {
    if (data.split(',')[2] == 127250) {
      const parsed = parser.parseString(data);
      latestHeading = parsed.fields.heading * (180/Math.PI);
    }
  });
}

app.get('/status', (req, res) => {
  res.json({status: latestCalibrationStatus});
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

app.listen(8080);