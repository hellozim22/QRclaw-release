import WebSocket from 'ws';

const GATEWAY = 'ws://localhost:3001';
const QR_CODE_ID = 'c11f9a48-0737-4903-8547-ffcf15773270';

const run = async () => {
  // 1. Get visitor ticket
  const ticketRes = await fetch('http://localhost:3001/api/visitor-ws-ticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ qr_code_id: QR_CODE_ID }),
  });
  const ticketJson = (await ticketRes.json()) as any;
  const ticket = ticketJson.data.ticket;
  const sessionToken = ticketJson.data.session_token;
  console.log('✅ Got visitor ticket');

  // 2. Connect WebSocket
  const ws = new WebSocket(`${GATEWAY}/ws?ticket=${encodeURIComponent(ticket)}&role=visitor`);

  ws.on('open', () => console.log('✅ WebSocket connected'));

  let gotAck = false;

  ws.on('message', (data: any) => {
    const frame = JSON.parse(data.toString());

    if (frame.type === 'connection_ack') {
      gotAck = true;
      console.log('✅ Connection acknowledged');

      // 3. Send a message to OpenClaw
      const msg = {
        type: 'visitor_message',
        id: `test-${Date.now()}`,
        timestamp: new Date().toISOString(),
        payload: {
          content: '你好！请用一句话介绍你自己。',
          content_type: 'text',
          metadata: {},
        },
      };
      ws.send(JSON.stringify(msg));
      console.log('📤 Sent: "你好！请用一句话介绍你自己。"');
      console.log('⏳ Waiting for AI reply...');
      return;
    }

    if (frame.type === 'pong') return;

    if (frame.type === 'message') {
      const payload = frame.payload as any;
      if (payload.sender_type === 'agent') {
        console.log(`\n🤖 AI replied: "${payload.content}"`);
        console.log(
          '\n🎉 Full E2E chain working: Visitor → Gateway → OpenClaw → AI → Gateway → Visitor'
        );
        ws.close();
        process.exit(0);
      }
      return;
    }

    console.log('📩 Frame:', frame.type, JSON.stringify(frame.payload || {}).slice(0, 100));
  });

  ws.on('error', (err: any) => {
    console.error('❌ WS error:', err.message);
    process.exit(1);
  });

  // Timeout after 30s
  setTimeout(() => {
    console.error('❌ Timeout: no AI reply within 30s');
    ws.close();
    process.exit(1);
  }, 30000);
};

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
