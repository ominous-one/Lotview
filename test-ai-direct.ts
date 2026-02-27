import bcrypt from 'bcryptjs';

// Login and test the AI settings endpoint
async function main() {
  // Login
  const loginRes = await fetch('https://lotview.ai/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@olympichyundai.ca', password: 'Olympic2024!' }),
  });
  const loginData = await loginRes.json() as any;
  if (!loginData.token) {
    console.error('Login failed:', loginData);
    return;
  }
  console.log('Logged in, token obtained');

  // Test AI
  const testRes = await fetch('https://lotview.ai/api/ai-settings/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.token}`,
    },
    body: JSON.stringify({ customerMessage: 'Hi, interested in the 2020 Tucson. What is your best price?' }),
  });
  const testData = await testRes.json();
  console.log('Status:', testRes.status);
  console.log('Response:', JSON.stringify(testData, null, 2));
}

main().catch(console.error);
