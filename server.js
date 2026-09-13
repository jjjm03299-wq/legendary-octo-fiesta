// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const dns = require('dns');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const availableDomains = new Map();
const userDomains = new Map();

// Unified Dashboard Template UI with Camera & File Manager Controls
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Stripe Domain & Camera Manager</title>
  <script src="https://js.stripe.com/v3/"></script>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #f8f9fa; }
    .container { max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; }
    .form-row { margin-bottom: 15px; }
    label { display: block; margin-bottom: 5px; font-weight: bold; }
    button { background: #6772e5; color: white; border: none; padding: 10px 15px; border-radius: 4px; cursor: pointer; margin-right: 5px; margin-top: 5px; }
    input, select, textarea { width: 100%; padding: 8px; box-sizing: border-box; margin-top: 5px; border: 1px solid #ccc; border-radius: 4px; }
    #card-element { padding: 10px; border: 1px solid #ccc; border-radius: 4px; }
    #card-errors { color: #fa755a; margin-top: 5px; }
    video { width: 100%; background: #000; border-radius: 4px; margin-top: 10px; display: none; }
    ul { padding-left: 20px; }
  </style>
</head>
<body>

  <div class="container">
    <h3>Camera Feed Control</h3>
    <button onclick="startCamera()">Start camera</button>
    <button onclick="stopCamera()">Stop camera</button>
    <a href="/preview-camera-video" target="_blank"><button type="button">Preview Camera Video Page</button></a>
    <video id="camera-preview" autoplay playsinline></video>
  </div>

  <div class="container">
    <h3>Buy Domain (1 Year Payment)</h3>
    <form id="payment-form">
      <div class="form-row">
        <label for="card-element">Credit or debit card</label>
        <div id="card-element"></div>
        <div id="card-errors" role="alert"></div>
      </div>
      <button type="submit">Submit Payment</button>
    </form>
  </div>

  <div class="container">
    <h3>DNS Record Configuration</h3>
    <form id="dns-form">
      <div class="form-row">
        <label>Type: choose dns type</label>
        <select id="dns-type"><option>A</option><option>CNAME</option><option>TXT</option></select>
      </div>
      <div class="form-row">
        <label>Name:</label>
        <input type="text" id="dns-name" value="@" />
      </div>
      <div class="form-row">
        <label>Value:</label>
        <input type="text" id="dns-value" placeholder="Enter IP or Alias" />
      </div>
      <div class="form-row">
        <label>TTL:</label>
        <input type="number" id="dns-ttl" value="600" />
      </div>
      <button type="submit">Add DNS Records</button>
    </form>
  </div>

  <div class="container">
    <h3>File Manager API</h3>
    <div class="form-row">
      <label>Enter new file name:</label>
      <input type="text" id="file-name" placeholder="e.g. index.html" />
    </div>
    <div class="form-row">
      <label>Enter file contents:</label>
      <textarea id="file-content" placeholder="File contents here..."></textarea>
    </div>
    <button onclick="createFile()">Create File</button>
    <button onclick="listFiles()">List Files</button>
    <div id="file-list-output" style="margin-top:10px;"></div>
  </div>

<script>
  var stripe = Stripe('pk_test_TYooMQauvdEDq54NiTphI7jx');
  var elements = stripe.elements();
  var style = {
    base: { color: '#32325d', lineHeight: '18px', fontFamily: '"Helvetica Neue", Helvetica, sans-serif', fontSize: '16px' }
  };
  var card = elements.create('card', { style: style });
  card.mount('#card-element');

  let mediaStream = null;

  async function startCamera() {
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoElement = document.getElementById('camera-preview');
      videoElement.srcObject = mediaStream;
      videoElement.style.display = 'block';
      
      await fetch('/start-camera', { method: 'POST' });
    } catch (err) {
      alert('Could not access camera: ' + err.message);
    }
  }

  async function stopCamera() {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    const videoElement = document.getElementById('camera-preview');
    videoElement.srcObject = null;
    videoElement.style.display = 'none';

    await fetch('/stop-camera', { method: 'POST' });
  }

  document.getElementById('payment-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const domainName = prompt("enter your Domain name:");
    if (!domainName) return;

    const { paymentMethod, error } = await stripe.createPaymentMethod({ type: 'card', card: card });
    if (error) {
      document.getElementById('card-errors').textContent = error.message;
    } else {
      const res = await fetch('/api/buy-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domainName, paymentMethodId: paymentMethod.id })
      });
      const data = await res.json();
      if (!res.ok) {
        document.getElementById('card-errors').textContent = data.error || 'your card was declined.';
      } else {
        alert(data.message);
      }
    }
  });

  document.getElementById('dns-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    const payload = {
      domain: prompt("enter your Domain name for DNS:"),
      type: document.getElementById('dns-type').value,
      name: document.getElementById('dns-name').value,
      value: document.getElementById('dns-value').value,
      ttl: document.getElementById('dns-ttl').value
    };
    const res = await fetch('/dns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert(data.message);
  });

  async function createFile() {
    const fileName = document.getElementById('file-name').value;
    const fileContent = document.getElementById('file-content').value;
    if (!fileName) return alert('Enter a file name');
    const res = await fetch('/api/create-file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, fileContent })
    });
    const data = await res.json();
    alert(data.success ? 'File created: ' + data.file : data.error);
  }

  async function listFiles() {
    const res = await fetch('/api/list-files');
    const data = await res.json();
    const container = document.getElementById('file-list-output');
    if (data.files) {
      container.innerHTML = '<ul>' + data.files.map(f => '<li>' + f + ' | <a href="/api/files/raw?name=' + f + '" target="_blank">open raw contents</a> | <a href="/api/view-files?name=' + f + '" target="_blank">view files</a></li>').join('') + '</ul>';
    } else {
      container.innerHTML = 'Could not list files';
    }
  }
</script>
</body>
</html>
`;

// Standalone Video Preview Template UI specifically for /preview-camera-video
const previewPageContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Preview Camera Video</title>
  <style>
    body { font-family: sans-serif; padding: 20px; background: #111; color: #fff; text-align: center; }
    video { width: 80%; max-width: 600px; background: #000; border-radius: 8px; border: 2px solid #6772e5; margin-top: 20px; }
    button { background: #6772e5; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-size: 16px; margin: 5px; }
  </style>
</head>
<body>
  <h2>Camera Video Live Preview Feed</h2>
  <div>
    <button onclick="startPreviewCamera()">Start Camera</button>
    <button onclick="stopPreviewCamera()">Stop Camera</button>
  </div>
  <div>
    <video id="preview-video" autoplay playsinline></video>
  </div>

<script>
  let previewStream = null;

  async function startPreviewCamera() {
    try {
      previewStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      const videoEl = document.getElementById('preview-video');
      videoEl.srcObject = previewStream;
      await fetch('/start-camera', { method: 'POST' });
    } catch (err) {
      alert('Camera access denied or unavailable: ' + err.message);
    }
  }

  async function stopPreviewCamera() {
    if (previewStream) {
      previewStream.getTracks().forEach(track => track.stop());
      previewStream = null;
    }
    const videoEl = document.getElementById('preview-video');
    videoEl.srcObject = null;
    await fetch('/stop-camera', { method: 'POST' });
  }
</script>
</body>
</html>
`;

// App Routing
app.get('/', (req, res) => res.send(htmlContent));
app.get('/buy', (req, res) => res.send(htmlContent));
app.get('/file', (req, res) => res.send(htmlContent));
app.get('/dns', (req, res) => res.send(htmlContent));
app.get('/preview-camera-video', (req, res) => res.send(previewPageContent));

// Camera Control Endpoints
app.post('/start-camera', (req, res) => {
  res.json({ success: true, message: 'Camera stream initialized via server route.' });
});

app.post('/stop-camera', (req, res) => {
  res.json({ success: true, message: 'Camera stream terminated via server route.' });
});

// Domain Search API
app.get('/api/available-domains', (req, res) => {
  const domainName = req.query.domain;
  if (!domainName) return res.status(400).json({ error: 'Domain query parameter is required.' });

  const isAvailable = !availableDomains.has(domainName) && !userDomains.has(domainName);
  const statusObj = { available: isAvailable, price: 15.00, term: '1 year' };
  availableDomains.set(domainName, statusObj);

  res.json({ domain: domainName, status: statusObj });
});

// Domain Purchase Endpoint
app.post('/api/buy-domain', async (req, res) => {
  try {
    const { domainName, paymentMethodId } = req.body;
    if (!domainName || !paymentMethodId) {
      return res.status(400).json({ error: 'Domain name and payment method are required.' });
    }

    userDomains.set(domainName, { registered: true, term: '1 year', purchasedAt: Date.now() });
    availableDomains.delete(domainName);
    
    return res.json({ success: true, message: `Domain ${domainName} successfully purchased for 1 year!` });
  } catch (err) {
    return res.status(400).json({ error: 'your card was declined.' });
  }
});

// File Manager Endpoints using fs & path modules
const filesDir = path.join(__dirname, 'files');
if (!fs.existsSync(filesDir)) fs.mkdirSync(filesDir);

app.post('/api/create-file', (req, res) => {
  const { fileName, fileContent } = req.body;
  if (!fileName) return res.status(400).json({ error: 'File name is required.' });
  const filePath = path.join(filesDir, fileName);
  fs.writeFile(filePath, fileContent || '', (err) => {
    if (err) return res.status(500).json({ error: 'Could not create file' });
    res.json({ success: true, file: fileName });
  });
});

app.get('/api/list-files', (req, res) => {
  fs.readdir(filesDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Unable to list files' });
    res.json({ files });
  });
});

app.get('/api/view-files', (req, res) => {
  const fileName = req.query.name;
  if (!fileName) return res.status(400).json({ error: 'File name parameter required.' });
  const filePath = path.join(filesDir, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  fs.readFile(filePath, 'utf8', (err, data) => {
    if (err) return res.status(500).json({ error: 'Could not read file' });
    res.send(data);
  });
});

app.get('/api/files/raw', (req, res) => {
  const fileName = req.query.name;
  if (!fileName) return res.status(400).json({ error: 'File name parameter required.' });
  const filePath = path.join(filesDir, fileName);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  
  res.sendFile(filePath);
});

app.delete('/api/delete-files', (req, res) => {
  const fileName = req.body.name;
  if (!fileName) return res.status(400).json({ error: 'File name parameter required.' });
  const filePath = path.join(filesDir, fileName);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(404).json({ error: 'File not found' });
    res.json({ success: true, message: 'File deleted' });
  });
});

// DNS Records Endpoint
app.post('/dns', (req, res) => {
  const { domain, type, name, value, ttl } = req.body;
  if (!domain) return res.status(400).json({ error: 'Domain name is required for DNS mapping.' });

  dns.resolve(domain, (err, addresses) => {
    res.json({
      success: true,
      record: { Domain: domain, Type: type || 'A', Name: name || '@', Value: value, TTL: ttl || 600 },
      resolvedIps: addresses || [],
      message: 'add dns records success. wait dns 8 hours for global propagation.'
    });
  });
});

app.listen(3000, () => console.log('Server running on port 3000'));
