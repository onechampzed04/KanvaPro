const http = require('http');
const jwt = require('jsonwebtoken');

const token = jwt.sign({ id: 'e43c035e-1d85-4c63-86f3-ed72fd4b52a1' }, 'secret_key_123', { expiresIn: '1d' });

function request(url) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: { 'Authorization': 'Bearer ' + token } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

(async () => {
  console.log('membersCount=3:', await request('http://localhost:3000/api/payments/preview-upgrade?planId=ebf2a4b6-1ba4-4e5f-b295-a876b38da7da&membersCount=3'));
  console.log('membersCount=4:', await request('http://localhost:3000/api/payments/preview-upgrade?planId=ebf2a4b6-1ba4-4e5f-b295-a876b38da7da&membersCount=4'));
})();
