async function updateStatus() {
  const updateJson = await fetch('/status');
  const update = (await updateJson.json());
  console.log(update);
  const heading = update.heading;
  const status = update.status;
  const statusDiv = document.getElementById('status');
  const headingDiv = document.getElementById('heading-reading');
  statusDiv.innerText = status;
  headingDiv.innerText = `Current heading: ${Math.round(heading * 100)/100}°`;
}

async function calibrate() {
  fetch('/start-calibration', {
    method: 'POST'
  });
}

async function setInstallationOffset() {
  const headingInput = document.getElementById('heading');
  fetch('/set-offset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({heading: Number(headingInput.value)})
  })
}

async function main() {
  const headingInput = document.getElementById('heading');
  headingInput.addEventListener('input', () => {
    const val = headingInput.value;
    if (val.includes('.')) {
      const [whole, fraction] = val.split('.');
      if (fraction.length > 2) {
        headingInput.value = whole + '.' + fraction.slice(0, 2);
      }
    }
  });
  setInterval(updateStatus, 500);
}
main();