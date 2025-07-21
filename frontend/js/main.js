async function updateStatus() {
  const statusJson = await fetch('/status');
  const status = (await statusJson.json()).status;
  const statusDiv = document.getElementById('status');
  statusDiv.innerText = status;
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